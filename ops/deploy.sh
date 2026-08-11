#!/usr/bin/env bash
set -euo pipefail

bun run build

wrangler_config="${WRANGLER_CONFIG:-wrangler.jsonc}"
pages_project="${PAGES_PROJECT_NAME:-zitadel-login}"

if [[ ! -f "$wrangler_config" ]]; then
  printf 'Missing Wrangler configuration: %s\n' "$wrangler_config" >&2
  printf 'Copy wrangler.example.jsonc to a local wrangler.jsonc first.\n' >&2
  exit 1
fi

bunx wrangler deploy --config "$wrangler_config"
WRANGLER_CONFIG=/dev/null bunx wrangler pages deploy ./dist/client --project-name "$pages_project" --commit-dirty=true --branch main
