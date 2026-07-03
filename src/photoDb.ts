import type { MemoryPhoto } from './types';

const PHOTO_DB_NAME = 'first-meeting-photos';
const PHOTO_STORE_NAME = 'photos';

export async function loadStoredPhotos(legacyPhotos: MemoryPhoto[] = []) {
  const db = await openPhotoDb();
  const stored = await getAllPhotos(db);
  if (stored.length || !legacyPhotos.length) return stored;

  await savePhotos(legacyPhotos);
  return legacyPhotos;
}

export async function savePhotos(photos: MemoryPhoto[]) {
  const db = await openPhotoDb();
  await clearPhotoStore(db);
  await Promise.all(photos.map((photo) => putPhoto(db, photo)));
}

export async function mergePhotos(photos: MemoryPhoto[]) {
  const current = await getAllPhotos(await openPhotoDb());
  const merged = new Map(current.map((photo) => [photo.id, photo]));
  photos.forEach((photo) => merged.set(photo.id, photo));
  await savePhotos([...merged.values()]);
  return [...merged.values()];
}

export function getAllPhotos(db: IDBDatabase): Promise<MemoryPhoto[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(PHOTO_STORE_NAME, 'readonly').objectStore(PHOTO_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as MemoryPhoto[]);
    request.onerror = () => reject(request.error);
  });
}

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PHOTO_STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putPhoto(db: IDBDatabase, photo: MemoryPhoto): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(PHOTO_STORE_NAME, 'readwrite').objectStore(PHOTO_STORE_NAME).put(photo);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearPhotoStore(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(PHOTO_STORE_NAME, 'readwrite').objectStore(PHOTO_STORE_NAME).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
