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
  last: { author: TicketMessage['author']; body: string; createdAt: number } | null;
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
  behind: number;
  releases: Release[];
  checkedAt: number;
}

export interface SupportAdapter {
  list(): Promise<{ tickets: Ticket[]; unread: number }>;
  get(id: string): Promise<TicketDetail>;
  create(input: TicketInput): Promise<TicketDetail>;
  reply(id: string, message: string): Promise<TicketDetail>;
  close(id: string): Promise<TicketDetail>;
  notices(): Promise<Notice[]>;
  update(force?: boolean): Promise<UpdateInfo | null>;
}

export class SupportError extends Error {
  code: string;
  retry: number | null;

  constructor(code: string, message: string, retry: number | null = null) {
    super(message);
    this.name = 'SupportError';
    this.code = code;
    this.retry = retry;
  }
}

export interface SupportClientOptions {
  headers?: Record<string, string> | (() => Record<string, string>);
  fetch?: typeof fetch;
}

export function createSupportClient(endpoint: string, options: SupportClientOptions = {}): SupportAdapter {
  const call = async <T>(payload: Record<string, unknown>): Promise<T> => {
    const extra = typeof options.headers === 'function' ? options.headers() : (options.headers ?? {});
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'content-type': 'application/json', ...extra },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new SupportError('network', 'Keine Verbindung zum Server.');
    }
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new SupportError(
        typeof data.error === 'string' ? data.error : 'server',
        typeof data.message === 'string' ? data.message : `Fehler ${response.status}`,
        typeof data.retry === 'number' ? data.retry : null
      );
    }
    return data as T;
  };
  return {
    list: () => call({ action: 'list' }),
    get: (id) => call({ action: 'get', id }),
    create: (input) => call({ action: 'create', input }),
    reply: (id, message) => call({ action: 'reply', id, message }),
    close: (id) => call({ action: 'close', id }),
    notices: async () => (await call<{ notices: Notice[] }>({ action: 'notices' })).notices,
    update: async (force = false) => (await call<{ update: UpdateInfo | null }>({ action: 'update', force })).update,
  };
}
