#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

# Builds packaging/icon.icns from packaging/icon-1024.png (the Figma export).
# macOS only — uses sips + iconutil, both built in, no extra deps.
#
# Windows icon.ico isn't built here: no ico-writing tool ships on macOS
# without adding a dependency for a one-off asset. Convert icon-1024.png with
# any PNG->ICO tool (sizes 16/32/48/64/128/256) and drop it at packaging/icon.ico.
set -euo pipefail
cd "$(dirname "$0")"

SRC="icon-1024.png"
[ -f "$SRC" ] || { echo "Missing packaging/$SRC — export the master icon from Figma at 1024x1024 first."; exit 1; }

rm -rf icon.iconset
mkdir icon.iconset
for sz in 16 32 128 256 512; do
  sips -z "$sz" "$sz" "$SRC" --out "icon.iconset/icon_${sz}x${sz}.png" >/dev/null
  sips -z $((sz * 2)) $((sz * 2)) "$SRC" --out "icon.iconset/icon_${sz}x${sz}@2x.png" >/dev/null
done
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset

echo "Built packaging/icon.icns"
