#!/usr/bin/env bash
# Parcel bundles each action into a single index.js but can't inline Prisma's
# native .so.node engine. This script repacks each action zip with the Linux
# Prisma engine so queries work on Adobe I/O Runtime (debian-openssl-1.1.x).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist/application/actions/migration-estimator"
ENGINE="libquery_engine-debian-openssl-1.1.x.so.node"
ENGINE_SRC="$ROOT/node_modules/.prisma/client/$ENGINE"
SCHEMA_SRC="$ROOT/node_modules/.prisma/client/schema.prisma"

if [ ! -f "$ENGINE_SRC" ]; then
  echo "Missing $ENGINE_SRC — run: npx prisma generate"; exit 1
fi

for zip in "$DIST"/*.zip; do
  name="$(basename "$zip" .zip)"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  unzip -q "$zip" -d "$tmp"
  mkdir -p "$tmp/node_modules/.prisma/client"
  cp "$ENGINE_SRC" "$tmp/node_modules/.prisma/client/"
  [ -f "$SCHEMA_SRC" ] && cp "$SCHEMA_SRC" "$tmp/node_modules/.prisma/client/"
  (cd "$tmp" && zip -qr "$zip.new" .)
  mv "$zip.new" "$zip"
  echo "repacked $name ($(du -h "$zip" | awk '{print $1}'))"
done
