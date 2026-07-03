export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

declare const __APP_CACHE_VERSION__: string;

export function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  window.addEventListener('load', () => {
    const serviceWorkerUrl = new URL(`sw.js?v=${encodeURIComponent(__APP_CACHE_VERSION__)}`, document.baseURI);
    navigator.serviceWorker.register(serviceWorkerUrl).catch(() => {
      // The app still works online if service worker registration is unavailable.
    });
  });
}

export async function checkForAppUpdate(onUpdateReady: () => void) {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;

  if (registration.waiting) {
    onUpdateReady();
  }

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        onUpdateReady();
      }
    });
  });

  await registration.update();
}

export async function refreshForWaitingServiceWorker() {
  const registration = await navigator.serviceWorker.getRegistration();
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}
