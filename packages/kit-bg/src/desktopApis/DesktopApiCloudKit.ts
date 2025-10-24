import { execFile } from 'child_process';
import { promisify } from 'util';

import logger from 'electron-log/main';

import { OneKeyLocalError } from '@onekeyhq/shared/src/errors';
import type { IAppleCloudKitStorage } from '@onekeyhq/shared/src/storage/AppleCloudKitStorage/types';

import { getMacApiBridgeCLI } from './base/getMacApiBridgeCLI';

import type { IDesktopApi } from './instance/IDesktopApi';

const execFileAsync = promisify(execFile);
export type ICloudKitRecord = {
  recordID: string;
  recordType: string;
  data: string;
  createdAt: number;
  modifiedAt: number;
};

export type ICloudKitSaveRecordParams = {
  recordType: string;
  recordID: string;
  data: string;
};

export type ICloudKitSaveRecordResult = {
  recordID: string;
  createdAt: number;
};

export type ICloudKitFetchRecordParams = {
  recordID: string;
  recordType: string;
};

export type ICloudKitDeleteRecordParams = {
  recordID: string;
  recordType: string;
};

export type ICloudKitRecordExistsParams = {
  recordID: string;
  recordType: string;
};

export type ICloudKitQueryRecordsParams = {
  recordType: string;
};

export type ICloudKitQueryRecordsResult = {
  records: ICloudKitRecord[];
};

class DesktopApiCloudKit implements IAppleCloudKitStorage {
  constructor({ desktopApi }: { desktopApi: IDesktopApi }) {
    this.desktopApi = desktopApi;
  }

  desktopApi: IDesktopApi;

  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return false;
    }

    try {
      const helperPath = getMacApiBridgeCLI();
      const { stdout } = await execFileAsync(helperPath, [
        'cloudkit.isAvailable',
      ]);
      const result = JSON.parse(stdout) as {
        error: string;
        success: boolean;
        available: boolean;
      };
      return result.available === true;
    } catch (error) {
      logger.error('CloudKit availability check failed:', error);
      return false;
    }
  }

  async saveRecord(
    params: ICloudKitSaveRecordParams,
  ): Promise<ICloudKitSaveRecordResult> {
    if (process.platform !== 'darwin') {
      throw new OneKeyLocalError('CloudKit is only available on macOS');
    }

    try {
      const helperPath = getMacApiBridgeCLI();
      const { stdout } = await execFileAsync(helperPath, [
        'cloudkit.saveRecord',
        JSON.stringify(params),
      ]);
      const result = JSON.parse(stdout) as {
        error: string;
        success: boolean;
        recordID: string;
        createdAt: number;
      };
      return result;
    } catch (error: any) {
      logger.error('CloudKit saveRecord failed:', error);
      throw new OneKeyLocalError(
        `Failed to save CloudKit record: ${(error as Error).message}`,
      );
    }
  }

  async fetchRecord(
    params: ICloudKitFetchRecordParams,
  ): Promise<ICloudKitRecord | null> {
    if (process.platform !== 'darwin') {
      throw new OneKeyLocalError('CloudKit is only available on macOS');
    }

    try {
      const helperPath = getMacApiBridgeCLI();
      const { stdout } = await execFileAsync(helperPath, [
        'cloudkit.fetchRecord',
        JSON.stringify(params),
      ]);
      const result = JSON.parse(stdout) as {
        error: string;
        success: boolean;
        record: ICloudKitRecord;
      };
      return result.record as ICloudKitRecord | null;
    } catch (error: any) {
      logger.error('CloudKit fetchRecord failed:', error);
      throw new OneKeyLocalError(
        `Failed to fetch CloudKit record: ${(error as Error).message}`,
      );
    }
  }

  async deleteRecord(params: ICloudKitDeleteRecordParams): Promise<void> {
    if (process.platform !== 'darwin') {
      throw new OneKeyLocalError('CloudKit is only available on macOS');
    }

    try {
      const helperPath = getMacApiBridgeCLI();
      const { stdout } = await execFileAsync(helperPath, [
        'cloudkit.deleteRecord',
        JSON.stringify(params),
      ]);
      const result = JSON.parse(stdout) as {
        error: string;
        success: boolean;
      };
      // return result.success === true;
    } catch (error: any) {
      logger.error('CloudKit deleteRecord failed:', error);
      throw new OneKeyLocalError(
        `Failed to delete CloudKit record: ${(error as Error).message}`,
      );
    }
  }

  async recordExists(params: ICloudKitRecordExistsParams): Promise<boolean> {
    if (process.platform !== 'darwin') {
      throw new OneKeyLocalError('CloudKit is only available on macOS');
    }

    try {
      const helperPath = getMacApiBridgeCLI();
      const { stdout } = await execFileAsync(helperPath, [
        'cloudkit.recordExists',
        JSON.stringify(params),
      ]);
      const result = JSON.parse(stdout) as {
        error: string;
        success: boolean;
        exists: boolean;
      };
      return result.exists === true;
    } catch (error: any) {
      logger.error('CloudKit recordExists failed:', error);
      throw new OneKeyLocalError(
        `Failed to check CloudKit record existence: ${
          (error as Error).message
        }`,
      );
    }
  }

  async queryRecords(
    params: ICloudKitQueryRecordsParams,
  ): Promise<ICloudKitQueryRecordsResult> {
    if (process.platform !== 'darwin') {
      throw new OneKeyLocalError('CloudKit is only available on macOS');
    }

    try {
      const helperPath = getMacApiBridgeCLI();
      const { stdout } = await execFileAsync(helperPath, [
        'cloudkit.queryRecords',
        JSON.stringify(params),
      ]);
      const result = JSON.parse(stdout) as {
        error: string;
        success: boolean;
        records: ICloudKitRecord[];
      };
      return { records: result.records || [] };
    } catch (error: any) {
      logger.error('CloudKit queryRecords failed:', error);
      throw new OneKeyLocalError(
        `Failed to query CloudKit records: ${(error as Error).message}`,
      );
    }
  }
}

export default DesktopApiCloudKit;
