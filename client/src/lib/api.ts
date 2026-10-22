import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import type {
  AccountOverview,
  AdminUser,
  Album,
  BackupInfo,
  DatabaseChoice,
  DatabaseInfo,
  DomainCheck,
  DomainState,
  EmailState,
  ExpiryChoice,
  FileItem,
  LinkListResponse,
  Preferences,
  ProfileSettings,
  PublicFilePage,
  ReportKind,
  ReportList,
  ReportReason,
  ShortLink,
  StatsOverview,
  StatsSeries,
  StorageInfo,
  TagCount,
  TrashSummary,
  UrlStyle,
  UserDomain,
  ViewDesign,
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
import { t } from './i18n';

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

const SESSION_EXPIRED_MESSAGE = t('Deine Sitzung ist abgelaufen. Melde dich erneut an.');

export const errorMessage = (error: unknown, fallback = t('Das hat nicht geklappt.')) =>
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
      ? t('Die Datei ist zu groß.')
      : res.status === 429
        ? t('Zu viele Anfragen. Warte kurz und versuche es erneut.')
        : t('Die Anfrage ist fehlgeschlagen (HTTP {status}).', { status: res.status }));
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
    throw new ApiError(t('Keine Verbindung zum Server.'), 0);
  }

  if (res.redirected && new URL(res.url).pathname === '/login') {
    throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, { sessionExpired: true, code: 'unauthenticated' });
  }
  if (!res.ok) throw await readError(res);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    throw new ApiError(t('Unerwartete Antwort vom Server (HTTP {status}).', { status: res.status }), res.status);
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
  id: number;
  filename: string;
  slug: string;
  expiresAt: number | null;
  protected: { password: boolean; maxViews: number | null };
}

export interface UploadOptions {
  expires?: ExpiryChoice | string;
  password?: string;
  maxViews?: number | null;
  urlStyle?: UrlStyle;
  domain?: string;
  title?: string;
  tags?: string[];
  album?: number | string | null;
  syntax?: string;
}

function optionFields(options: UploadOptions): Array<[string, string]> {
  const fields: Array<[string, string]> = [];
  if (options.expires) fields.push(['expires', String(options.expires)]);
  if (options.password) fields.push(['password', options.password]);
  if (options.maxViews) fields.push(['maxViews', String(options.maxViews)]);
  if (options.urlStyle) fields.push(['urlStyle', options.urlStyle]);
  if (options.domain) fields.push(['domain', options.domain]);
  if (options.title) fields.push(['title', options.title]);
  if (options.tags && options.tags.length) fields.push(['tags', options.tags.join(',')]);
  if (options.album) fields.push(['album', String(options.album)]);
  if (options.syntax) fields.push(['syntax', options.syntax]);
  return fields;
}

export interface UploadHandle {
  promise: Promise<UploadResponse>;
  abort: () => void;
}

export function uploadFile(file: File, onProgress: (fraction: number) => void, options: UploadOptions = {}): UploadHandle {
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
        (xhr.status === 413 ? t('Die Datei ist zu groß.') : t('Upload fehlgeschlagen (HTTP {status}).', { status: xhr.status }));
      reject(new ApiError(message, xhr.status));
    });
    xhr.addEventListener('error', () => reject(new ApiError(t('Netzwerkfehler beim Hochladen.'), 0)));
    xhr.addEventListener('abort', () => reject(new ApiError('Abgebrochen.', 0)));

    const form = new FormData();
    for (const [key, value] of optionFields(options)) form.append(key, value);
    form.append('file', file);
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

export type SortKey = 'newest' | 'oldest' | 'views' | 'size' | 'name' | 'expiring';
export type TypeFilter = '' | 'image' | 'video' | 'audio' | 'text' | 'file';

export function listFiles(params: {
  page: number;
  limit: number;
  search: string;
  type: TypeFilter;
  sort: SortKey;
  tag?: string;
  album?: number | null;
}) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    search: params.search,
    type: params.type,
    sort: params.sort,
  });
  if (params.tag) query.set('tag', params.tag);
  if (params.album) query.set('album', String(params.album));
  return api<FileListResponse>(`/api/files?${query}`);
}

export interface FilePatch {
  title?: string | null;
  expires?: ExpiryChoice | string;
  password?: string | null;
  maxViews?: number | null;
  tags?: string[];
  syntax?: string | null;
  listed?: boolean;
}

export const updateFile = (id: number, data: FilePatch) => patch<{ file: FileItem }>(`/api/files/${id}`, data);
export const fetchFile = (id: number) => api<{ file: FileItem }>(`/api/files/${id}`);
export const bulkFiles = (data: { action: string; ids: number[]; tags?: string[]; expires?: string; password?: string }) =>
  post<{ ok: boolean; count: number; trashed: boolean }>('/api/files/bulk', data);
export const fetchTags = () => api<{ tags: TagCount[] }>('/api/tags');

export const listTrash = (page = 1, limit = 60) =>
  api<FileListResponse & { summary: TrashSummary }>(`/api/trash?page=${page}&limit=${limit}`);
export const restoreFile = (id: number) => post<{ ok: boolean; file: FileItem }>(`/api/trash/${id}/restore`);
export const purgeFile = (id: number) => del<{ ok: boolean; summary: TrashSummary }>(`/api/trash/${id}`);
export const emptyTrash = () => del<{ ok: boolean; count: number; summary: TrashSummary }>('/api/trash');

export const zipUrl = (ids: number[], name?: string) =>
  `/api/files/zip?ids=${ids.join(',')}${name ? `&name=${encodeURIComponent(name)}` : ''}`;

export const fetchFileStats = (id: number, days = 30) => api<StatsSeries>(`/api/files/${id}/stats?days=${days}`);
export const fetchLinkStats = (id: number, days = 30) => api<StatsSeries>(`/api/links/${id}/stats?days=${days}`);
export const fetchAlbumStats = (id: number, days = 30) => api<StatsSeries>(`/api/albums/${id}/stats?days=${days}`);
export const fetchStatsOverview = (days = 30) => api<StatsOverview>(`/api/stats/overview?days=${days}`);

export const fileContentUrl = (id: number) => `/api/files/${id}/content`;

export async function replaceFile(id: number, blob: Blob, name: string) {
  const form = new FormData();
  form.append('file', blob, name);
  return api<{ ok: boolean; file: FileItem }>(`/api/files/${id}/replace`, { method: 'POST', body: form });
}

export const saveDesign = (design: ViewDesign) => put<{ ok: boolean; design: ViewDesign }>('/api/design', { design });
export const resetDesign = () => del<{ ok: boolean }>('/api/design');
export const previewDesign = (design: ViewDesign, scope: 'own' | 'default') =>
  post<{ design: ViewDesign; css: string }>('/api/design/preview', { design, scope });
export const saveProfile = (data: Partial<Omit<ProfileSettings, 'available' | 'urls' | 'counts' | 'blocked'>>) =>
  put<{ ok: boolean; profile: ProfileSettings }>('/api/profile', data);
export const fetchProfileFiles = (username: string, page: number) =>
  api<PublicFilePage>(`/api/profiles/${encodeURIComponent(username)}/files?page=${page}`);

export const sendReport = (data: {
  kind?: ReportKind;
  target?: string;
  url?: string;
  reason: ReportReason;
  message: string;
  contact: string;
  website?: string;
}) => post<{ ok: boolean; duplicate: boolean }>('/api/reports', data);
export const fetchReports = (status: 'open' | 'closed', page = 1) => api<ReportList>(`/api/admin/reports?status=${status}&page=${page}`);
export const resolveReport = (id: number, action: string, note = '') =>
  post<{ ok: boolean; open: number }>(`/api/admin/reports/${id}/resolve`, { action, note });
export const moderateContent = (kind: ReportKind, id: number, action: 'block' | 'unblock', reason = '') =>
  post<{ ok: boolean; open: number }>('/api/admin/moderation', { kind, id, action, reason });

export const createText = (content: string, options: UploadOptions = {}) =>
  post<UploadResponse>('/api/texts', { content, ...Object.fromEntries(optionFields(options)) });

export const listLinks = (params: { page: number; limit: number; search: string }) => {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit), search: params.search });
  return api<LinkListResponse>(`/api/links?${query}`);
};
export const createLink = (url: string, options: UploadOptions = {}) =>
  post<{ success: boolean; url: string; code: string; id: number }>('/api/links', { url, ...Object.fromEntries(optionFields(options)) });
export const updateLink = (
  id: number,
  data: { url?: string; title?: string | null; expires?: string; password?: string | null; maxClicks?: number | null }
) => patch<{ link: ShortLink }>(`/api/links/${id}`, data);
export const deleteLink = (id: number) => del<{ ok: boolean }>(`/api/links/${id}`);

export const listAlbums = () => api<{ albums: Album[] }>('/api/albums');
export const fetchAlbum = (id: number) => api<{ album: Album }>(`/api/albums/${id}`);
export const createAlbum = (data: { title: string; description?: string; visibility?: string; password?: string; fileIds?: number[] }) =>
  post<{ album: Album }>('/api/albums', data);
export const updateAlbum = (
  id: number,
  data: { title?: string; description?: string; visibility?: string; password?: string | null; coverFileId?: number | null }
) => patch<{ album: Album }>(`/api/albums/${id}`, data);
export const deleteAlbum = (id: number) => del<{ ok: boolean }>(`/api/albums/${id}`);
export const addToAlbum = (id: number, fileIds: number[]) => post<{ album: Album }>(`/api/albums/${id}/files`, { fileIds });
export const removeFromAlbum = (id: number, fileIds: number[]) => del<{ album: Album }>(`/api/albums/${id}/files`, { fileIds });
export const reorderAlbum = (id: number, fileIds: number[]) => put<{ album: Album }>(`/api/albums/${id}/order`, { fileIds });

export const unlock = (kind: 'file' | 'link' | 'album', slug: string, password: string) =>
  post<{ ok: boolean }>(`/${kind === 'file' ? 'view' : kind === 'link' ? 's' : 'a'}/${encodeURIComponent(slug)}/unlock`, { password });
export const openOnce = (slug: string) => post<{ ok: boolean; until?: number }>(`/view/${encodeURIComponent(slug)}/open`, {});

export const savePreferences = (data: Partial<Preferences>) => patch<{ preferences: Preferences }>('/api/account/preferences', data);

export const fetchUserStats = () => api<UserStats>('/api/stats-cards');
export const fetchHomeStats = () => api<HomeStats>('/api/home');
export const deleteOwnFile = (filename: string) => del<{ success: boolean }>(`/file/${encodeURIComponent(filename)}`);
export const uploadFromUrl = (url: string, options: UploadOptions = {}) =>
  post<UploadResponse>('/api/fetch', { url, ...Object.fromEntries(optionFields(options)) });

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

export const startEmailVerification = (email: string) => post<{ ok: boolean; email: EmailState }>('/api/account/email', { email });
export const removeEmail = () => del<{ ok: boolean; email: EmailState }>('/api/account/email');
export const fetchDomains = () => api<DomainState>('/api/account/domains');
export const addDomain = (domain: string) =>
  post<{ ok: boolean; domain: UserDomain; domains: DomainState }>('/api/account/domains', { domain });
export const verifyDomain = (id: number) =>
  post<{ ok: boolean; result: DomainCheck; domains: DomainState }>(`/api/account/domains/${id}/verify`);
export const removeDomain = (id: number) => del<{ ok: boolean; domains: DomainState }>(`/api/account/domains/${id}`);

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
export function listAllFiles(params: { page: number; limit: number; search: string; trash?: boolean }) {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit), search: params.search });
  if (params.trash) query.set('trash', '1');
  return api<FileListResponse>(`/api/admin/files?${query}`);
}
export const deleteAnyFile = (username: string, filename: string, permanent = false) =>
  del<{ ok: boolean; trashed: boolean }>(
    `/api/admin/files/${encodeURIComponent(username)}/${encodeURIComponent(filename)}${permanent ? '?permanent=1' : ''}`
  );
export const restoreAnyFile = (id: number) => post<{ ok: boolean; file: FileItem }>(`/api/admin/trash/${id}/restore`);
export const purgeAnyFile = (id: number) => del<{ ok: boolean }>(`/api/admin/trash/${id}`);
export const fetchAdminDomains = () => api<{ domains: UserDomain[] }>('/api/admin/domains');
export const revokeDomain = (id: number) => del<{ ok: boolean; domains: UserDomain[] }>(`/api/admin/domains/${id}`);
export const testMail = (to: string) => post<{ ok: boolean; to: string; ms: number }>('/api/admin/settings/mail-test', { to });

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
  email?: string;
}) => post<{ ok: boolean; invite: Invite; sent: string | null; mailError: string | null }>('/api/admin/invites', data);
export const revokeInvite = (code: string) => del<{ ok: boolean }>(`/api/admin/invites/${encodeURIComponent(code)}`);

export const saveSettings = (changes: Record<string, SettingValue>) =>
  patch<SettingsPayload & { ok: boolean; changed: string[] }>('/api/admin/settings', changes);
export const testWebhook = (url?: string) => post<{ ok: boolean }>('/api/admin/settings/webhook-test', { url });

export const fetchDatabaseInfo = () => api<DatabaseInfo>('/api/admin/database');
export const fetchStorageInfo = () => api<StorageInfo>('/api/admin/storage');
export const testStorage = (data: Record<string, string | boolean>) =>
  post<{ ok: boolean; ms: number; region: string }>('/api/admin/storage/test', data);
export const migrateStorage = (to: 'local' | 's3') => post<{ ok: boolean }>('/api/admin/storage/migrate', { to });
export const fetchBackups = () => api<BackupInfo>('/api/admin/backups');
export const startBackup = (includeUploads: boolean) => post<BackupInfo & { ok: boolean }>('/api/admin/backups', { includeUploads });
export const backupDownloadUrl = (name: string, location: string) =>
  `/api/admin/backups/${encodeURIComponent(name)}/download?location=${encodeURIComponent(location)}`;
export const probeBackupDownload = (name: string, location: string) => api<{ ok: boolean }>(`${backupDownloadUrl(name, location)}&probe=1`);
export const deleteBackup = (name: string, location: string) =>
  del<BackupInfo & { ok: boolean }>(`/api/admin/backups/${encodeURIComponent(name)}?location=${encodeURIComponent(location)}`);

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
export const testSetupDatabase = (token: string, url: string) =>
  post<{ ok: boolean; label: string; version: string; accounts: number }>('/api/setup/database/test', { token, url });
export const switchSetupDatabase = (token: string, url: string) =>
  post<DatabaseChoice & { ok: boolean; switched: boolean; accounts?: number; open: boolean }>('/api/setup/database', { token, url });
export const completeSetup = (payload: SetupPayload & { createToken: boolean }) =>
  post<{ ok: boolean; redirect: string; username: string; token: string | null; baseUrl: string }>('/api/setup', payload);
