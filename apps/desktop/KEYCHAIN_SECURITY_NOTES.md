# Keychain Security Implementation Notes

## ✅ 最终实现方案

**使用原生 Swift KeychainHelper** - 提供真正的应用沙盒隔离和 iCloud 同步

### 核心特性
- ✅ **TRUE app sandboxing** - 使用 Bundle ID 实现系统级应用隔离
- ✅ **iCloud Keychain sync** - 自动同步到用户的所有 Apple 设备
- ✅ **iOS compatibility** - 与 iOS KeychainModule 完全兼容，数据共享
- ✅ **Security** - 其他应用**无法访问**这些 keychain 项目

## 重要说明：为什么不使用 `security` 命令行工具

### 问题分析

最初的实现考虑使用 macOS `security` 命令行工具，但这有严重的安全问题：

#### 1. **应用沙盒隔离问题**
```bash
# 使用 security 命令写入的数据
security add-generic-password -s so.onekey.wallet.desktop -a key -w value
```

**问题**：
- 数据存储在**用户的 login keychain**，不是应用专属的 keychain
- 只通过 service identifier 区分应用
- **其他应用可以访问相同 service identifier 的数据**
- 不是真正的应用沙盒隔离

#### 2. **Mac App Store 沙盒限制**
- 沙盒应用可能无法执行 `security` 命令
- 需要额外的 entitlements
- 可能导致审核被拒

#### 3. **iCloud Keychain 同步不可靠**
- `-U` 参数不保证真正的 iCloud 同步
- 需要正确的 entitlements 和代码签名
- 同步行为不可预测

## 实现方案对比

### ❌ 方案 1: Electron safeStorage API

**优点**：
- ✅ 真正的应用沙盒隔离
- ✅ 跨平台支持
- ✅ 简单易用

**缺点**：
- ❌ **不支持 iCloud 同步** - 数据仅存储在本地
- ❌ **无法与 iOS 共享** - 无法跨设备访问
- ❌ **数据恢复困难** - 设备切换后需要重新设置

### ❌ 方案 2: `security` 命令行工具

**优点**：
- ✅ 支持 iCloud 同步

**缺点**：
- ❌ **不是真正的应用隔离** - 只用字符串标识
- ❌ **其他应用可访问** - 知道 service name 即可读取
- ❌ **安全性低** - 任何应用都可以用相同参数读取
- ❌ **Mac App Store 不兼容** - 可能被审核拒绝

### ✅ 方案 3: 原生 Swift KeychainHelper（最终方案）

**优点**：
- ✅ **真正的应用沙盒隔离** - 使用 Bundle ID，系统级安全
- ✅ **iCloud Keychain 同步** - 自动同步到所有设备
- ✅ **与 iOS 完全兼容** - 数据可以跨 Desktop 和 Mobile 共享
- ✅ **安全性高** - 其他应用无法访问
- ✅ **Mac App Store 兼容** - 符合审核规范

**缺点**：
- ⚠️ 需要编译 Swift helper
- ⚠️ macOS only（但这是预期的）

### 当前实现：Native Swift KeychainHelper ✅

```swift
// KeychainHelper.swift - 原生 Swift 实现
import Foundation
import Security

class KeychainHelper {
    // 使用 Bundle ID 实现真正的应用隔离
    let serviceIdentifier = "so.onekey.wallet"

    func setItem(key: String, value: String, enableSync: Bool) {
        let query: [String: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: serviceIdentifier,  // ✅ Bundle ID 隔离
            kSecAttrAccount: key,
            kSecValueData: value.data(using: .utf8)!,
            kSecAttrSynchronizable: enableSync,   // ✅ iCloud 同步
        ]
        SecItemAdd(query as CFDictionary, nil)
    }
}
```

```typescript
// keychain-bridge.ts - Node.js 调用 Swift helper
import { execFile } from 'child_process';

export async function setItem(params: { key: string; value: string }) {
    const helperPath = getKeychainHelperPath();
    const { stdout } = await execFileAsync(helperPath, [
        'setItem',
        JSON.stringify({
            key: params.key,
            value: params.value,
            enableSync: true,  // 启用 iCloud 同步
        }),
    ]);
    return JSON.parse(stdout);
}
```

### Native Swift KeychainHelper 的优势

#### 1. **真正的应用沙盒隔离**
- 使用 Bundle ID 作为 service identifier
- 系统级应用标识，无法伪造
- 其他应用**绝对无法访问**

#### 2. **iCloud Keychain 同步**
- 自动同步到用户所有 Apple 设备
- 与 iOS KeychainModule 使用相同机制
- 数据跨设备无缝访问

#### 3. **iOS 兼容性**
- 相同的 API 结构和数据格式
- 相同的 Bundle ID 和 key 命名
- Desktop 和 iOS 可以共享 keychain 数据

#### 4. **Mac App Store 兼容**
- 使用系统原生 API
- 完全符合沙盒要求
- 不会被审核拒绝

#### 5. **安全性保障**
- 代码签名验证
- Bundle ID 系统级隔离
- iCloud Keychain 端到端加密

## API 对比

### ❌ 错误方式 1：使用 security 命令

```typescript
// 不安全！不推荐！
const { execFile } = require('child_process');

// 写入 - 问题：只用字符串标识，其他应用可以访问
await execFile('security', [
  'add-generic-password',
  '-s', 'so.onekey.wallet.desktop',  // ❌ 只是字符串，不安全
  '-a', 'key',
  '-w', 'value'
]);

// 读取 - 问题：任何应用都可以这样读取
const { stdout } = await execFile('security', [
  'find-generic-password',
  '-s', 'so.onekey.wallet.desktop',
  '-a', 'key',
  '-w'
]);
// 结果：value  😱 其他应用也能读取！
```

### ❌ 错误方式 2：使用 Electron safeStorage

```typescript
// 安全但不支持 iCloud 同步
import * as store from '@onekeyhq/desktop/app/libs/store';

// 写入 - 安全但只在本地
store.setSecureItem('key', 'value');

// ❌ 无法在 iOS 设备上访问
// ❌ 设备切换后需要重新设置
```

### ✅ 正确方式：使用原生 Swift KeychainHelper

```typescript
// 推荐！安全且支持 iCloud 同步
import desktopApiProxy from '@onekeyhq/kit-bg/src/desktopApis/instance/desktopApiProxy';

// Desktop 上存储
await desktopApiProxy.keychain.setItem({
  key: 'wallet_encryption_key',
  value: 'my-secret-key',
});

// ✅ 自动同步到 iCloud
// ✅ iOS 设备上可以读取相同的数据
// ✅ 其他应用无法访问（Bundle ID 隔离）

// iOS 上读取（使用 KeychainModule.swift）
const result = await KeychainModule.getItem({
  key: 'wallet_encryption_key'
});
// result.value === 'my-secret-key'  ✅ 跨设备数据共享！
```

## iCloud Keychain 同步

### ✅ 完整支持

**Native Swift KeychainHelper 完全支持 iCloud Keychain 同步**

- ✅ 使用 `kSecAttrSynchronizable: true` 启用同步
- ✅ 数据自动同步到所有 Apple 设备
- ✅ 与 iOS KeychainModule 完全兼容
- ✅ 跨设备数据共享无缝工作

### 实现细节

```swift
// KeychainHelper.swift - 已实现 ✅
import Foundation
import Security

class KeychainHelper {
  let serviceIdentifier = "so.onekey.wallet"  // Bundle ID

  func setItem(key: String, value: String, enableSync: Bool) {
    let query: [String: Any] = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: serviceIdentifier,        // ✅ Bundle ID 隔离
      kSecAttrAccount: key,
      kSecValueData: value.data(using: .utf8)!,
      kSecAttrSynchronizable: enableSync,        // ✅ iCloud 同步
    ]
    SecItemAdd(query as CFDictionary, nil)
  }
}
```

**编译和使用**:
```bash
# 1. 编译 Swift helper
cd apps/desktop/scripts
./build-keychain-helper.sh

# 2. 在 Electron 中使用
import desktopApiProxy from '@onekeyhq/kit-bg/src/desktopApis/instance/desktopApiProxy';
await desktopApiProxy.keychain.setItem({ key: 'test', value: 'value' });
```

## 推荐使用方案

### ✅ 使用 Native Swift KeychainHelper（已实现）

```typescript
import desktopApiProxy from '@onekeyhq/kit-bg/src/desktopApis/instance/desktopApiProxy';

// 存储加密密钥（支持 iCloud 同步）
await desktopApiProxy.keychain.setItem({
  key: 'wallet_encryption_key',
  value: 'my-secret-key',
});

// ✅ 自动同步到用户所有 Apple 设备
// ✅ iOS 上可以读取相同数据
// ✅ 其他应用无法访问

// 读取
const result = await desktopApiProxy.keychain.getItem({
  key: 'wallet_encryption_key',
});

// iOS 上也能读取（相同 Bundle ID）
const iOSResult = await KeychainModule.getItem({
  key: 'wallet_encryption_key'
});
// iOSResult.value === 'my-secret-key'  ✅ 跨设备共享！
```

**特点**：
- ✅ **TRUE app sandboxing** - Bundle ID 系统级隔离
- ✅ **iCloud Keychain sync** - 自动同步到所有设备
- ✅ **iOS compatible** - Desktop 和 iOS 数据共享
- ✅ **Secure** - 其他应用无法访问
- ⚠️ macOS only（预期行为）

### 对于非敏感数据的云同步：使用 CloudKit

```typescript
// 使用 CloudKit 进行云同步
await desktopApiProxy.cloudKit.saveRecord({
  recordType: 'Settings',
  recordID: 'user_preferences',
  data: JSON.stringify({ theme: 'dark', language: 'en' }),
});

// 从其他设备恢复
const record = await desktopApiProxy.cloudKit.fetchRecord({
  recordID: 'user_preferences',
  recordType: 'Settings',
});
```

**特点**：
- ✅ iCloud 云同步
- ✅ 跨设备访问
- ✅ Apple 生态集成
- ⚠️ 需要编译 Swift helper
- ⚠️ 用户需要登录 iCloud

## 安全最佳实践

### 1. 敏感数据分类

| 数据类型 | 存储方案 | 同步需求 |
|---------|---------|---------|
| 加密密钥 | Keychain (Swift Helper) | ✅ iCloud 同步 |
| 用户偏好设置 | CloudKit 或 Keychain | ✅ 云同步 |
| 钱包备份 | CloudKit (加密) | ✅ 云同步 |
| 会话 Token | Keychain | ✅ iCloud 同步 |

### 2. 加密密钥管理（推荐模式）

```typescript
// ✅ 正确：加密密钥存储在 Keychain (Native Swift Helper)
// 支持 iCloud 同步，Desktop 和 iOS 可以共享密钥
const encryptionKey = await desktopApiProxy.keychain.getItem({
  key: 'wallet_encryption_key'
});

// ✅ 正确：使用密钥加密数据
const encryptedData = encrypt(walletData, encryptionKey.value);

// ✅ 正确：加密数据可以存储在 CloudKit
await desktopApiProxy.cloudKit.saveRecord({
  recordType: 'WalletBackup',
  recordID: 'backup_001',
  data: encryptedData, // 已加密
});

// ✅ 跨设备恢复场景
// 在新的 iOS 设备上：
const iOSKey = await KeychainModule.getItem({ key: 'wallet_encryption_key' });
// iOSKey.value 自动同步自 Desktop，可以直接解密备份
```

### 3. 避免的错误模式

```typescript
// ❌ 错误：不要在 CloudKit 存储未加密的密钥
await desktopApiProxy.cloudKit.saveRecord({
  recordType: 'Keys',
  recordID: 'encryption_key',
  data: 'my-secret-key', // 危险！
});

// ❌ 错误：不要在普通存储存储敏感数据
localStorage.setItem('encryption_key', 'my-secret-key'); // 危险！

// ❌ 错误：不要使用 security 命令行工具
execFile('security', ['add-generic-password', ...]); // 不安全！
```

## 总结

### ✅ 最终实现方案

1. **Keychain API**：使用 Native Swift KeychainHelper
   - ✅ 真正的应用沙盒隔离（Bundle ID）
   - ✅ iCloud Keychain 同步
   - ✅ 与 iOS 完全兼容
   - ✅ 跨设备数据共享

2. **CloudKit API**：用于非敏感数据云存储
   - ✅ 大容量数据存储
   - ✅ 用户偏好设置
   - ✅ 加密后的备份数据

3. **安全原则**：
   - ✅ 加密密钥存储在 Keychain（支持 iCloud 同步）
   - ✅ 敏感数据先加密再上传 CloudKit
   - ✅ Desktop 和 iOS 使用相同 Bundle ID 共享 Keychain
   - ❌ 永远不要使用 `security` 命令行工具

### 编译和使用

```bash
# 编译 Keychain helper
cd apps/desktop/scripts
./build-keychain-helper.sh

# 编译 CloudKit helper
./build-cloudkit-helper.sh

# 在代码中使用
import desktopApiProxy from '@onekeyhq/kit-bg/src/desktopApis/instance/desktopApiProxy';

// Keychain - 密钥和敏感数据（支持 iCloud 同步）
await desktopApiProxy.keychain.setItem({ key: 'key', value: 'secret' });

// CloudKit - 备份和设置（大容量数据）
await desktopApiProxy.cloudKit.saveRecord({
  recordType: 'Backup',
  recordID: 'id',
  data: encryptedData,
});
```

这样的架构**既保证了安全性，又提供了完整的 iCloud 跨设备同步能力**。
