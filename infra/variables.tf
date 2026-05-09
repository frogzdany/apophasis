variable "project_id" {
  description = "GCP project the lucy-blob deploy lives in. Use a personal project — billing follows the project."
  type        = string
}

variable "region" {
  description = "GCP region for Cloud Run, Artifact Registry, and the logs bucket. us-central1 has the broadest model availability."
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "Cloud Run service name (also used for the AR repo and SA prefix)."
  type        = string
  default     = "lucy-blob"
}

variable "image" {
  description = <<-EOT
    Full container image URI to deploy, e.g.
    us-central1-docker.pkg.dev/<project>/lucy-blob/lucy-blob:<tag>.
    Build & push first, then `terraform apply -var image=...`.
  EOT
  type        = string
}

variable "gemini_api_key" {
  description = <<-EOT
    Long-lived Gemini API key from https://aistudio.google.com/apikey.
    Stored in Secret Manager and injected into Cloud Run as GEMINI_API_KEY.
    The browser never sees this — the backend mints ephemeral tokens.
  EOT
  type      = string
  sensitive = true
}

variable "gemini_live_model" {
  description = "Live model the ephemeral token is locked to."
  type        = string
  default     = "gemini-3.1-flash-live-preview"
}

variable "logs_prefix" {
  description = "Object prefix inside the logs bucket."
  type        = string
  default     = "sessions"
}

variable "logs_retention_days" {
  description = "Lifecycle delete age for the logs bucket. 0 disables auto-delete."
  type        = number
  default     = 30
}

variable "billing_account" {
  description = "Billing account ID linked to the project (e.g. 01ED20-562E90-E63AF2)."
  type        = string
}

variable "notification_email" {
  description = "Email address that receives budget alerts."
  type        = string
}

variable "budget_amount" {
  description = "Monthly budget cap (whole units of budget_currency). Alerts fire at 50/90/100% spend and 100% forecast."
  type        = number
  default     = 10
}

variable "budget_currency" {
  description = "Currency code for the budget."
  type        = string
  default     = "USD"
}

variable "public_access" {
  description = "When true, anyone can invoke the Cloud Run service. When false, only authenticated callers (none configured) can — effectively turns the public site off without destroying anything."
  type        = bool
  default     = true
}
