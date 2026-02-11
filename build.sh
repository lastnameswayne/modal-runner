#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend/modal-run"

echo "Building Rust backend..."
cargo build --release --manifest-path "$BACKEND_DIR/Cargo.toml"

echo "Copying binary..."
mkdir -p "$FRONTEND_DIR/bin"
cp "$BACKEND_DIR/target/release/backend" "$FRONTEND_DIR/bin/backend"

echo "Installing npm dependencies..."
cd "$FRONTEND_DIR"
npm install

echo "Compiling TypeScript..."
npm run compile

echo "Packaging extension..."
npx vsce package

echo "Done!"
ls -la "$FRONTEND_DIR"/*.vsix
