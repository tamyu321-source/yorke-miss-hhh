export const STORAGE_PREFIX = 'first-meeting';

export function storageKey(kind: string, key?: string) {
  return key ? `${STORAGE_PREFIX}:${kind}:${key}` : `${STORAGE_PREFIX}:${kind}`;
}

export function collectAppLocalStorage() {
  const data: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && key.startsWith(`${STORAGE_PREFIX}:`)) {
      data[key] = localStorage.getItem(key) ?? '';
    }
  }
  return data;
}

export function clearAppLocalStorage() {
  const keys = Object.keys(localStorage).filter((key) => key.startsWith(`${STORAGE_PREFIX}:`));
  keys.forEach((key) => localStorage.removeItem(key));
}

export function restoreAppLocalStorage(data: Record<string, string>, mode: 'merge' | 'replace') {
  if (mode === 'replace') clearAppLocalStorage();

  Object.entries(data).forEach(([key, value]) => {
    if (key.startsWith(`${STORAGE_PREFIX}:`)) {
      localStorage.setItem(key, String(value));
    }
  });
}
