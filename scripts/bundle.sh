#!/usr/bin/env bash
# Fallback macOS bundler for tmd.
#
# `pnpm tauri build` validates the config and compiles+bundles in one shot.
# That is the preferred path. This script exists as a robust fallback that
# skips the JS CLI entirely: it assumes the release binary already exists
# (built via `cargo build --release --features custom-protocol`, which embeds the frontend) and assembles
# a runnable .app by copying the binary + an Info.plist + the app icon.
#
# Usage:
#   pnpm build          # build the frontend into dist/
#   cargo build --release --features custom-protocol  # compile + embed frontend (in src-tauri)
#   bash scripts/bundle.sh
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="src-tauri/target/release/tmd"
APP="src-tauri/target/release/bundle/macos/tmd.app"

if [ ! -f "$SRC" ]; then
  echo "error: $SRC not found. Run 'cargo build --release --features custom-protocol' in src-tauri first." >&2
  exit 1
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp "$SRC" "$APP/Contents/MacOS/tmd"
chmod +x "$APP/Contents/MacOS/tmd"

if [ -f src-tauri/icons/icon.icns ]; then
  cp src-tauri/icons/icon.icns "$APP/Contents/Resources/AppIcon.icns"
fi

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>tmd</string>
  <key>CFBundleDisplayName</key>
  <string>tmd</string>
  <key>CFBundleExecutable</key>
  <string>tmd</string>
  <key>CFBundleIdentifier</key>
  <string>bid.adaq.tmd</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>CFBundleGetInfoString</key>
  <string>tmd</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
  <key>NSSupportsAutomaticGraphicsSwitching</key>
  <true/>
</dict>
</plist>
PLIST

# Ad-hoc sign so macOS (Gatekeeper / library validation) will run a locally
# built, unsigned binary. Harmless if codesign is unavailable.
if command -v codesign >/dev/null 2>&1; then
  codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true
fi

echo "Created $APP"
