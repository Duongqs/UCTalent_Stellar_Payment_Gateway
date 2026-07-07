#!/bin/bash
# Contract Source/WASM Integrity Gate

set -e

# Change directory to the soroban root (where Cargo.toml is)
cd "$(dirname "$0")"

echo "======================================================"
echo "🛡️  Contract Source/WASM Integrity Gate"
echo "======================================================"

# 1. Compile the contract to WASM
echo "🔨 Compiling smart contracts..."
stellar contract build

# 2. Paths to WASM files
BUILT_WASM="target/wasm32v1-none/release/uctalent_escrow.wasm"
CHECKED_IN_WASM="contracts/uctalent-escrow/uctalent_escrow.wasm"

if [ ! -f "$BUILT_WASM" ]; then
  echo "❌ Error: Built WASM file not found at $BUILT_WASM"
  exit 1
fi

if [ ! -f "$CHECKED_IN_WASM" ]; then
  echo "❌ Error: Checked-in WASM file not found at $CHECKED_IN_WASM"
  exit 1
fi

# 3. Calculate SHA-256 hashes
BUILT_HASH=$(shasum -a 256 "$BUILT_WASM" | cut -d' ' -f1)
CHECKED_IN_HASH=$(shasum -a 256 "$CHECKED_IN_WASM" | cut -d' ' -f1)

echo "📦 Built WASM Hash      : $BUILT_HASH"
echo "📦 Checked-in WASM Hash : $CHECKED_IN_HASH"

# 4. Compare hashes
if [ "$BUILT_HASH" != "$CHECKED_IN_HASH" ]; then
  echo "❌ INTEGRITY ERROR: Mismatch detected between compiled WASM and checked-in WASM!"
  echo "   The Rust source code has changed but the prebuilt WASM was not updated."
  echo "   Please run 'stellar contract build' and copy the output to 'contracts/uctalent-escrow/uctalent_escrow.wasm',"
  echo "   or run 'cp target/wasm32v1-none/release/uctalent_escrow.wasm contracts/uctalent-escrow/uctalent_escrow.wasm' and commit the update."
  exit 1
fi

echo "✅ Hash check passed! Freshly built WASM matches checked-in WASM."

# 5. Run contract tests
echo "🧪 Running Cargo unit tests..."
cargo test

echo "✅ All tests passed successfully!"
echo "======================================================"
