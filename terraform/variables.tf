variable "resource_group_name" {
  type        = string
  default     = "Notebook-LM-Like-on-Azure"
  description = "Resource group that holds all LearnMap AI resources."
}

variable "location_openai" {
  type        = string
  default     = "eastus"
  description = "Region for Azure OpenAI (must support gpt-4.1 + o4-mini)."
}

variable "location_cosmos" {
  type        = string
  default     = "westus2"
  description = "Primary region for Cosmos DB (serverless)."
}

variable "openai_account_name" {
  type        = string
  default     = "learnmap-openai"
  description = "Globally-unique Azure OpenAI resource name."
}

variable "cosmos_account_name" {
  type        = string
  default     = "learnmap-cosmosdb"
  description = "Globally-unique Cosmos DB account name."
}

variable "cosmos_database_name" {
  type        = string
  default     = "learner_assistant"
}

variable "cosmos_container_name" {
  type        = string
  default     = "documents"
}

variable "gpt41_deployment_name" {
  type        = string
  default     = "gpt-41"
}

variable "gpt41_model_version" {
  type        = string
  default     = "2025-04-14"
}

variable "gpt41_capacity" {
  type        = number
  default     = 10
  description = "TPM (in thousands) for GPT-4.1 GlobalStandard deployment."
}

variable "o4mini_deployment_name" {
  type        = string
  default     = "o4-mini"
}

variable "o4mini_model_version" {
  type        = string
  default     = "2025-04-16"
}

variable "o4mini_capacity" {
  type        = number
  default     = 1
}

variable "developer_object_id" {
  type        = string
  default     = ""
  description = "AAD objectId of the user/SP that runs the Flask app locally. Leave empty to auto-detect the current az login user."
}

variable "tags" {
  type = map(string)
  default = {
    project = "LearnMap-AI"
    env     = "dev"
    iac     = "terraform"
  }
}
