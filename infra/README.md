# lucy-blob — GCP deploy

Single Cloud Run service, fronted by an `*.a.run.app` HTTPS URL Google issues
for free. Infra in Terraform; container built locally and pushed to Artifact
Registry.

```
                              Cloud Run service (lucy-blob)
   *.a.run.app  ─►  ┌────────────────────────────────────────┐
                    │  Bun container                          │
                    │   ├─ /                  → dist/ (SPA)   │
                    │   ├─ /api/log           → GCS bucket    │
                    │   ├─ /api/health        → store info    │
                    │   ├─ /api/gemini-token  → ephem. token  │
                    │   └─ /api/search/<x>    → upstream API  │
                    └────────────────────────────────────────┘
                                    │
                          Secret Manager:
                            GEMINI_API_KEY
                            BRAVE_API_KEY, TAVILY_API_KEY, EXA_API_KEY,
                            SERPAPI_KEY, GOOGLE_BOOKS_API_KEY,
                            GOOGLE_PLACES_API_KEY, YOUTUBE_API_KEY
                          GCS bucket  (session logs)
```

## One-time setup

```bash
# 0. Switch gcloud to your personal account.
gcloud auth login                       # interactive, opens browser
gcloud auth application-default login   # ADC for terraform + @google-cloud/storage

# 1. Pick or create a personal project.
gcloud projects create my-lucy-proj --name="lucy"   # or use an existing one
gcloud config set project my-lucy-proj
PROJECT_ID=$(gcloud config get-value project)

# 2. Make sure billing is linked. Cloud Run scales to zero, but the project
#    must have a billing account attached.
gcloud beta billing projects describe "$PROJECT_ID"

# 3. Bootstrap APIs (terraform also enables these, but enabling now means
#    the first apply isn't slowed by API enable propagation).
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
    secretmanager.googleapis.com storage.googleapis.com \
    cloudresourcemanager.googleapis.com aiplatform.googleapis.com
```

## First deploy

```bash
# 1. Configure Terraform inputs.
cp infra/terraform.tfvars.example infra/terraform.tfvars
$EDITOR infra/terraform.tfvars   # set project_id, gemini_api_key, and any
                                 # of the optional search-provider keys
                                 # (brave / tavily / exa / serpapi /
                                 # google_books / google_places / youtube).
                                 # Empty values are accepted; the
                                 # corresponding /api/search/<x> route
                                 # then returns "<X>_KEY not configured".

# 2. First-pass apply WITHOUT a real image: provisions Artifact Registry,
#    bucket, secret, SA. Use a placeholder image; we'll re-apply with the
#    real one after the build.
cd infra
terraform init
terraform plan -var image="us-docker.pkg.dev/cloudrun/container/hello"
# review, then:
terraform apply -var image="us-docker.pkg.dev/cloudrun/container/hello"

# 3. Configure Docker to push to the new AR repo.
REGION=$(terraform output -raw artifact_registry_repo | cut -d- -f1-2)
gcloud auth configure-docker us-central1-docker.pkg.dev   # adjust if region differs

# 4. Build & push the real image.
cd ..
IMAGE=$(cd infra && terraform output -raw artifact_registry_repo)/lucy-blob:0.1.0
docker build --platform=linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"

# 5. Re-apply with the real image. Update terraform.tfvars `image` to $IMAGE
#    or pass it on the CLI:
cd infra
terraform apply -var image="$IMAGE"

# 6. Open the service.
terraform output service_url
```

Smoke test the deployed URL:

```bash
URL=$(terraform output -raw service_url)
curl -s "$URL/api/health" | jq
curl -s -X POST "$URL/api/gemini-token" | jq   # should return { token, expiresAt, model }
open "$URL"                                    # try the voice session
```

## Updates

After code changes:

```bash
IMAGE=$(cd infra && terraform output -raw artifact_registry_repo)/lucy-blob:$(date +%Y%m%d-%H%M)
docker build --platform=linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"
( cd infra && terraform apply -var image="$IMAGE" )
```

Cloud Run keeps the previous revision; rollback in the console or via
`gcloud run services update-traffic`.

## Custom domain (optional, later)

1. In the Cloud Run console, add a domain mapping (or use
   `google_cloud_run_domain_mapping` in Terraform).
2. Add the DNS records Google shows you to your registrar.
3. Cloud Run provisions a managed cert automatically.

## Costs

With min_instance_count = 0 and a small demo, expect:

- Cloud Run: ~$0/mo idle, a few cents per active hour.
- Artifact Registry: ~$0.10/GB-mo storage.
- Secret Manager: free for small secret + few accesses.
- GCS logs bucket: ~$0.02/GB-mo + minor request costs; lifecycle deletes after `logs_retention_days` (default 30).

## Tearing down

```bash
cd infra
terraform destroy
```

`force_destroy` is **off** on the logs bucket — empty it manually first if
you want destroy to succeed (`gsutil -m rm -r gs://<bucket>/**`).
