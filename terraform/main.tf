data "azurerm_client_config" "current" {}

locals {
  developer_object_id = var.developer_object_id != "" ? var.developer_object_id : data.azurerm_client_config.current.object_id
}

# ---------------------------------------------------------------------------
# Resource Group
# ---------------------------------------------------------------------------
resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location_openai
  tags     = var.tags
}

# ---------------------------------------------------------------------------
# Azure OpenAI account + deployments
# ---------------------------------------------------------------------------
resource "azurerm_cognitive_account" "openai" {
  name                  = var.openai_account_name
  location              = var.location_openai
  resource_group_name   = azurerm_resource_group.rg.name
  kind                  = "OpenAI"
  sku_name              = "S0"
  custom_subdomain_name = var.openai_account_name

  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}

resource "azurerm_cognitive_deployment" "gpt41" {
  name                 = var.gpt41_deployment_name
  cognitive_account_id = azurerm_cognitive_account.openai.id

  model {
    format  = "OpenAI"
    name    = "gpt-4.1"
    version = var.gpt41_model_version
  }

  sku {
    name     = "GlobalStandard"
    capacity = var.gpt41_capacity
  }
}

resource "azurerm_cognitive_deployment" "o4mini" {
  name                 = var.o4mini_deployment_name
  cognitive_account_id = azurerm_cognitive_account.openai.id

  model {
    format  = "OpenAI"
    name    = "o4-mini"
    version = var.o4mini_model_version
  }

  sku {
    name     = "GlobalStandard"
    capacity = var.o4mini_capacity
  }

  # Force sequential creation so AOAI quota isn't hit twice in parallel.
  depends_on = [azurerm_cognitive_deployment.gpt41]
}

# ---------------------------------------------------------------------------
# Cosmos DB (Serverless, AAD-only)
# ---------------------------------------------------------------------------
resource "azurerm_cosmosdb_account" "cosmos" {
  name                          = var.cosmos_account_name
  location                      = var.location_cosmos
  resource_group_name           = azurerm_resource_group.rg.name
  offer_type                    = "Standard"
  kind                          = "GlobalDocumentDB"
  local_authentication_disabled = true # AAD only

  capabilities {
    name = "EnableServerless"
  }

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = var.location_cosmos
    failover_priority = 0
  }

  tags = var.tags
}

resource "azurerm_cosmosdb_sql_database" "db" {
  name                = var.cosmos_database_name
  resource_group_name = azurerm_resource_group.rg.name
  account_name        = azurerm_cosmosdb_account.cosmos.name
}

resource "azurerm_cosmosdb_sql_container" "docs" {
  name                  = var.cosmos_container_name
  resource_group_name   = azurerm_resource_group.rg.name
  account_name          = azurerm_cosmosdb_account.cosmos.name
  database_name         = azurerm_cosmosdb_sql_database.db.name
  partition_key_paths   = ["/id"]
  partition_key_version = 2
}

# ---------------------------------------------------------------------------
# RBAC for the developer running the Flask app locally
# ---------------------------------------------------------------------------

# Azure OpenAI: data-plane access for inference calls
resource "azurerm_role_assignment" "openai_user" {
  scope                = azurerm_cognitive_account.openai.id
  role_definition_name = "Cognitive Services OpenAI User"
  principal_id         = local.developer_object_id
}

# Cosmos DB SQL: built-in Data Contributor role (read/write items)
# Role definition GUID 00000000-0000-0000-0000-000000000002 is the built-in
# "Cosmos DB Built-in Data Contributor" role.
resource "azapi_resource" "cosmos_data_contributor" {
  type      = "Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15"
  name      = "00000000-0000-0000-0000-000000000010"
  parent_id = azurerm_cosmosdb_account.cosmos.id

  body = {
    properties = {
      roleDefinitionId = "${azurerm_cosmosdb_account.cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
      principalId      = local.developer_object_id
      scope            = azurerm_cosmosdb_account.cosmos.id
    }
  }
}
