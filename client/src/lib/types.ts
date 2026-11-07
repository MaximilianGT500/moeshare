export type FileType = 'image' | 'video' | 'audio' | 'text' | 'file';

export type UrlStyle = 'uuid' | 'random' | 'words' | 'emoji' | 'invisible' | 'original';
export type ExpiryChoice = 'never' | '10m' | '1h' | '6h' | '1d' | '3d' | '7d' | '30d' | '90d' | '365d';

export interface FileUrls {
  view: string;
  direct: string;
  playback?: string | null;
  download: string;
  preview: string;
  delete: string;
}

export interface FileItem {
  id: number;
  slug: string;
  filename: string;
  title: string | null;
  originalName: string | null;
  username: string;
  createdAt: number | null;
  storage: 'local' | 's3';
  syntax: string | null;
  tags: string[];
  password: boolean;
  maxViews: number | null;
  expiresAt: number | null;
  sizeBytes: number;
  date: string;
  width: number;
  height: number;
  color: string;
  views: number;
  type: FileType;
  isGif: boolean;
  listed: boolean;
  deletedAt: number | null;
  purgeAt: number | null;
  blocked: { at: number; reason: string } | null;
  warning: string | null;
  version: number;
  versionAt: number | null;
  scan: 'clean' | 'skipped' | 'error' | null;
  deduped: boolean;
  versions?: number;
  twins?: number;
  match?: SearchMatch;
  mine?: boolean;
  urls: FileUrls;
}

export interface SearchMatch {
  before: string;
  match: string;
  after: string;
  line: number;
}

export interface FileVersion {
  id: number;
  version: number;
  name: string;
  filename: string;
  sizeBytes: number;
  createdAt: number;
  replacedAt: number;
  width: number;
  height: number;
  note: 'original' | 'edited' | 'trimmed' | null;
  type: FileType;
  content: string;
}

export interface DuplicateGroup {
  sha256: string;
  sizeBytes: number;
  files: FileItem[];
  redundantBytes: number;
  savedBytes: number;
}

export interface DuplicateReport {
  groups: DuplicateGroup[];
  files: number;
  redundantBytes: number;
  savedBytes: number;
}

export interface Job<T = unknown> {
  id: string;
  kind: string;
  state: 'running' | 'done' | 'error';
  progress: number;
  detail: unknown;
  startedAt: number;
  finishedAt?: number;
  result: T | null;
  error: { message: string; status: number; code: string | null } | null;
}

export interface UploadSession {
  id: string;
  name: string;
  size: number;
  received: number;
  fileId: number | null;
  fingerprint: string | null;
  chunkSize: number;
  maxChunk: number;
  createdAt: number;
  expiresAt: number;
}

export type WatermarkPosition =
  'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right' | 'tile';

export interface WatermarkConfig {
  enabled: boolean;
  kind: 'text' | 'image';
  text: string;
  position: WatermarkPosition;
  size: number;
  opacity: number;
  color: string;
  shadow: boolean;
  keepOriginal: boolean;
  image: string | null;
  allowed: boolean;
}

export type WebhookKind = 'discord' | 'slack' | 'matrix' | 'telegram' | 'ntfy' | 'json';

export interface WebhookTarget {
  id: number;
  name: string;
  kind: WebhookKind;
  config: Record<string, string>;
  secrets: Record<string, boolean>;
  events: string[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastAt: number | null;
  lastStatus: number | null;
  lastError: string | null;
  legacyHeaders?: boolean;
}

export interface ImportAccount {
  username: string;
  target: string;
  merge: boolean;
  renamed: boolean;
  admin: boolean;
  password: 'kept' | 'new';
  active: boolean;
}

export interface ImportPreview {
  kind: string;
  label: string;
  counts: { users: number; files: number; albums: number; links: number; texts: number };
  bytes: number;
  missing: number;
  alreadyImported: number;
  accounts: ImportAccount[];
  orphans: number;
}

export interface ImportBucket {
  imported: number;
  skipped: number;
  missing: number;
  failed: number;
  bytes: number;
}

export interface ImportReport {
  users: { created: number; merged: number; skipped: number };
  files: ImportBucket;
  texts: ImportBucket;
  albums: { imported: number; skipped: number };
  links: { imported: number; skipped: number };
  redirects: number;
  passwords: Array<{ username: string; password: string }>;
  renamed: Array<{ from: string; to: string }>;
  warnings: string[];
  label?: string;
  ms?: number;
}

export interface FileListResponse {
  files: FileItem[];
  total: number;
  page: number;
  pages: number;
  limit?: number;
  hasNext: boolean;
  avatars?: Record<string, string | null>;
}

export interface StorageBreakdown {
  images: number;
  videos: number;
  audio: number;
  other: number;
  versions?: number;
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
  texts?: number;
  savedBytes?: number;
  duplicates?: number;
  latestUpload: string | null;
  storageBreakdown: StorageBreakdown;
  quota?: QuotaInfo;
  trash?: TrashSummary;
}

export interface TrashSummary {
  files: number;
  bytes: number;
  days: number;
  enabled: boolean;
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
  email: string | null;
  emailVerified: boolean;
  domains: number;
  avatar: string | null;
  linkPath: string | null;
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
  announcements?: SiteAnnouncement[];
  maintenance?: boolean;
  title: string;
  favicon: string;
  version: string | null;
  baseUrl: string;
  seedColor: string;
  copyright: string;
  links: SiteLink[];
  legal: SiteLink[];
  pwa?: boolean;
  language?: 'de' | 'en';
  report?: boolean;
  poweredBy?: boolean;
  custom?: boolean;
}

export interface UploadOptionsInfo {
  urlStyle: UrlStyle;
  expiry: ExpiryChoice;
  maxExpiry: ExpiryChoice;
  domain: string;
  domains: string[];
  texts: boolean;
  textMaxBytes: number | null;
  links: boolean;
  albums: boolean;
  trash: boolean;
  trashDays: number;
  zip: boolean;
  stats: boolean;
  profiles: boolean;
  editable: string[];
  chunked: boolean;
  chunkSize: number;
  versions: boolean;
  versionsKeep: number;
  optimize: boolean;
  optimizeFormat: 'keep' | 'webp' | 'avif';
  optimizePreference: boolean;
  watermark: boolean;
  watermarks: boolean;
  contentSearch: boolean;
  deduplicate: boolean;
  clips: boolean;
  customAddresses: boolean;
  linkPath: string | null;
  requests?: boolean;
}

export interface TagCount {
  tag: string;
  files: number;
}

export interface ShortLink {
  id: number;
  code: string;
  url: string;
  title: string | null;
  createdAt: number;
  expiresAt: number | null;
  password: boolean;
  maxClicks: number | null;
  clicks: number;
  lastClickedAt: number | null;
  blocked: { at: number; reason: string } | null;
  short: string;
}

export interface LinkListResponse {
  links: ShortLink[];
  total: number;
  page: number;
  pages: number;
  limit: number;
  hasNext: boolean;
}

export type AlbumVisibility = 'private' | 'link' | 'public';

export interface Album {
  id: number;
  code: string;
  title: string;
  description: string;
  visibility: AlbumVisibility;
  password: boolean;
  coverFileId: number | null;
  createdAt: number;
  updatedAt: number;
  url: string;
  files: number;
  blocked?: { at: number; reason: string } | null;
  cover?: { type: FileType; url: string | null; color: string } | null;
  items?: FileItem[];
  owner?: string | null;
  role?: 'owner' | 'member';
  members?: number;
  memberList?: AlbumMember[];
  contributors?: string[];
  avatars?: Record<string, string | null>;
}

export interface AlbumMember {
  id: number;
  username: string;
  avatar?: string | null;
  role: string;
  addedAt: number;
}

export type NotifyKey = 'security' | 'reports' | 'users' | 'system' | 'requests';

export interface Preferences {
  language: 'de' | 'en' | null;
  urlStyle: UrlStyle | null;
  domain: string | null;
  expiry: ExpiryChoice | null;
  optimize: boolean | null;
  notify: Record<NotifyKey, boolean>;
}

export interface PreferenceChoices {
  languages: Array<'de' | 'en'>;
  urlStyles: UrlStyle[];
  expiries: ExpiryChoice[];
  maxExpiry: ExpiryChoice;
  domains: string[];
  defaults: { language: 'de' | 'en'; urlStyle: UrlStyle; expiry: ExpiryChoice };
  texts: boolean;
  links: boolean;
  mail: boolean;
  optimize: boolean;
  export: boolean;
  avatars: { enabled: boolean; animated: boolean; maxBytes: number };
  customAddresses: boolean;
}

export interface SessionUser {
  username: string;
  role: Role;
  isAdmin: boolean;
  avatar: string | null;
  canCustomizeEmbed: boolean;
  canDesign: boolean;
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
    avatar: string | null;
  };
  linkPath: { enabled: boolean; current: string | null; suggestion: string };
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
  policy: { passwordMinLength: number; passwordLogin: boolean };
  sessions: SessionInfo[];
  tokens: ApiTokenInfo[];
  activity: AuditEvent[];
  setup: SetupStep;
  preferences: Preferences;
  choices: PreferenceChoices;
  email: EmailState;
  domains: DomainState;
}

export interface EmailState {
  available: boolean;
  email: string | null;
  verifiedAt: number | null;
  pending: { email: string; sentAt: number } | null;
}

export interface UserDomain {
  id: number;
  domain: string;
  origin: string;
  status: 'pending' | 'verified';
  createdAt: number;
  verifiedAt: number | null;
  checkedAt: number | null;
  error: string | null;
  autoCheckUntil: number | null;
  record: { type: 'TXT'; name: string; value: string };
  target: string;
  username?: string | null;
  userId?: number;
  active: boolean;
  legal: DomainLegal;
}

export type LegalMode = 'template' | 'text' | 'url';

export interface LegalImprintData {
  name?: string;
  representative?: string;
  street?: string;
  postcode?: string;
  city?: string;
  country?: string;
  email?: string;
  phone?: string;
  register?: string;
  vatId?: string;
  responsible?: string;
  extra?: string;
}

export interface LegalPrivacyData {
  controller?: string;
  email?: string;
  dpo?: string;
  authority?: string;
  extra?: string;
}

export interface LegalPart<T> {
  mode: LegalMode;
  data?: T;
  text?: string;
  url?: string;
}

export interface LegalConfig {
  imprint: LegalPart<LegalImprintData>;
  privacy: LegalPart<LegalPrivacyData>;
}

export interface DomainLegal {
  complete: boolean;
  required: boolean;
  graceUntil: number | null;
  missing: { imprint: string[]; privacy: string[] };
  updatedAt: number | null;
  config: LegalConfig | null;
}

export interface LegalPreview {
  imprint: string | null;
  privacy: string | null;
  status: { complete: boolean; imprint: string[]; privacy: string[] };
}

export interface DomainCheck extends UserDomain {
  verified: boolean;
  points: boolean | null;
  reachable: boolean | null;
}

export interface DomainState {
  enabled: boolean;
  max: number;
  https: boolean;
  items: UserDomain[];
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

export type DesignLayout = 'standard' | 'minimal' | 'stage' | 'split' | 'polaroid' | 'magazine';
export type DesignScheme = 'visitor' | 'dark' | 'light';
export type DesignBackground = 'ambient' | 'gradient' | 'plain' | 'dots';
export type DesignFont = 'rounded' | 'system' | 'serif' | 'mono';
export type DesignCorners = 'round' | 'soft' | 'sharp';
export type DesignElement =
  'header' | 'title' | 'owner' | 'date' | 'size' | 'resolution' | 'views' | 'download' | 'copy' | 'share' | 'original' | 'footer';

export interface ViewDesign {
  layout: DesignLayout;
  accent: string;
  scheme: DesignScheme;
  background: DesignBackground;
  font: DesignFont;
  corners: DesignCorners;
  show: Record<DesignElement, boolean>;
  note: string;
  button: { label: string; url: string };
  css?: string;
}

export interface ViewDesignData {
  own: ViewDesign | null;
  defaultDesign: ViewDesign;
  builtinDesign: ViewDesign;
  allowCustom: boolean;
  cssMode: 'off' | 'admins' | 'all';
  cssAllowed: boolean;
  sampleFileId: number | null;
  choices: {
    layouts: DesignLayout[];
    backgrounds: DesignBackground[];
    fonts: DesignFont[];
    corners: DesignCorners[];
    schemes: DesignScheme[];
    elements: DesignElement[];
  };
  maxCss: number;
}

export interface ProfileSettings {
  enabled: boolean;
  name: string;
  bio: string;
  links: SiteLink[];
  showAlbums: boolean;
  showFiles: boolean;
  blocked: { at: number; reason: string } | null;
  available: boolean;
  urls: { profile: string; domains: string[] };
  counts: { albums: number; files: number };
}

export interface DesignBoot extends BootBase {
  page: 'design';
  user: SessionUser;
  view: ViewDesignData;
  profile: ProfileSettings;
  embed: EmbedPageData;
  userStats: UserStats;
  sudo: SudoMethods;
  watermark: WatermarkConfig;
  avatars: { enabled: boolean; animated: boolean; maxBytes: number };
}

export interface StatsCounts {
  views: number;
  downloads: number;
  direct: number;
  previews: number;
}

export interface StatsDay extends StatsCounts {
  day: string;
}

export interface StatsSeries {
  enabled: boolean;
  retentionDays: number;
  days: StatsDay[];
  totals: StatsCounts;
  sources: Array<{ source: string; hits: number; lastAt: number | null }>;
}

export interface StatsOverview {
  enabled: boolean;
  days: StatsDay[];
  top: Array<StatsCounts & { id: number; total: number; file: FileItem }>;
  sources: Array<{ source: string; hits: number }>;
}

export type ReportReason = 'illegal' | 'copyright' | 'privacy' | 'spam' | 'abuse' | 'other';
export type ReportKind = 'file' | 'album' | 'link' | 'profile';

export interface ReportTarget {
  kind: ReportKind;
  target: string;
}

export interface ReportDetails {
  exists: boolean;
  label?: string;
  url?: string;
  preview?: string | null;
  type?: FileType;
  destination?: string;
  owner?: string | null;
  blocked?: boolean;
  deleted?: boolean;
}

export interface ReportEntry {
  id: number;
  kind: ReportKind;
  target: string;
  targetId: number | null;
  reason: ReportReason;
  message: string;
  contact: string | null;
  createdAt: number;
  status: 'open' | 'resolved' | 'dismissed';
  resolvedAt: number | null;
  action: string | null;
  note: string;
  similar: number;
  details: ReportDetails;
}

export interface ReportList {
  reports: ReportEntry[];
  total: number;
  page: number;
  pages: number;
  hasNext: boolean;
  open: number;
}

export interface ReportBoot extends BootBase {
  page: 'report';
  report: { url: string; reasons: ReportReason[] };
}

export type SettingValue = string | number | boolean | null | string[] | EmbedTemplate | SiteLink[] | ViewDesign;

export interface SettingsPayload {
  values: Record<string, SettingValue>;
  secrets: Record<string, boolean>;
  localizedDefaults?: Record<string, { value: string; localized: string }>;
  redirectUris: Record<string, string>;
  environment: { port: number; logLevel: string; logFormat: string; errorReports: 'project' | 'custom' | 'off' };
}

type PageName =
  | 'home'
  | 'setup'
  | 'login'
  | 'dashboard'
  | 'admin'
  | 'account'
  | 'design'
  | 'view'
  | 'notfound'
  | 'legal'
  | 'album'
  | 'profile'
  | 'report'
  | 'request';

interface BootBase {
  page: PageName;
  site: SiteInfo;
  language?: 'de' | 'en';
  messages?: Record<string, string> | null;
}

export interface LoginMethods {
  password: boolean;
  passkey: boolean;
  providers: Provider[];
  token: boolean;
  register: boolean;
  reset: boolean;
  emailLink: boolean;
  passkeyOrigin: string;
}

export type LinkInfo =
  | { valid: true; token: string; username: string; expiresAt: number; current: string | null; same: boolean }
  | { valid: false; reason: string };

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
  mode: 'login' | 'register' | 'reset' | 'link';
  link?: LinkInfo;
  error: string;
  notice?: string;
  next: string;
  methods: LoginMethods;
  mfa?: MfaChallenge | null;
  reset?: { valid: boolean; username: string; passwordMinLength: number };
  registration?: {
    mode: 'closed' | 'invite' | 'open';
    allowed: boolean;
    invite: InviteInfo | null;
    oauth: { id: string; provider: string; label: string; name: string; suggestion: string } | null;
    providers: Provider[];
    passwordMinLength: number;
    passwordless: boolean;
    passkeys: boolean;
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
  options: UploadOptionsInfo;
  tags: TagCount[];
  domainNotices?: DomainNotice[];
}

export interface DomainNotice {
  id: number;
  domain: string;
  graceUntil: number | null;
  active: boolean;
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
  database: DatabaseInfo;
  storage: StorageInfo;
  backups: BackupInfo;
  moderation: { open: number; enabled: boolean };
  domains: UserDomain[];
  mail: { ready: boolean };
  webhooks: { targets: WebhookTarget[]; kinds: WebhookKind[]; events: string[] };
  imports: { sources: Array<{ id: string; label: string }>; argon2: boolean; redirects: number };
  access: { pending: number; enabled: boolean; passwordLogin: boolean };
  update: UpdateInfo;
  announcements: Announcement[];
  videos: { running: string | null; ffmpeg: boolean };
}

export interface UpdateInfo {
  enabled: boolean;
  current: string;
  latest: string | null;
  available: string | null;
  checkedAt: number | null;
  changelog: string;
}

export type AnnouncementLevel = 'info' | 'success' | 'warning' | 'error';
export type AnnouncementAudience = 'everyone' | 'users' | 'admins';

export interface Announcement {
  id: number;
  title: string;
  text: string;
  level: AnnouncementLevel;
  audience: AnnouncementAudience;
  startsAt: number | null;
  endsAt: number | null;
  dismissible: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SiteAnnouncement {
  id: number;
  title: string;
  text: string;
  level: AnnouncementLevel;
  dismissible: boolean;
  updatedAt: number;
}

export interface CaddySite {
  server: string;
  listen: string[];
  hosts: string[];
  upstreams: string[];
}

export interface CaddyIssuer {
  module: string;
  ca: string | null;
  email: string | null;
}

export interface CaddySummary {
  sites: CaddySite[];
  policies: Array<{ subjects: string[]; onDemand: boolean; issuers: CaddyIssuer[] }>;
  onDemand: boolean;
  ask: string | null;
  email: string | null;
  admin: string | null;
}

export interface CaddyNote {
  level: 'error' | 'warning' | 'info';
  text: string;
}

export interface CaddyOverview {
  connected: boolean;
  url: string | null;
  detected: boolean;
  error?: string | null;
  summary?: CaddySummary;
  upstreams?: Array<{ address: string; requests: number; fails: number }>;
  reload?: { successful: boolean | null; at: number | null };
  notes?: CaddyNote[];
  config?: unknown;
}

export type CertificateStatus = 'ok' | 'warning' | 'expired' | 'error' | 'untrusted' | 'unchecked';

export interface CertificateInfo {
  domain: string;
  source: 'site' | 'custom' | 'caddy';
  status: CertificateStatus;
  issuer?: string | null;
  names: string[];
  validFrom?: number | null;
  validTo?: number | null;
  daysLeft?: number | null;
  fingerprint?: string | null;
  error?: string | null;
  checkedAt: number | null;
}

export interface TlsRequest {
  id: number;
  domain: string;
  allowed: boolean;
  reason: string;
  at: number;
}

export interface CaddyState {
  overview: CaddyOverview;
  certificates: CertificateInfo[];
  requests: TlsRequest[];
  checking: boolean;
}

export interface CaddyAdapt {
  ok: boolean;
  error: string | null;
  warnings: string[];
  summary?: CaddySummary;
}

export type RequestTypes = 'any' | 'images' | 'videos' | 'media' | 'documents';
export type RequestState = 'open' | 'closed' | 'expired' | 'full';

export interface UploadRequest {
  id: number;
  code: string;
  url: string;
  title: string;
  message: string;
  password: boolean;
  albumId: number | null;
  maxFiles: number | null;
  maxBytes: number | null;
  fileBytes: number | null;
  types: RequestTypes;
  askName: boolean;
  notify: boolean;
  files: number;
  bytes: number;
  expiresAt: number | null;
  closedAt: number | null;
  lastUploadAt: number | null;
  createdAt: number;
  state: RequestState;
}

export interface UploadRequestInput {
  title?: string;
  message?: string;
  password?: string | null;
  expires?: ExpiryChoice;
  maxFiles?: number | null;
  maxBytes?: number | null;
  fileBytes?: number | null;
  types?: RequestTypes;
  albumId?: number | null;
  askName?: boolean;
  notify?: boolean;
  closed?: boolean;
}

export interface PublicRequest {
  code: string;
  title: string;
  message: string;
  owner: { name: string; avatar: string | null };
  state: RequestState;
  password: boolean;
  unlocked: boolean;
  askName: boolean;
  types: RequestTypes;
  expiresAt: number | null;
  maxFileBytes: number | null;
  filesLeft: number | null;
  bytesLeft: number | null;
}

export interface RequestBoot extends BootBase {
  page: 'request';
  request: PublicRequest;
}

export interface Subtitle {
  id: number;
  language: string;
  label: string;
  default: boolean;
  url: string;
  createdAt?: number;
}

export type LoginLinkStatus = 'pending' | 'ready' | 'used' | 'revoked' | 'denied' | 'expired';

export interface LoginLink {
  id: number;
  user: { id: number; username: string | null };
  status: LoginLinkStatus;
  source: 'admin' | 'api' | 'email' | 'cli';
  integration: { id: number; name: string | null } | null;
  createdBy: string | null;
  requestedBy: string | null;
  decidedBy: string | null;
  note: string;
  redirect: string;
  minutes: number;
  secondFactor: boolean;
  delivery: 'email' | null;
  createdAt: number;
  expiresAt: number;
  decidedAt: number | null;
  usedAt: number | null;
  usedIp: string | null;
}

export interface Integration {
  id: number;
  name: string;
  hint: string;
  mode: 'direct' | 'approval';
  allowAdmins: boolean;
  maxMinutes: number | null;
  enabled: boolean;
  createdAt: number;
  createdBy: string | null;
  lastUsedAt: number | null;
  pending: number;
  issued: number;
}

export interface DatabaseInfo {
  client: 'sqlite' | 'postgres' | 'mysql';
  label: string;
  version: string;
  source: 'env' | 'file' | 'default' | 'cli';
  tables: Record<string, number>;
}

export interface StorageMigration {
  to: 'local' | 's3';
  startedAt: number;
  total: number | null;
  done: number;
  moved: number;
  failed: number;
  missing: number;
  finishedAt: number | null;
  error: string | null;
}

export interface StorageInfo {
  driver: 'local' | 's3';
  configured: boolean;
  counts: { local: { files: number; bytes: number }; s3: { files: number; bytes: number } };
  migration: StorageMigration | null;
  ffmpeg: string | null;
}

export interface BackupItem {
  name: string;
  size: number;
  at: number;
  location: 'local' | 's3';
  auto: boolean;
}

export interface BackupInfo {
  items: BackupItem[];
  listError?: string;
  running: { name: string; startedAt: number; phase: string; includeUploads: boolean; reason: string } | null;
  last: { name: string; at: number; ok: boolean; error?: string; size?: number; location?: string; ms?: number } | null;
}

export interface AccountBoot extends BootBase {
  page: 'account';
  user: SessionUser;
  account: AccountOverview;
  userStats: UserStats;
}

export interface LockedInfo {
  kind?: 'file' | 'link' | 'album';
  state: 'locked' | 'once';
  slug: string;
  password: boolean;
  once?: boolean;
  expiresAt?: number | null;
}

export interface ViewFile {
  id: number;
  slug: string;
  filename: string;
  title: string | null;
  originalName: string | null;
  type: FileType;
  isGif: boolean;
  syntax: string | null;
  textBytes: number | null;
  textPreview: boolean;
  width: number;
  height: number;
  sizeBytes: number;
  views: number;
  date: string;
  createdAt: number | null;
  expiresAt: number | null;
  once: boolean;
  protected: boolean;
  username: string;
  avatar?: string | null;
  owner: boolean;
  blocked?: { reason: string } | null;
  warning?: string | null;
  version?: number;
}

export interface ViewUrls {
  view: string;
  direct: string;
  raw: string;
  download: string;
  display: string;
  poster: string | null;
  hls: string | null;
  playback: string | null;
}

export interface OwnerStyle {
  design?: ViewDesign;
  css?: string;
  report?: ReportTarget | null;
}

export interface ViewBoot extends BootBase, OwnerStyle {
  page: 'view';
  locked?: LockedInfo;
  file: ViewFile;
  urls: ViewUrls;
  accent: string | null;
  hlsConverting: boolean;
  webConverting?: boolean;
  subtitles?: Subtitle[];
  profile?: { name: string; url: string } | null;
  preview?: boolean;
  sample?: boolean;
  sampleUser?: string;
}

export interface AlbumItem {
  id: number;
  slug: string;
  title: string | null;
  name: string | null;
  filename: string | null;
  type: FileType;
  isGif: boolean;
  width: number;
  height: number;
  color: string;
  sizeBytes: number;
  locked: boolean;
  once: boolean;
  view: string;
  preview: string | null;
  direct: string | null;
  playback?: string | null;
  download: string | null;
  warning?: string | null;
  username?: string;
}

export interface AlbumBoot extends BootBase, OwnerStyle {
  page: 'album';
  locked?: LockedInfo;
  album?: {
    id: number;
    code: string;
    title: string;
    description: string;
    owner: string | null;
    contributors?: string[];
    avatars?: Record<string, string | null>;
    updatedAt: number;
    url: string;
    zip: boolean;
  };
  items?: AlbumItem[];
  owner?: boolean;
  dashboard?: string | null;
}

export interface PublicAlbum {
  code: string;
  title: string;
  description: string;
  files: number;
  locked: boolean;
  url: string;
  cover: { type: FileType; url: string | null; color: string } | null;
  updatedAt: number;
}

export interface PublicFilePage {
  items: AlbumItem[];
  page: number;
  hasNext: boolean;
  total: number;
}

export interface ProfileBoot extends BootBase, OwnerStyle {
  page: 'profile';
  profile: {
    id: number;
    username: string;
    name: string;
    bio: string;
    links: SiteLink[];
    since: number | null;
    url: string;
    avatar?: string | null;
  };
  albums: PublicAlbum[];
  files: PublicFilePage | null;
  owner: boolean;
  custom: boolean;
}

export interface DatabaseChoice {
  client: 'sqlite' | 'postgres' | 'mysql';
  label: string;
  source: 'env' | 'file' | 'default' | 'cli';
  locked: boolean;
  host: string | null;
  port: number | null;
  database: string | null;
  user: string | null;
  ssl: boolean;
  sqliteDefault: boolean;
}

export interface NotFoundBoot extends BootBase {
  page: 'notfound';
  message: string;
  status?: number;
  requestId?: string;
  maintenance?: boolean;
  signedIn?: boolean;
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
    database: DatabaseChoice | null;
    passwordMinLength: number;
  };
}

export interface LegalBoot extends BootBase {
  page: 'legal';
  legal: { title: string; text: string; heading?: string };
}

export type AnyBoot =
  | HomeBoot
  | SetupBoot
  | LoginBoot
  | DashboardBoot
  | AdminBoot
  | AccountBoot
  | DesignBoot
  | ViewBoot
  | NotFoundBoot
  | LegalBoot
  | AlbumBoot
  | ProfileBoot
  | ReportBoot
  | RequestBoot;
