output "service_url" {
  description = "Public *.run.app URL of the deployed service."
  value       = google_cloud_run_v2_service.lucy.uri
}

output "logs_bucket" {
  description = "GCS bucket session logs are written to."
  value       = google_storage_bucket.logs.name
}

output "artifact_registry_repo" {
  description = "Docker image base path."
  value = format(
    "%s-docker.pkg.dev/%s/%s",
    var.region,
    var.project_id,
    google_artifact_registry_repository.lucy.repository_id,
  )
}

output "runtime_service_account" {
  description = "Email of the SA the Cloud Run revision runs as."
  value       = google_service_account.runtime.email
}
