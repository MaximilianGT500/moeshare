import { isAppleMobile, isStandalone } from './device';

export type PushSupport = 'ok' | 'insecure' | 'install' | 'unsupported';

export function pushSupport(): PushSupport {
  if (!window.isSecureContext) return 'insecure';
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isAppleMobile() && !isStandalone()) return 'install';
  return capable ? 'ok' : 'unsupported';
}

export const permission = (): NotificationPermission => ('Notification' in window ? Notification.permission : 'default');

function keyBytes(value: string) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(current: ArrayBuffer | null | undefined, wanted: Uint8Array) {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === wanted.length && bytes.every((byte, index) => byte === wanted[index]);
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing) await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing) return null;
  return existing.pushManager.getSubscription();
}

export class PushBlocked extends Error {}

export async function subscribe(publicKey: string) {
  const answer = await Notification.requestPermission();
  if (answer !== 'granted') throw new PushBlocked(answer);
  const ready = await registration();
  const key = keyBytes(publicKey);
  const existing = await ready.pushManager.getSubscription();
  if (existing) {
    if (sameKey(existing.options.applicationServerKey, key)) return existing;
    await existing.unsubscribe().catch(() => false);
  }
  return ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

export async function endpointHash(subscription: PushSubscription) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(new URL(subscription.endpoint).href));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
