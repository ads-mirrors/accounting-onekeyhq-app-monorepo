/* eslint-disable spellcheck/spell-checker */
import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';

import logger from 'electron-log/main';

import { OneKeyLocalError } from '@onekeyhq/shared/src/errors';
import type { IAppleKeyChainStorage } from '@onekeyhq/shared/src/storage/AppleKeyChainStorage/types';

import { getMacApiBridgeCLI } from './base/getMacApiBridgeCLI';

import type { IDesktopApi } from './instance/IDesktopApi';

const execFileAsync = promisify(execFile);

export type IKeychainSetItemParams = {
  key: string;
  value: string;
  enableSync?: boolean; // Optional, defaults to true for iCloud sync
  label?: string; // Optional, friendly name displayed in Keychain Access app
  description?: string; // Optional, description for the keychain item
};

export type IKeychainGetItemParams = {
  key: string;
};

export type IKeychainGetItemResult = {
  key: string;
  value: string;
} | null;

export type IKeychainRemoveItemParams = {
  key: string;
};

export type IKeychainHasItemParams = {
  key: string;
};

/**
 * Desktop Keychain API - Secure Keychain access with app sandboxing and iCloud sync
 *
 * This implementation uses native Swift KeychainHelper which provides:
 * - TRUE app sandboxing via Bundle ID (other apps CANNOT access)
 * - iCloud Keychain synchronization for cross-device data sharing
 * - Full compatibility with iOS KeychainModule.swift
 *
 * Security Features:
 * ✅ Bundle ID-based app isolation (system-level security)
 * ✅ iCloud Keychain sync (automatically syncs to user's other Apple devices)
 * ✅ Compatible with iOS for seamless data sharing across Desktop and Mobile
 * ✅ Other applications CANNOT access these keychain items
 *
 * Platform Support:
 * - macOS: Full support with iCloud sync
 * - Windows/Linux: Not supported (throws error)
 *
 * Use Cases:
 * - Store encryption keys that need to sync across devices
 * - Share secure data between Desktop and iOS apps
 * - Backup/restore keys across user's Apple devices
 */
class DesktopApiKeychain implements IAppleKeyChainStorage {
  constructor({ desktopApi }: { desktopApi: IDesktopApi }) {
    this.desktopApi = desktopApi;
  }

  desktopApi: IDesktopApi;

  /**
   * Store an item securely in Keychain with iCloud sync
   *
   * Data is stored with:
   * - Bundle ID-based app isolation (true sandboxing)
   * - iCloud Keychain sync enabled by default
   * - Accessible only when device is unlocked
   *
   * @param params.key - Keychain account identifier
   * @param params.value - Data to store (will be encrypted by macOS)
   * @param params.enableSync - Enable iCloud sync (default: true)
   * @returns Promise<boolean> - true if successful
   */
  async setItem(params: IKeychainSetItemParams): Promise<void> {
    if (process.platform !== 'darwin') {
      throw new OneKeyLocalError('Keychain is only available on macOS');
    }

    try {
      const helperPath = getMacApiBridgeCLI();
      console.log('DesktopApiKeychain__setItem:', params.key);
      const { stdout } = await execFileAsync(helperPath, [
        'keychain.setItem',
        JSON.stringify({
          key: params.key,
          value: params.value,
          enableSync: params.enableSync !== false, // Default to true
          label: params.label,
          description: params.description,
        }),
      ]);

      const result = JSON.parse(stdout) as {
        error: string;
        success: boolean;
      };
      console.log('DesktopApiKeychain__setItem__result:', result);

      if (result.error) {
        throw new OneKeyLocalError(result.error);
      }
      // return result.success === true;
    } catch (error) {
      logger.error('Keychain setItem failed:', error);
      throw new OneKeyLocalError(
        `Failed to set keychain item: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Retrieve a securely stored item from Keychain
   *
   * Queries both local and iCloud-synced items
   *
   * @param params.key - Keychain account identifier
   * @returns Promise<IKeychainGetItemResult | null> - The stored data or null if not found
   */
  async getItem(
    params: IKeychainGetItemParams,
  ): Promise<IKeychainGetItemResult> {
    if (process.platform !== 'darwin') {
      throw new OneKeyLocalError('Keychain is only available on macOS');
    }

    try {
      const helperPath = getMacApiBridgeCLI();
      const { stdout } = await execFileAsync(helperPath, [
        'keychain.getItem',
        JSON.stringify({
          key: params.key,
        }),
      ]);

      const result = JSON.parse(stdout) as {
        error: string;
        success: boolean;
        key: string;
        value: string;
      };
      if (result.error) {
        throw new OneKeyLocalError(result.error);
      }

      // Check if result has key and value (item found)
      if (result.key && result.value) {
        return {
          key: result.key,
          value: result.value,
        };
      }

      // Item not found
      return null;
    } catch (error: any) {
      logger.error('Keychain getItem failed:', error);
      throw new OneKeyLocalError(
        `Failed to get keychain item: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Remove a securely stored item from Keychain
   *
   * Removes both local and iCloud-synced copies
   *
   * @param params.key - Keychain account identifier
   * @returns Promise<boolean> - true if successful
   */
  async removeItem(params: IKeychainRemoveItemParams): Promise<void> {
    if (process.platform !== 'darwin') {
      throw new OneKeyLocalError('Keychain is only available on macOS');
    }

    try {
      const helperPath = getMacApiBridgeCLI();
      const { stdout } = await execFileAsync(helperPath, [
        'keychain.removeItem',
        JSON.stringify({
          key: params.key,
        }),
      ]);

      const result = JSON.parse(stdout) as {
        error: string;
        success: boolean;
      };
      if (result.error) {
        throw new OneKeyLocalError(result.error);
      }
      // return result.success === true;
    } catch (error: any) {
      logger.error('Keychain removeItem failed:', error);
      throw new OneKeyLocalError(
        `Failed to remove keychain item: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Check if an item exists in Keychain
   *
   * @param params.key - Keychain account identifier
   * @returns Promise<boolean> - true if item exists
   */
  async hasItem(params: IKeychainHasItemParams): Promise<boolean> {
    if (process.platform !== 'darwin') {
      throw new OneKeyLocalError('Keychain is only available on macOS');
    }

    try {
      const helperPath = getMacApiBridgeCLI();
      const { stdout } = await execFileAsync(helperPath, [
        'keychain.hasItem',
        JSON.stringify({
          key: params.key,
        }),
      ]);

      const result = JSON.parse(stdout) as {
        error: string;
        success: boolean;
        exists: boolean;
      };
      if (result.error) {
        throw new OneKeyLocalError(result.error);
      }
      return result.exists === true;
    } catch (error: any) {
      logger.error('Keychain hasItem failed:', error);
      throw new OneKeyLocalError(
        `Failed to check keychain item existence: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Check if iCloud Keychain sync is enabled
   *
   * Tests if the system can create synchronizable keychain items.
   * Returns false if user is not signed in to iCloud or iCloud Keychain is disabled.
   *
   * @returns Promise<boolean> - true if iCloud Keychain sync is available
   */
  async isICloudSyncEnabled(): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return false;
    }

    try {
      const helperPath = getMacApiBridgeCLI();
      const { stdout } = await execFileAsync(helperPath, [
        'keychain.isICloudSyncEnabled',
      ]);

      const result = JSON.parse(stdout) as {
        error: string;
        success: boolean;
        enabled: boolean;
      };
      return result.enabled === true;
    } catch (error) {
      logger.error('iCloud Keychain sync check failed:', error);
      return false;
    }
  }
}

export default DesktopApiKeychain;
