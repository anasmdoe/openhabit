// Web Push for reminders on this device: subscribe the service worker with the
// server's VAPID key and register the subscription with the API.
import { authApi } from '../api';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iPhone/iPad only allow Web Push for apps added to the Home Screen. */
export const needsHomeScreen = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;

const keyBytes = (b64url: string) => {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function enablePush(publicKey: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site in your browser settings.');
  const reg = await navigator.serviceWorker.ready;
  // a subscription made with another server key can't be reused
  const existing = await reg.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await authApi.pushSubscribe(sub.toJSON());
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await authApi.pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}
