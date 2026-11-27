export declare const PROTOCOL = 1;
export declare const SDK_VERSION = '1.3.1';
export declare const DEFAULT_ENDPOINT = 'https://pulse.moestudio.net';
export type Primitive = string | number | boolean | null;
export type Facts = Record<string, Primitive>;
export type Numbers = Record<string, number>;
export type Level = 'fatal' | 'error' | 'warning';
export interface Consent {
  stats: boolean;
  errors: boolean;
}
export interface IdentityStore {
  load(): Promise<string | null> | string | null;
  save(value: string): Promise<void> | void;
  clear?(): Promise<void> | void;
}
export interface PulseOptions {
  app: string;
  version: string;
  dataDir: string;
  consent: () => boolean | Consent | Promise<boolean | Consent>;
  endpoint?: string;
  install?: string;
  channel?: string;
  features?: () => Facts | Promise<Facts>;
  metrics?: () => Numbers | Promise<Numbers>;
  root?: string;
  paths?: Record<string, string>;
  redact?: () => Array<string | RegExp>;
  crashes?: boolean;
  interval?: number;
  timeout?: number;
  identity?: IdentityStore;
  log?: (level: 'debug' | 'warn', message: string) => void;
  fetch?: typeof fetch;
}
export interface Frame {
  fn: string;
  file: string;
  line: number;
  col: number;
  app: boolean;
}
export interface ErrorEvent {
  id: string;
  time: number;
  level: Level;
  type: string;
  code: string | null;
  message: string;
  frames: Frame[];
  raw: string;
  count: number;
  version: string;
  context: Facts;
  handled: boolean;
  origin: string;
}
export interface SystemInfo {
  os: {
    platform: string;
    name: string;
    release: string;
    arch: string;
  };
  runtime: {
    name: string;
    version: string;
  };
  cpu: {
    model: string | null;
    cores: number;
    load: number[] | null;
  };
  memory: {
    total: number;
    free: number;
    limit: number | null;
    process: number;
  };
  disk: {
    total: number;
    free: number;
  } | null;
  uptime: {
    system: number;
    process: number;
  };
  container: string | null;
  locale: string;
  timezone: string;
}
export interface Heartbeat {
  protocol: number;
  sdk: string;
  key: string;
  app: string;
  version: string;
  channel: string | null;
  install: string | null;
  scope: 'full' | 'errors';
  started: number;
  runtime: {
    name: string;
    version: string;
  };
  system?: SystemInfo;
  features?: Facts;
  metrics?: Numbers;
  counters?: Numbers;
}
export type TicketCategory = 'bug' | 'question' | 'idea' | 'other';
export type TicketStatus = 'open' | 'answered' | 'closed';
export interface TicketInput {
  subject: string;
  message: string;
  category?: TicketCategory;
  name?: string;
  email?: string;
  diagnostics?: boolean;
}
export interface TicketMessage {
  id: number;
  author: 'user' | 'developer' | 'system';
  body: string;
  createdAt: number;
}
export interface Ticket {
  id: string;
  number: number;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  createdAt: number;
  updatedAt: number;
  unread: boolean;
  last: {
    author: TicketMessage['author'];
    body: string;
    createdAt: number;
  } | null;
}
export interface TicketDetail extends Ticket {
  name: string | null;
  email: string | null;
  messages: TicketMessage[];
}
export interface Notice {
  id: number;
  level: 'info' | 'warning' | 'security';
  title: string;
  body: string;
  link: string | null;
  minVersion: string | null;
  maxVersion: string | null;
  createdAt: number;
}
export interface Support {
  create(input: TicketInput): Promise<TicketDetail>;
  list(): Promise<{
    tickets: Ticket[];
    unread: number;
  }>;
  get(id: string): Promise<TicketDetail>;
  reply(id: string, message: string): Promise<TicketDetail>;
  close(id: string): Promise<TicketDetail>;
  unread(): number;
}
export declare class PulseError extends Error {
  code: string;
  status: number;
  retry: number | null;
  constructor(code: string, message: string, status?: number, retry?: number | null);
}
export interface PulseStatus {
  consent: Consent;
  running: boolean;
  interval: number;
  installId: string | null;
  lastHeartbeat: number | null;
  lastError: string | null;
  queued: number;
  blocked: boolean;
}
export interface Release {
  version: string;
  title: string | null;
  date: number | null;
  dateText: string | null;
  url: string | null;
  security: boolean;
  channel: 'stable' | 'beta';
  notes: string | null;
}
export interface UpdateInfo {
  app: string;
  version: string | null;
  channel: 'stable' | 'beta';
  latest: Release | null;
  update: boolean;
  security: boolean;
  yanked: boolean;
  supported: boolean;
  minimum: string | null;
  behind: number;
  releases: Release[];
  checkedAt: number;
}
export interface UpdateSummary {
  latest: string;
  update: boolean;
  security: boolean;
  yanked: boolean;
  supported: boolean;
  url: string | null;
}
export interface Pulse {
  support: Support;
  notices(): Notice[];
  fetchNotices(): Promise<Notice[]>;
  update(): UpdateSummary | null;
  checkUpdate(options?: { channel?: 'stable' | 'beta'; force?: boolean }): Promise<UpdateInfo | null>;
  start(): Promise<void>;
  refresh(): Promise<void>;
  stop(): Promise<void>;
  capture(error: unknown, context?: Facts, level?: Level): void;
  message(text: string, context?: Facts, level?: Level): void;
  count(name: string, by?: number): void;
  flush(timeout?: number): Promise<void>;
  preview(consent?: Partial<Consent>): Promise<{
    endpoint: string;
    installId: string | null;
    heartbeat: Heartbeat;
  }>;
  status(): PulseStatus;
  forget(): Promise<boolean>;
}
export declare function canonical(method: string, path: string, id: string, time: string, nonce: string, body: string | Uint8Array): string;
export interface ScrubOptions {
  root?: string;
  paths?: Record<string, string>;
  extra?: Array<string | RegExp>;
}
export type Cleaner = (input: unknown) => string;
export declare function scrubber(options?: ScrubOptions): Cleaner;
export declare function scrub(input: unknown, options?: ScrubOptions): string;
export declare function parseStack(stack: string | undefined, root?: string, clean?: Cleaner): Frame[];
export declare function normalizeMessage(message: string): string;
export declare function fingerprint(type: string, message: string, frames: Frame[]): string;
export declare function cleanFacts(input: unknown, clean?: Cleaner, max?: number): Facts;
export declare function detectContainer(): 'docker' | 'kubernetes' | 'lxc' | 'podman' | 'wsl' | null;
export declare function systemInfo(dataDir: string): Promise<SystemInfo>;
export declare function buildEvent(
  value: unknown,
  options: {
    version: string;
    level: Level;
    context?: Facts;
    handled: boolean;
    origin: string;
    root?: string;
    clean?: Cleaner;
  }
): ErrorEvent;
export declare function describe(
  language?: 'de' | 'en',
  app?: string
): {
  title: string;
  summary: string;
  stats: string[];
  errors: string[];
  note: string;
};
export declare function compareVersions(a: string, b: string): number;
export declare function noticeMatches(notice: Pick<Notice, 'minVersion' | 'maxVersion'>, version: string): boolean;
export declare function workChallenge(install: string, time: number, subject: string, message: string): string;
export declare function workBits(challenge: string, nonce: string): number;
export declare function createPulse(options: PulseOptions): Pulse;
export interface SupportReply {
  status: number;
  body: Record<string, unknown>;
}
export declare function handleSupport(pulse: Pulse, input: unknown): Promise<SupportReply>;
