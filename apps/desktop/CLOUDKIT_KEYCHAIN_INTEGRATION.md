# CloudKit and Keychain Integration for Desktop App

This document describes how to use CloudKit and Keychain APIs in the OneKey Desktop application on macOS.

## Overview

The desktop application now has access to CloudKit and secure storage services through the `desktopApiProxy` interface. This allows for:

- **CloudKit**: Cloud storage and synchronization of data across user's Apple devices (macOS only)
- **Keychain**: Secure storage with iCloud Keychain sync and TRUE app sandboxing (macOS only, via native Swift)

**Important**: Both CloudKit and Keychain now support iCloud sync on macOS. Keychain provides TRUE Bundle ID-based app isolation and is fully compatible with iOS KeychainModule for cross-device data sharing.

## Architecture

### Components

1. **Bridge Layer** (`apps/desktop/app/libs/`)
   - `cloudkit-bridge.ts`: CloudKit operations wrapper (calls Swift helper)
   - `keychain-bridge.ts`: Keychain operations wrapper (calls Swift helper)

2. **Desktop API Layer** (`packages/kit-bg/src/desktopApis/`)
   - `DesktopApiCloudKit.ts`: CloudKit API interface
   - `DesktopApiKeychain.ts`: Keychain API interface (uses native Swift helper)

3. **Proxy Layer** (`packages/kit-bg/src/desktopApis/instance/`)
   - `desktopApiProxy.ts`: Exposes APIs to renderer process

4. **Native Helpers** (`apps/desktop/scripts/`)
   - `CloudKitHelper.swift`: Swift command-line tool for CloudKit operations
   - `KeychainHelper.swift`: Swift command-line tool for Keychain operations with iCloud sync

## Usage

### Accessing the APIs

In your renderer process code:

```typescript
import desktopApiProxy from '@onekeyhq/kit-bg/src/desktopApis/instance/desktopApiProxy';

// Access CloudKit
const cloudKit = desktopApiProxy.cloudKit;

// Access Keychain
const keychain = desktopApiProxy.keychain;
```

### CloudKit API

#### Check Availability

```typescript
const isAvailable = await desktopApiProxy.cloudKit.isAvailable();
if (!isAvailable) {
  console.log('CloudKit is not available');
}
```

#### Save a Record

```typescript
const result = await desktopApiProxy.cloudKit.saveRecord({
  recordType: 'BackupData',
  recordID: 'backup_001',
  data: JSON.stringify({ wallet: 'data' }),
});

console.log('Saved record:', result.recordID, 'at', result.createdAt);
```

#### Fetch a Record

```typescript
const record = await desktopApiProxy.cloudKit.fetchRecord({
  recordID: 'backup_001',
  recordType: 'BackupData',
});

if (record) {
  console.log('Fetched record:', record);
  const data = JSON.parse(record.data);
}
```

#### Delete a Record

```typescript
const success = await desktopApiProxy.cloudKit.deleteRecord({
  recordID: 'backup_001',
  recordType: 'BackupData',
});
```

#### Check Record Existence

```typescript
const exists = await desktopApiProxy.cloudKit.recordExists({
  recordID: 'backup_001',
  recordType: 'BackupData',
});
```

#### Query Records

```typescript
const result = await desktopApiProxy.cloudKit.queryRecords({
  recordType: 'BackupData',
});

console.log(`Found ${result.records.length} records`);
result.records.forEach(record => {
  console.log(record.recordID, record.data);
});
```

### Keychain API

#### Store an Item

```typescript
await desktopApiProxy.keychain.setItem({
  key: 'encryption_key',
  value: 'my-secret-key',
});
```

#### Retrieve an Item

```typescript
const result = await desktopApiProxy.keychain.getItem({
  key: 'encryption_key',
});

if (result) {
  console.log('Retrieved:', result.value);
} else {
  console.log('Item not found');
}
```

#### Remove an Item

```typescript
await desktopApiProxy.keychain.removeItem({
  key: 'encryption_key',
});
```

#### Check Item Existence

```typescript
const exists = await desktopApiProxy.keychain.hasItem({
  key: 'encryption_key',
});
```

#### Check iCloud Keychain Sync Status

```typescript
const isSyncEnabled = await desktopApiProxy.keychain.isICloudSyncEnabled();
// Returns true if user is signed in to iCloud and iCloud Keychain is enabled
// When true, keychain items automatically sync across all Apple devices
```

## Implementation Details

### CloudKit Bridge

The CloudKit bridge requires a native Swift helper tool to be compiled and bundled with the app. This helper tool:

1. Wraps CloudKit APIs in a command-line interface
2. Takes commands via JSON input
3. Returns results via JSON output
4. Is invoked by Node.js using `child_process.execFile`

**Location**: `apps/desktop/scripts/cloudkit-helper`

**Build**: Run `./build-cloudkit-helper.sh`

### Keychain Bridge

The Keychain implementation uses **Native Swift KeychainHelper** (NOT Electron safeStorage). This provides:

- **TRUE Bundle ID-based app sandboxing** - System-level isolation, other apps CANNOT access
- **iCloud Keychain synchronization** - Automatic sync across user's Apple devices
- **iOS compatibility** - Full compatibility with iOS KeychainModule for cross-device data sharing
- **Security Framework APIs** - Uses native macOS Security framework

**Features**:
- ✅ TRUE app sandboxing via Bundle ID (not just string identifier)
- ✅ iCloud Keychain sync enabled by default
- ✅ Compatible with iOS KeychainModule (same Bundle ID)
- ✅ Mac App Store compatible
- ✅ Cross-device data sharing (Desktop ↔ iOS)

**Why not `security` CLI tool?**
- ❌ Only string-based isolation (not Bundle ID)
- ❌ Other apps can access if they know service name
- ❌ Not Mac App Store compatible

**Why not Electron safeStorage?**
- ❌ No iCloud Keychain sync
- ❌ Cannot share data with iOS app

**Location**: `apps/desktop/scripts/keychain-helper`

**Build**: Run `./build-keychain-helper.sh`

See `KEYCHAIN_SECURITY_NOTES.md` for detailed security analysis.

## Platform Support

- **CloudKit**: macOS only (requires native Swift helper)
- **Keychain**: macOS only (requires native Swift helper with iCloud sync)
  - Uses native Security framework
  - Provides TRUE Bundle ID-based app sandboxing
  - Supports iCloud Keychain synchronization
  - Compatible with iOS KeychainModule

Both APIs return platform-appropriate errors when called on unsupported platforms.

## Security Considerations

1. **Keychain (Native Swift KeychainHelper)**:
   - TRUE Bundle ID-based app sandboxing (system-level security)
   - iCloud Keychain synchronization enabled by default
   - Data encrypted at rest and in transit (iCloud sync)
   - Compatible with iOS KeychainModule for cross-device data sharing
   - Mac App Store compatible
   - Other applications CANNOT access these keychain items
   - See `KEYCHAIN_SECURITY_NOTES.md` for detailed security analysis

2. **CloudKit**:
   - Data stored in user's private iCloud database
   - Requires user to be signed in to iCloud
   - Subject to iCloud storage limits
   - End-to-end encrypted when using CloudKit encryption
   - Suitable for large data storage (backups, settings)

## Next Steps

### To Build and Test:

1. **Build Keychain Helper**:
   ```bash
   cd apps/desktop/scripts
   ./build-keychain-helper.sh
   ```

2. **Build CloudKit Helper**:
   ```bash
   cd apps/desktop/scripts
   ./build-cloudkit-helper.sh
   ```

3. **Test Keychain with iCloud Sync**:
   ```typescript
   // Store on Desktop
   await desktopApiProxy.keychain.setItem({
     key: 'test_key',
     value: 'hello from desktop',
   });

   // Check iCloud sync status
   const syncEnabled = await desktopApiProxy.keychain.isICloudSyncEnabled();
   console.log('iCloud sync enabled:', syncEnabled);

   // On iOS device (same Apple ID), read the same data
   const result = await KeychainModule.getItem({ key: 'test_key' });
   console.log(result.value); // 'hello from desktop'
   ```

4. **Test CloudKit**:
   ```typescript
   // Test availability
   const available = await desktopApiProxy.cloudKit.isAvailable();

   // Test save/fetch
   await desktopApiProxy.cloudKit.saveRecord({...});
   const record = await desktopApiProxy.cloudKit.fetchRecord({...});
   ```

## Troubleshooting

### Keychain

- **Helper not found**: Check helper tool path in `keychain-bridge.ts` and ensure it's compiled
- **Item not found**: Item may have been deleted or never created
- **iCloud sync not working**:
  - Check if user is signed in to iCloud
  - Verify iCloud Keychain is enabled in System Preferences
  - Use `isICloudSyncEnabled()` to check status
- **Platform not supported**: Keychain with iCloud sync only available on macOS
- **Cross-device sync issues**:
  - Verify both devices use same Apple ID
  - Ensure same Bundle ID ("so.onekey.wallet") is used on both platforms
  - Check iCloud Keychain is enabled on both devices

### CloudKit

- **Helper not found**: Check helper tool path in `cloudkit-bridge.ts` and ensure it's compiled
- **Account unavailable**: User must be signed in to iCloud
- **Container not found**: Verify CloudKit container configuration

## Reference

- iOS Implementation: `apps/mobile/ios/OneKeyWallet/CloudKitModule.swift`
- iOS Implementation: `apps/mobile/ios/OneKeyWallet/KeychainModule.swift`
- Electron safeStorage: https://www.electronjs.org/docs/latest/api/safe-storage
- CloudKit Documentation: https://developer.apple.com/documentation/cloudkit
- Security Analysis: `apps/desktop/KEYCHAIN_SECURITY_NOTES.md`
