#!/usr/bin/env bash
set -euo pipefail

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

bun run build

wrangler_config="${WRANGLER_CONFIG:-wrangler.jsonc}"
pages_project="${PAGES_PROJECT_NAME:-zitadel-login}"
wrangler_bin="$(pwd)/node_modules/wrangler/bin/wrangler.js"

if [[ ! -f "$wrangler_config" ]]; then
  printf 'Missing Wrangler configuration: %s\n' "$wrangler_config" >&2
  printf 'Copy wrangler.example.jsonc to a local wrangler.jsonc first.\n' >&2
  exit 1
fi

if [[ ! -f "$wrangler_bin" ]]; then
  printf 'Missing Wrangler CLI: %s\n' "$wrangler_bin" >&2
  printf 'Run bun install first.\n' >&2
  exit 1
fi

node_bin=""
if [[ -n "${DEPLOY_NODE_BIN:-}" && -x "${DEPLOY_NODE_BIN}" ]]; then
  node_bin="$DEPLOY_NODE_BIN"
else
  while IFS= read -r candidate; do
    if [[ -z "$candidate" || ! -x "$candidate" ]]; then
      continue
    fi
    if "$candidate" -p 'process.versions.node' >/dev/null 2>&1; then
      node_bin="$candidate"
      break
    fi
  done <<EOF
${HOME}/.node/bin/node
/usr/local/bin/node
/usr/bin/node
$(command -v node || true)
EOF
fi

if [[ -z "$node_bin" ]]; then
  printf 'Wrangler deploy needs a real Node.js binary, not Bun'\''s node shim.\n' >&2
  printf 'Install Node.js >= 22 or set DEPLOY_NODE_BIN to that binary.\n' >&2
  exit 1
fi

"$node_bin" "$wrangler_bin" deploy --config "$wrangler_config"
WRANGLER_CONFIG=/dev/null "$node_bin" "$wrangler_bin" pages deploy ./dist/client --project-name "$pages_project" --commit-dirty=true --branch main
