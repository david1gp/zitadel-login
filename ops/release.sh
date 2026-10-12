#!/usr/bin/env bash
set -euo pipefail

changelogs_dir="changelogs"
package_json="package.json"

if ! command -v gh >/dev/null 2>&1; then
  printf 'Error: GitHub CLI is not installed or unavailable.\n' >&2
  exit 1
fi

if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  printf 'Error: GitHub CLI is not authenticated for github.com.\n' >&2
  exit 1
fi

deploy=true
version_arg=""
for arg in "$@"; do
  case "$arg" in
    --no-deploy) deploy=false ;;
    *)
      if [[ -n "$version_arg" ]]; then
        printf 'Error: provide zero or one version argument plus optional --no-deploy.\n' >&2
        exit 1
      fi
      version_arg="$arg"
      ;;
  esac
done

current_version="$(jq -r '.version' "$package_json")"
changelog_body="$(git cliff --unreleased --strip all | sed '1{/^## \[unreleased\]$/d};2{/^$/d}')"

if [[ -z "$changelog_body" || "$changelog_body" == *"No commits found"* ]]; then
  printf 'No new commits since the last release.\n' >&2
  exit 1
fi

if [[ -n "$version_arg" ]]; then
  new_version="$version_arg"
else
  IFS='.' read -r major minor patch <<<"$current_version"
  if [[ "$changelog_body" == *"### Features"* ]]; then
    new_version="$major.$((minor + 1)).0"
  else
    new_version="$major.$minor.$((patch + 1))"
  fi
fi

date_now="$(date +%Y-%m-%d)"
changelog_file="$changelogs_dir/${date_now}_v${new_version}.md"
mkdir -p "$changelogs_dir"
printf '## [%s] - %s\n\n%s\n' "$new_version" "$date_now" "$changelog_body" >"$changelog_file"

bun run build
jq --arg version "$new_version" '.version = $version' "$package_json" >"$package_json.tmp"
mv "$package_json.tmp" "$package_json"

tag="v$new_version"
git add "$changelog_file" "$package_json"
git commit -m "chore(release): $tag"
git tag -a "$tag" -m "Release $tag"
git push origin main
git push origin --tags
gh release create "$tag" --title "$tag" --notes-file "$changelog_file"

# Deploy after the release commit so Cloudflare serves the released tree,
# not the pre-release working tree. Skip with --no-deploy.
if [[ "$deploy" == true ]]; then
  printf 'Deploying released commit...\n'
  bun run deploy
else
  printf 'Skipping deploy (--no-deploy). Run bun run deploy later to serve this release.\n'
fi
