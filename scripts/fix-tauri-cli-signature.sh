#!/usr/bin/env bash
# Re-sign the Tauri CLI's native NAPI bindings so macOS 26.5+ (Tahoe) does not
# SIGKILL the `tauri` CLI process.
#
# Root cause: the prebuilt `cli.darwin-*.node` Mach-O dylibs shipped inside
# @tauri-apps/cli are only *linker-signed* (`codesign` flags=0x20002, i.e.
# CS_LINKER_SIGNED). On macOS 26.5+ the kernel's AMFI module rejects that
# signature format for these binaries and kills the process ("Attempt to
# execute completely unsigned code") as soon as the CLI loads the project
# config (i.e. the moment `tauri dev`/`build`/`info` reads
# `src-tauri/tauri.conf.json`). `tauri --help`/`--version` still work because
# they don't load the config.
#
# Fix: re-sign each binding with a plain ad-hoc signature (removes
# CS_LINKER_SIGNED) using a 4KB page size. See tauri-apps/tauri#15801.
#
# Re-run after every `pnpm install` (wired into `postinstall`).
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v codesign >/dev/null 2>&1; then
  echo "[tauri-sign] codesign not available — skipping (not on macOS)"
  exit 0
fi

count=0
while IFS= read -r f; do
  info="$(codesign -dv "$f" 2>&1 || true)"
  if printf '%s' "$info" | grep -q 'linker-signed'; then
    codesign --force --sign - --pagesize=4096 "$f" >/dev/null 2>&1 && {
      echo "[tauri-sign] re-signed $f"
      count=$((count + 1))
    }
  fi
done < <(find node_modules/.pnpm -name 'cli.darwin*.node' 2>/dev/null)

echo "[tauri-sign] done ($count bindings re-signed)"
