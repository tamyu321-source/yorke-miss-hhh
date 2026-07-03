import { collectAppLocalStorage } from './storage';
import type { MemoryPhoto } from './types';

export const EXPORT_SCHEMA_VERSION = 2;

export type AppExportData = {
  schemaVersion: number;
  exportedAt: string;
  localStorage: Record<string, string>;
  photos: MemoryPhoto[];
};

export type ImportPreview = {
  data: AppExportData;
  summary: string;
};

export function createExportData(photos: MemoryPhoto[]): AppExportData {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    localStorage: collectAppLocalStorage(),
    photos
  };
}

export function parseImportData(raw: string): ImportPreview {
  const parsed = JSON.parse(raw) as Partial<AppExportData>;
  const localStorageData = parsed.localStorage;
  if (!localStorageData || typeof localStorageData !== 'object' || Array.isArray(localStorageData)) {
    throw new Error('Invalid backup localStorage payload.');
  }

  const photos = Array.isArray(parsed.photos)
    ? parsed.photos.filter(
        (photo): photo is MemoryPhoto =>
          typeof photo?.id === 'string' && typeof photo?.name === 'string' && typeof photo?.dataUrl === 'string'
      )
    : [];

  const data: AppExportData = {
    schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 1,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    localStorage: Object.fromEntries(
      Object.entries(localStorageData).filter(
        (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
      )
    ),
    photos
  };

  const itemCount = Object.keys(data.localStorage).length;
  const versionLabel = data.schemaVersion === EXPORT_SCHEMA_VERSION ? `v${data.schemaVersion}` : `舊版 v${data.schemaVersion}`;
  return {
    data,
    summary: `偵測到 ${versionLabel} 備份：${itemCount} 筆設定/紀錄、${photos.length} 張照片。`
  };
}

export function downloadJsonBackup(data: AppExportData, dateKey: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `first-meeting-${dateKey}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
