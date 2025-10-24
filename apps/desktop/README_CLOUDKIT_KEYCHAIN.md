# CloudKit & Keychain Desktop Integration - Quick Reference

## 概览

为 Electron macOS desktop 应用添加了 CloudKit 和 Keychain API 支持。

## API 使用

```typescript
import desktopApiProxy from '@onekeyhq/kit-bg/src/desktopApis/instance/desktopApiProxy';

// CloudKit - 云存储（macOS only）
await desktopApiProxy.cloudKit.saveRecord({
  recordType: 'BackupData',
  recordID: 'backup_001',
  data: JSON.stringify({ wallet: 'data' }),
});

// Keychain - 安全存储 + iCloud 同步（macOS only）
await desktopApiProxy.keychain.setItem({
  key: 'encryption_key',
  value: 'my-secret-key',
});
```

## 重要说明

### ⚠️ Keychain - 需要编译

**实现方式**: Native Swift KeychainHelper（使用原生 Security framework）

**特点**:
- ✅ **TRUE Bundle ID-based app sandboxing** - 系统级应用隔离
- ✅ **iCloud Keychain 同步** - 自动同步到所有 Apple 设备
- ✅ **与 iOS 完全兼容** - Desktop 和 iOS 可以共享 keychain 数据
- ✅ Mac App Store 兼容
- ⚠️ 需要编译 Swift helper
- ⚠️ macOS only

**编译步骤**:
```bash
cd apps/desktop/scripts
./build-keychain-helper.sh
```

### ⚠️ CloudKit - 需要编译

**实现方式**: Swift command-line helper tool

**状态**: 需要编译 Swift helper 才能使用

**编译步骤**:
```bash
cd apps/desktop/scripts
./build-cloudkit-helper.sh
```

**特点**:
- ✅ iCloud 云同步
- ✅ 跨设备访问
- ⚠️ 需要编译 Swift helper
- ⚠️ macOS only
- ⚠️ 用户需要登录 iCloud

## 安全架构

### 数据存储策略

| 数据类型 | 推荐方案 | 是否同步 | 原因 |
|---------|---------|---------|------|
| 加密密钥 | Keychain | ✅ iCloud 同步 | 跨设备共享密钥，支持恢复 |
| 钱包备份 | CloudKit | ✅ 云同步 | 大容量数据存储 |
| 用户设置 | CloudKit | ✅ 云同步 | 跨设备一致性 |
| 会话 Token | Keychain | ✅ iCloud 同步 | 跨设备自动登录 |

### 正确的使用模式

```typescript
// ✅ 正确：加密密钥存在 Keychain（iCloud 同步）
// Desktop 上存储
await desktopApiProxy.keychain.setItem({
  key: 'encryption_key',
  value: 'my-secret-key'
});

// ✅ iOS 上可以读取相同的密钥（自动 iCloud 同步）
// const iOSKey = await KeychainModule.getItem({ key: 'encryption_key' });
// iOSKey.value === 'my-secret-key' ✅ 跨设备共享！

// ✅ 正确：使用密钥加密数据
const key = await desktopApiProxy.keychain.getItem({ key: 'encryption_key' });
const encrypted = encrypt(walletData, key.value);

// ✅ 正确：加密数据存在 CloudKit（云端）
await desktopApiProxy.cloudKit.saveRecord({
  recordType: 'Backup',
  recordID: 'backup_001',
  data: encrypted, // 已加密
});
```

## 为什么不使用 `security` 命令行工具？

### ❌ 问题

```bash
# 不安全的方式
security add-generic-password -s app.id -a key -w value
```

**问题**:
1. **不是真正的应用隔离** - 存储在用户 keychain，不是应用专属
2. **其他应用可访问** - 只通过 service identifier 区分（字符串）
3. **Mac App Store 不兼容** - 沙盒限制
4. **iCloud 同步不可靠** - 需要额外配置和权限

### ✅ 正确方式

使用 Native Swift KeychainHelper：

```swift
// 安全的方式 - 使用原生 Security framework
let query: [String: Any] = [
    kSecClass: kSecClassGenericPassword,
    kSecAttrService: "so.onekey.wallet",    // ✅ Bundle ID 隔离
    kSecAttrAccount: key,
    kSecValueData: value.data(using: .utf8)!,
    kSecAttrSynchronizable: true,            // ✅ iCloud 同步
]
SecItemAdd(query as CFDictionary, nil)
```

**优势**:
- ✅ TRUE Bundle ID-based app sandboxing（系统级隔离）
- ✅ iCloud Keychain 同步（自动跨设备）
- ✅ 与 iOS KeychainModule 完全兼容
- ✅ 其他应用**无法访问**这些数据

## 文件结构

### 已实现的文件

```
packages/kit-bg/src/desktopApis/
├── DesktopApiCloudKit.ts         ✅ CloudKit API 接口
├── DesktopApiKeychain.ts          ✅ Keychain API 接口（使用 Swift helper）
└── instance/
    ├── IDesktopApi.ts             ✅ 接口定义
    ├── desktopApi.ts              ✅ Main process 实现
    └── desktopApiProxy.ts         ✅ Renderer process 代理

apps/desktop/app/libs/
├── cloudkit-bridge.ts             ✅ CloudKit bridge
└── keychain-bridge.ts             ✅ Keychain bridge

apps/desktop/scripts/
├── CloudKitHelper.swift           ✅ CloudKit Swift helper
├── KeychainHelper.swift           ✅ Keychain Swift helper
├── build-cloudkit-helper.sh       ✅ CloudKit 构建脚本
└── build-keychain-helper.sh       ✅ Keychain 构建脚本
```

### 文档

```
apps/desktop/
├── CLOUDKIT_KEYCHAIN_INTEGRATION.md   ✅ 完整集成指南
├── KEYCHAIN_SECURITY_NOTES.md         ✅ 安全性分析
├── USAGE_EXAMPLES.md                  ✅ 使用示例
└── README_CLOUDKIT_KEYCHAIN.md        ✅ 本文档（快速参考）
```

## 快速测试

### 测试 Keychain（需要先编译）

```typescript
// 1. 先编译 Swift helper
// cd apps/desktop/scripts && ./build-keychain-helper.sh

// 2. 测试
const desktopApiProxy = require('@onekeyhq/kit-bg/src/desktopApis/instance/desktopApiProxy').default;

// 检查 iCloud Keychain 同步状态
const syncEnabled = await desktopApiProxy.keychain.isICloudSyncEnabled();
console.log('iCloud Keychain sync enabled:', syncEnabled);

// 存储（自动 iCloud 同步）
await desktopApiProxy.keychain.setItem({
  key: 'test_key',
  value: 'test_value',
});
console.log('✅ Saved to Keychain - will sync to iOS');

// 读取
const result = await desktopApiProxy.keychain.getItem({
  key: 'test_key',
});
console.log(result); // { key: 'test_key', value: 'test_value' }

// 在 iOS 设备上（相同 Apple ID），可以读取相同数据：
// const iOSResult = await KeychainModule.getItem({ key: 'test_key' });
// console.log(iOSResult.value); // 'test_value' ✅

// 删除
await desktopApiProxy.keychain.removeItem({
  key: 'test_key',
});
```

### 测试 CloudKit（需要先编译）

```typescript
// 1. 先编译 Swift helper
// cd apps/desktop/scripts && ./build-cloudkit-helper.sh

// 2. 测试
const isAvailable = await desktopApiProxy.cloudKit.isAvailable();
console.log('CloudKit available:', isAvailable);

if (isAvailable) {
  await desktopApiProxy.cloudKit.saveRecord({
    recordType: 'TestData',
    recordID: 'test_001',
    data: 'Hello CloudKit',
  });
}
```

## 常见问题

### Q: Keychain 支持 iCloud 同步吗？
**A**: 支持！Keychain API 使用 Native Swift KeychainHelper，默认启用 iCloud Keychain 同步。数据会自动同步到用户的所有 Apple 设备（Desktop ↔ iOS）。

### Q: 为什么不用 `security` 命令？
**A**: 不安全！`security` 命令只提供字符串标识隔离，其他应用可以访问。Native Swift KeychainHelper 使用 Bundle ID 提供系统级应用隔离，更安全。详见 `KEYCHAIN_SECURITY_NOTES.md`。

### Q: CloudKit 支持 Windows/Linux 吗？
**A**: 不支持。CloudKit 是 Apple 专有服务，仅支持 macOS。

### Q: Keychain 支持 Windows/Linux 吗？
**A**: 不支持。当前 Keychain 实现使用 Native Swift KeychainHelper，仅支持 macOS（需要 iCloud Keychain 同步功能）。

### Q: 如何在项目中使用？
**A**: 编译 Swift helper 后，直接导入并使用：
```bash
# 1. 编译 helper
cd apps/desktop/scripts && ./build-keychain-helper.sh

# 2. 在代码中使用
```
```typescript
import desktopApiProxy from '@onekeyhq/kit-bg/src/desktopApis/instance/desktopApiProxy';
await desktopApiProxy.keychain.setItem({ key: 'xxx', value: 'yyy' });
```

### Q: Desktop 和 iOS 如何共享 keychain 数据？
**A**:
1. 确保两个平台使用相同的 Bundle ID (`so.onekey.wallet`)
2. 使用相同的 key 名称存储和读取数据
3. 用户需要在两个设备上登录相同的 Apple ID
4. 确保 iCloud Keychain 已启用
5. 数据会在 1 分钟内自动同步

## 参考文档

1. **完整指南**: `CLOUDKIT_KEYCHAIN_INTEGRATION.md`
2. **安全分析**: `KEYCHAIN_SECURITY_NOTES.md`
3. **使用示例**: `USAGE_EXAMPLES.md`
4. **iOS 参考**: `apps/mobile/ios/OneKeyWallet/CloudKitModule.swift`
5. **iOS 参考**: `apps/mobile/ios/OneKeyWallet/KeychainModule.swift`

## 总结

- ✅ **Keychain**: Native Swift KeychainHelper，TRUE Bundle ID-based app sandboxing，支持 iCloud 同步
- ✅ **CloudKit**: Swift helper tool，macOS only，支持大容量数据云存储
- 🔒 **安全**: 密钥 iCloud 同步（Keychain），数据云存储（CloudKit），双重保障
- 🔄 **跨设备**: Desktop ↔ iOS 无缝数据共享（相同 Bundle ID）
- 📦 **架构**: 遵循现有 DesktopApi 模式，无需修改应用代码

### 关键特性

**Keychain**:
- ✅ TRUE app sandboxing（Bundle ID 系统级隔离）
- ✅ iCloud Keychain 自动同步
- ✅ 与 iOS 完全兼容（跨设备数据共享）
- ✅ 其他应用无法访问
- ⚠️ 需要编译 Swift helper
- ⚠️ macOS only

**CloudKit**:
- ✅ iCloud 云存储
- ✅ 大容量数据支持
- ✅ 跨设备访问
- ⚠️ 需要编译 Swift helper
- ⚠️ macOS only
