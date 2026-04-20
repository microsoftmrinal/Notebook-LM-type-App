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

---

## Appendix A — Full Annotated Python Code (`app.py`)

Below is the **complete `app.py`** with line-by-line comments explaining the logic, design decisions, and how each piece connects.

> **Instructor tip:** Walk through this section after students have built the app. Use it to answer "why did we do it this way?" questions.

---

### Section 1: Imports — Loading the Toolbox

```python
import os          # Access environment variables and file system paths
import json        # Parse JSON strings into Python dicts (for mind map data)
import uuid        # Generate unique IDs for each uploaded document
from datetime import datetime  # Timestamp when documents are uploaded

# --- Flask framework ---
from flask import Flask, render_template, request, jsonify
# Flask          → The web framework itself (creates the app object)
# render_template → Looks inside templates/ folder and returns HTML to the browser
# request        → Gives access to incoming HTTP data (form fields, uploaded files, JSON body)
# jsonify        → Converts Python dicts/lists into JSON HTTP responses

from werkzeug.utils import secure_filename
# secure_filename → Sanitizes user-provided filenames
# Example: "../../etc/passwd" becomes "etc_passwd"
# This prevents PATH TRAVERSAL attacks where a malicious filename could
# overwrite system files

# --- Azure SDKs ---
from openai import AzureOpenAI
# AzureOpenAI → The official OpenAI Python SDK configured for Azure endpoints
# It handles authentication, retries, and API versioning

from azure.cosmos import CosmosClient, PartitionKey, exceptions
# CosmosClient  → Connects to Azure Cosmos DB (our NoSQL database)
# PartitionKey  → Defines how data is distributed across Cosmos DB partitions
# exceptions    → Cosmos-specific errors like CosmosResourceNotFoundError

from azure.identity import DefaultAzureCredential
# DefaultAzureCredential → The "Swiss Army knife" of Azure authentication
# It tries multiple auth methods in order:
#   1. Environment variables (AZURE_CLIENT_ID, etc.)
#   2. Managed Identity (when deployed on Azure)
#   3. Azure CLI (az login) — this is what we use in development
#   4. VS Code credential
#   5. Azure PowerShell
# Benefit: Same code works locally AND in production without changes

# --- Document parsers ---
from PyPDF2 import PdfReader    # Reads and extracts text from PDF files
from docx import Document       # Reads and extracts text from Word (.docx) files
from dotenv import load_dotenv  # Reads .env file and sets environment variables
```

**Logic: Why these specific imports?**
- We need **Flask** (web server) + **Azure SDKs** (cloud services) + **file parsers** (text extraction)
- Every import serves a specific purpose — no unused libraries
- `DefaultAzureCredential` is the key security decision: it eliminates hardcoded API keys

---

### Section 2: App Configuration — Setting the Rules

```python
load_dotenv()
# ↑ Reads the .env file in the project root and loads key=value pairs
# into environment variables. After this line, os.getenv("AZURE_OPENAI_ENDPOINT")
# returns the value from .env.
#
# IMPORTANT: load_dotenv() does NOT override existing environment variables.
# If AZURE_OPENAI_ENDPOINT is already set in the system, .env won't overwrite it.
# This is by design — system env vars take priority over .env.

app = Flask(__name__)
# ↑ Creates the Flask application object.
# __name__ tells Flask where to find templates/ and static/ folders
# (relative to THIS file's location).

app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB
# ↑ SECURITY: Limits upload size to 50 MB.
# Without this, an attacker could upload a 10 GB file and crash the server
# (denial-of-service attack). Flask will return 413 (Request Entity Too Large)
# automatically for any request body exceeding this limit.
#
# Calculation: 50 * 1024 * 1024 = 52,428,800 bytes = 50 MB

app.config["UPLOAD_FOLDER"] = os.path.join(os.path.dirname(__file__), "uploads")
# ↑ Builds an absolute path to the uploads/ folder next to app.py.
# os.path.dirname(__file__) = the directory containing app.py
# os.path.join(..., "uploads") = appends "uploads" to that path
#
# Example result: "C:\NOTEBOOKLM - AZURE Project\uploads"
# Using absolute paths prevents confusion about "where is uploads/ relative to?"

ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "txt"}
# ↑ SECURITY: Allowlist of permitted file types.
# This is an ALLOWLIST pattern (only accept these) rather than a BLOCKLIST
# (reject .exe, .bat, etc.). Allowlists are safer because you can't forget
# to block a dangerous extension.
#
# Using a set {} instead of a list [] because `in` lookups on sets are O(1)
# vs O(n) for lists. Minor optimization but good practice.

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
# ↑ Creates the uploads/ directory if it doesn't exist.
# exist_ok=True means "don't crash if it already exists."
# Without exist_ok=True, running the app a second time would raise FileExistsError.
```

**Logic: Why configure these up front?**
- Flask needs to know its limits BEFORE handling any requests
- The upload folder must exist BEFORE the first file is saved
- These are "fail-fast" checks — if something is wrong, the app crashes at startup (good!) rather than silently failing later (bad!)

---

### Section 3: Azure Client Initialization — Connecting to Cloud Services

```python
credential = DefaultAzureCredential()
# ↑ Creates ONE credential object that is SHARED across all Azure services.
#
# WHY SHARE? Because each service (OpenAI, Cosmos DB) needs Azure AD tokens.
# Creating one credential avoids duplicate token caches and is more efficient.
#
# HOW IT WORKS: When any SDK needs a token, it calls:
#   credential.get_token("https://cognitiveservices.azure.com/.default")
# This returns a short-lived token (1 hour) that is auto-refreshed.
#
# COMPARED TO API KEYS:
# - API key: static string, never expires, full access if leaked
# - AAD token: expires in 1 hour, tied to your identity, revocable
```

```python
aoai_client = AzureOpenAI(
    azure_ad_token_provider=lambda: credential.get_token(
        "https://cognitiveservices.azure.com/.default"
    ).token,
    # ↑ This lambda is a FUNCTION that gets called every time the SDK needs
    # a token. It's not called once — it's called repeatedly, so the SDK
    # always has a fresh token.
    #
    # The ".default" scope means "give me whatever permissions this resource allows."
    # For Cognitive Services, this grants the roles assigned via RBAC
    # (we assigned "Cognitive Services OpenAI User" earlier).
    #
    # .token extracts just the token string from the AccessToken object.

    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview"),
    # ↑ API version determines which features are available.
    # o4-mini REQUIRES "2024-12-01-preview" or later.
    # Using "2025-01-01-preview" supports both GPT-4.1 and o4-mini.
    #
    # The second argument ("2025-01-01-preview") is the DEFAULT if the
    # environment variable is not set.

    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    # ↑ The base URL of your Azure OpenAI resource.
    # Example: "https://learnmap-openai.openai.azure.com/"
    # All API calls will be sent to this endpoint.
)

GPT_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-41")
# ↑ The deployment name for GPT-4.1 (configured when we ran
# `az cognitiveservices account deployment create --deployment-name gpt-41`)
# This is NOT the model name — it's YOUR name for the deployment.

O4_MINI_DEPLOYMENT = os.getenv("AZURE_O4MINI_DEPLOYMENT_NAME", "o4-mini")
# ↑ The deployment name for the o4-mini reasoning model.

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "gpt")
# ↑ Which model to use when the user doesn't specify one.
# "gpt" = GPT-4.1, "o4-mini" = o4-mini reasoning model.
```

```python
cosmos_client = CosmosClient(
    os.getenv("COSMOS_DB_ENDPOINT"),
    # ↑ Example: "https://learnmap-cosmosdb.documents.azure.com:443/"
    # Port 443 = HTTPS (encrypted connection)

    credential=credential,
    # ↑ REUSE the same DefaultAzureCredential object.
    # Cosmos DB also supports AAD authentication when RBAC is configured.
    # We assigned "Cosmos DB Built-in Data Contributor" role earlier.
)

database = cosmos_client.get_database_client("learner_assistant")
# ↑ Gets a REFERENCE to the database (doesn't create it).
# The database must already exist (we created it with az cosmosdb sql database create).
# We use get_database_client() instead of create_database_if_not_exists()
# because some subscriptions restrict database creation via RBAC.

container = database.get_container_client("documents")
# ↑ Gets a REFERENCE to the container (like a "table" in SQL).
# The container has partition key /id, which we set during creation.
# All CRUD operations (read, write, delete) go through this container object.
```

**Logic: Why initialize clients at module level (outside any function)?**
- These are **singletons** — we create them ONCE when the app starts
- Every request reuses the same client objects (no repeated connection setup)
- Creating a new `CosmosClient` or `AzureOpenAI` per request would waste time establishing connections and fetching tokens

---

### Section 4: File Validation — The First Line of Defense

```python
def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    # ↑ Two checks combined with `and`:
    #
    # CHECK 1: "." in filename
    #   Ensures the filename HAS an extension.
    #   "readme" → False (no dot, no extension)
    #   "readme.pdf" → True (has a dot)
    #
    # CHECK 2: filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    #   rsplit(".", 1) splits from the RIGHT, at most 1 time:
    #     "report.final.pdf" → ["report.final", "pdf"]
    #     "hack.exe" → ["hack", "exe"]
    #   [1] takes the extension part
    #   .lower() normalizes: "PDF" → "pdf", "Docx" → "docx"
    #   `in ALLOWED_EXTENSIONS` checks against our allowlist set
    #
    # WHY rsplit instead of split?
    #   "my.file.name.pdf".split(".") = ["my", "file", "name", "pdf"]  ← 4 parts!
    #   "my.file.name.pdf".rsplit(".", 1) = ["my.file.name", "pdf"]    ← exactly 2 parts
    #   rsplit from the right ensures we always get the LAST extension.
    #
    # SECURITY NOTE: This only checks the file NAME, not the actual content.
    # A malicious user could rename a .exe to .pdf. For production, you'd also
    # check the file's MIME type or magic bytes. But for our workshop, the
    # allowlist is sufficient because we only ever READ text from the file.
```

---

### Section 5: Text Extraction — Converting Files to Plain Text

```python
def extract_text_from_pdf(filepath: str) -> str:
    reader = PdfReader(filepath)
    # ↑ Opens the PDF file and creates a reader object.
    # PdfReader parses the PDF structure (pages, fonts, metadata).

    parts: list[str] = []
    # ↑ Accumulator list — we'll add each page's text here.
    # Type hint `list[str]` documents that this holds strings.

    for page in reader.pages:
        # ↑ reader.pages is a list of Page objects (one per PDF page).

        text = page.extract_text()
        # ↑ Extracts visible text from this page.
        # NOTE: This does NOT extract text from images in the PDF.
        # For scanned PDFs, you'd need OCR (e.g., Azure Document Intelligence).

        if text:
            parts.append(text)
            # ↑ Only add if text is not None/empty.
            # Some PDF pages are purely images with no extractable text.

    return "\n".join(parts)
    # ↑ Join all pages with newlines into one big string.
    # "\n".join(["page1 text", "page2 text"]) = "page1 text\npage2 text"
```

```python
def extract_text_from_docx(filepath: str) -> str:
    doc = Document(filepath)
    # ↑ Opens the .docx file (which is actually a ZIP of XML files).
    # python-docx parses the XML and gives us paragraph objects.

    return "\n".join(p.text for p in doc.paragraphs)
    # ↑ Generator expression: iterates through every paragraph, gets its text,
    # and joins them with newlines.
    #
    # NOTE: This extracts paragraph text only — it skips:
    # - Tables (would need doc.tables)
    # - Headers/footers
    # - Text inside text boxes
    # For a workshop, paragraphs cover most content.
```

```python
def extract_text(filepath: str, filename: str) -> str:
    ext = filename.rsplit(".", 1)[1].lower()
    # ↑ Get the file extension (same logic as allowed_file)

    if ext == "pdf":
        return extract_text_from_pdf(filepath)
    if ext in ("docx", "doc"):
        return extract_text_from_docx(filepath)
    if ext == "txt":
        with open(filepath, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read()
            # ↑ encoding="utf-8" handles most text files correctly.
            # errors="replace" replaces undecodable bytes with '�' instead of crashing.
            # This is defensive coding — we don't know what encoding users will upload.
    return ""
    # ↑ Fallback: return empty string for unknown types.
    # This shouldn't happen because allowed_file() already filtered,
    # but defense-in-depth means we handle it anyway.
```

**Logic: Why separate functions for each format?**
- **Single Responsibility Principle** — each function does ONE thing (extract from ONE format)
- Easy to add support for new formats later (just add a new `extract_text_from_xxx` function)
- Easy to test individually — you can test PDF extraction without having Word files

---

### Section 6: Text Chunking — Fitting Content into AI Token Limits

```python
def chunk_text(text: str, max_chars: int = 12_000) -> list[str]:
    # ↑ Splits a long text into chunks of at most max_chars characters.
    #
    # WHY 12,000 characters?
    # - GPT-4.1 supports ~128K tokens, but 1 token ≈ 4 characters
    # - 12,000 chars ≈ 3,000 tokens per chunk
    # - We take up to 5 chunks (see generate_mindmap), so ~15,000 tokens total
    # - This leaves plenty of room for the system prompt + output tokens
    # - Sending less text = lower cost and faster response

    chunks: list[str] = []

    while text:
        # ↑ Keep looping until all text is consumed.

        if len(text) <= max_chars:
            chunks.append(text)
            break
            # ↑ Last chunk — text fits entirely. Add it and stop.

        # --- Smart split point selection (priority order) ---

        bp = text.rfind("\n", 0, max_chars)
        # ↑ PRIORITY 1: Find the last NEWLINE within the limit.
        # Splitting at a newline keeps paragraphs intact.
        # rfind searches RIGHT-TO-LEFT (finds the LAST occurrence).
        # rfind("\\n", 0, 12000) searches only within the first 12K chars.

        if bp == -1:
            bp = text.rfind(". ", 0, max_chars)
            # ↑ PRIORITY 2: No newline found → find the last SENTENCE boundary.
            # ". " (dot-space) is a simple sentence detector.
            # This avoids splitting mid-sentence like "Dr. Smith" → "Dr." / "Smith"

        if bp == -1:
            bp = max_chars
            # ↑ PRIORITY 3: No sentence boundary either → hard cut at max_chars.
            # This is a fallback for pathological text (e.g., one giant line
            # with no periods). Rare but we must handle it.

        chunks.append(text[:bp])
        # ↑ Take everything up to the break point.

        text = text[bp:]
        # ↑ Remove the chunk we just took. Loop processes the remainder.

    return chunks
```

**Logic: Why not just truncate at 60K characters?**
- We COULD just do `text[:60000]`, but that risks cutting mid-word or mid-sentence
- Chunking at natural boundaries (paragraph → sentence → hard limit) preserves readability
- The AI produces better results when input text makes grammatical sense

---

### Section 7: LLM Caller — The AI Interface

```python
def _call_llm(system_prompt: str, user_prompt: str, model: str = "gpt",
              max_tokens: int = 4096, json_mode: bool = False) -> str:
    """Route to the right LLM backend and return the text response."""
    # ↑ The underscore prefix (_call_llm) is a Python convention meaning:
    # "This is an internal/private function — don't call it from outside this module."
    # It's not enforced, but signals intent to other developers.

    deployment = O4_MINI_DEPLOYMENT if model == "o4-mini" else GPT_DEPLOYMENT
    # ↑ Ternary expression — picks the right deployment name.
    # If model is "o4-mini" → use "o4-mini" deployment
    # Otherwise → use "gpt-41" deployment (default)
    #
    # IMPORTANT: "deployment" is YOUR name for the model instance on Azure.
    # It's NOT the model name (gpt-4.1 vs o4-mini). Azure requires deployment names
    # because you could have multiple deployments of the same model with different settings.

    # --- Handle API differences between models ---

    token_param = "max_completion_tokens" if model == "o4-mini" else "max_tokens"
    # ↑ o4-mini REJECTS the "max_tokens" parameter.
    # It requires "max_completion_tokens" instead.
    # This is because reasoning models have internal "thinking" tokens
    # that don't count toward max_completion_tokens.
    #
    # API error without this fix:
    # "Unsupported parameter: 'max_tokens' is not supported with this model"

    kwargs = dict(
        model=deployment,
        # ↑ Which deployed model to call

        messages=[
            {"role": "system", "content": system_prompt},
            # ↑ SYSTEM message: sets the AI's persona/behavior.
            # "You are an expert educator" tells the model HOW to respond.
            # The system message is processed before the user message.

            {"role": "user", "content": user_prompt},
            # ↑ USER message: the actual question or document text.
            # This is what the model analyzes and responds to.
        ],
    )
    kwargs[token_param] = max_tokens
    # ↑ Set the token limit using the correct parameter name.
    # dict[key] = value dynamically adds a key to the dictionary.
    # Result: either {"max_tokens": 4096} or {"max_completion_tokens": 4096}

    if model != "o4-mini":
        kwargs["temperature"] = 0.3
        # ↑ Temperature controls randomness in the output.
        #
        # temperature = 0.0 → DETERMINISTIC (always picks most likely token)
        # temperature = 0.3 → SLIGHTLY CREATIVE (good for structured data)
        # temperature = 1.0 → DIVERSE (good for creative writing)
        # temperature = 2.0 → VERY RANDOM (often incoherent)
        #
        # We use 0.3 for mind maps because we want CONSISTENT, STRUCTURED output.
        # o4-mini ignores temperature entirely — reasoning models manage their own
        # randomness internally.

    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
        # ↑ JSON MODE: forces the model to return valid JSON.
        # Without this, GPT might include explanatory text like:
        #   "Here's the mind map: ```json { ... } ```"
        # With json_mode, it returns PURE JSON: { ... }
        #
        # This is critical for generate_mindmap() because we call json.loads()
        # on the response — any non-JSON text would crash.

    response = aoai_client.chat.completions.create(**kwargs)
    # ↑ **kwargs unpacks the dictionary as keyword arguments:
    #   create(model="gpt-41", messages=[...], max_tokens=4096, temperature=0.3)
    #
    # This makes an HTTPS POST to Azure OpenAI's completions endpoint.
    # The SDK handles authentication (using our AAD token provider),
    # retries (on transient errors), and response parsing.

    return response.choices[0].message.content
    # ↑ The API returns a list of "choices" (possible responses).
    # We always get 1 choice (unless we request n>1).
    # .message.content is the actual text the AI generated.
```

---

### Section 8: Mind Map Generation — The Core AI Prompt

```python
def generate_mindmap(text: str, filename: str, model: str = "gpt") -> dict:
    chunks = chunk_text(text)
    # ↑ Split the document into manageable chunks

    combined = "\n\n".join(chunks[:5])[:60_000]
    # ↑ Take at most 5 chunks and join them with double newlines.
    # Then truncate to 60,000 characters total.
    #
    # WHY ONLY 5 CHUNKS?
    # 5 chunks × 12,000 chars = 60,000 chars max (before the [:60_000] cap)
    # ~60K chars ≈ ~15K tokens input
    # This keeps the input well within model limits and controls cost.
    #
    # WHY [:60_000] after joining?
    # Safety net — if chunks are uneven sizes, this ensures we never exceed 60K.

    prompt = (
        "Analyze the following document and create a comprehensive hierarchical "
        "mind map structure for learning.\n\n"
        # ↑ Clear instruction: what the AI should DO with the document

        "Rules:\n"
        "1. Root node = document's main topic / title.\n"
        "2. 4-8 primary branches for major themes or chapters.\n"
        "3. 2-5 secondary branches per primary branch for key concepts.\n"
        "4. 1-3 tertiary branches per secondary branch for important details.\n\n"
        # ↑ STRUCTURAL CONSTRAINTS: Forces a specific hierarchy depth.
        # Without these rules, the AI might create 50 top-level nodes (too flat)
        # or nest 10 levels deep (too deep to visualize).
        # 4-8 → 2-5 → 1-3 creates a balanced, readable tree.

        "For EACH node provide:\n"
        '- "name": concise label (2-6 words)\n'
        '- "summary": 2-4 sentence explanation\n'
        '- "children": array of child nodes (empty [] for leaves)\n\n'
        # ↑ JSON SCHEMA DEFINITION: Tells the AI exactly what fields to include.
        # "2-6 words" for names prevents verbose labels that won't fit in the visualization.
        # "2-4 sentences" for summaries keeps tooltips readable.
        # "children: []" for leaves ensures proper JSON structure at the bottom of the tree.

        "Return ONLY valid JSON.\n\n"
        # ↑ Reinforces json_mode — no explanatory text, no markdown code fences.

        f"Document filename: {filename}\n\n"
        # ↑ Gives the AI a hint about the document's topic from its name.
        # "machine-learning-basics.pdf" helps the AI name the root node appropriately.

        f"Document content:\n{combined}"
        # ↑ The actual document text to analyze.
    )

    system_prompt = (
        "You are an expert educator and knowledge organizer. "
        "Create detailed, well-structured mind maps that help "
        "learners understand complex topics. Always return valid JSON only."
    )
    # ↑ SYSTEM PROMPT: Establishes the AI's role.
    # "expert educator" → uses pedagogical structure (intro → concepts → details)
    # "knowledge organizer" → creates logical groupings
    # "Always return valid JSON only" → reinforced instruction for output format

    raw = _call_llm(system_prompt, prompt, model=model,
                    max_tokens=4096, json_mode=True)
    # ↑ max_tokens=4096 limits the response to ~4K tokens.
    # A mind map with 40-60 nodes typically uses 2000-3500 tokens.
    # 4096 gives enough room while capping cost.

    return json.loads(raw)
    # ↑ Parse the JSON string into a Python dictionary.
    # This dict has the structure: {"name": ..., "summary": ..., "children": [...]}
    # If the AI returns invalid JSON (rare with json_mode), this will raise
    # json.JSONDecodeError, which is caught by the upload endpoint's try/except.
```

---

### Section 9: Node Deep-Dive — Detailed AI Explanations

```python
def get_node_details(node_name: str, node_summary: str, doc_text: str,
                     model: str = "gpt") -> str:
    excerpt = doc_text[:30_000]
    # ↑ Only send the first 30K characters of the document.
    # Node details need less context than mind map generation.
    # This halves the input tokens = halves the cost per deep-dive.

    prompt = (
        f'Based on the following document, provide a detailed explanation about '
        f'the topic: "{node_name}"\n\n'
        # ↑ f-string inserts the clicked node's name into the prompt.
        # Example: 'the topic: "Neural Networks"'
        # Quoting the topic name prevents prompt injection issues.

        f"Current summary: {node_summary}\n\n"
        # ↑ Gives the AI context about what the mind map already says.
        # This helps the AI provide ADDITIONAL details rather than repeating the summary.

        "Please provide:\n"
        "1. A comprehensive explanation (3-5 paragraphs)\n"
        "2. Key takeaways (bullet points)\n"
        "3. Related concepts from the document\n"
        "4. Examples or practical applications if applicable\n\n"
        # ↑ STRUCTURED OUTPUT FORMAT: Tells the AI exactly what sections to include.
        # This creates consistent, well-organized responses that are easy to read.
        # "if applicable" for examples prevents the AI from inventing examples
        # when the document doesn't contain any.

        "Format the response in Markdown.\n\n"
        # ↑ Markdown output is rendered by marked.js in the browser.
        # This gives us bold, bullet points, headings, and code blocks for free.

        f"Document content:\n{excerpt}"
    )

    system_prompt = (
        "You are an expert educator. Provide detailed, clear "
        "explanations that help learners deeply understand concepts. "
        "Use Markdown formatting."
    )
    # ↑ Different system prompt than mind map generation.
    # Here we want EXPLANATORY text, not structured JSON.
    # "deeply understand" encourages thorough explanations.

    return _call_llm(system_prompt, prompt, model=model, max_tokens=2048)
    # ↑ max_tokens=2048 (half of mind map generation).
    # A good explanation is 500-1500 tokens. 2048 allows detailed answers
    # without runaway-long responses.
    #
    # NOTE: json_mode is NOT used here (defaults to False).
    # We want free-form Markdown text, not JSON.
```

---

### Section 10: Routes — The API Gateway

```python
@app.route("/")
def index():
    return render_template("index.html")
# ↑ ROUTE DECORATOR: @app.route("/") registers this function for URL path "/".
#
# When a browser visits http://127.0.0.1:5000/, Flask calls index().
# render_template("index.html") does:
#   1. Looks for templates/index.html (Flask convention: templates/ folder)
#   2. Processes any Jinja2 template tags (we don't use any)
#   3. Returns the HTML as an HTTP response
#   4. Browser receives HTML and renders the page
```

```python
@app.route("/upload", methods=["POST"])
def upload_file():
    # ↑ methods=["POST"] means this route ONLY accepts POST requests.
    # GET /upload would return 405 Method Not Allowed.
    # POST is correct for uploads because we're SENDING data to the server.

    # --- VALIDATION LAYER (3 checks before any processing) ---

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    # ↑ Check 1: Was a file included in the request at all?
    # request.files is a dict of uploaded files, keyed by form field name.
    # 400 = Bad Request (client error, not server error)

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    # ↑ Check 2: Does the file have a name?
    # Browsers send an empty filename if the user clicks "Upload" without selecting a file.

    if not allowed_file(file.filename):
        return jsonify({"error": "File type not allowed. Use PDF, DOCX, or TXT."}), 400
    # ↑ Check 3: Is the file type in our allowlist?
    # Rejects .exe, .py, .js, .zip, etc.

    # --- SAFE FILE HANDLING ---

    filename = secure_filename(file.filename)
    # ↑ Sanitizes the filename:
    #   "../../etc/passwd"  → "etc_passwd"
    #   "my file (1).pdf"   → "my_file_1.pdf"
    #   "../../../hack.exe" → "hack.exe"  (but blocked by allowed_file above)
    # This prevents PATH TRAVERSAL attacks.

    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(filepath)
    # ↑ Saves the uploaded file to disk temporarily.
    # We MUST save to disk because PyPDF2 and python-docx need file paths, not streams.

    try:
        text = extract_text(filepath, filename)
        if not text.strip():
            return jsonify({"error": "Could not extract text from the document."}), 400
        # ↑ .strip() removes whitespace. An empty string or whitespace-only = no useful text.
        # This catches scanned PDFs (images, no text) or empty files.

        selected_model = request.form.get("model", DEFAULT_MODEL)
        # ↑ Gets the model choice from the form data.
        # request.form contains key-value pairs from FormData (sent by the browser).
        # Default to GPT if no model specified.

        mindmap = generate_mindmap(text, filename, model=selected_model)
        # ↑ THE BIG CALL: Sends text to Azure OpenAI and gets back a mind map JSON dict.
        # This is the slowest part of the request (2-15 seconds depending on document size).

        doc_id = str(uuid.uuid4())
        # ↑ Generate a unique ID for this document.
        # UUID4 = random UUID (no timestamp or MAC address embedded).
        # Example: "550e8400-e29b-41d4-a716-446655440000"
        # Collision probability: astronomically low (2^122 possible values).

        document = {
            "id": doc_id,                              # Unique ID (also partition key)
            "filename": filename,                       # Original filename (sanitized)
            "uploadDate": datetime.utcnow().isoformat(),# ISO 8601 timestamp
            "textContent": text[:100_000],              # First 100K chars of extracted text
            "mindMap": mindmap,                         # The JSON mind map structure
            "status": "processed",                      # Status flag
        }
        # ↑ This dict becomes a JSON document in Cosmos DB.
        #
        # WHY text[:100_000]?
        # Cosmos DB has a 2 MB limit per item. 100K characters ≈ 100 KB of text.
        # Plus the mind map JSON ≈ 10-20 KB. Total is well under 2 MB.
        # Storing the text allows us to do deep-dives later without re-uploading.

        container.upsert_item(document)
        # ↑ UPSERT = INSERT if new, UPDATE if exists (based on id + partition key).
        # We use upsert instead of create to avoid errors if someone uploads
        # the same file twice (extremely unlikely with UUID4, but defensive).

        return jsonify({
            "id": doc_id,
            "filename": filename,
            "mindMap": mindmap,
            "message": "Document processed successfully",
        })
        # ↑ Return the mind map to the browser immediately.
        # The frontend doesn't need to make a second request to fetch it.

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
        # ↑ 500 = Internal Server Error. Catches any unexpected errors.
        # str(exc) converts the exception to a readable message.
        # In production, you'd log the full traceback and return a generic message.

    finally:
        if os.path.exists(filepath):
            os.remove(filepath)
        # ↑ CRITICAL CLEANUP: Delete the uploaded file regardless of success or failure.
        #
        # WHY in finally?
        # `finally` runs NO MATTER WHAT — even if an exception is raised.
        # Without finally, a crash during processing would leave user files on disk forever.
        # This is both a SECURITY measure (user data doesn't pile up on disk)
        # and a STORAGE measure (prevents the uploads/ folder from growing indefinitely).
```

```python
@app.route("/documents", methods=["GET"])
def list_documents():
    query = (
        "SELECT c.id, c.filename, c.uploadDate, c.status "
        "FROM c ORDER BY c.uploadDate DESC"
    )
    # ↑ SQL-like query language (Cosmos DB's SQL API).
    # SELECT specific fields (not SELECT * — we don't need textContent for the list).
    # ORDER BY uploadDate DESC shows newest documents first.
    #
    # "c" is an alias for the container — Cosmos DB convention.
    # NOT fetching textContent here is IMPORTANT — it could be 100KB per document.
    # For a list view, we only need id, filename, date, and status.

    items = list(
        container.query_items(query=query, enable_cross_partition_query=True)
    )
    # ↑ enable_cross_partition_query=True allows querying ALL partitions.
    # Since each document has a unique partition key (its id), listing ALL documents
    # requires crossing partitions. This is slightly slower than a single-partition
    # query, but necessary for listing all documents.
    #
    # list() converts the lazy iterator to an actual list (Cosmos SDK returns pages).

    return jsonify(items)
    # ↑ Returns a JSON array of document metadata.
```

```python
@app.route("/node-details", methods=["POST"])
def node_details():
    data = request.get_json(silent=True) or {}
    # ↑ Parses the JSON body of the POST request.
    # silent=True means "return None instead of raising an error if JSON is invalid."
    # `or {}` provides an empty dict if JSON is None/empty — prevents KeyError below.

    node_name = data.get("nodeName")
    node_summary = data.get("nodeSummary", "")
    doc_id = data.get("documentId")
    selected_model = data.get("model", DEFAULT_MODEL)
    # ↑ .get() returns None if the key doesn't exist (unlike dict[key] which crashes).
    # .get("model", DEFAULT_MODEL) provides a default value.

    if not node_name or not doc_id:
        return jsonify({"error": "Missing required fields"}), 400
    # ↑ Validation: both fields are required for a meaningful response.

    try:
        item = container.read_item(item=doc_id, partition_key=doc_id)
        # ↑ POINT READ: Fetches one document by id + partition key.
        # This is the FASTEST Cosmos DB operation (O(1) — no query needed).
        # Costs exactly 1 RU (Request Unit), regardless of document size.

        details = get_node_details(
            node_name, node_summary, item.get("textContent", ""),
            model=selected_model,
        )
        # ↑ Sends the document text + node info to Azure OpenAI.
        # item.get("textContent", "") safely handles documents without text.

        return jsonify({"details": details})

    except exceptions.CosmosResourceNotFoundError:
        return jsonify({"error": "Document not found"}), 404
        # ↑ 404 = Not Found. Specific Cosmos exception for missing items.
        # Better than a generic 500 error — the client knows to show "not found" UI.

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
```

```python
@app.route("/document/<doc_id>", methods=["DELETE"])
def delete_document(doc_id):
    # ↑ <doc_id> is a URL PARAMETER — Flask extracts it from the URL.
    # DELETE /document/550e8400-... → doc_id = "550e8400-..."
    #
    # methods=["DELETE"] — only accepts HTTP DELETE method.
    # Using the correct HTTP method is RESTful design:
    #   GET = read, POST = create, PUT = update, DELETE = remove

    try:
        container.delete_item(item=doc_id, partition_key=doc_id)
        # ↑ Removes the document from Cosmos DB permanently.
        # Both item id AND partition key are required for deletion.

        return jsonify({"message": "Document deleted"})

    except exceptions.CosmosResourceNotFoundError:
        return jsonify({"error": "Document not found"}), 404
```

```python
@app.route("/models", methods=["GET"])
def get_models():
    models = [
        {"id": "gpt", "name": "GPT-4.1 (Azure OpenAI)", "available": True},
        {"id": "o4-mini", "name": "o4-mini Reasoning (Azure OpenAI)", "available": True},
    ]
    return jsonify({"models": models, "default": DEFAULT_MODEL})
    # ↑ Returns the list of available models as JSON.
    # The frontend calls this on page load to populate the model selector dropdown.
    #
    # WHY an API endpoint instead of hardcoding in HTML?
    # Because models might be added/removed dynamically (e.g., based on config).
    # The frontend stays decoupled from backend model configuration.
```

---

### Section 11: Server Startup

```python
if __name__ == "__main__":
    app.run(debug=True, port=5000)
# ↑ This block only runs when you execute `python app.py` directly.
# It does NOT run when app.py is imported by another module.
#
# debug=True enables:
#   1. AUTO-RELOAD: Flask restarts when you save any .py file
#   2. DEBUGGER: Shows a detailed error page in the browser on crash
#   3. LOGGING: More verbose output in the terminal
#
# port=5000: The server listens on http://127.0.0.1:5000
#   127.0.0.1 = localhost (only accessible from this machine)
#   To allow access from other machines: app.run(host="0.0.0.0")
#
# ⚠️ NEVER use debug=True in production:
#   - The debugger allows remote code execution via the browser
#   - Detailed error pages expose internal code paths to attackers
#   - Use a production WSGI server like gunicorn or waitress instead
```

---

### Section 12: Data Flow Summary

Here is the complete request lifecycle when a user uploads a document:

```
USER ACTION: Drops "ml-book.pdf" onto the upload area

BROWSER (app.js):
  1. handleFile() creates FormData with file + model choice
  2. fetch("/upload", {method: "POST", body: formData})

FLASK (app.py):
  3.  upload_file() receives the request
  4.  ✓ Validates: file exists? filename not empty? extension allowed?
  5.  secure_filename("ml-book.pdf") → "ml-book.pdf"
  6.  Saves to uploads/ml-book.pdf
  7.  extract_text_from_pdf("uploads/ml-book.pdf")
       → PdfReader opens PDF, loops through pages, extracts text
       → Returns "Chapter 1: Introduction to ML..."
  8.  chunk_text(text, 12000)
       → Splits into chunks at paragraph/sentence boundaries
       → Returns ["chunk1...", "chunk2...", "chunk3..."]
  9.  generate_mindmap() builds the prompt:
       System: "You are an expert educator..."
       User: "Analyze this document... Rules: 1. Root node = ..."
  10. _call_llm() sends to Azure OpenAI:
       → HTTPS POST to learnmap-openai.openai.azure.com
       → Uses AAD token (from DefaultAzureCredential)
       → Waits 2-15 seconds for response
       → Returns JSON string: '{"name":"ML Basics","children":[...]}'
  11. json.loads(raw) → Python dict
  12. uuid4() generates doc ID: "a1b2c3d4-..."
  13. container.upsert_item({id, filename, text, mindmap, date, status})
       → HTTPS POST to learnmap-cosmosdb.documents.azure.com
       → Document stored in Cosmos DB
  14. Returns JSON response: {id, filename, mindMap, message}
  15. finally: os.remove("uploads/ml-book.pdf") ← cleanup

BROWSER (app.js):
  16. Receives JSON response
  17. loadDocuments() refreshes sidebar
  18. activateDocument() calls d3.hierarchy() → d3.tree() → renders SVG
  19. User sees the interactive mind map!

TOTAL TIME: 5-20 seconds (mostly waiting for Azure OpenAI)
```
