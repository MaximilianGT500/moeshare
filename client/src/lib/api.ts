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
  DuplicateReport,
  FileVersion,
  ImportPreview,
  ImportReport,
  Job,
  UploadSession,
  WatermarkConfig,
  WebhookTarget,
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
  warning?: string | null;
  duplicateOf?: { id: number; slug: string; view: string; stored: boolean };
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
  warning?: string | null;
  optimize?: boolean;
  watermark?: boolean;
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
  if (options.warning !== undefined && options.warning !== null) fields.push(['warning', options.warning.trim() || 'true']);
  if (typeof options.optimize === 'boolean') fields.push(['optimize', String(options.optimize)]);
  if (options.watermark === false) fields.push(['watermark', 'false']);
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
    xhr.addEventListener('abort', () => reject(new ApiError('Abgebrochen.', 0, { code: 'aborted' })));

    const form = new FormData();
    for (const [key, value] of optionFields(options)) form.append(key, value);
    form.append('file', file);
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

export interface VersionUploadResponse {
  ok: boolean;
  version?: boolean;
  file: FileItem;
}

type ResumableResult = UploadResponse | VersionUploadResponse;

interface ResumableHandle {
  promise: Promise<ResumableResult>;
  abort: () => void;
  pause: () => void;
  resume: () => void;
}

const RESUME_KEY = 'moeshare-uploads';
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];

export const fingerprintOf = (file: File) => `${file.name}|${file.size}|${file.lastModified}`;

function storedSessions(): Record<string, { id: string; expiresAt: number }> {
  try {
    const value = JSON.parse(window.localStorage.getItem(RESUME_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function rememberSession(fingerprint: string, session: UploadSession | null) {
  try {
    const all = storedSessions();
    const now = Date.now();
    for (const [key, value] of Object.entries(all)) if (!value || value.expiresAt < now) delete all[key];
    if (session) all[fingerprint] = { id: session.id, expiresAt: session.expiresAt };
    else delete all[fingerprint];
    window.localStorage.setItem(RESUME_KEY, JSON.stringify(all));
  } catch {}
}

const storedSessionFor = (file: File) => storedSessions()[fingerprintOf(file)] || null;

const sessionsInUse = new Set<string>();

export const listUploadSessions = () => api<{ uploads: UploadSession[] }>('/api/uploads');
const fetchUploadSession = (id: string) => api<UploadSession>(`/api/uploads/${encodeURIComponent(id)}`);
export const cancelUploadSession = (id: string) => del<{ ok: boolean }>(`/api/uploads/${encodeURIComponent(id)}`);

export async function discardResumable(file: File) {
  const stored = storedSessionFor(file);
  if (!stored || sessionsInUse.has(stored.id)) return;
  rememberSession(fingerprintOf(file), null);
  await cancelUploadSession(stored.id).catch(() => {});
}

function sendChunk(id: string, offset: number, blob: Blob, onProgress: (bytes: number) => void, register: (xhr: XMLHttpRequest) => void) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open('PATCH', `/api/uploads/${encodeURIComponent(id)}`);
    xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');
    xhr.setRequestHeader('Upload-Offset', String(offset));
    xhr.upload.addEventListener('progress', (event) => onProgress(event.loaded));
    xhr.addEventListener('load', () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText || '{}');
      } catch {}
      resolve({ status: xhr.status, body });
    });
    xhr.addEventListener('error', () => reject(new ApiError(t('Netzwerkfehler beim Hochladen.'), 0)));
    xhr.addEventListener('abort', () => reject(new ApiError('Abgebrochen.', 0, { code: 'aborted' })));
    xhr.send(blob);
  });
}

export function uploadResumable(
  file: File,
  onProgress: (fraction: number) => void,
  options: UploadOptions = {},
  { fileId = null, onState }: { fileId?: number | null; onState?: (state: 'running' | 'paused' | 'retrying') => void } = {}
): ResumableHandle {
  let current: XMLHttpRequest | null = null;
  let paused = false;
  let cancelled = false;
  let wake: (() => void) | null = null;
  let session: UploadSession | null = null;
  const fingerprint = fingerprintOf(file);
  const waitWhilePaused = () =>
    paused
      ? new Promise<void>((resolve) => {
          wake = resolve;
        })
      : Promise.resolve();
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, ms);
      wake = () => {
        window.clearTimeout(timer);
        resolve();
      };
    });
  const check = () => {
    if (cancelled) throw new ApiError('Abgebrochen.', 0, { code: 'aborted' });
  };

  async function reuse(): Promise<UploadSession | null> {
    if (fileId) return null;
    const stored = storedSessions()[fingerprint];
    if (stored && !sessionsInUse.has(stored.id)) {
      try {
        const existing = await fetchUploadSession(stored.id);
        if (existing.size === file.size) return existing;
      } catch {}
    }
    try {
      const { uploads } = await listUploadSessions();
      return (
        uploads.find(
          (entry) => !entry.fileId && entry.fingerprint === fingerprint && entry.size === file.size && !sessionsInUse.has(entry.id)
        ) || null
      );
    } catch {
      return null;
    }
  }

  async function open(): Promise<UploadSession> {
    const existing = await reuse();
    if (existing) return existing;
    return post<UploadSession>('/api/uploads', {
      name: file.name,
      size: file.size,
      fingerprint,
      ...(fileId ? { fileId } : Object.fromEntries(optionFields(options))),
    });
  }

  async function run(): Promise<ResumableResult> {
    session = await open();
    if (cancelled) {
      cancelUploadSession(session.id).catch(() => {});
      if (!fileId) rememberSession(fingerprint, null);
      check();
    }
    sessionsInUse.add(session.id);
    try {
      return await transfer(session);
    } finally {
      sessionsInUse.delete(session.id);
    }
  }

  async function transfer(session: UploadSession): Promise<ResumableResult> {
    check();
    if (!fileId) rememberSession(fingerprint, session);
    let received = session.received;
    onProgress(received / file.size);
    let failures = 0;
    while (received < file.size) {
      check();
      await waitWhilePaused();
      check();
      const end = Math.min(file.size, received + session.chunkSize);
      try {
        const answer = await sendChunk(
          session.id,
          received,
          file.slice(received, end),
          (bytes) => onProgress((received + bytes) / file.size),
          (xhr) => {
            current = xhr;
          }
        );
        current = null;
        if (answer.status === 200) {
          received = Number(answer.body.received);
          failures = 0;
          onState?.('running');
        } else if (answer.status === 409 && typeof answer.body.received === 'number') {
          received = answer.body.received;
        } else if (answer.status === 401) {
          throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, { sessionExpired: true });
        } else if (answer.status >= 400 && answer.status < 500 && answer.status !== 408 && answer.status !== 429) {
          if (answer.status === 404) rememberSession(fingerprint, null);
          throw new ApiError(typeof answer.body.error === 'string' ? answer.body.error : t('Upload fehlgeschlagen.'), answer.status);
        } else {
          throw new ApiError(t('Netzwerkfehler beim Hochladen.'), answer.status);
        }
        onProgress(received / file.size);
      } catch (error) {
        current = null;
        if (cancelled || (error instanceof ApiError && error.code === 'aborted' && !paused)) throw error;
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429)
          throw error;
        if (paused) continue;
        if (failures >= RETRY_DELAYS.length) throw error;
        onState?.('retrying');
        await sleep(RETRY_DELAYS[failures]);
        failures += 1;
        try {
          received = (await fetchUploadSession(session.id)).received;
        } catch {}
      }
    }
    check();
    const result = await post<ResumableResult>(`/api/uploads/${encodeURIComponent(session.id)}/complete`, {});
    if (!fileId) rememberSession(fingerprint, null);
    onProgress(1);
    return result;
  }

  const promise = run();
  return {
    promise,
    abort: () => {
      cancelled = true;
      current?.abort();
      wake?.();
      if (session) {
        cancelUploadSession(session.id).catch(() => {});
        if (!fileId) rememberSession(fingerprint, null);
      }
    },
    pause: () => {
      paused = true;
      onState?.('paused');
      current?.abort();
    },
    resume: () => {
      paused = false;
      onState?.('running');
      const resolve = wake;
      wake = null;
      resolve?.();
    },
  };
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
  warning?: string | boolean | null;
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
export const bulkFiles = (data: {
  action: string;
  ids: number[];
  tags?: string[];
  expires?: string;
  password?: string;
  warning?: string | boolean;
}) => post<{ ok: boolean; count: number; trashed: boolean }>('/api/files/bulk', data);
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

export const fetchDuplicates = () => api<DuplicateReport>('/api/files/duplicates');
export const fetchVersions = (id: number) =>
  api<{ file: FileItem; versions: FileVersion[]; enabled: boolean; keep: number }>(`/api/files/${id}/versions`);
export const restoreVersion = (id: number, versionId: number) =>
  post<{ ok: boolean; file: FileItem; versions: FileVersion[] }>(`/api/files/${id}/versions/${versionId}/restore`);
export const deleteVersion = (id: number, versionId: number) =>
  del<{ ok: boolean; file: FileItem; versions: FileVersion[] }>(`/api/files/${id}/versions/${versionId}`);

export function uploadVersion(
  id: number,
  file: File,
  onProgress: (fraction: number) => void
): { promise: Promise<VersionUploadResponse>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<VersionUploadResponse>((resolve, reject) => {
    xhr.open('POST', `/api/files/${id}/versions`);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener('load', () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText || '{}');
      } catch {}
      if (xhr.status === 200 && body.ok) return resolve(body as unknown as VersionUploadResponse);
      if (xhr.status === 401) return reject(new ApiError(SESSION_EXPIRED_MESSAGE, 401, { sessionExpired: true }));
      return reject(
        new ApiError(
          (typeof body.error === 'string' && body.error) || t('Upload fehlgeschlagen (HTTP {status}).', { status: xhr.status }),
          xhr.status
        )
      );
    });
    xhr.addEventListener('error', () => reject(new ApiError(t('Netzwerkfehler beim Hochladen.'), 0)));
    xhr.addEventListener('abort', () => reject(new ApiError('Abgebrochen.', 0, { code: 'aborted' })));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

interface ClipRequest {
  start: number;
  end: number;
  format: 'mp4' | 'gif';
  target?: 'new' | 'version';
  audio?: boolean;
  fps?: number;
  width?: number;
}

export interface ClipResult {
  kind: 'file' | 'version';
  file: FileItem;
  links?: UploadResponse;
}

export const startClip = (id: number, data: ClipRequest) => post<{ job: Job<ClipResult> }>(`/api/files/${id}/clip`, data);
const fetchJob = <T>(id: string) => api<{ job: Job<T> }>(`/api/jobs/${encodeURIComponent(id)}`);
const fetchAdminJob = <T>(id: string) => api<{ job: Job<T> }>(`/api/admin/jobs/${encodeURIComponent(id)}`);

export async function waitForJob<T>(
  id: string,
  onProgress: (job: Job<T>) => void,
  { admin = false, interval = 700 }: { admin?: boolean; interval?: number } = {}
): Promise<Job<T>> {
  for (;;) {
    const { job } = admin ? await fetchAdminJob<T>(id) : await fetchJob<T>(id);
    onProgress(job);
    if (job.state !== 'running') return job;
    await new Promise((resolve) => window.setTimeout(resolve, interval));
  }
}

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
export const addAlbumMember = (id: number, username: string) => post<{ album: Album }>(`/api/albums/${id}/members`, { username });
export const removeAlbumMember = (id: number, userId: number) => del<{ album: Album }>(`/api/albums/${id}/members/${userId}`);
export const leaveAlbum = (id: number) => post<{ ok: boolean }>(`/api/albums/${id}/leave`);
export const albumZipUrl = (id: number) => `/api/albums/${id}/zip`;
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

export const saveWatermark = (data: Partial<Omit<WatermarkConfig, 'allowed'>>) =>
  put<{ ok: boolean; watermark: WatermarkConfig }>('/api/account/watermark', data);
export const resetWatermark = () => del<{ ok: boolean; watermark: WatermarkConfig }>('/api/account/watermark');

export async function previewWatermark(data: Partial<Omit<WatermarkConfig, 'allowed'>>): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch('/api/account/watermark/preview', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'image/jpeg' },
      body: JSON.stringify(data),
    });
  } catch {
    throw new ApiError(t('Keine Verbindung zum Server.'), 0);
  }
  if (!res.ok) throw await readError(res);
  return res.blob();
}

export const exportUrl = (withFiles: boolean) => `/api/account/export${withFiles ? '' : '?files=0'}`;
export const probeExport = () => api<{ ok: boolean }>('/api/account/export?probe=1');

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

export interface WebhookInput {
  kind?: string;
  name?: string;
  config?: Record<string, string>;
  events?: string[];
  enabled?: boolean;
}

export const createWebhook = (data: WebhookInput) =>
  post<{ ok: boolean; target: WebhookTarget; targets: WebhookTarget[] }>('/api/admin/webhooks', data);
export const updateWebhook = (id: number, data: WebhookInput) =>
  patch<{ ok: boolean; target: WebhookTarget; targets: WebhookTarget[] }>(`/api/admin/webhooks/${id}`, data);
export const deleteWebhook = (id: number) => del<{ ok: boolean; targets: WebhookTarget[] }>(`/api/admin/webhooks/${id}`);
export const testWebhookTarget = (id: number | null, data?: WebhookInput) =>
  post<{ ok: boolean; targets?: WebhookTarget[] }>(id ? `/api/admin/webhooks/${id}/test` : '/api/admin/webhooks/test', data || {});

export const testClamav = (data: { host?: string; port?: number | string; socket?: string }) =>
  post<{ ok: boolean; version: string; detects: boolean; signature: string | null; ms: number }>('/api/admin/clamav/test', data);

export interface ImportInput {
  kind: string;
  database: string;
  files: string;
  admins?: boolean;
  merge?: boolean;
  orphans?: 'admin' | 'skip';
}

export const previewImport = (data: ImportInput) => post<{ ok: boolean; preview: ImportPreview }>('/api/admin/import/preview', data);
export const startImport = (data: ImportInput) => post<{ ok: boolean; job: Job<ImportReport> }>('/api/admin/import', data);

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
