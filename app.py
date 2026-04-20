import os
import json
import uuid
from datetime import datetime

from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from openai import AzureOpenAI
from azure.cosmos import CosmosClient, PartitionKey, exceptions
from azure.identity import DefaultAzureCredential
from PyPDF2 import PdfReader
from docx import Document
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB
app.config["UPLOAD_FOLDER"] = os.path.join(os.path.dirname(__file__), "uploads")
ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "txt"}

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

# ---------------------------------------------------------------------------
# Shared AAD credential (used for OpenAI, Cosmos DB, and AI Foundry)
# ---------------------------------------------------------------------------
credential = DefaultAzureCredential()

# ---------------------------------------------------------------------------
# Azure OpenAI  — uses AAD token (GPT-4.1)
# ---------------------------------------------------------------------------
aoai_client = AzureOpenAI(
    azure_ad_token_provider=lambda: credential.get_token(
        "https://cognitiveservices.azure.com/.default"
    ).token,
    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
)
GPT_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-41")
O4_MINI_DEPLOYMENT = os.getenv("AZURE_O4MINI_DEPLOYMENT_NAME", "o4-mini")

# Active model: "gpt" or "o4-mini"
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "gpt")

# ---------------------------------------------------------------------------
# Azure Cosmos DB  –  singleton client, database & container
# Supports both the local emulator (key auth) and cloud (AAD auth)
# ---------------------------------------------------------------------------
_cosmos_endpoint = os.getenv("COSMOS_DB_ENDPOINT", "https://localhost:8081/")
_cosmos_key = os.getenv("COSMOS_DB_KEY", "")
_use_emulator = "localhost" in _cosmos_endpoint

if _use_emulator:
    # Local Cosmos DB Emulator — uses the well-known account key
    cosmos_client = CosmosClient(_cosmos_endpoint, credential=_cosmos_key)
    # Auto-create database & container on the emulator (starts empty)
    database = cosmos_client.create_database_if_not_exists("learner_assistant")
    container = database.create_container_if_not_exists(
        "documents", partition_key=PartitionKey(path="/id")
    )
else:
    # Cloud Cosmos DB — uses Azure AD (DefaultAzureCredential)
    cosmos_client = CosmosClient(_cosmos_endpoint, credential=credential)
    database = cosmos_client.get_database_client("learner_assistant")
    container = database.get_container_client("documents")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_text_from_pdf(filepath: str) -> str:
    reader = PdfReader(filepath)
    parts: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text)
    return "\n".join(parts)


def extract_text_from_docx(filepath: str) -> str:
    doc = Document(filepath)
    return "\n".join(p.text for p in doc.paragraphs)


def extract_text(filepath: str, filename: str) -> str:
    ext = filename.rsplit(".", 1)[1].lower()
    if ext == "pdf":
        return extract_text_from_pdf(filepath)
    if ext in ("docx", "doc"):
        return extract_text_from_docx(filepath)
    if ext == "txt":
        with open(filepath, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read()
    return ""


def chunk_text(text: str, max_chars: int = 12_000) -> list[str]:
    chunks: list[str] = []
    while text:
        if len(text) <= max_chars:
            chunks.append(text)
            break
        bp = text.rfind("\n", 0, max_chars)
        if bp == -1:
            bp = text.rfind(". ", 0, max_chars)
        if bp == -1:
            bp = max_chars
        chunks.append(text[:bp])
        text = text[bp:]
    return chunks


# ---------------------------------------------------------------------------
# AI Helpers — unified interface for GPT and Claude
# ---------------------------------------------------------------------------

def _call_llm(system_prompt: str, user_prompt: str, model: str = "gpt",
              max_tokens: int = 4096, json_mode: bool = False) -> str:
    """Route to the right LLM backend and return the text response."""

    deployment = O4_MINI_DEPLOYMENT if model == "o4-mini" else GPT_DEPLOYMENT

    # o4-mini is a reasoning model — it uses max_completion_tokens (not
    # max_tokens) and ignores temperature.
    token_param = "max_completion_tokens" if model == "o4-mini" else "max_tokens"

    kwargs = dict(
        model=deployment,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    kwargs[token_param] = max_tokens

    if model != "o4-mini":
        kwargs["temperature"] = 0.3
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    response = aoai_client.chat.completions.create(**kwargs)
    return response.choices[0].message.content


# ---------------------------------------------------------------------------
# Mind-map generation
# ---------------------------------------------------------------------------

def generate_mindmap(text: str, filename: str, model: str = "gpt") -> dict:
    chunks = chunk_text(text)
    combined = "\n\n".join(chunks[:5])[:60_000]

    prompt = (
        "Analyze the following document and create a comprehensive hierarchical "
        "mind map structure for learning.\n\n"
        "Rules:\n"
        "1. Root node = document's main topic / title.\n"
        "2. 4-8 primary branches for major themes or chapters.\n"
        "3. 2-5 secondary branches per primary branch for key concepts.\n"
        "4. 1-3 tertiary branches per secondary branch for important details.\n\n"
        "For EACH node provide:\n"
        '- "name": concise label (2-6 words)\n'
        '- "summary": 2-4 sentence explanation\n'
        '- "children": array of child nodes (empty [] for leaves)\n\n'
        "Return ONLY valid JSON.\n\n"
        f"Document filename: {filename}\n\n"
        f"Document content:\n{combined}"
    )

    system_prompt = (
        "You are an expert educator and knowledge organizer. "
        "Create detailed, well-structured mind maps that help "
        "learners understand complex topics. Always return valid JSON only."
    )

    raw = _call_llm(system_prompt, prompt, model=model,
                    max_tokens=4096, json_mode=True)
    return json.loads(raw)


def get_node_details(node_name: str, node_summary: str, doc_text: str,
                     model: str = "gpt") -> str:
    excerpt = doc_text[:30_000]

    prompt = (
        f'Based on the following document, provide a detailed explanation about '
        f'the topic: "{node_name}"\n\n'
        f"Current summary: {node_summary}\n\n"
        "Please provide:\n"
        "1. A comprehensive explanation (3-5 paragraphs)\n"
        "2. Key takeaways (bullet points)\n"
        "3. Related concepts from the document\n"
        "4. Examples or practical applications if applicable\n\n"
        "Format the response in Markdown.\n\n"
        f"Document content:\n{excerpt}"
    )

    system_prompt = (
        "You are an expert educator. Provide detailed, clear "
        "explanations that help learners deeply understand concepts. "
        "Use Markdown formatting."
    )

    return _call_llm(system_prompt, prompt, model=model, max_tokens=2048)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "File type not allowed. Use PDF, DOCX, or TXT."}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(filepath)

    try:
        text = extract_text(filepath, filename)
        if not text.strip():
            return jsonify({"error": "Could not extract text from the document."}), 400

        selected_model = request.form.get("model", DEFAULT_MODEL)
        mindmap = generate_mindmap(text, filename, model=selected_model)

        doc_id = str(uuid.uuid4())
        document = {
            "id": doc_id,
            "filename": filename,
            "uploadDate": datetime.utcnow().isoformat(),
            "textContent": text[:100_000],
            "mindMap": mindmap,
            "status": "processed",
        }
        container.upsert_item(document)

        return jsonify(
            {
                "id": doc_id,
                "filename": filename,
                "mindMap": mindmap,
                "message": "Document processed successfully",
            }
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)


@app.route("/documents", methods=["GET"])
def list_documents():
    query = (
        "SELECT c.id, c.filename, c.uploadDate, c.status "
        "FROM c ORDER BY c.uploadDate DESC"
    )
    items = list(
        container.query_items(query=query, enable_cross_partition_query=True)
    )
    return jsonify(items)


@app.route("/models", methods=["GET"])
def get_models():
    models = [
        {"id": "gpt", "name": "GPT-4.1 (Azure OpenAI)", "available": True},
        {"id": "o4-mini", "name": "o4-mini Reasoning (Azure OpenAI)", "available": True},
    ]
    return jsonify({"models": models, "default": DEFAULT_MODEL})


@app.route("/mindmap/<doc_id>", methods=["GET"])
def get_mindmap(doc_id):
    try:
        item = container.read_item(item=doc_id, partition_key=doc_id)
        return jsonify(
            {
                "id": item["id"],
                "filename": item["filename"],
                "mindMap": item["mindMap"],
            }
        )
    except exceptions.CosmosResourceNotFoundError:
        return jsonify({"error": "Document not found"}), 404


@app.route("/node-details", methods=["POST"])
def node_details():
    data = request.get_json(silent=True) or {}
    node_name = data.get("nodeName")
    node_summary = data.get("nodeSummary", "")
    doc_id = data.get("documentId")
    selected_model = data.get("model", DEFAULT_MODEL)

    if not node_name or not doc_id:
        return jsonify({"error": "Missing required fields"}), 400

    try:
        item = container.read_item(item=doc_id, partition_key=doc_id)
        details = get_node_details(
            node_name, node_summary, item.get("textContent", ""),
            model=selected_model,
        )
        return jsonify({"details": details})
    except exceptions.CosmosResourceNotFoundError:
        return jsonify({"error": "Document not found"}), 404
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/document/<doc_id>", methods=["DELETE"])
def delete_document(doc_id):
    try:
        container.delete_item(item=doc_id, partition_key=doc_id)
        return jsonify({"message": "Document deleted"})
    except exceptions.CosmosResourceNotFoundError:
        return jsonify({"error": "Document not found"}), 404


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True, port=5000)
