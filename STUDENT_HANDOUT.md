# Student Handout: LearnMap AI — Quick Start Guide

**Get up and running in ~30 minutes after cloning the repo.**

> **Prerequisites:** Python 3.10+, Azure CLI installed, Azure account with an active subscription, VS Code (recommended)

---

## What You'll Be Running

LearnMap AI is an intelligent learning assistant that:
- Accepts PDF, Word, or text file uploads
- Uses Azure OpenAI (GPT-4.1 / o4-mini) to generate interactive mind maps
- Renders mind maps as an interactive tree (zoom, pan, click-to-explore)
- Stores everything in Azure Cosmos DB

---

## Step 1 — Clone the Repository

```bash
git clone https://github.com/microsoftmrinal/Notebook-LM-type-App.git
cd Notebook-LM-type-App
```

---

## Step 2 — Create a Python Virtual Environment

```bash
python -m venv .venv
```

**Activate it:**

| OS | Command |
|----|---------|
| Windows | `.venv\Scripts\activate` |
| macOS / Linux | `source .venv/bin/activate` |

You should see `(.venv)` in your terminal prompt.

---

## Step 3 — Install Dependencies

```bash
pip install -r requirements.txt
```

This installs Flask, Azure SDKs, OpenAI SDK, PDF/DOCX parsers, and other required packages.

---

## Step 4 — Log in to Azure

```bash
az login
```

This opens a browser window. Sign in with your Azure account. If a browser doesn't open, use:

```bash
az login --use-device-code
```

Then go to https://login.microsoft.com/device and enter the code shown in your terminal.

**Verify you're logged in:**

```bash
az account show --query "{user: user.name, subscription: name}" -o table
```

---

## Step 5 — Create Azure Resources

Run these commands **one at a time** in your terminal.

### 5.1 Create a Resource Group

```bash
az group create --name "Notebook-LM-Like-on-Azure" --location eastus
```

### 5.2 Create Azure OpenAI Resource

```bash
az cognitiveservices account create \
  --name learnmap-openai \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --kind OpenAI --sku S0 --location eastus \
  --custom-domain learnmap-openai
```

> **Windows users:** Replace `\` with `` ` `` (backtick) for line continuation in PowerShell, or put the entire command on one line.

### 5.3 Deploy GPT-4.1 Model

```bash
az cognitiveservices account deployment create \
  --name learnmap-openai \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --deployment-name gpt-41 \
  --model-name gpt-4.1 --model-version "2025-04-14" \
  --model-format OpenAI \
  --sku-capacity 10 --sku-name "GlobalStandard"
```

### 5.4 Deploy o4-mini Model (Optional)

```bash
az cognitiveservices account deployment create \
  --name learnmap-openai \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --deployment-name o4-mini \
  --model-name o4-mini --model-version "2025-04-16" \
  --model-format OpenAI \
  --sku-capacity 1 --sku-name GlobalStandard
```

### 5.5 Grant Yourself OpenAI Access (RBAC)

```bash
# Get your user ID
USER_ID=$(az ad signed-in-user show --query id -o tsv)

# Get the OpenAI resource ID
OPENAI_ID=$(az cognitiveservices account show --name learnmap-openai \
  --resource-group "Notebook-LM-Like-on-Azure" --query id -o tsv)

# Assign the role
az role assignment create \
  --assignee $USER_ID \
  --role "Cognitive Services OpenAI User" \
  --scope $OPENAI_ID
```

> **PowerShell users:** Use `$env:USER_ID` syntax or run each command separately, copying the output manually.

---

## Step 6 — Set Up Cosmos DB

You have **two options**: Local Emulator (simpler, no cloud costs) or Cloud Cosmos DB.

### Option A: Local Cosmos DB Emulator (Recommended for Workshop)

1. **Download & install** the [Azure Cosmos DB Emulator](https://learn.microsoft.com/azure/cosmos-db/emulator)
2. **Start the emulator** — search for "Azure Cosmos DB Emulator" in your Start menu, or run:
   ```bash
   "C:\Program Files\Azure Cosmos DB Emulator\Microsoft.Azure.Cosmos.Emulator.exe"
   ```
3. Wait until it's running (the system tray icon turns green, or visit https://localhost:8081/_explorer/index.html)

The app auto-detects the emulator and creates the database/container automatically. **No further setup needed.**

### Option B: Cloud Cosmos DB

```bash
# Create the account (takes ~5 minutes)
az cosmosdb create \
  --name learnmap-cosmosdb \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --kind GlobalDocumentDB \
  --default-consistency-level Session \
  --locations regionName=westus2 failoverPriority=0 isZoneRedundant=false \
  --capabilities EnableServerless

# Create the database
az cosmosdb sql database create \
  --account-name learnmap-cosmosdb \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --name learner_assistant

# Create the container
az cosmosdb sql container create \
  --account-name learnmap-cosmosdb \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --database-name learner_assistant \
  --name documents \
  --partition-key-path "/id"

# Grant yourself data access
USER_ID=$(az ad signed-in-user show --query id -o tsv)
az cosmosdb sql role assignment create \
  --account-name learnmap-cosmosdb \
  --resource-group "Notebook-LM-Like-on-Azure" \
  --scope "/" \
  --principal-id $USER_ID \
  --role-definition-id "00000000-0000-0000-0000-000000000002"
```

Then update your `.env` file (Step 7) to use the cloud endpoint.

---

## Step 7 — Configure the `.env` File

Create a file named `.env` in the project root (same folder as `app.py`):

### If using the Local Emulator:

```env
# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://learnmap-openai.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-41
AZURE_O4MINI_DEPLOYMENT_NAME=o4-mini
AZURE_OPENAI_API_VERSION=2025-01-01-preview

# Cosmos DB — Local Emulator
COSMOS_DB_ENDPOINT=https://localhost:8081/
COSMOS_DB_KEY=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==

# Default model
DEFAULT_MODEL=gpt
```

> The emulator key above is the **well-known public key** — it's the same for everyone and is not a secret.

### If using Cloud Cosmos DB:

```env
# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://learnmap-openai.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-41
AZURE_O4MINI_DEPLOYMENT_NAME=o4-mini
AZURE_OPENAI_API_VERSION=2025-01-01-preview

# Cosmos DB — Cloud (uses Azure AD, no key needed)
COSMOS_DB_ENDPOINT=https://learnmap-cosmosdb.documents.azure.com:443/

# Default model
DEFAULT_MODEL=gpt
```

---

## Step 8 — Run the App

```bash
python app.py
```

You should see:

```
 * Serving Flask app 'app'
 * Debug mode: on
 * Running on http://127.0.0.1:5000
```

**Open http://127.0.0.1:5000 in your browser.**

---

## Step 9 — Test It!

| # | Action | What Should Happen |
|---|--------|--------------------|
| 1 | Open http://127.0.0.1:5000 | You see the three-panel layout |
| 2 | Upload a PDF or DOCX file | Loading spinner → mind map appears |
| 3 | Click any node on the mind map | Summary appears in the right panel |
| 4 | Click "Explore More with AI" | Detailed AI explanation appears |
| 5 | Try the zoom/pan controls | Mind map zooms and pans smoothly |
| 6 | Click "Download PNG" | Mind map exports as an image |
| 7 | Switch model to o4-mini | Dropdown changes (if deployed) |
| 8 | Refresh the page | Your documents persist in the sidebar |
| 9 | Delete a document | It's removed from the list |

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `DefaultAzureCredential` failed | Not logged in to Azure | Run `az login` |
| `No connection could be made` (port 8081) | Cosmos DB Emulator not running | Start the emulator (Step 6A) |
| 403 on OpenAI calls | Missing RBAC role | Re-run Step 5.5 |
| 403 on Cosmos DB | Missing data role | Re-run the role assignment in Step 6B |
| `ModuleNotFoundError` | Virtual env not activated or packages missing | Activate `.venv` and run `pip install -r requirements.txt` |
| `max_tokens` error with o4-mini | API parameter mismatch | Already handled in code — make sure you have the latest `app.py` |

---

## Project Structure

```
Notebook-LM-type-App/
├── app.py                 ← Backend server (Flask + Azure SDKs)
├── requirements.txt       ← Python dependencies
├── .env                   ← Your config (NOT committed to Git)
├── .gitignore             ← Excludes .env, uploads, __pycache__
├── WORKSHOP_GUIDE.md      ← Detailed instructor guide
├── STUDENT_HANDOUT.md     ← This file
├── README.md              ← Project overview
├── templates/
│   └── index.html         ← Single-page app (HTML)
├── static/
│   ├── css/
│   │   └── style.css      ← Styling (CSS variables, flexbox layout)
│   └── js/
│       └── app.js         ← Frontend logic (D3.js mind map, API calls)
└── uploads/               ← Temporary file storage (auto-created)
```

---

## Key Concepts to Understand

| Concept | What It Means |
|---------|---------------|
| **Flask** | Python web framework — handles routes like `/upload`, `/documents` |
| **DefaultAzureCredential** | Automatically finds your Azure identity (from `az login`) — no API keys in code |
| **Cosmos DB** | NoSQL database that stores JSON natively — perfect for mind map data |
| **D3.js** | JavaScript library that turns JSON data into interactive tree visualizations |
| **Prompt Engineering** | The structured instructions we send to GPT-4.1 to get well-formed mind map JSON |

---

## Cleanup (After the Workshop)

To avoid Azure charges, delete all resources when you're done:

```bash
az group delete --name "Notebook-LM-Like-on-Azure" --yes --no-wait
```

This deletes the resource group and **everything inside it** (OpenAI resource, Cosmos DB, etc.).

---

## Want to Go Further?

- **Add PowerPoint support** — Use `python-pptx` to parse `.pptx` files
- **Add user authentication** — Use MSAL.js for Azure AD login
- **Deploy to Azure** — Containerize with Docker, deploy to Azure App Service
- **Add rate limiting** — Use Flask-Limiter to prevent abuse

See the [WORKSHOP_GUIDE.md](WORKSHOP_GUIDE.md) for the full deep-dive with code explanations.

---

*Built with Azure OpenAI, Azure Cosmos DB, Flask, and D3.js*
