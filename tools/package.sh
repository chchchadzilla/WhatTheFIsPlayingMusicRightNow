#!/usr/bin/env bash
# Zips the extension for the Chrome Web Store (Mac / Linux).
#   ./tools/package.sh
# Output: dist/WhatTheFIsPlayingMusicRightNow-<version>.zip
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
version="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$root/manifest.json','utf8')).version)")"
stage="$root/dist/stage"
rm -rf "$stage"
mkdir -p "$stage"
cp "$root/manifest.json" "$root/LICENSE" "$stage/"
cp -R "$root/src" "$root/icons" "$stage/"
zip_path="$root/dist/WhatTheFIsPlayingMusicRightNow-$version.zip"
rm -f "$zip_path"
(cd "$stage" && zip -qr "$zip_path" .)
rm -rf "$stage"
echo "Built $zip_path"
