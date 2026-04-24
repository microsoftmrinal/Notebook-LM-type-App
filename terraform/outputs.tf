output "resource_group_name" {
  value = azurerm_resource_group.rg.name
}

output "azure_openai_endpoint" {
  value       = azurerm_cognitive_account.openai.endpoint
  description = "Set this as AZURE_OPENAI_ENDPOINT in your .env file."
}

output "azure_openai_gpt41_deployment" {
  value = azurerm_cognitive_deployment.gpt41.name
}

output "azure_openai_o4mini_deployment" {
  value = azurerm_cognitive_deployment.o4mini.name
}

output "cosmos_db_endpoint" {
  value       = azurerm_cosmosdb_account.cosmos.endpoint
  description = "Set this as COSMOS_DB_ENDPOINT in your .env file."
}

output "cosmos_db_database" {
  value = azurerm_cosmosdb_sql_database.db.name
}

output "cosmos_db_container" {
  value = azurerm_cosmosdb_sql_container.docs.name
}

output "env_file_snippet" {
  description = "Copy this into your .env file."
  value       = <<EOT
AZURE_OPENAI_ENDPOINT=${azurerm_cognitive_account.openai.endpoint}
AZURE_OPENAI_API_VERSION=2025-01-01-preview
AZURE_OPENAI_GPT_DEPLOYMENT=${azurerm_cognitive_deployment.gpt41.name}
AZURE_OPENAI_O4MINI_DEPLOYMENT=${azurerm_cognitive_deployment.o4mini.name}
COSMOS_DB_ENDPOINT=${azurerm_cosmosdb_account.cosmos.endpoint}
COSMOS_DB_DATABASE=${azurerm_cosmosdb_sql_database.db.name}
COSMOS_DB_CONTAINER=${azurerm_cosmosdb_sql_container.docs.name}
EOT
}
