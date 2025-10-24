#!/bin/bash

# Build MacApiBridge - Unified macOS Native API Tool
# This script compiles the unified Swift bridge for CloudKit and Keychain access

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
OUTPUT_NAME="onekey-desktop-mac-api-bridge"
OUTPUT_PATH="$SCRIPT_DIR/bin/$OUTPUT_NAME"

echo "Building MacApiBridge..."
echo ""

# Check if we're on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo "❌ Error: MacApiBridge can only be built on macOS"
    exit 1
fi

# Check if Swift compiler is available
if ! command -v swiftc &> /dev/null; then
    echo "❌ Error: Swift compiler not found. Please install Xcode Command Line Tools."
    exit 1
fi

# Compile architecture-specific binaries (x86_64 + arm64)
echo "Compiling Swift sources for architecture-specific binaries..."
echo "  - MacApiBridge.swift (main entry point)"
echo "  - CloudKitModuleCore.swift (from Mobile)"
echo "  - KeychainModuleCore.swift (from Mobile)"
echo ""

# Paths to Mobile Core files
MOBILE_IOS_DIR="$SCRIPT_DIR/../../../mobile/ios/OneKeyWallet"
CLOUDKIT_CORE="$MOBILE_IOS_DIR/CloudKitModuleCore.swift"
KEYCHAIN_CORE="$MOBILE_IOS_DIR/KeychainModuleCore.swift"

# Verify Mobile Core files exist
if [[ ! -f "$CLOUDKIT_CORE" ]]; then
    echo "❌ Error: CloudKitModuleCore.swift not found at $CLOUDKIT_CORE"
    exit 1
fi

if [[ ! -f "$KEYCHAIN_CORE" ]]; then
    echo "❌ Error: KeychainModuleCore.swift not found at $KEYCHAIN_CORE"
    exit 1
fi

# Paths for architecture-specific binaries
X64_PATH="$SCRIPT_DIR/bin/${OUTPUT_NAME}-x64"
ARM64_PATH="$SCRIPT_DIR/bin/${OUTPUT_NAME}-arm64"

# Compile for x64 (Intel)
echo "📦 Compiling for x64 (Intel)..."
swiftc -target x86_64-apple-macos12 \
    -o "$X64_PATH" \
    "$SCRIPT_DIR/MacApiBridge.swift" \
    "$CLOUDKIT_CORE" \
    "$KEYCHAIN_CORE"

# Compile for arm64 (Apple Silicon)
echo "📦 Compiling for arm64 (Apple Silicon)..."
swiftc -target arm64-apple-macos12 \
    -o "$ARM64_PATH" \
    "$SCRIPT_DIR/MacApiBridge.swift" \
    "$CLOUDKIT_CORE" \
    "$KEYCHAIN_CORE"

# Verify architectures
echo "✅ Verifying architectures..."
echo "  x64: $(lipo -info "$X64_PATH")"
echo "  arm64:  $(lipo -info "$ARM64_PATH")"

# Make them executable
chmod +x "$X64_PATH"
chmod +x "$ARM64_PATH"

# Verify the build
if [[ ! -f "$X64_PATH" ]] || [[ ! -f "$ARM64_PATH" ]]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ MacApiBridge built successfully:"
echo "  x64: $X64_PATH"
echo "  arm64:  $ARM64_PATH"
echo ""

# Determine which binary to test based on current architecture
CURRENT_ARCH=$(uname -m)
if [[ "$CURRENT_ARCH" == "x86_64" ]]; then
    TEST_BINARY="$X64_PATH"
    TEST_ARCH_NAME="x64 (Intel)"
elif [[ "$CURRENT_ARCH" == "arm64" ]]; then
    TEST_BINARY="$ARM64_PATH"
    TEST_ARCH_NAME="arm64 (Apple Silicon)"
else
    echo "⚠️  Unknown architecture: $CURRENT_ARCH, skipping tests"
    TEST_BINARY=""
fi

if [[ -n "$TEST_BINARY" ]]; then
    echo "Testing $TEST_ARCH_NAME binary..."
    echo ""

    # Test CloudKit functionality
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Testing CloudKit functionality..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    CLOUDKIT_RESULT=$("$TEST_BINARY" cloudkit.isAvailable 2>&1)
    if [[ $? -eq 0 ]]; then
        echo "✅ CloudKit test passed"
        echo "   Result: $CLOUDKIT_RESULT"
    else
        echo "⚠️  CloudKit test failed (this is expected if not signed in to iCloud)"
        echo "   Result: $CLOUDKIT_RESULT"
    fi
    echo ""

    # Test Keychain functionality
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Testing Keychain functionality..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Test iCloud sync check
    echo "1. Testing iCloud Keychain sync status..."
    SYNC_RESULT=$("$TEST_BINARY" keychain.isICloudSyncEnabled 2>&1)
    if [[ $? -eq 0 ]]; then
        echo "   ✅ iCloud sync check passed"
        echo "   Result: $SYNC_RESULT"
    else
        echo "   ⚠️  iCloud sync check failed (may be expected if not signed in)"
        echo "   Result: $SYNC_RESULT"
    fi
    echo ""

    # Test set/get/remove
    echo "2. Testing set/get/remove operations..."

    # Set test item
    SET_RESULT=$("$TEST_BINARY" keychain.setItem '{"key":"__test__","value":"test_value","enableSync":false}' 2>&1)
    if [[ $? -eq 0 ]] && echo "$SET_RESULT" | grep -q '"success"'; then
        echo "   ✅ Set test item succeeded"

        # Get test item
        GET_RESULT=$("$TEST_BINARY" keychain.getItem '{"key":"__test__"}' 2>&1)
        if [[ $? -eq 0 ]] && echo "$GET_RESULT" | grep -q '"value"'; then
            echo "   ✅ Get test item succeeded"

            # Remove test item
            REMOVE_RESULT=$("$TEST_BINARY" keychain.removeItem '{"key":"__test__"}' 2>&1)
            if [[ $? -eq 0 ]] && echo "$REMOVE_RESULT" | grep -q '"success"'; then
                echo "   ✅ Remove test item succeeded"
            else
                echo "   ❌ Remove test item failed"
            fi
        else
            echo "   ❌ Get test item failed"
        fi
    else
        echo "   ❌ Set test item failed"
    fi
    echo ""
fi

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Build Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ MacApiBridge architecture-specific binaries are ready:"
echo "  x64: $X64_PATH"
echo "  arm64:  $ARM64_PATH"
echo ""
echo "Architecture:"
echo "  • MacApiBridge uses Core implementation from Mobile"
echo "  • CloudKitModuleCore.swift - Shared CloudKit logic"
echo "  • KeychainModuleCore.swift - Shared Keychain logic"
echo "  • Single source of truth for both Desktop and Mobile"
echo ""
echo "Supported Commands:"
echo ""
echo "  CloudKit:"
echo "    • cloudkit.isAvailable"
echo "    • cloudkit.saveRecord <json>"
echo "    • cloudkit.fetchRecord <json>"
echo "    • cloudkit.deleteRecord <json>"
echo "    • cloudkit.recordExists <json>"
echo "    • cloudkit.queryRecords <json>"
echo ""
echo "  Keychain:"
echo "    • keychain.setItem <json>"
echo "    • keychain.getItem <json>"
echo "    • keychain.removeItem <json>"
echo "    • keychain.hasItem <json>"
echo "    • keychain.isICloudSyncEnabled"
echo ""
echo "Integration:"
echo ""
echo "1. Desktop API classes already configured:"
echo "   - packages/kit-bg/src/desktopApis/DesktopApiCloudKit.ts"
echo "   - packages/kit-bg/src/desktopApis/DesktopApiKeychain.ts"
echo ""
echo "2. Production builds:"
echo "   - Architecture-specific binaries bundled via electron-builder config"
echo "   - Code signing handled by entitlements"
echo "   - Runtime detects and uses correct architecture binary"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
