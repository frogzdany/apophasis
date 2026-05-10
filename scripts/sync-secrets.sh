#!/usr/bin/env bash
# Pulls the rotated upstream API keys out of .env.local and writes them
# into infra/terraform.tfvars in place, ready for `tofu apply` to push
# new google_secret_manager_secret_version resources. The actual key
# values stay on disk — they never pass through stdout, command args,
# or any tool parameter.
#
# Usage:  bash scripts/sync-secrets.sh
# After:  tofu -chdir=infra plan
#         tofu -chdir=infra apply -var image="<current image tag>"
#
# A timestamped backup of terraform.tfvars is written next to it.
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=".env.local"
TFVARS="infra/terraform.tfvars"

[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE"; exit 1; }
[[ -f "$TFVARS" ]] || { echo "Missing $TFVARS"; exit 1; }

# Source .env.local — `set -a` exports every var declared while it's on
# so the indirect ${!VAR} expansion can find them later.
set -a
# shellcheck disable=SC1091
source "$ENV_FILE"
set +a

# Each entry maps "env var name(s) | tfvars var name". The env var side
# can be a comma-separated fallback chain — first non-empty value wins.
# Lets us support .env.local conventions where the Gemini / YouTube
# keys are stored under their VITE_-prefixed names (since dev hits the
# browser path) while the server-side Cloud Run env expects the bare
# names.
PAIRS=(
  "VITE_GEMINI_API_KEY,GEMINI_API_KEY|gemini_api_key"
  "BRAVE_API_KEY|brave_api_key"
  "TAVILY_API_KEY|tavily_api_key"
  "EXA_API_KEY|exa_api_key"
  "SERPAPI_KEY|serpapi_key"
  "GOOGLE_BOOKS_API_KEY|google_books_api_key"
  "GOOGLE_PLACES_API_KEY|google_places_api_key"
  "VITE_YOUTUBE_API_KEY,YOUTUBE_API_KEY|youtube_api_key"
  "RECAPTCHA_SITE_KEY|recaptcha_site_key"
  "RECAPTCHA_SECRET_KEY|recaptcha_secret_key"
)

resolve_value() {
  # Walk a comma-separated env-var list, return the first non-empty.
  local IFS=','
  for V in $1; do
    local CUR="${!V-}"
    if [[ -n "$CUR" ]]; then
      printf '%s' "$CUR"
      return 0
    fi
  done
  return 1
}

BACKUP="${TFVARS}.bak.$(date +%Y%m%d-%H%M%S)"
cp "$TFVARS" "$BACKUP"
echo "Backup: $BACKUP"

UPDATED=0
SKIPPED=0
for PAIR in "${PAIRS[@]}"; do
  ENV_LIST="${PAIR%%|*}"
  TFVAR="${PAIR#*|}"
  if VALUE=$(resolve_value "$ENV_LIST"); then
    :
  else
    echo "  skip   $TFVAR (none of {$ENV_LIST} set in .env.local)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  if ! grep -qE "^[[:space:]]*${TFVAR}[[:space:]]*=" "$TFVARS"; then
    echo "  skip   $TFVAR (line not present in $TFVARS — add manually)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  # Escape backslash, forward-slash, and ampersand for sed's replacement.
  ESC=$(printf '%s' "$VALUE" | sed -e 's/[\\/&]/\\&/g')
  sed -i.tmp -E "s|^([[:space:]]*${TFVAR}[[:space:]]*=[[:space:]]*).*$|\1\"${ESC}\"|" "$TFVARS"
  rm -f "${TFVARS}.tmp"
  echo "  ok     $TFVAR"
  UPDATED=$((UPDATED + 1))
done

echo
echo "Done — $UPDATED updated, $SKIPPED skipped."
echo "Diff (line counts only):"
diff -u <(grep -cE "^[[:space:]]*[a-z_]+_(api_)?key" "$BACKUP") \
        <(grep -cE "^[[:space:]]*[a-z_]+_(api_)?key" "$TFVARS") || true
echo
echo "Next:"
echo "  tofu -chdir=infra plan"
echo "  tofu -chdir=infra apply -var image=\"\$(gcloud run services describe lucy-blob --region=us-central1 --format=value\\(spec.template.spec.containers[0].image\\))\""
