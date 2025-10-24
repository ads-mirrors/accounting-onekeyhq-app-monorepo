# CloudKit and Keychain Usage Examples

This document provides practical examples for using CloudKit and Keychain APIs in the OneKey Desktop application.

## Basic Setup

```typescript
import desktopApiProxy from '@onekeyhq/kit-bg/src/desktopApis/instance/desktopApiProxy';
import platformEnv from '@onekeyhq/shared/src/platformEnv';

// Check if we're on desktop
if (platformEnv.isDesktop) {
  // APIs are available
}
```

## Example 1: Backup with CloudKit

```typescript
async function backupToCloudKit(backupData: any) {
  try {
    // Check if CloudKit is available
    const isAvailable = await desktopApiProxy.cloudKit.isAvailable();
    if (!isAvailable) {
      console.error('CloudKit is not available. User may not be signed in to iCloud.');
      return { success: false, error: 'CloudKit unavailable' };
    }

    // Save backup to CloudKit
    const result = await desktopApiProxy.cloudKit.saveRecord({
      recordType: 'WalletBackup',
      recordID: `backup_${Date.now()}`,
      data: JSON.stringify(backupData),
    });

    console.log('Backup saved to CloudKit:', result.recordID);
    return { success: true, recordID: result.recordID };
  } catch (error) {
    console.error('Failed to backup to CloudKit:', error);
    return { success: false, error: error.message };
  }
}

// Usage
const backupData = {
  wallets: [...],
  settings: {...},
  timestamp: Date.now(),
};

const result = await backupToCloudKit(backupData);
if (result.success) {
  console.log('Backup successful:', result.recordID);
}
```

## Example 2: Restore from CloudKit

```typescript
async function restoreFromCloudKit(recordID: string) {
  try {
    // Fetch the backup record
    const record = await desktopApiProxy.cloudKit.fetchRecord({
      recordID,
      recordType: 'WalletBackup',
    });

    if (!record) {
      return { success: false, error: 'Backup not found' };
    }

    // Parse backup data
    const backupData = JSON.parse(record.data);

    console.log('Backup restored from CloudKit:', {
      recordID: record.recordID,
      createdAt: new Date(record.createdAt),
      modifiedAt: new Date(record.modifiedAt),
    });

    return { success: true, data: backupData };
  } catch (error) {
    console.error('Failed to restore from CloudKit:', error);
    return { success: false, error: error.message };
  }
}

// Usage
const result = await restoreFromCloudKit('backup_1234567890');
if (result.success) {
  // Apply restored data
  applyBackup(result.data);
}
```

## Example 3: List All Backups

```typescript
async function listAllBackups() {
  try {
    const result = await desktopApiProxy.cloudKit.queryRecords({
      recordType: 'WalletBackup',
    });

    const backups = result.records.map(record => ({
      id: record.recordID,
      createdAt: new Date(record.createdAt),
      modifiedAt: new Date(record.modifiedAt),
      preview: JSON.parse(record.data),
    }));

    // Sort by creation date (newest first)
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return { success: true, backups };
  } catch (error) {
    console.error('Failed to list backups:', error);
    return { success: false, error: error.message };
  }
}

// Usage
const result = await listAllBackups();
if (result.success) {
  result.backups.forEach(backup => {
    console.log(`Backup: ${backup.id} - Created: ${backup.createdAt}`);
  });
}
```

## Example 4: Secure Encryption Key with Keychain (with iCloud Sync)

```typescript
async function saveEncryptionKey(key: string) {
  try {
    // Keychain items automatically sync to iCloud by default
    await desktopApiProxy.keychain.setItem({
      key: 'wallet_encryption_key',
      value: key,
    });

    console.log('✅ Encryption key saved to Keychain');
    console.log('🔄 Will automatically sync to user\'s other Apple devices');
    return { success: true };
  } catch (error) {
    console.error('Failed to save encryption key:', error);
    return { success: false, error: error.message };
  }
}

async function getEncryptionKey() {
  try {
    const result = await desktopApiProxy.keychain.getItem({
      key: 'wallet_encryption_key',
    });

    if (!result) {
      return { success: false, error: 'Key not found' };
    }

    console.log('✅ Retrieved encryption key from Keychain');
    console.log('🔄 This key may have synced from another device');
    return { success: true, key: result.value };
  } catch (error) {
    console.error('Failed to get encryption key:', error);
    return { success: false, error: error.message };
  }
}

// Usage
// Save key on Desktop
await saveEncryptionKey('my-secret-key-12345');

// Retrieve key on Desktop (or iOS after iCloud sync)
const result = await getEncryptionKey();
if (result.success) {
  const encryptionKey = result.key;
  // Use the key for encryption/decryption
}

// On iOS device (same Apple ID), you can access the same key:
// const iOSResult = await KeychainModule.getItem({ key: 'wallet_encryption_key' });
// console.log(iOSResult.value); // 'my-secret-key-12345'
```

## Example 5: Check iCloud Sync Status

```typescript
async function checkSyncCapability() {
  try {
    // Check CloudKit availability
    const cloudKitAvailable = await desktopApiProxy.cloudKit.isAvailable();

    // Check iCloud Keychain sync capability
    const keychainSyncEnabled = await desktopApiProxy.keychain.isICloudSyncEnabled();

    return {
      cloudKit: cloudKitAvailable,
      keychainSync: keychainSyncEnabled,
      canBackup: cloudKitAvailable,
      canSyncKeys: keychainSyncEnabled,
    };
  } catch (error) {
    console.error('Failed to check sync capability:', error);
    return {
      cloudKit: false,
      keychainSync: false,
      canBackup: false,
      canSyncKeys: false,
    };
  }
}

// Usage
const syncStatus = await checkSyncCapability();
if (syncStatus.cloudKit) {
  console.log('✅ CloudKit available - can backup large data to iCloud');
}
if (syncStatus.keychainSync) {
  console.log('✅ iCloud Keychain sync enabled - keys will sync across devices');
  console.log('   Desktop ↔ iOS data sharing is enabled');
}

// Display to user
if (!syncStatus.keychainSync) {
  console.warn('⚠️  iCloud Keychain sync not available');
  console.warn('   - User may not be signed in to iCloud');
  console.warn('   - iCloud Keychain may be disabled in System Preferences');
}
```

## Example 6: Complete Backup/Restore Flow with Cross-Device Support

```typescript
class BackupManager {
  private readonly BACKUP_RECORD_TYPE = 'WalletBackup';
  private readonly ENCRYPTION_KEY = 'wallet_backup_encryption_key';

  async createBackup(walletData: any) {
    try {
      // 1. Check CloudKit availability
      const isAvailable = await desktopApiProxy.cloudKit.isAvailable();
      if (!isAvailable) {
        throw new Error('CloudKit not available');
      }

      // 2. Get or create encryption key
      // Key automatically syncs to iOS via iCloud Keychain
      let encryptionKey = await this.getOrCreateEncryptionKey();

      // 3. Encrypt wallet data
      const encryptedData = this.encrypt(walletData, encryptionKey);

      // 4. Save to CloudKit
      const recordID = `backup_${Date.now()}`;
      const result = await desktopApiProxy.cloudKit.saveRecord({
        recordType: this.BACKUP_RECORD_TYPE,
        recordID,
        data: encryptedData,
      });

      console.log('✅ Backup created successfully:', result.recordID);
      console.log('🔄 Encryption key automatically synced to iOS via iCloud Keychain');
      return { success: true, recordID: result.recordID };
    } catch (error) {
      console.error('❌ Backup failed:', error);
      return { success: false, error: error.message };
    }
  }

  async restoreBackup(recordID: string) {
    try {
      // 1. Fetch from CloudKit
      const record = await desktopApiProxy.cloudKit.fetchRecord({
        recordID,
        recordType: this.BACKUP_RECORD_TYPE,
      });

      if (!record) {
        throw new Error('Backup not found');
      }

      // 2. Get encryption key (may have synced from another device)
      const keyResult = await desktopApiProxy.keychain.getItem({
        key: this.ENCRYPTION_KEY,
      });

      if (!keyResult) {
        throw new Error('Encryption key not found - may need to restore from original device');
      }

      // 3. Decrypt data
      const walletData = this.decrypt(record.data, keyResult.value);

      console.log('✅ Backup restored successfully');
      console.log('🔄 Used encryption key synced via iCloud Keychain');
      return { success: true, data: walletData };
    } catch (error) {
      console.error('❌ Restore failed:', error);
      return { success: false, error: error.message };
    }
  }

  private async getOrCreateEncryptionKey(): Promise<string> {
    // Check if key already exists (may have synced from another device)
    const result = await desktopApiProxy.keychain.getItem({
      key: this.ENCRYPTION_KEY,
    });

    if (result) {
      console.log('📱 Using existing encryption key (possibly synced from another device)');
      return result.value;
    }

    // Create new key - will automatically sync to user's other Apple devices
    const newKey = this.generateEncryptionKey();
    await desktopApiProxy.keychain.setItem({
      key: this.ENCRYPTION_KEY,
      value: newKey,
    });

    console.log('🔑 Created new encryption key - will sync to other devices via iCloud Keychain');
    return newKey;
  }

  private generateEncryptionKey(): string {
    // Generate a secure random key
    return require('crypto').randomBytes(32).toString('hex');
  }

  private encrypt(data: any, key: string): string {
    // Implement your encryption logic
    return JSON.stringify(data); // Placeholder
  }

  private decrypt(encryptedData: string, key: string): any {
    // Implement your decryption logic
    return JSON.parse(encryptedData); // Placeholder
  }
}

// Usage
const backupManager = new BackupManager();

// Create backup
const backupResult = await backupManager.createBackup({
  wallets: [...],
  settings: {...},
});

// Restore backup
const restoreResult = await backupManager.restoreBackup(backupResult.recordID);
```

## Example 7: Delete Old Backups

```typescript
async function cleanupOldBackups(keepCount: number = 5) {
  try {
    // Get all backups
    const result = await desktopApiProxy.cloudKit.queryRecords({
      recordType: 'WalletBackup',
    });

    // Sort by creation date (newest first)
    const sortedBackups = result.records.sort(
      (a, b) => b.createdAt - a.createdAt
    );

    // Delete old backups
    const toDelete = sortedBackups.slice(keepCount);
    const deletePromises = toDelete.map(backup =>
      desktopApiProxy.cloudKit.deleteRecord({
        recordID: backup.recordID,
        recordType: 'WalletBackup',
      })
    );

    await Promise.all(deletePromises);

    console.log(`✅ Cleaned up ${toDelete.length} old backups`);
    return { success: true, deletedCount: toDelete.length };
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    return { success: false, error: error.message };
  }
}

// Usage
// Keep only the 5 most recent backups
await cleanupOldBackups(5);
```

## Error Handling Best Practices

```typescript
async function robustBackup(data: any) {
  try {
    // Always check availability first
    const isAvailable = await desktopApiProxy.cloudKit.isAvailable();
    if (!isAvailable) {
      return {
        success: false,
        error: 'CloudKit not available',
        userMessage: 'Please sign in to iCloud to enable backups',
      };
    }

    // Attempt backup
    const result = await desktopApiProxy.cloudKit.saveRecord({
      recordType: 'WalletBackup',
      recordID: `backup_${Date.now()}`,
      data: JSON.stringify(data),
    });

    return { success: true, recordID: result.recordID };
  } catch (error) {
    // Handle specific errors
    if (error.message.includes('quota')) {
      return {
        success: false,
        error: 'iCloud storage full',
        userMessage: 'Your iCloud storage is full. Please free up space.',
      };
    }

    if (error.message.includes('network')) {
      return {
        success: false,
        error: 'Network error',
        userMessage: 'Please check your internet connection and try again.',
      };
    }

    // Generic error
    return {
      success: false,
      error: error.message,
      userMessage: 'Backup failed. Please try again later.',
    };
  }
}
```

## Platform Detection

```typescript
import platformEnv from '@onekeyhq/shared/src/platformEnv';

function getAvailableFeatures() {
  const features = {
    cloudKitBackup: false,
    keychainSync: false,
  };

  if (platformEnv.isDesktop && platformEnv.isMac) {
    features.cloudKitBackup = true;
    features.keychainSync = true;
  }

  return features;
}

// Usage
const features = getAvailableFeatures();
if (features.cloudKitBackup) {
  // Show CloudKit backup option in UI
}
```

## Example 8: Cross-Device Data Sharing (Desktop ↔ iOS)

```typescript
// On Desktop: Store a key
await desktopApiProxy.keychain.setItem({
  key: 'shared_wallet_key',
  value: 'my-secret-key-12345',
});
console.log('✅ Key saved on Desktop - will sync to iOS');

// Wait for iCloud sync (usually < 1 minute)
// ...

// On iOS: Read the same key
// import { KeychainModule } from '@onekeyhq/mobile';
// const result = await KeychainModule.getItem({ key: 'shared_wallet_key' });
// console.log(result.value); // 'my-secret-key-12345' ✅

// Vice versa: Store on iOS, read on Desktop
// iOS: await KeychainModule.setItem({ key: 'ios_key', value: 'from-ios' });
// Desktop: const result = await desktopApiProxy.keychain.getItem({ key: 'ios_key' });
// console.log(result.value); // 'from-ios' ✅
```

**Requirements for Cross-Device Sync**:
1. Same Apple ID signed in on both devices
2. iCloud Keychain enabled on both devices
3. Same Bundle ID (`so.onekey.wallet`) used on both platforms
4. Same key names used for accessing data

**Sync Time**: Usually completes within 1 minute, but may take longer depending on network conditions.

## Notes

1. All APIs are asynchronous and return Promises
2. Always check availability before using CloudKit or Keychain operations
3. Handle errors gracefully with user-friendly messages
4. **Keychain**: macOS only, supports iCloud Keychain sync
5. **CloudKit**: macOS only, for large data storage
6. User must be signed in to iCloud for both CloudKit and iCloud Keychain sync
7. **Keychain items automatically sync via iCloud Keychain** to all user's Apple devices (Desktop ↔ iOS)
8. Encryption keys in Keychain can be shared across Desktop and iOS apps for seamless backup/restore
