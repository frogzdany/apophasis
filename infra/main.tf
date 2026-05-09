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

# ─── Secret Manager: search-provider keys ────────────────────────────────
# One secret per upstream so each can be rotated independently and IAM
# audit shows exactly which key was touched. Keys with empty values still
# create the secret but with no usable version — the runtime treats this
# as "key not configured" and the corresponding /api/search/<x> route
# returns a clean error.
locals {
  # Static list of upstream names. Used as for_each keys (must be
  # non-sensitive). Add a new upstream by extending this list, the
  # search_env_names map below, the search_secret_values map, and
  # introducing a matching variable.
  search_provider_names = [
    "brave",
    "tavily",
    "exa",
    "serpapi",
    "google_books",
    "google_places",
    "youtube",
  ]

  # The container reads these env-var names. Keep this map in sync with
  # server/searchProxy.ts when adding a new upstream.
  search_env_names = {
    brave         = "BRAVE_API_KEY"
    tavily        = "TAVILY_API_KEY"
    exa           = "EXA_API_KEY"
    serpapi       = "SERPAPI_KEY"
    google_books  = "GOOGLE_BOOKS_API_KEY"
    google_places = "GOOGLE_PLACES_API_KEY"
    youtube       = "YOUTUBE_API_KEY"
  }

  # The actual secret material. References sensitive variables; only
  # consumed inside resource attributes (where sensitive flow is fine),
  # never as a for_each key.
  search_secret_values = {
    brave         = var.brave_api_key
    tavily        = var.tavily_api_key
    exa           = var.exa_api_key
    serpapi       = var.serpapi_key
    google_books  = var.google_books_api_key
    google_places = var.google_places_api_key
    youtube       = var.youtube_api_key
  }

  # Which upstreams have a real key to publish. Boolean per name; OK to
  # iterate because nonsensitive() strips the sensitivity flag when the
  # derived value is just "is the var non-empty?".
  search_populated = nonsensitive(
    toset([for k in local.search_provider_names : k if local.search_secret_values[k] != ""])
  )
}

resource "google_secret_manager_secret" "search" {
  for_each  = toset(local.search_provider_names)
  secret_id = "${var.service_name}-${replace(each.key, "_", "-")}-key"
  replication {
    auto {}
  }
  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_version" "search" {
  # Only publish a version when there's actually a key to store. Empty
  # values would make Secret Manager reject the create call.
  for_each    = local.search_populated
  secret      = google_secret_manager_secret.search[each.key].id
  secret_data = local.search_secret_values[each.key]
}

resource "google_secret_manager_secret_iam_member" "search_runtime_access" {
  for_each  = toset(local.search_provider_names)
  secret_id = google_secret_manager_secret.search[each.key].id
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

      # Search-provider keys. We only inject env vars for upstreams that
      # have an actual secret version; missing keys stay unset and the
      # proxy returns a clean "<X>_API_KEY not configured" error.
      dynamic "env" {
        for_each = google_secret_manager_secret_version.search
        content {
          name = local.search_env_names[env.key]
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.search[env.key].secret_id
              version = "latest"
            }
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
    google_secret_manager_secret_iam_member.search_runtime_access,
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
