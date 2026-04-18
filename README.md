# LearnMap AI — Intelligent Learner Assistant (NotebookLM-like on Azure)

An intelligent learning assistant built on Azure that transforms documents (PDF, DOCX, TXT) into interactive mind maps for accelerated learning — similar to Google's NotebookLM but powered entirely by Azure services.

![Azure](https://img.shields.io/badge/Azure-Powered-0078D4?logo=microsoftazure)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?logo=flask)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Table of Contents

1. [Features](#features)
2. [Architecture Overview](#architecture-overview)
3. [Azure Resources Created](#azure-resources-created)
4. [Step-by-Step Azure Setup](#step-by-step-azure-setup)
5. [Step-by-Step Application Build](#step-by-step-application-build)
6. [Project Structure](#project-structure)
7. [Security Breakdown](#security-breakdown)
8. [Cost Breakdown](#cost-breakdown)
9. [How to Run](#how-to-run)
10. [Screenshots](#screenshots)

---

## Features

- **Document Upload** — Drag-and-drop or click to upload PDF, DOCX, or TXT files (up to 50 MB)
- **AI-Powered Mind Maps** — Azure OpenAI (GPT-4.1) analyzes documents and generates hierarchical mind maps
- **Interactive Visualization** — D3.js tree with zoom, pan, expand/collapse, and color-coded branches
- **Click-to-Explore** — Click any node to see its summary; click "Explore More with AI" for a deep-dive explanation
- **Multi-Document Support** — Upload multiple documents; switch between them via the sidebar
- **Download PNG** — Export the mind map as a high-resolution PNG image
- **Persistent Storage** — All documents and mind maps are stored in Azure Cosmos DB
- **Azure AD Authentication** — Zero API keys at runtime; uses `DefaultAzureCredential` for both OpenAI and Cosmos DB

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      User Browser                       │
│   ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│   │  Upload   │  │  Mind Map    │  │  Detail Panel    │  │
│   │  Sidebar  │  │  (D3.js)     │  │  (AI Deep Dive)  │  │
│   └──────────┘  └──────────────┘  └──────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP (REST API)
                        ▼
              ┌─────────────────────┐
              │   Flask Backend     │
              │   (Python 3.10+)    │
              │                     │
              │  • Upload handler   │
              │  • Text extraction  │
              │  • Mind map gen     │
              │  • Node details     │
              └──┬──────┬──────┬────┘
                 │      │      │
    AAD Token    │      │      │  Key / AAD
                 ▼      │      ▼
  ┌───────────────┐    │    ┌──────────────────────┐
  │ Azure OpenAI  │    │    │ Azure AI Foundry     │
  │ (GPT-4.1)     │    │    │ (Claude Sonnet)      │
  │               │    │    │                      │
  │ • Mind map    │    │    │ • Serverless MaaS    │
  │   generation  │    │    │ • Mind map gen       │
  │ • Deep dive   │    │    │ • Deep dive          │
  └───────────────┘    │    └──────────────────────┘
                       │
              AAD Token│
                       ▼
              ┌──────────────────┐
              │ Azure Cosmos DB  │
              │ (NoSQL/Serverless│
              │  AAD-only auth)  │
              │                  │
              │ • Document store │
              │ • Mind map JSON  │
              │ • Text content   │
              └──────────────────┘
```

---

## Azure Resources Created

All resources live under a single resource group: **`Notebook-LM-Like-on-Azure`**

| # | Resource | Name | Type / SKU | Region |
|---|----------|------|-----------|--------|
| 1 | **Resource Group** | `Notebook-LM-Like-on-Azure` | — | East US |
| 2 | **Azure OpenAI** | `learnmap-openai` | Cognitive Services / S0 | East US |
| 3 | **GPT-4.1 Deployment** | `gpt-41` | GlobalStandard (10 TPM) | East US |
| 4 | **Azure Cosmos DB** | `learnmap-cosmosdb` | NoSQL / Serverless | West US 2 |
| 5 | **Cosmos DB Database** | `learner_assistant` | SQL Database | — |
| 6 | **Cosmos DB Container** | `documents` | Partition Key: `/id` | — |
| 7 | **AI Foundry Hub** | `learnmap-ai-hub-eastus2` | ML Workspace / Hub | East US 2 |
| 8 | **AI Foundry Project** | `learnmap-claude-project` | ML Workspace / Project | East US 2 |
| 9 | **Claude Deployment** | _(deploy via portal)_ | Serverless MaaS | East US 2 |

---

## Step-by-Step Azure Setup

### 1. Resource Group Creation
```bash
az group create --name "Notebook-LM-Like-on-Azure" --location eastus
```

### 2. Azure OpenAI Resource
```bash
az cognitiveservices account create \
  --name learnmap-openai \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --kind OpenAI --sku S0 --location eastus \
  --custom-domain learnmap-openai
```

### 3. Deploy GPT-4.1 Model
```bash
az cognitiveservices account deployment create \
  --name learnmap-openai \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --deployment-name gpt-41 \
  --model-name gpt-4.1 --model-version "2025-04-14" \
  --model-format OpenAI \
  --sku-capacity 10 --sku-name "GlobalStandard"
```

### 4. Azure Cosmos DB Account (Serverless)
```bash
az cosmosdb create \
  --name learnmap-cosmosdb \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --kind GlobalDocumentDB \
  --default-consistency-level Session \
  --locations regionName=westus2 failoverPriority=0 isZoneRedundant=false \
  --capabilities EnableServerless
```

### 5. Cosmos DB Database & Container
```bash
az cosmosdb sql database create \
  --account-name learnmap-cosmosdb \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --name learner_assistant

az cosmosdb sql container create \
  --account-name learnmap-cosmosdb \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --database-name learner_assistant \
  --name documents \
  --partition-key-path "/id"
```

### 6. RBAC Role Assignments (AAD Auth)

**Azure OpenAI — Cognitive Services OpenAI User:**
```bash
USER_ID=$(az ad signed-in-user show --query id -o tsv)
OPENAI_ID=$(az cognitiveservices account show --name learnmap-openai \
  --resource-group "Notebook-LM-Like-on-Azure" --query id -o tsv)

az role assignment create \
  --assignee $USER_ID \
  --role "Cognitive Services OpenAI User" \
  --scope $OPENAI_ID
```

**Cosmos DB — Built-in Data Contributor:**
```bash
az cosmosdb sql role assignment create \
  --account-name learnmap-cosmosdb \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --scope "/" \
  --principal-id $USER_ID \
  --role-definition-id "00000000-0000-0000-0000-000000000002"
```

### 7. Azure AI Foundry — Claude Deployment

Azure AI Foundry provides access to Anthropic's Claude models via **Models-as-a-Service (MaaS)**. Claude is available in **East US 2** and **Sweden Central**.

**Step 1 — Hub & Project were created via CLI:**
```bash
# Hub (already provisioned)
az rest --method PUT \
  --url "https://management.azure.com/subscriptions/<sub-id>/resourceGroups/Notebook-LM-Like-on-Azure/providers/Microsoft.MachineLearningServices/workspaces/learnmap-ai-hub-eastus2?api-version=2024-04-01" \
  --body '{"location":"eastus2","kind":"Hub","properties":{},"identity":{"type":"SystemAssigned"}}'

# Project (already provisioned)
az rest --method PUT \
  --url "https://management.azure.com/subscriptions/<sub-id>/resourceGroups/Notebook-LM-Like-on-Azure/providers/Microsoft.MachineLearningServices/workspaces/learnmap-claude-project?api-version=2024-04-01" \
  --body '{"location":"eastus2","kind":"Project","properties":{"hubResourceId":"<hub-resource-id>"},"identity":{"type":"SystemAssigned"}}'
```

**Step 2 — Deploy Claude via Azure AI Foundry Portal:**

> Claude marketplace subscriptions require terms acceptance via the portal.

1. Go to [Azure AI Foundry](https://ai.azure.com) → select **learnmap-claude-project**
2. Navigate to **Model catalog** → search **"Claude"**
3. Select a Claude model (e.g., Claude Sonnet 4.5, Claude Haiku 4.5)
4. Click **"Use this model"** → review pricing → **Deploy**
5. After deployment, note the **Target URI** and **Key** from the endpoint page
6. Add to `.env`:
   ```
   AZURE_CLAUDE_ENDPOINT=https://<your-endpoint>.eastus2.models.ai.azure.com
   AZURE_CLAUDE_KEY=<your-key>
   DEFAULT_MODEL=claude
   ```

**Available Claude models on Azure AI Foundry:**
| Model | Type | Best For |
|-------|------|----------|
| Claude Sonnet 4.5 | Preview | Balanced speed & quality |
| Claude Sonnet 4.6 | Preview | Latest capabilities |
| Claude Haiku 4.5 | Preview | Fast & cost-effective |
| Claude Opus 4.1–4.7 | Preview | Maximum quality |

---

## Step-by-Step Application Build

### Phase 1 — Backend (`app.py`)
1. **Flask app setup** — Configured with 50 MB upload limit, file type validation (PDF/DOCX/TXT)
2. **Azure AD authentication** — Single `DefaultAzureCredential` instance shared by both Azure OpenAI and Cosmos DB clients (zero API keys at runtime)
3. **Document processing pipeline**:
   - Upload → `werkzeug.secure_filename` for safe file handling
   - Text extraction → PyPDF2 for PDFs, python-docx for Word files, plain read for TXT
   - Chunking → Smart text splitting at sentence/paragraph boundaries (12K chars per chunk)
   - AI Analysis → GPT-4.1 generates a hierarchical JSON mind map structure
   - Storage → Document text + mind map JSON stored in Cosmos DB
   - Cleanup → Uploaded file deleted after processing (no files stored on disk)
4. **REST API endpoints**:
   - `POST /upload` — Upload and process a document
   - `GET /documents` — List all processed documents
   - `GET /mindmap/<id>` — Retrieve a specific mind map
   - `POST /node-details` — AI-powered deep-dive on any topic node
   - `DELETE /document/<id>` — Remove a document

### Phase 2 — Frontend (`templates/index.html`, `static/`)
1. **Three-panel layout** — Sidebar (upload + doc list) | Main canvas (mind map) | Detail panel (AI explanations)
2. **Drag-and-drop upload** — HTML5 drag events with visual feedback
3. **D3.js mind map** — Interactive tree visualization with:
   - Zoom & pan (scroll + drag)
   - Click to expand/collapse branches
   - Color-coded branches (12 distinct colors)
   - Hover tooltips showing node summaries
   - Node selection with detail panel integration
4. **"Explore More with AI"** — Click any node, then click the button to get a GPT-powered deep-dive rendered in Markdown
5. **PNG export** — SVG → Canvas → PNG at 2× resolution with white background
6. **Toast notifications** — Success/error messages for all operations
7. **Responsive design** — Sidebar collapses on small screens

### Phase 3 — Security Hardening
- Migrated from API key auth to `DefaultAzureCredential` for both services
- Added RBAC role assignments (Cognitive Services OpenAI User + Cosmos DB Data Contributor)
- File upload validation (extension check + `secure_filename`)
- Uploaded files deleted immediately after processing

---

## Project Structure

```
NOTEBOOKLM - AZURE Project/
├── app.py                    # Flask backend — routes, Azure integration, AI logic
├── requirements.txt          # Python dependencies
├── .env                      # Environment variables (endpoints — no secrets needed)
├── .env.example              # Template for environment variables
├── .gitignore                # Git ignore rules
├── README.md                 # This file
├── templates/
│   └── index.html            # Main HTML template — three-panel layout
├── static/
│   ├── css/
│   │   └── style.css         # Complete styling — modern UI with CSS variables
│   └── js/
│       └── app.js            # D3.js mind map, upload logic, panel interactions
└── uploads/                  # Temporary upload directory (files deleted after processing)
```

---

## Security Breakdown

### Authentication & Authorization

| Concern | Implementation | OWASP Category |
|---------|---------------|----------------|
| **No API keys in code** | `DefaultAzureCredential` (Azure AD) for both OpenAI and Cosmos DB | A07:2021 — Identification & Auth Failures |
| **No keys in .env at runtime** | AAD tokens are fetched automatically; `.env` only stores endpoints | A02:2021 — Cryptographic Failures |
| **RBAC least privilege** | `Cognitive Services OpenAI User` (not Contributor); Cosmos DB Data Contributor scoped to account | A01:2021 — Broken Access Control |
| **Cosmos DB AAD-only** | `disableLocalAuth=true` enforced by subscription policy — key-based access is impossible | A01:2021 — Broken Access Control |

### Input Validation & File Handling

| Concern | Implementation | OWASP Category |
|---------|---------------|----------------|
| **File type validation** | Allowlist check: only `.pdf`, `.docx`, `.doc`, `.txt` | A03:2021 — Injection |
| **Filename sanitization** | `werkzeug.secure_filename()` prevents path traversal | A01:2021 — Broken Access Control |
| **Upload size limit** | Flask `MAX_CONTENT_LENGTH = 50 MB` | A05:2021 — Security Misconfiguration |
| **Temp file cleanup** | Uploaded files are deleted in `finally` block after processing | A05:2021 — Security Misconfiguration |

### Data Protection

| Concern | Implementation |
|---------|---------------|
| **Data at rest** | Cosmos DB encrypts all data at rest by default (Microsoft-managed keys) |
| **Data in transit** | All Azure service connections use HTTPS/TLS 1.2+ |
| **No secrets in Git** | `.gitignore` excludes `.env`, `uploads/`, and virtual environments |

### What Could Be Added for Production

- **Rate limiting** — Add Flask-Limiter to prevent abuse of upload/AI endpoints
- **CSRF protection** — Add Flask-WTF for form-based CSRF tokens
- **Content Security Policy** — Add CSP headers to prevent XSS via CDN resources
- **Authentication for users** — Add Azure AD B2C or MSAL for multi-user access
- **Input sanitization** — Sanitize Markdown output from AI before rendering (DOMPurify)

---

## Cost Breakdown

### Azure OpenAI (GPT-4.1 — GlobalStandard)

| Operation | Tokens Used (est.) | Rate | Cost per Request |
|-----------|-------------------|------|-----------------|
| **Mind map generation** | ~4,000 input + ~2,000 output | $2.00/1M input, $8.00/1M output | ~$0.024 |
| **Node deep-dive** | ~2,000 input + ~1,000 output | $2.00/1M input, $8.00/1M output | ~$0.012 |

| Usage Scenario | Monthly Est. |
|----------------|-------------|
| Light (10 docs/month, 50 deep-dives) | ~$0.84 |
| Medium (50 docs/month, 250 deep-dives) | ~$4.20 |
| Heavy (200 docs/month, 1000 deep-dives) | ~$16.80 |

### Azure Cosmos DB (Serverless)

| Metric | Rate | Notes |
|--------|------|-------|
| **Request Units (RUs)** | $0.25 per 1M RUs | Pay only when used |
| **Storage** | $0.25/GB/month | Per GB stored |

| Usage Scenario | Monthly Est. |
|----------------|-------------|
| Light (10 docs, ~1 MB) | < $0.01 |
| Medium (50 docs, ~10 MB) | ~$0.05 |
| Heavy (200 docs, ~50 MB) | ~$0.25 |

### Total Monthly Cost Estimates

| Tier | OpenAI | Cosmos DB | **Total** |
|------|--------|-----------|-----------|
| **Light** (personal learning) | $0.84 | < $0.01 | **~$0.85/month** |
| **Medium** (team use) | $4.20 | $0.05 | **~$4.25/month** |
| **Heavy** (organization) | $16.80 | $0.25 | **~$17.05/month** |

> **Note:** Cosmos DB Serverless has zero cost when idle — you pay only for actual reads/writes. Azure OpenAI charges are purely consumption-based (per token). There are no fixed monthly fees for either service in this configuration.

### Cost Optimization Tips

1. **Cosmos DB Serverless** — No provisioned throughput; ideal for development and low-traffic workloads
2. **GlobalStandard deployment** — Shared capacity at lower per-token rates vs. Standard
3. **Text chunking** — Only the first ~60K characters are sent to GPT, keeping token costs bounded
4. **No storage costs for files** — Uploaded files are deleted immediately after processing; only extracted text is stored

---

## How to Run

### Prerequisites
- Python 3.10+
- Azure CLI (`az`) logged in
- Azure subscription with the resources created (see [Azure Setup](#step-by-step-azure-setup))

### 1. Clone & Install
```bash
git clone https://github.com/<your-username>/learnmap-ai.git
cd learnmap-ai
pip install -r requirements.txt
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your Azure OpenAI and Cosmos DB endpoints
```

### 3. Run
```bash
python app.py
```
Open **http://127.0.0.1:5000** in your browser.

### 4. Use
1. Drag & drop a PDF, DOCX, or TXT file onto the upload area
2. Wait for the AI to generate the mind map
3. Click nodes to expand/collapse and view summaries
4. Click **"Explore More with AI"** for detailed explanations
5. Click **"Download PNG"** to export the mind map

---

## License

MIT License — free for personal and commercial use.
