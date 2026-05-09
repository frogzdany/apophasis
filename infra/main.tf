terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  # Required by APIs that bill the *caller's* project (e.g. billingbudgets)
  # when the provider authenticates via user ADC. Tells the provider to pass
  # x-goog-user-project so quota/billing land on apophasis instead of the
  # implicit fallback project.
  user_project_override = true
  billing_project       = var.project_id
}

# ─── APIs ────────────────────────────────────────────────────────────────
locals {
  required_apis = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "aiplatform.googleapis.com", # used by Gemini API token minting
  ]
}

resource "google_project_service" "this" {
  for_each = toset(local.required_apis)
  service  = each.key

  disable_on_destroy = false
}

# ─── Artifact Registry: Docker repo for the container ────────────────────
resource "google_artifact_registry_repository" "lucy" {
  location      = var.region
  repository_id = var.service_name
  description   = "Container images for ${var.service_name}"
  format        = "DOCKER"

  depends_on = [google_project_service.this]
}

# ─── Logs bucket ─────────────────────────────────────────────────────────
resource "google_storage_bucket" "logs" {
  name                        = "${var.project_id}-${var.service_name}-logs"
  location                    = var.region
  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = false
  }

  dynamic "lifecycle_rule" {
    for_each = var.logs_retention_days > 0 ? [1] : []
    content {
      condition {
        age = var.logs_retention_days
      }
      action {
        type = "Delete"
      }
    }
  }

  depends_on = [google_project_service.this]
}

# ─── Service account for Cloud Run ───────────────────────────────────────
resource "google_service_account" "runtime" {
  account_id   = "${var.service_name}-runtime"
  display_name = "${var.service_name} runtime SA"
  depends_on   = [google_project_service.this]
}

resource "google_storage_bucket_iam_member" "logs_writer" {
  bucket = google_storage_bucket.logs.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

# ─── Secret Manager: GEMINI_API_KEY ──────────────────────────────────────
resource "google_secret_manager_secret" "gemini_key" {
  secret_id = "${var.service_name}-gemini-api-key"
  replication {
    auto {}
  }
  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_version" "gemini_key" {
  secret      = google_secret_manager_secret.gemini_key.id
  secret_data = var.gemini_api_key
}

resource "google_secret_manager_secret_iam_member" "runtime_access" {
  secret_id = google_secret_manager_secret.gemini_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# ─── Cloud Run service ───────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "lucy" {
  name                = var.service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.runtime.email

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      # PORT is auto-injected by Cloud Run; declaring it here errors out.
      env {
        name  = "DIST_DIR"
        value = "/app/dist"
      }
      env {
        name  = "LOGS_BUCKET"
        value = google_storage_bucket.logs.name
      }
      env {
        name  = "LOGS_PREFIX"
        value = var.logs_prefix
      }
      env {
        name  = "GEMINI_LIVE_MODEL"
        value = var.gemini_live_model
      }
      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini_key.secret_id
            version = "latest"
          }
        }
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }
  }

  depends_on = [
    google_secret_manager_secret_iam_member.runtime_access,
    google_storage_bucket_iam_member.logs_writer,
    google_artifact_registry_repository.lucy,
  ]
}

# Public invocation, toggleable via var.public_access. When set to false the
# binding is removed and Cloud Run returns 403 to unauthenticated callers —
# a no-cost "pause" that keeps the URL and all other infra intact.
resource "google_cloud_run_v2_service_iam_binding" "public" {
  count    = var.public_access ? 1 : 0
  project  = google_cloud_run_v2_service.lucy.project
  location = google_cloud_run_v2_service.lucy.location
  name     = google_cloud_run_v2_service.lucy.name
  role     = "roles/run.invoker"
  members  = ["allUsers"]
}
