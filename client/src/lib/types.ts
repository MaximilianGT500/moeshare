export type FileType = 'image' | 'video' | 'audio' | 'file';

export interface FileUrls {
  view: string;
  direct: string;
  download: string;
  preview: string;
  delete: string;
}

export interface FileItem {
  id: number;
  filename: string;
  username: string;
  sizeBytes: number;
  date: string;
  width: number;
  height: number;
  color: string;
  views: number;
  type: FileType;
  isGif: boolean;
  urls: FileUrls;
}

export interface FileListResponse {
  files: FileItem[];
  total: number;
  page: number;
  pages: number;
  limit?: number;
  hasNext: boolean;
}

export interface StorageBreakdown {
  images: number;
  videos: number;
  audio: number;
  other: number;
}

export interface QuotaInfo {
  quotaBytes: number | null;
  usedBytes: number;
}

export interface UserStats {
  files: number;
  storageBytes: number;
  views: number;
  images: number;
  videos: number;
  audio: number;
  latestUpload: string | null;
  storageBreakdown: StorageBreakdown;
  quota?: QuotaInfo;
}

export interface GlobalStats {
  files: number;
  storageBytes: number;
  users: number;
  views: number;
}

export type Role = 'admin' | 'mitglied';

export interface AdminUser {
  id: number;
  username: string;
  role: Role;
  status: 'active' | 'suspended';
  suspendedReason: string;
  createdAt: number | null;
  lastLoginAt: number | null;
  storageBytes: number;
  files: number;
  views: number;
  quotaBytes: number | null;
  maxFileBytes: number | null;
  effectiveQuotaBytes: number | null;
  effectiveMaxFileBytes: number | null;
  totp: boolean;
  passkeys: number;
  identities: LinkedIdentity[];
  hasPassword: boolean;
  mustChangePassword: boolean;
}

export interface Provider {
  key: string;
  label: string;
}

export interface LinkedIdentity {
  provider: string;
  label?: string;
  name: string;
  enabled?: boolean;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface SystemInfo {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  loadavg: number[];
  memory: {
    total: number;
    free: number;
    used: number;
    usedPercent: number;
  };
  processMemoryBytes: number;
  uptime: { seconds: number; days: number; hours: number; minutes: number };
  nodeVersion: string;
  appVersion: string;
}

export interface SiteInfo {
  title: string;
  favicon: string;
  version: string;
  baseUrl: string;
  seedColor: string;
  copyright: string;
  links: SiteLink[];
  legal: SiteLink[];
}

export interface SessionUser {
  username: string;
  role: Role;
  isAdmin: boolean;
  canCustomizeEmbed: boolean;
}

export interface SessionInfo {
  id: string;
  current: boolean;
  device: string;
  ip: string | null;
  method: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  persistent: boolean;
}

export interface ApiTokenInfo {
  id: number;
  name: string;
  hint: string;
  legacy: boolean;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface PasskeyInfo {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
  backedUp: boolean;
  deviceType: string | null;
}

export interface AuditEvent {
  id: number;
  at: number;
  action: string;
  ip: string | null;
  details: Record<string, unknown>;
  user: { id: number; username: string | null } | null;
  actor: { id: number; username: string | null } | null;
}

export type SetupStep = 'password' | 'mfa' | null;

export interface AccountOverview {
  user: {
    id: number;
    username: string;
    role: Role;
    isAdmin: boolean;
    createdAt: number | null;
    lastLoginAt: number | null;
    passwordChangedAt: number | null;
    hasPassword: boolean;
    mustChangePassword: boolean;
  };
  security: {
    totp: boolean;
    totpEnabledAt: number | null;
    recoveryCodesLeft: number;
    mfaRequired: boolean;
    passkeysEnabled: boolean;
    passkeyOrigin: string;
    passkeys: PasskeyInfo[];
    identities: Array<LinkedIdentity & { label: string; enabled: boolean }>;
    providers: Provider[];
    elevated: boolean;
  };
  limits: { usedBytes: number; quotaBytes: number | null; maxFileBytes: number | null };
  policy: { passwordMinLength: number };
  sessions: SessionInfo[];
  tokens: ApiTokenInfo[];
  activity: AuditEvent[];
  setup: SetupStep;
}

export interface Invite {
  code: string;
  url: string;
  role: Role;
  quotaBytes: number | null;
  maxFileBytes: number | null;
  maxUses: number | null;
  uses: number;
  expiresAt: number | null;
  createdAt: number;
  createdBy: string | null;
  note: string;
  state: 'active' | 'expired' | 'used';
}

export type EmbedColorMode = 'dominant' | 'fixed' | 'random';

export interface EmbedTemplate {
  enabled: boolean;
  siteName: string;
  siteUrl: string;
  author: string;
  authorUrl: string;
  title: string;
  description: string;
  color: { mode: EmbedColorMode; value: string };
  largeImage: boolean;
}

export interface EmbedPageData {
  own: EmbedTemplate | null;
  defaultTemplate: EmbedTemplate;
  builtinTemplate: EmbedTemplate;
  allowCustom: boolean;
  samples: FileItem[];
  siteTitle: string;
  dominantColors: boolean;
}

export interface SiteLink {
  label: string;
  url: string;
}

export type SettingValue = string | number | boolean | null | string[] | EmbedTemplate | SiteLink[];

export interface SettingsPayload {
  values: Record<string, SettingValue>;
  secrets: Record<string, boolean>;
  redirectUris: Record<string, string>;
  environment: { port: number; logLevel: string; logFormat: string; errorReports: 'project' | 'custom' | 'off' };
}

type PageName = 'home' | 'setup' | 'login' | 'dashboard' | 'admin' | 'account' | 'embed' | 'view' | 'notfound' | 'legal';

interface BootBase {
  page: PageName;
  site: SiteInfo;
}

export interface LoginMethods {
  passkey: boolean;
  providers: Provider[];
  token: boolean;
  register: boolean;
  passkeyOrigin: string;
}

export interface MfaChallenge {
  ticket: string;
  methods: Array<'totp' | 'recovery' | 'passkey'>;
  username: string;
}

export interface InviteInfo {
  code: string;
  role: Role;
  expiresAt: number | null;
  createdBy: string | null;
}

export interface LoginBoot extends BootBase {
  page: 'login';
  mode: 'login' | 'register';
  error: string;
  next: string;
  methods: LoginMethods;
  mfa?: MfaChallenge | null;
  registration?: {
    mode: 'closed' | 'invite' | 'open';
    allowed: boolean;
    invite: InviteInfo | null;
    oauth: { id: string; provider: string; label: string; name: string; suggestion: string } | null;
    providers: Provider[];
    passwordMinLength: number;
  };
}

export interface DashboardBoot extends BootBase {
  page: 'dashboard';
  user: SessionUser;
  greeting: string;
  stats: UserStats;
  files: FileListResponse;
  maxUploadBytes: number | null;
  quota: QuotaInfo;
  urlFetch: boolean;
}

export interface SudoMethods {
  password: boolean;
  totp: boolean;
  passkey: boolean;
  providers: Provider[];
  passkeyOrigin: string;
}

export interface AdminBoot extends BootBase {
  page: 'admin';
  user: SessionUser;
  greeting: string;
  stats: GlobalStats;
  userStats: UserStats;
  system: SystemInfo;
  users: AdminUser[];
  files: FileListResponse;
  invites: Invite[];
  settings: SettingsPayload;
  audit: AuditEvent[];
  sudo: SudoMethods;
  homeStats: HomeStatsFull;
}

export interface AccountBoot extends BootBase {
  page: 'account';
  user: SessionUser;
  account: AccountOverview;
  userStats: UserStats;
}

export interface EmbedBoot extends BootBase {
  page: 'embed';
  user: SessionUser;
  embed: EmbedPageData;
  userStats: UserStats;
  sudo: SudoMethods;
}

export interface ViewBoot extends BootBase {
  page: 'view';
  file: {
    filename: string;
    type: FileType;
    isGif: boolean;
    width: number;
    height: number;
    sizeBytes: number;
    views: number;
    date: string;
    username: string;
  };
  urls: {
    view: string;
    direct: string;
    download: string;
    display: string;
    poster: string | null;
    hls: string | null;
  };
  accent: string | null;
  hlsConverting: boolean;
}

export interface NotFoundBoot extends BootBase {
  page: 'notfound';
  message: string;
  status?: number;
  requestId?: string;
}

export type HomeStatKey = 'files' | 'storage' | 'views' | 'users' | 'images' | 'videos' | 'audio' | 'today';

export interface HomeActivityDay {
  day: string;
  uploads: number;
}

export interface HomeOptions {
  enabled: boolean;
  headline: string;
  text: string;
  stats: HomeStatKey[];
  activity: boolean;
  signIn: boolean;
}

export interface HomeStats {
  stats: Array<{ key: HomeStatKey; value: number }>;
  activity: HomeActivityDay[] | null;
}

export interface HomeStatsFull {
  values: Record<HomeStatKey, number>;
  activity: HomeActivityDay[];
}

export interface HomeBoot extends BootBase {
  page: 'home';
  home: HomeOptions;
  stats: HomeStats;
  user: { username: string } | null;
  registration: boolean;
}

export interface SetupCheck {
  key: string;
  ok: boolean;
  optional?: boolean;
  label: string;
  detail: string;
}

export interface SetupBoot extends BootBase {
  page: 'setup';
  setup: {
    token: string;
    tokenRejected: boolean;
    settings: { values: Record<string, SettingValue>; secrets: Record<string, boolean> } | null;
    suggestedBaseUrl: string;
    checks: SetupCheck[] | null;
    passwordMinLength: number;
  };
}

export interface LegalBoot extends BootBase {
  page: 'legal';
  legal: { title: string; text: string };
}

export type AnyBoot =
  HomeBoot | SetupBoot | LoginBoot | DashboardBoot | AdminBoot | AccountBoot | EmbedBoot | ViewBoot | NotFoundBoot | LegalBoot;
