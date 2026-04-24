# LearnMap AI – Terraform

Provisions the full Azure stack from the README:

| Resource                   | Created as                          |
| -------------------------- | ----------------------------------- |
| Resource Group             | `Notebook-LM-Like-on-Azure`         |
| Azure OpenAI account       | `learnmap-openai` (S0)              |
| GPT-4.1 deployment         | `gpt-41` GlobalStandard, 10 TPM     |
| o4-mini deployment         | `o4-mini` GlobalStandard, 1 TPM     |
| Cosmos DB account          | `learnmap-cosmosdb` (Serverless)    |
| Cosmos DB database         | `learner_assistant`                 |
| Cosmos DB container        | `documents` (PK: `/id`)             |
| RBAC – AOAI                | "Cognitive Services OpenAI User"    |
| RBAC – Cosmos DB           | "Cosmos DB Built-in Data Contributor" |

Cosmos DB is **AAD-only** (`local_authentication_disabled = true`) — no keys
floating around, matching the app's `DefaultAzureCredential` flow.

## Prereqs

```powershell
# Login + pick subscription
az login
az account set --subscription "<your-subscription-id>"

# Verify Terraform
terraform -version    # >= 1.5
```

## Deploy

```powershell
cd terraform
terraform init
terraform plan -out tfplan
terraform apply tfplan
```

## Use the outputs

```powershell
terraform output env_file_snippet
```

Copy the printed block into the project's `.env` file. Then run the app:

```powershell
cd ..
python app.py
```

## Variables you may want to override

Create `terraform.tfvars`:

```hcl
openai_account_name = "learnmap-openai-mrinal"   # must be globally unique
cosmos_account_name = "learnmap-cosmosdb-mrinal" # must be globally unique
location_openai     = "eastus"
location_cosmos     = "westus2"
gpt41_capacity      = 30
```

## Tear down

```powershell
terraform destroy
```
