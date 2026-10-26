#!/usr/bin/env bash
# Called by the main-branch Action over pinned-host-key SSH, on a previously
# prepared Ubuntu VM. Never provisions, prunes volumes, overwrites .env, or
# fetches map data. A missing migration requires explicit operator action.
set -euo pipefail

sha="${1:?expected immutable commit SHA}"
image_prefix="${2:?expected registry image prefix}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA' >&2; exit 1; }
[[ "$image_prefix" =~ ^ghcr\.io/[a-z0-9_-]+/[a-z0-9_-]+$ ]] || { echo 'Invalid registry prefix' >&2; exit 1; }
[[ "$(pwd -P)" == "/opt/borobiya" && "$(git branch --show-current)" == main ]] || {
  echo 'Run only in the prepared /opt/borobiya main checkout' >&2; exit 1;
}
[[ -s .env && -s .deploy/"$sha".tgz ]] || { echo 'Missing VM .env or uploaded client archive' >&2; exit 1; }
[[ -z "$(git diff --name-only)$(git diff --cached --name-only)" ]] || {
  echo 'VM checkout has tracked edits; resolve them before deploy' >&2; exit 1;
}

# Refuse a stale workflow run if main advanced since this Action began.
git fetch --quiet origin main
[[ "$(git rev-parse FETCH_HEAD)" == "$sha" ]] || { echo 'main advanced; refusing stale deploy' >&2; exit 1; }
git merge --ff-only FETCH_HEAD

export BOROBIYA_DEPLOY_SHA="$sha" BOROBIYA_IMAGE_PREFIX="$image_prefix"
compose=(docker compose -f docker-compose.yml -f docker-compose.vm.yml -f docker-compose.production.yml \
  -f docker-compose.deploy.yml --profile routing --profile geocoding --profile production)
# The operator must already have a seeded database, a map-library selection,
# graph and Photon index, valid production env, and GHCR pull credentials.
PYTHONPATH=scripts python3 -c 'import vm; vm.verify_serving_artifacts(vm.require_env(), vm.configured_map())'
"${compose[@]}" config --quiet

# Stage the new static bundle without touching the live Nginx bind mount yet.
release=".deploy/client-$sha"
mkdir -p "$release"
tar -xzf ".deploy/$sha.tgz" -C "$release" --no-same-owner
[[ -s "$release/index.html" && -s "$release/maplibre-gl-worker.mjs" ]] || {
  echo 'Client archive is incomplete' >&2; exit 1;
}

"${compose[@]}" pull api routing-gateway photon
# No implicit migration or destructive reset. Schema drift fails *before* switching
# application images; follow the reviewed VM migration/backup runbook explicitly.
"${compose[@]}" run --rm --no-deps api bun src/db/check-schema.ts

# Refuse a missing static rollback source before changing any running container.
old_dist=".deploy/client-before-$sha"
[[ -d packages/client/dist && ! -e "$old_dist" ]] || {
  echo 'Existing client build missing or rollback slot occupied' >&2; exit 1;
}
previous_sha="$(cat .deploy/active-sha 2>/dev/null || true)"
rollback() {
  echo 'Deploy failed: restoring previous client bundle and available tagged images' >&2
  if [[ -d "$old_dist" ]]; then
    mv packages/client/dist ".deploy/failed-client-$sha" 2>/dev/null || true
    mv "$old_dist" packages/client/dist
    "${compose[@]}" up -d --no-deps --force-recreate --no-build --pull never nginx || true
  fi
  if [[ "$previous_sha" =~ ^[0-9a-f]{40}$ && "$previous_sha" != "$sha" ]]; then
    BOROBIYA_DEPLOY_SHA="$previous_sha" "${compose[@]}" up -d --no-deps --no-build --pull never \
      api routing-gateway photon || true
  else
    echo 'No previous tagged release; operator must inspect/restore image versions manually' >&2
  fi
}
trap rollback ERR
# Never recreate Postgres, map tiles or volumes as a side effect of a code deploy.
"${compose[@]}" up -d --no-deps --wait --wait-timeout 120 --no-build --pull never api routing-gateway photon
mv packages/client/dist "$old_dist"
mv "$release" packages/client/dist
# Recreate *only* Nginx to rebind the atomically exchanged static directory.
"${compose[@]}" up -d --wait --wait-timeout 60 --no-deps --force-recreate --no-build --pull never nginx
"${compose[@]}" up -d --wait --wait-timeout 60 --no-deps --no-build --pull never edge
"${compose[@]}" exec -T nginx wget -qO- http://127.0.0.1/health >/dev/null
trap - ERR
printf '%s\n' "$sha" > .deploy/active-sha.tmp
mv .deploy/active-sha.tmp .deploy/active-sha
rm -f ".deploy/$sha.tgz"
echo "Deployment completed for $sha. Check HTTPS, map, login, SOS and Android manually."
