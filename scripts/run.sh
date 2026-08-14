#!/usr/bin/env bash
# Launch the tmd app directly, bypassing the Tauri CLI.
#
# Why this exists: in the CodeBuddy sandbox the harness SIGKILLs the
# `tauri` CLI process tree (and its `cargo` child), so `pnpm tauri dev`
# / `pnpm tauri build` die instantly with no error. The compiled binary
# itself runs fine when launched directly — and the sandbox has a
# WindowServer, so the UI actually renders.
#
# This builds the frontend + backend, then execs the binary.
# (For true HMR dev with `tauri dev`, run on your own Mac instead.)
set -e
cd "$(dirname "$0")/.."

echo "[run] building frontend (tsc + vite)…"
pnpm build

echo "[run] building backend (cargo release, custom-protocol)…"
(cd src-tauri && cargo build --release --features custom-protocol)

echo "[run] launching tmd…"
exec ./src-tauri/target/release/tmd
