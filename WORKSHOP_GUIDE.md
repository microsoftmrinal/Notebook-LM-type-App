# Workshop Guide: Build a NotebookLM-Like App on Azure

**A step-by-step guide for instructors and students to build LearnMap AI — an intelligent learning assistant that transforms documents into interactive mind maps.**

> **Duration:** ~3 hours  
> **Level:** Intermediate  
> **Prerequisites:** Python basics, a web browser, Azure account with active subscription

---

## Table of Contents

1. [What Are We Building?](#step-0--what-are-we-building)
2. [Environment Setup](#step-1--environment-setup)
3. [Azure Resource Provisioning](#step-2--azure-resource-provisioning)
4. [Project Scaffolding](#step-3--project-scaffolding)
5. [Backend — Flask Server](#step-4--backend--flask-server-apppy)
6. [Document Processing Pipeline](#step-5--document-processing-pipeline)
7. [AI Integration — Azure OpenAI](#step-6--ai-integration--azure-openai)
8. [Database — Azure Cosmos DB](#step-7--database--azure-cosmos-db)
9. [REST API Endpoints](#step-8--rest-api-endpoints)
10. [Frontend — HTML Template](#step-9--frontend--html-template-indexhtml)
11. [Frontend — Styling (CSS)](#step-10--frontend--styling-css)
12. [Frontend — Mind Map Visualization (JavaScript)](#step-11--frontend--mind-map-visualization-javascript)
13. [Security Hardening](#step-12--security-hardening)
14. [Adding a Second Model (o4-mini)](#step-13--adding-a-second-model-o4-mini)
15. [Run & Test](#step-14--run--test)
16. [Push to GitHub](#step-15--push-to-github)

---

## Step 0 — What Are We Building?

### The App: LearnMap AI

An intelligent learning assistant that:
1. Accepts PDF, Word, or text file uploads
2. Sends the document text to Azure OpenAI (GPT-4.1 or o4-mini)
3. AI generates a hierarchical mind map (JSON)
4. The mind map is rendered as an interactive tree using D3.js
5. Users can click any node to get an AI-powered deep-dive explanation
6. Everything is stored in Azure Cosmos DB for persistence

### Component Overview

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Backend Server** | Python / Flask | Handles HTTP requests, file uploads, calls Azure APIs |
| **AI Engine** | Azure OpenAI (GPT-4.1, o4-mini) | Generates mind maps and node explanations from text |
| **Database** | Azure Cosmos DB (NoSQL, Serverless) | Stores documents, extracted text, and mind map JSON |
| **Frontend UI** | HTML + CSS + JavaScript | Three-panel layout rendered in the browser |
| **Mind Map Visualization** | D3.js v7 | Interactive tree with zoom, pan, expand/collapse |
| **Markdown Rendering** | Marked.js | Renders AI explanations with formatting |
| **Authentication** | Azure AD (DefaultAzureCredential) | Zero API keys at runtime; uses AAD tokens |

### Architecture

```
  Browser (HTML + CSS + JS)
        │
        │  ← HTTP requests (REST API) →
        │
   Flask (app.py) on port 5000
        │
        ├── Azure OpenAI  (generates mind map JSON + explanations)
        │
        └── Azure Cosmos DB  (stores documents + mind maps)
```

> **Key concept:** Flask is the ONLY server. It serves the HTML/CSS/JS files AND handles the API calls. The JavaScript (`app.js`) runs in the browser and communicates with Flask via `fetch()`.

---

## Step 1 — Environment Setup

### Why this step?
Before writing any code, you need Python, Azure CLI, and a code editor. Azure CLI lets you create cloud resources from the command line — much faster than clicking through the portal.

### 1.1 Install Prerequisites

```bash
# Check Python version (need 3.10+)
python --version

# Check Azure CLI
az --version

# Login to Azure
az login
```

### 1.2 Create Project Folder

```bash
mkdir learnmap-ai
cd learnmap-ai
```

### 1.3 Create a Python Virtual Environment

```bash
python -m venv .venv

# Activate it:
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
```

**Why a virtual environment?** It isolates your project's packages from the system Python. This prevents version conflicts and makes your project reproducible.

### 1.4 Create requirements.txt

```
flask==3.0.0
azure-cosmos==4.7.0
azure-identity
openai>=1.50.0
PyPDF2==3.0.1
python-docx==1.1.0
python-dotenv==1.0.0
werkzeug==3.0.1
```

**Component explanations:**

| Package | What It Does |
|---------|-------------|
| `flask` | Lightweight web framework — serves HTML and handles REST API routes |
| `azure-cosmos` | Python SDK to read/write data in Azure Cosmos DB |
| `azure-identity` | Provides `DefaultAzureCredential` — gets Azure AD tokens automatically |
| `openai` | Official OpenAI Python SDK — talks to Azure OpenAI endpoints |
| `PyPDF2` | Extracts text from PDF files |
| `python-docx` | Extracts text from Word (.docx) files |
| `python-dotenv` | Loads environment variables from a `.env` file |
| `werkzeug` | Provides `secure_filename()` — sanitizes uploaded filenames for safety |

### 1.5 Install Dependencies

```bash
pip install -r requirements.txt
```

---

## Step 2 — Azure Resource Provisioning

### Why this step?
Our app needs two Azure services: **Azure OpenAI** (the AI brain) and **Azure Cosmos DB** (the database). We'll create them via CLI, which is faster and reproducible.

### 2.1 Create a Resource Group

A resource group is a logical container for all your Azure resources.

```bash
az group create --name "Notebook-LM-Like-on-Azure" --location eastus
```

**Why East US?** Azure OpenAI models like GPT-4.1 are available in this region. Always check model availability before choosing a region.

### 2.2 Create Azure OpenAI Resource

```bash
az cognitiveservices account create \
  --name learnmap-openai \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --kind OpenAI --sku S0 --location eastus \
  --custom-domain learnmap-openai
```

**What this does:**
- Creates an Azure OpenAI resource (the "account" that hosts your AI models)
- `--kind OpenAI` specifies it's an OpenAI-type cognitive service
- `--sku S0` is the standard pricing tier
- `--custom-domain` gives it a friendly URL: `learnmap-openai.openai.azure.com`

### 2.3 Deploy GPT-4.1 Model

```bash
az cognitiveservices account deployment create \
  --name learnmap-openai \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --deployment-name gpt-41 \
  --model-name gpt-4.1 --model-version "2025-04-14" \
  --model-format OpenAI \
  --sku-capacity 10 --sku-name "GlobalStandard"
```

**What this does:**
- Deploys the GPT-4.1 model inside your OpenAI resource
- `--deployment-name gpt-41` is the name you'll use in code to call this model
- `--sku-name GlobalStandard` means shared capacity at lower cost — great for development
- `--sku-capacity 10` is 10K tokens per minute — sufficient for a workshop

### 2.4 Create Azure Cosmos DB (Serverless)

```bash
az cosmosdb create \
  --name learnmap-cosmosdb \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --kind GlobalDocumentDB \
  --default-consistency-level Session \
  --locations regionName=westus2 failoverPriority=0 isZoneRedundant=false \
  --capabilities EnableServerless
```

**What this does:**
- Creates a NoSQL database account (document model — stores JSON)
- **Serverless** = you pay ONLY for what you use (zero cost when idle) — perfect for development
- `Session` consistency = reads always see your own writes (good default)

**Why Cosmos DB over SQL?** Our data is JSON (mind maps, document metadata). Cosmos DB stores JSON natively without schema definitions — no CREATE TABLE needed.

### 2.5 Create Database and Container

```bash
# Create the database
az cosmosdb sql database create \
  --account-name learnmap-cosmosdb \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --name learner_assistant

# Create the container (like a "table")
az cosmosdb sql container create \
  --account-name learnmap-cosmosdb \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --database-name learner_assistant \
  --name documents \
  --partition-key-path "/id"
```

**What is a partition key?** It's the field Cosmos DB uses to distribute data across servers. Using `/id` means each document gets its own partition — simple and effective for our use case.

### 2.6 Set Up RBAC Authentication (Azure AD)

Instead of using API keys, we'll use Azure AD tokens — this is more secure.

```bash
# Get your user ID
USER_ID=$(az ad signed-in-user show --query id -o tsv)

# Get the OpenAI resource ID
OPENAI_ID=$(az cognitiveservices account show --name learnmap-openai \
  --resource-group "Notebook-LM-Like-on-Azure" --query id -o tsv)

# Grant yourself "OpenAI User" role
az role assignment create \
  --assignee $USER_ID \
  --role "Cognitive Services OpenAI User" \
  --scope $OPENAI_ID

# Grant yourself Cosmos DB data access
az cosmosdb sql role assignment create \
  --account-name learnmap-cosmosdb \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --scope "/" \
  --principal-id $USER_ID \
  --role-definition-id "00000000-0000-0000-0000-000000000002"
```

**Why RBAC instead of API keys?**
- API keys are static secrets — if leaked, anyone can use your resources
- Azure AD tokens are short-lived (1 hour), auto-refreshed, and tied to your identity
- RBAC lets you grant minimum permissions (e.g., "User" not "Owner")
- This follows the security principle of least privilege

---

## Step 3 — Project Scaffolding

### Why this step?
Flask expects a specific folder structure. Let's create it.

```
learnmap-ai/
├── app.py                # Backend server (we'll build this)
├── requirements.txt      # Already created
├── .env                  # Environment variables
├── .gitignore            # Files to exclude from Git
├── templates/            # Flask looks here for HTML
│   └── index.html        # Our single-page app
├── static/               # Flask serves these files automatically
│   ├── css/
│   │   └── style.css     # Styling
│   └── js/
│       └── app.js        # Frontend logic
└── uploads/              # Temporary file storage
```

### 3.1 Create the Folder Structure

```bash
mkdir templates static static/css static/js uploads
```

### 3.2 Create .env File

```env
# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT=https://learnmap-openai.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-41
AZURE_O4MINI_DEPLOYMENT_NAME=o4-mini
AZURE_OPENAI_API_VERSION=2025-01-01-preview

# Azure Cosmos DB Configuration
COSMOS_DB_ENDPOINT=https://learnmap-cosmosdb.documents.azure.com:443/

# Default model
DEFAULT_MODEL=gpt
```

**Why .env?** It keeps configuration separate from code. Different environments (dev, staging, production) can use different `.env` files without changing code.

### 3.3 Create .gitignore

```
.env
__pycache__/
*.py[cod]
.venv/
venv/
uploads/*
!uploads/.gitkeep
```

**Why?** Prevents secrets (`.env`), temporary files (`__pycache__`), and uploaded documents from being committed to Git.

---

## Step 4 — Backend: Flask Server (app.py)

### Why Flask?
Flask is a lightweight Python web framework. It lets you define URL routes (like `/upload`, `/documents`) and handle HTTP requests with just a few lines of code. Unlike Django, Flask has no boilerplate — you build only what you need.

### 4.1 Start with Imports and App Configuration

```python
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
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB limit
app.config["UPLOAD_FOLDER"] = os.path.join(os.path.dirname(__file__), "uploads")
ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "txt"}

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
```

**Explanation:**
- `load_dotenv()` reads `.env` and sets environment variables
- `MAX_CONTENT_LENGTH` prevents users from uploading huge files (denial-of-service protection)
- `ALLOWED_EXTENSIONS` is an allowlist — only these file types are accepted (security measure)
- `os.makedirs(..., exist_ok=True)` creates the uploads folder if it doesn't exist

### 4.2 Initialize Azure Clients

```python
# Shared Azure AD credential
credential = DefaultAzureCredential()

# Azure OpenAI client
aoai_client = AzureOpenAI(
    azure_ad_token_provider=lambda: credential.get_token(
        "https://cognitiveservices.azure.com/.default"
    ).token,
    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
)
GPT_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-41")

# Cosmos DB client
cosmos_client = CosmosClient(
    os.getenv("COSMOS_DB_ENDPOINT"),
    credential=credential,
)
database = cosmos_client.get_database_client("learner_assistant")
container = database.get_container_client("documents")
```

**Explanation:**
- `DefaultAzureCredential` automatically finds your Azure identity (from `az login`, environment variables, or managed identity) — one credential works everywhere
- `azure_ad_token_provider` gets a fresh AAD token each time the SDK needs one — no static API keys
- We create ONE client for each service and reuse it (singleton pattern) — creating new clients per request would be wasteful

---

## Step 5 — Document Processing Pipeline

### Why this step?
Users upload files, but AI models need plain text. We need to extract text from different file formats.

### 5.1 File Validation

```python
def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
```

**Why validate?** Without this, users could upload executable files (.exe), scripts (.py), or other dangerous content. The allowlist pattern (only permit known-good types) is safer than a blocklist (block known-bad types).

### 5.2 Text Extraction Functions

```python
def extract_text_from_pdf(filepath: str) -> str:
    reader = PdfReader(filepath)
    parts = []
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
```

**Explanation:**
- `PyPDF2` reads PDF page by page and extracts text
- `python-docx` reads Word documents paragraph by paragraph
- `errors="replace"` prevents crashes on files with encoding issues
- The dispatcher function (`extract_text`) routes to the right extractor based on file extension

### 5.3 Text Chunking

```python
def chunk_text(text: str, max_chars: int = 12_000) -> list[str]:
    chunks = []
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
```

**Why chunk?** AI models have token limits. A 200-page PDF might have 500K characters, but GPT-4.1 can only process ~128K tokens. Chunking splits the text at natural boundaries (paragraphs → sentences → hard limit) to stay within limits while keeping text readable.

---

## Step 6 — AI Integration: Azure OpenAI

### Why this step?
This is the core intelligence of the app — we send document text to Azure OpenAI and get back structured data (mind map JSON) or explanations (Markdown text).

### 6.1 The LLM Caller

```python
def _call_llm(system_prompt, user_prompt, model="gpt",
              max_tokens=4096, json_mode=False):
    """Route to the right model and return the text response."""

    deployment = GPT_DEPLOYMENT  # default

    kwargs = dict(
        model=deployment,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        max_tokens=max_tokens,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = aoai_client.chat.completions.create(**kwargs)
    return response.choices[0].message.content
```

**Explanation:**
- **System prompt:** Sets the AI's behavior/role (e.g., "You are an expert educator")
- **User prompt:** The actual question or document text
- **temperature=0.3:** Low temperature = more focused/deterministic output (good for structured data). Higher values (0.7+) = more creative/varied
- **json_mode:** Forces the model to return valid JSON — critical for mind map generation
- **max_tokens:** Limits how long the response can be (controls cost and latency)

### 6.2 Mind Map Generation

```python
def generate_mindmap(text, filename, model="gpt"):
    chunks = chunk_text(text)
    combined = "\n\n".join(chunks[:5])[:60_000]  # First ~60K chars

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
```

**Why this prompt structure?**
- We give the AI explicit rules about the hierarchy depth (root → primary → secondary → tertiary)
- We define the exact JSON schema (`name`, `summary`, `children`) so the output is predictable
- We limit to the first 60K characters to keep costs bounded
- `json_mode=True` ensures the response is parseable JSON

### 6.3 Node Deep-Dive

```python
def get_node_details(node_name, node_summary, doc_text, model="gpt"):
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
```

**Why separate from mind map generation?** Mind map generation returns JSON (structured data). Node details return Markdown (formatted text). Different output formats require different prompts and settings.

---

## Step 7 — Database: Azure Cosmos DB

### Why this step?
Without a database, mind maps would be lost when the server restarts. Cosmos DB stores each document's text and mind map JSON persistently.

### 7.1 Document Schema

Each document stored in Cosmos DB looks like:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "machine-learning-basics.pdf",
  "uploadDate": "2026-04-19T10:30:00.000000",
  "textContent": "Chapter 1: Introduction to ML...",
  "mindMap": {
    "name": "Machine Learning Basics",
    "summary": "An introduction to ML concepts...",
    "children": [ ... ]
  },
  "status": "processed"
}
```

**Why this structure?**
- `id` (UUID) is the partition key — uniquely identifies each document
- `textContent` is stored so the AI can reference it for deep-dives later (no need to re-upload)
- `mindMap` is the full JSON tree — loaded by the frontend to render the visualization
- We store text up to 100K characters (`text[:100_000]`) to stay within Cosmos DB's 2 MB item limit

---

## Step 8 — REST API Endpoints

### Why this step?
The frontend (JavaScript in the browser) needs a way to communicate with the backend. REST APIs use standard HTTP methods (GET, POST, DELETE) to perform operations.

### 8.1 Serve the HTML Page

```python
@app.route("/")
def index():
    return render_template("index.html")
```

**Explanation:** When a user visits `http://127.0.0.1:5000/`, Flask renders `templates/index.html` and sends it to the browser. This is the entry point of the entire app.

### 8.2 File Upload Endpoint

```python
@app.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "File type not allowed."}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(filepath)

    try:
        text = extract_text(filepath, filename)
        if not text.strip():
            return jsonify({"error": "Could not extract text."}), 400

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

        return jsonify({
            "id": doc_id, "filename": filename,
            "mindMap": mindmap, "message": "Document processed successfully",
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)
```

**Key security features:**
- `secure_filename()` removes path traversal characters (e.g., `../../etc/passwd` becomes `etc_passwd`)
- The `finally` block **always** deletes the uploaded file — even if an error occurs
- Input validation at every step: file presence → filename → file type → text content

### 8.3 Other Endpoints

```python
# List all documents
@app.route("/documents", methods=["GET"])
def list_documents():
    query = "SELECT c.id, c.filename, c.uploadDate, c.status FROM c ORDER BY c.uploadDate DESC"
    items = list(container.query_items(query=query, enable_cross_partition_query=True))
    return jsonify(items)

# Get a specific mind map
@app.route("/mindmap/<doc_id>", methods=["GET"])
def get_mindmap(doc_id):
    item = container.read_item(item=doc_id, partition_key=doc_id)
    return jsonify({"id": item["id"], "filename": item["filename"], "mindMap": item["mindMap"]})

# Get AI deep-dive for a node
@app.route("/node-details", methods=["POST"])
def node_details():
    data = request.get_json(silent=True) or {}
    node_name = data.get("nodeName")
    doc_id = data.get("documentId")
    selected_model = data.get("model", DEFAULT_MODEL)
    # ... calls get_node_details() and returns the Markdown response

# Delete a document
@app.route("/document/<doc_id>", methods=["DELETE"])
def delete_document(doc_id):
    container.delete_item(item=doc_id, partition_key=doc_id)
    return jsonify({"message": "Document deleted"})

# List available models
@app.route("/models", methods=["GET"])
def get_models():
    models = [
        {"id": "gpt", "name": "GPT-4.1 (Azure OpenAI)", "available": True},
        {"id": "o4-mini", "name": "o4-mini Reasoning (Azure OpenAI)", "available": True},
    ]
    return jsonify({"models": models, "default": DEFAULT_MODEL})
```

### 8.4 Start the Server

```python
if __name__ == "__main__":
    app.run(debug=True, port=5000)
```

**Why `debug=True`?** During development, it auto-reloads when you save changes and shows detailed error pages. **Never use debug mode in production** — it exposes internal details.

---

## Step 9 — Frontend: HTML Template (index.html)

### Why this step?
The HTML defines the structure of what users see. Flask renders this template and sends it to the browser.

### 9.1 Three-Panel Layout

The app has three panels:

```
┌──────────┬─────────────────────────┬──────────────┐
│          │                         │              │
│ SIDEBAR  │     MIND MAP CANVAS     │ DETAIL PANEL │
│          │       (D3.js tree)      │ (AI explain) │
│ • Upload │                         │              │
│ • Docs   │                         │              │
│ • Model  │                         │              │
│          │                         │              │
└──────────┴─────────────────────────┴──────────────┘
```

### 9.2 Key HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- External libraries loaded from CDNs -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>

  <!-- Our app's CSS -->
  <link rel="stylesheet" href="/static/css/style.css" />
</head>
<body>
  <div class="app-container">
    <!-- Left sidebar: model selector, upload area, document list -->
    <aside class="sidebar">
      <select id="model-select">
        <option value="gpt">GPT-4.1</option>
        <option value="o4-mini">o4-mini Reasoning</option>
      </select>
      <div id="upload-area">Drop files here or click to upload</div>
      <div id="documents-list"></div>
    </aside>

    <!-- Center: mind map canvas -->
    <main class="main-content">
      <header class="toolbar"><!-- zoom, expand, download buttons --></header>
      <div id="mindmap-container">
        <div id="mindmap-wrapper"></div>
      </div>
    </main>

    <!-- Right: detail panel -->
    <aside class="detail-panel">
      <div id="node-details"></div>
      <button id="btn-explore">Explore More with AI</button>
    </aside>
  </div>

  <!-- Our app's JavaScript -->
  <script src="/static/js/app.js"></script>
</body>
</html>
```

**How Flask serves this:**
1. User visits `http://127.0.0.1:5000/`
2. Flask route `"/"` calls `render_template("index.html")`
3. Flask finds `templates/index.html` and returns it
4. Browser receives the HTML, sees `<link>` and `<script>` tags
5. Browser makes additional requests: `GET /static/css/style.css` and `GET /static/js/app.js`
6. Flask automatically serves files from the `static/` folder

---

## Step 10 — Frontend: Styling (CSS)

### Why this step?
CSS makes the app look professional. Without it, you'd see plain HTML with default browser styles.

### 10.1 Design Tokens (CSS Variables)

```css
:root {
  --primary: #6366f1;        /* Indigo — main accent color */
  --bg: #f1f5f9;             /* Light gray background */
  --sidebar-bg: #ffffff;     /* White sidebar */
  --text: #1e293b;           /* Dark text */
  --text-muted: #64748b;     /* Gray secondary text */
  --border: #e2e8f0;         /* Subtle borders */
  --radius: 12px;            /* Rounded corners */
  --font: "Inter", sans-serif;
}
```

**Why CSS variables?** Changing `--primary` in one place updates the color EVERYWHERE it's used. This makes theming trivial.

### 10.2 Layout with Flexbox

```css
.app-container {
  display: flex;       /* Side-by-side layout */
  height: 100vh;       /* Full viewport height */
  width: 100vw;
}

.sidebar {
  width: 300px;        /* Fixed width sidebar */
  overflow-y: auto;    /* Scrollable if content overflows */
}

.main-content {
  flex: 1;             /* Takes remaining space */
}
```

**Why Flexbox?** It's the simplest way to create responsive side-by-side layouts. `flex: 1` means "take all remaining space" — the mind map canvas automatically fills whatever width is available.

### 10.3 Upload Area Styling

The upload area has drag-and-drop feedback:

```css
.upload-area {
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  transition: all 0.25s ease;
  cursor: pointer;
}

.upload-area:hover, .upload-area.drag-over {
  border-color: var(--primary);
  background: var(--primary-light);
}
```

**Why dashed border?** It's a universal visual cue for "drop zone" — users intuitively know they can drag files here.

---

## Step 11 — Frontend: Mind Map Visualization (JavaScript)

### Why this step?
This is where the magic happens — turning JSON data into an interactive visual tree.

### 11.1 D3.js Overview

**D3.js** (Data-Driven Documents) is a JavaScript library for creating data visualizations. We use its tree layout to convert our hierarchical JSON into positioned SVG elements.

```
JSON Mind Map Data         D3.js Tree Layout          SVG on Screen
{                          Calculates x,y           ┌── Branch 1
  name: "Root",     →     positions for      →     ├── Branch 2
  children: [...]          each node                │   ├── Sub 1
}                                                   │   └── Sub 2
                                                    └── Branch 3
```

### 11.2 Application State

```javascript
const state = {
  currentDocId: null,    // Which document is active
  root: null,            // D3 hierarchy root node
  svg: null,             // The SVG element
  g: null,               // <g> group inside SVG (for zoom/pan)
  zoom: null,            // D3 zoom behavior
  nodeId: 0,             // Unique ID counter for nodes
  selectedNode: null,    // Currently clicked node
};
```

**Why a state object?** It keeps all app state in one place — easier to debug and reason about. When multiple functions need to access the same data, they read from `state`.

### 11.3 Bootstrap — What Happens on Page Load

```javascript
document.addEventListener("DOMContentLoaded", () => {
  setupUpload();      // Wire up drag-and-drop
  setupToolbar();     // Wire up toolbar buttons
  loadDocuments();    // Fetch document list from API
  loadModels();       // Fetch available models from API
  createTooltip();    // Create hover tooltip element
});
```

### 11.4 Upload Flow

```javascript
async function handleFile(file) {
  const form = new FormData();
  form.append("file", file);
  form.append("model", getSelectedModel());  // Which AI model to use

  const res = await fetch("/upload", { method: "POST", body: form });
  const data = await res.json();

  // On success: reload doc list, render the mind map
  await loadDocuments();
  activateDocument(data.id, data.filename, data.mindMap);
}
```

**What's happening:**
1. User drops a file → `handleFile()` is called
2. A `FormData` object is created (like an HTML form submission)
3. `fetch("/upload", ...)` sends it to the Flask backend
4. Flask processes the file, calls Azure OpenAI, stores in Cosmos DB, returns JSON
5. Frontend receives the mind map JSON and renders it

### 11.5 Rendering the Mind Map

```javascript
function activateDocument(docId, docName, mindMapData) {
  state.currentDocId = docId;

  // Convert JSON to D3 hierarchy
  state.root = d3.hierarchy(mindMapData);

  // Create tree layout
  const treeLayout = d3.tree().nodeSize([40, 280]);
  treeLayout(state.root);

  // Draw links (lines) and nodes (circles + text)
  renderTree(state.root);
}
```

**D3 pipeline:** `JSON data → d3.hierarchy() → d3.tree() → SVG elements`

### 11.6 Interactivity

- **Click a node:** Expands/collapses children, shows summary in detail panel
- **Hover:** Shows tooltip with node summary
- **Zoom/Pan:** D3 zoom behavior on the SVG
- **"Explore More with AI":** Sends a POST to `/node-details`, renders the Markdown response

```javascript
async function exploreMore() {
  const res = await fetch("/node-details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nodeName: state.selectedNode.data.name,
      nodeSummary: state.selectedNode.data.summary,
      documentId: state.currentDocId,
      model: getSelectedModel(),
    }),
  });
  const data = await res.json();
  // Render Markdown to HTML using marked.js
  detailContent.innerHTML = marked.parse(data.details);
}
```

---

## Step 12 — Security Hardening

### Why this step?
Security isn't optional — even for a workshop app. Here are the measures already built in:

| Measure | What It Prevents |
|---------|-----------------|
| `DefaultAzureCredential` | Eliminates static API keys from code |
| `secure_filename()` | Prevents path traversal attacks (`../../etc/passwd`) |
| `ALLOWED_EXTENSIONS` | Blocks upload of executable/script files |
| `MAX_CONTENT_LENGTH` | Prevents denial-of-service via huge uploads |
| File deletion in `finally` block | No leaked user data on server disk |
| RBAC roles (not admin keys) | Minimum permissions principle |

### Discussion Questions for Students
1. What would happen if we used `file.filename` directly instead of `secure_filename()`?
2. Why do we delete uploaded files immediately? What if we didn't?
3. Why is `DefaultAzureCredential` better than putting an API key in `.env`?
4. What security measures are missing for a production deployment? (Hint: rate limiting, CSRF, CSP, user authentication)

---

## Step 13 — Adding a Second Model (o4-mini)

### Why this step?
o4-mini is a "reasoning model" — it thinks step-by-step before answering, making it better for complex analysis. Giving users a choice lets them pick the right tool for the job.

### 13.1 Deploy o4-mini

```bash
az cognitiveservices account deployment create \
  --name learnmap-openai \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --deployment-name o4-mini \
  --model-name o4-mini --model-version "2025-04-16" \
  --model-format OpenAI \
  --sku-capacity 1 --sku-name GlobalStandard
```

### 13.2 Update the LLM Caller

o4-mini has two API differences from GPT-4.1:
1. Uses `max_completion_tokens` instead of `max_tokens`
2. Ignores the `temperature` parameter (reasoning models handle this internally)

```python
def _call_llm(system_prompt, user_prompt, model="gpt",
              max_tokens=4096, json_mode=False):
    deployment = O4_MINI_DEPLOYMENT if model == "o4-mini" else GPT_DEPLOYMENT

    # o4-mini uses a different parameter name for token limits
    token_param = "max_completion_tokens" if model == "o4-mini" else "max_tokens"

    kwargs = dict(
        model=deployment,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    kwargs[token_param] = max_tokens

    # Only GPT models accept temperature
    if model != "o4-mini":
        kwargs["temperature"] = 0.3

    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = aoai_client.chat.completions.create(**kwargs)
    return response.choices[0].message.content
```

### 13.3 Model Comparison

| Feature | GPT-4.1 | o4-mini |
|---------|---------|---------|
| **Type** | General-purpose | Reasoning |
| **Speed** | Faster | Slower (thinks first) |
| **Strength** | Broad knowledge, fast generation | Logic, analysis, structured output |
| **Token param** | `max_tokens` | `max_completion_tokens` |
| **Temperature** | Supported (0.0–2.0) | Not supported |
| **API version** | Any recent | 2024-12-01-preview or later |
| **Cost (input)** | $2.00/1M tokens | $1.10/1M tokens |
| **Cost (output)** | $8.00/1M tokens | $4.40/1M tokens |

---

## Step 14 — Run & Test

### 14.1 Start the Server

```bash
python app.py
```

You should see:
```
 * Serving Flask app 'app'
 * Debug mode: on
 * Running on http://127.0.0.1:5000
```

### 14.2 Test Checklist

| # | Test | Expected Result |
|---|------|----------------|
| 1 | Open http://127.0.0.1:5000 | Welcome screen appears |
| 2 | Upload a PDF | Loading spinner → mind map appears |
| 3 | Click a node | Summary shows in detail panel |
| 4 | Click "Explore More with AI" | AI-generated explanation appears |
| 5 | Click "Download PNG" | PNG file downloads |
| 6 | Switch to o4-mini model | Model selector changes |
| 7 | Upload with o4-mini | Mind map generates (may be slower) |
| 8 | Refresh the page | Previously uploaded docs appear in sidebar |
| 9 | Delete a document | Document removed from sidebar |

### 14.3 Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `DefaultAzureCredential` failed | Not logged in to Azure | Run `az login` |
| 403 AuthenticationTypeDisabled | Subscription blocks API keys | Use AAD auth (already done) |
| 400 `max_tokens` not supported | o4-mini requires different parameter | Use `max_completion_tokens` |
| 400 API version too old | o4-mini needs 2024-12-01-preview+ | Update `AZURE_OPENAI_API_VERSION` |
| Cosmos DB 403 Forbidden | Missing RBAC role | Re-run the role assignment command |
| `ModuleNotFoundError` | Missing package | Run `pip install -r requirements.txt` |

---

## Step 15 — Push to GitHub

### 15.1 Initialize Git

```bash
git init
git add -A
git commit -m "Initial commit: LearnMap AI - NotebookLM-like app on Azure"
```

### 15.2 Create GitHub Repository

```bash
# Using GitHub CLI (install with: winget install GitHub.cli)
gh repo create learnmap-ai --public --source . --push
```

Or manually:
1. Go to https://github.com/new
2. Create a new repository
3. Follow the "push an existing repository" instructions

### 15.3 Verify

Visit your repository URL and confirm:
- `.env` is NOT in the repo (listed in `.gitignore`)
- All source files are present
- README renders properly

---

## Recap — What We Built

```
                    ┌─────────────────────┐
                    │   You built this!   │
                    └─────────────────────┘

  ┌─────────────┐    ┌────────────────┐    ┌──────────────┐
  │   Frontend   │    │    Backend     │    │  Azure Cloud │
  │              │    │                │    │              │
  │ • HTML       │───▶│ • Flask        │───▶│ • OpenAI     │
  │ • CSS        │    │ • REST API     │    │   (GPT-4.1)  │
  │ • JavaScript │◀───│ • File parsing │◀───│   (o4-mini)  │
  │ • D3.js      │    │ • Auth (AAD)   │    │ • Cosmos DB  │
  └─────────────┘    └────────────────┘    └──────────────┘
```

### Skills Practiced

| Skill | Where |
|-------|-------|
| **Python web development** | Flask routes, file handling |
| **Cloud provisioning** | Azure CLI, resource groups, deployments |
| **AI/LLM integration** | Prompt engineering, JSON mode, model selection |
| **NoSQL databases** | Cosmos DB, partition keys, CRUD operations |
| **Frontend development** | HTML/CSS/JS, D3.js visualization |
| **Security** | RBAC, AAD auth, input validation, secure file handling |
| **DevOps** | Git, GitHub, .gitignore, environment variables |

---

## Bonus Challenges for Students

1. **Add a new file format** — Support `.pptx` (PowerPoint) uploads using `python-pptx`
2. **Add search** — Let users search across all uploaded documents
3. **Add user auth** — Use MSAL.js to add Azure AD login so each user has private documents
4. **Deploy to Azure** — Package the app in a Docker container and deploy to Azure App Service
5. **Add rate limiting** — Use Flask-Limiter to prevent API abuse
6. **Improve the prompt** — Experiment with different system prompts to get better mind maps

---

*Built with Azure OpenAI, Azure Cosmos DB, Flask, and D3.js*
