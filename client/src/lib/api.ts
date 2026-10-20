import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import type {
  AccountOverview,
  AdminUser,
  ApiTokenInfo,
  AuditEvent,
  EmbedTemplate,
  FileListResponse,
  GlobalStats,
  HomeStats,
  Invite,
  PasskeyInfo,
  SessionInfo,
  SettingsPayload,
  SettingValue,
  SystemInfo,
  UserStats,
} from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly sessionExpired: boolean;
  readonly code: string;
  readonly field: string;

  constructor(message: string, status: number, { code = '', field = '', sessionExpired = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
    this.sessionExpired = sessionExpired;
  }
}

const SESSION_EXPIRED_MESSAGE = 'Deine Sitzung ist abgelaufen. Melde dich erneut an.';

export const errorMessage = (error: unknown, fallback = 'Das hat nicht geklappt.') =>
  error instanceof Error && error.message ? error.message : fallback;

async function readError(res: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {}
  const message =
    (typeof body.error === 'string' && body.error) ||
    (typeof body.message === 'string' && body.message) ||
    (res.status === 413
      ? 'Die Datei ist zu groß.'
      : res.status === 429
        ? 'Zu viele Anfragen. Warte kurz und versuche es erneut.'
        : `Die Anfrage ist fehlgeschlagen (HTTP ${res.status}).`);
  const code = typeof body.code === 'string' ? body.code : '';
  return new ApiError(message, res.status, {
    code,
    field: typeof body.field === 'string' ? body.field : '',
    sessionExpired: res.status === 401 && code === 'unauthenticated',
  });
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: 'same-origin',
      ...init,
      headers: { Accept: 'application/json', ...(init.headers || {}) },
    });
  } catch {
    throw new ApiError('Keine Verbindung zum Server.', 0);
  }

  if (res.redirected && new URL(res.url).pathname === '/login') {
    throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, { sessionExpired: true, code: 'unauthenticated' });
  }
  if (!res.ok) throw await readError(res);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    throw new ApiError(`Unerwartete Antwort vom Server (HTTP ${res.status}).`, res.status);
  }
  return (await res.json()) as T;
}

const send = (method: string, data?: unknown): RequestInit => ({
  method,
  headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
  body: data === undefined ? undefined : JSON.stringify(data),
});

const post = <T>(url: string, data: unknown = {}) => api<T>(url, send('POST', data));
const patch = <T>(url: string, data: unknown) => api<T>(url, send('PATCH', data));
const put = <T>(url: string, data: unknown) => api<T>(url, send('PUT', data));
const del = <T>(url: string, data?: unknown) => api<T>(url, send('DELETE', data));

export interface UploadResponse {
  success: boolean;
  file: string;
  view: string;
  preview: string;
  delete: string;
}

export interface UploadHandle {
  promise: Promise<UploadResponse>;
  abort: () => void;
}

export function uploadFile(file: File, onProgress: (fraction: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<UploadResponse>((resolve, reject) => {
    xhr.open('POST', '/upload');
    xhr.responseType = 'text';

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener('load', () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText || '{}');
      } catch {}
      if (xhr.status === 200 && body.success) {
        onProgress(1);
        resolve(body as unknown as UploadResponse);
        return;
      }
      if (xhr.status === 401) {
        reject(new ApiError(SESSION_EXPIRED_MESSAGE, 401, { sessionExpired: true }));
        return;
      }
      const message =
        (typeof body.error === 'string' && body.error) ||
        (xhr.status === 413 ? 'Die Datei ist zu groß.' : `Upload fehlgeschlagen (HTTP ${xhr.status}).`);
      reject(new ApiError(message, xhr.status));
    });
    xhr.addEventListener('error', () => reject(new ApiError('Netzwerkfehler beim Hochladen.', 0)));
    xhr.addEventListener('abort', () => reject(new ApiError('Abgebrochen.', 0)));

    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

export type SortKey = 'newest' | 'oldest' | 'views' | 'size' | 'name';
export type TypeFilter = '' | 'image' | 'video' | 'audio' | 'file';

export function listFiles(params: { page: number; limit: number; search: string; type: TypeFilter; sort: SortKey }) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    search: params.search,
    type: params.type,
    sort: params.sort,
  });
  return api<FileListResponse>(`/api/files?${query}`);
}

export const fetchUserStats = () => api<UserStats>('/api/stats-cards');
export const fetchHomeStats = () => api<HomeStats>('/api/home');
export const deleteOwnFile = (filename: string) => del<{ success: boolean }>(`/file/${encodeURIComponent(filename)}`);
export const uploadFromUrl = (url: string) => post<UploadResponse>('/api/fetch', { url });

export const fetchAccount = () => api<AccountOverview>('/api/account');
export const changePassword = (current: string, next: string) =>
  post<{ ok: boolean; endedSessions: number }>('/api/account/password', { current, next });
export const beginTotpSetup = () => post<{ secret: string; uri: string; qr: string }>('/api/account/totp/setup');
export const enableTotp = (code: string) => post<{ ok: boolean; recoveryCodes: string[] }>('/api/account/totp/enable', { code });
export const disableTotp = () => post<{ ok: boolean }>('/api/account/totp/disable');
export const regenerateRecoveryCodes = () => post<{ recoveryCodes: string[] }>('/api/account/recovery-codes');
export const passkeyRegistrationOptions = () =>
  post<{ flowId: string; options: PublicKeyCredentialCreationOptionsJSON }>('/api/account/passkeys/options');
export const savePasskey = (flowId: string, response: unknown, name = '') =>
  post<{ ok: boolean; passkey: PasskeyInfo }>('/api/account/passkeys', { flowId, response, name });
export const renamePasskey = (id: string, name: string) =>
  patch<{ ok: boolean }>(`/api/account/passkeys/${encodeURIComponent(id)}`, { name });
export const deletePasskey = (id: string) => del<{ ok: boolean }>(`/api/account/passkeys/${encodeURIComponent(id)}`);
export const unlinkIdentity = (provider: string) => del<{ ok: boolean }>(`/api/account/identities/${encodeURIComponent(provider)}`);
export const revokeSession = (id: string) => del<{ ok: boolean }>(`/api/account/sessions/${encodeURIComponent(id)}`);
export const revokeOtherSessions = () => post<{ ok: boolean; count: number }>('/api/account/sessions/revoke-others');
export const createToken = (name: string) => post<{ ok: boolean; token: string; record: ApiTokenInfo }>('/api/account/tokens', { name });
export const revokeToken = (id: number) => del<{ ok: boolean }>(`/api/account/tokens/${id}`);
export const fetchActivity = (before?: number) =>
  api<{ events: AuditEvent[] }>(`/api/account/activity${before ? `?before=${before}` : ''}`);
export const deleteAccount = (confirm: string) => del<{ ok: boolean; redirect: string }>('/api/account', { confirm });

export const reauthWithPassword = (password: string) => post<{ ok: boolean }>('/api/auth/reauth', { password });
export const reauthWithCode = (code: string) => post<{ ok: boolean }>('/api/auth/reauth', { code });
export const reauthPasskeyOptions = () =>
  post<{ flowId: string; options: PublicKeyCredentialRequestOptionsJSON }>('/api/auth/reauth/passkey/options');
export const reauthWithPasskey = (flowId: string, response: unknown) =>
  post<{ ok: boolean }>('/api/auth/reauth/passkey', { flowId, response });

export const saveOwnEmbed = (template: EmbedTemplate) => put<{ ok: boolean; template: EmbedTemplate }>('/api/embed', { template });
export const resetOwnEmbed = () => del<{ ok: boolean }>('/api/embed');

export const fetchAdminStats = () => api<GlobalStats>('/api/admin/stats');
export const fetchSystem = () => api<SystemInfo>('/api/admin/system');
export const listUsers = (search: string) =>
  api<{ users: AdminUser[] }>(`/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`);
export function listAllFiles(params: { page: number; limit: number; search: string }) {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit), search: params.search });
  return api<FileListResponse>(`/api/admin/files?${query}`);
}
export const deleteAnyFile = (username: string, filename: string) =>
  del<{ ok: boolean }>(`/api/admin/files/${encodeURIComponent(username)}/${encodeURIComponent(filename)}`);

export interface UserDetail {
  user: AdminUser;
  sessions: SessionInfo[];
  tokens: ApiTokenInfo[];
  passkeys: PasskeyInfo[];
  activity: AuditEvent[];
}

export const fetchUserDetail = (id: number) => api<UserDetail>(`/api/admin/users/${id}`);
export const createUser = (data: {
  username: string;
  password?: string;
  role: string;
  quotaBytes: number | null;
  maxFileBytes: number | null;
  mustChangePassword: boolean;
}) => post<{ ok: boolean; user: AdminUser; password?: string }>('/api/admin/users', data);
export const updateUser = (
  id: number,
  data: Partial<Pick<AdminUser, 'role' | 'status' | 'suspendedReason' | 'quotaBytes' | 'maxFileBytes'>>
) => patch<{ ok: boolean; user: AdminUser }>(`/api/admin/users/${id}`, data);
export const resetUserPassword = (id: number, password: string, mustChange: boolean) =>
  post<{ ok: boolean; password?: string }>(`/api/admin/users/${id}/password`, { password, mustChange });
export const resetUserMfa = (id: number) => post<{ ok: boolean }>(`/api/admin/users/${id}/reset-mfa`);
export const removeUserPasskeys = (id: number) => del<{ ok: boolean; count: number }>(`/api/admin/users/${id}/passkeys`);
export const revokeUserSessions = (id: number) => post<{ ok: boolean; count: number }>(`/api/admin/users/${id}/revoke-sessions`);
export const createUserToken = (id: number, name: string) =>
  post<{ ok: boolean; token: string; record: ApiTokenInfo }>(`/api/admin/users/${id}/tokens`, { name });
export const revokeUserToken = (id: number, tokenId: number) => del<{ ok: boolean }>(`/api/admin/users/${id}/tokens/${tokenId}`);
export const unlinkUserIdentity = (id: number, provider: string) =>
  del<{ ok: boolean }>(`/api/admin/users/${id}/identities/${encodeURIComponent(provider)}`);
export const deleteUserById = (id: number) => del<{ ok: boolean }>(`/api/admin/users/${id}`);

export const createInvite = (data: {
  role: string;
  quotaBytes: number | null;
  maxFileBytes: number | null;
  expiresInDays: number | null;
  maxUses: number | null;
  note: string;
}) => post<{ ok: boolean; invite: Invite }>('/api/admin/invites', data);
export const revokeInvite = (code: string) => del<{ ok: boolean }>(`/api/admin/invites/${encodeURIComponent(code)}`);

export const saveSettings = (changes: Record<string, SettingValue>) =>
  patch<SettingsPayload & { ok: boolean; changed: string[] }>('/api/admin/settings', changes);
export const testWebhook = (url?: string) => post<{ ok: boolean }>('/api/admin/settings/webhook-test', { url });

export const fetchAudit = (params: { category?: string; before?: number; userId?: number } = {}) => {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.before) query.set('before', String(params.before));
  if (params.userId) query.set('userId', String(params.userId));
  return api<{ events: AuditEvent[] }>(`/api/admin/audit?${query}`);
};

interface SetupPayload {
  token: string;
  account?: { username: string; password: string };
  settings?: Record<string, SettingValue>;
}

export const validateSetup = (payload: SetupPayload) => post<{ ok: boolean }>('/api/setup/validate', payload);
export const testSetupWebhook = (token: string, url: string) => post<{ ok: boolean }>('/api/setup/webhook-test', { token, url });
export const completeSetup = (payload: SetupPayload & { createToken: boolean }) =>
  post<{ ok: boolean; redirect: string; username: string; token: string | null; baseUrl: string }>('/api/setup', payload);
