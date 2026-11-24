import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import type { SupportAdapter, Ticket, TicketCategory, TicketDetail, TicketMessage, TicketStatus } from './client';

export interface PulseSupportProps {
  support: Pick<SupportAdapter, 'list' | 'get' | 'create' | 'reply' | 'close'>;
  language?: 'de' | 'en';
  developer?: string;
  defaults?: { name?: string; email?: string };
  diagnostics?: boolean;
  privacy?: string;
  poll?: number;
  onUnread?: (count: number) => void;
}

const LABELS = {
  de: {
    title: 'Support',
    intro: 'Schreib direkt an {dev}, wenn etwas hakt, eine Frage offen ist oder du eine Idee hast. Die Antwort erscheint hier.',
    create: 'Neue Nachricht',
    empty: 'Noch keine Nachrichten',
    emptyHint: 'Fragen, Fehler oder Ideen? Schreib einfach los.',
    back: 'Zurück',
    topic: 'Worum geht es?',
    subject: 'Betreff',
    message: 'Nachricht',
    messageHint: 'Was ist passiert und was hast du erwartet? Je genauer, desto schneller die Hilfe.',
    name: 'Name (optional)',
    email: 'E-Mail (optional)',
    emailHint: 'Nur falls {dev} dich auch per Mail erreichen soll',
    diagnostics: 'Diagnose mitsenden',
    diagnosticsHint: 'Version, System, Speicherplatz und die letzten Fehler, bereinigt und ohne persönliche Daten',
    send: 'Senden',
    sending: 'Wird gesendet …',
    privacy: 'Deine Nachricht geht an {dev} und wird nur für diese Anfrage verwendet.',
    you: 'Du',
    reply: 'Deine Antwort',
    answer: 'Antworten',
    keys: 'Strg + Enter sendet',
    reopen: 'Das Ticket ist geschlossen. Mit einer Antwort öffnest du es wieder.',
    close: 'Ticket schließen',
    unread: 'Neue Antwort',
    retry: 'Noch einmal versuchen',
    failed: 'Laden hat nicht geklappt.',
    status: { open: 'Offen', answered: 'Beantwortet', closed: 'Geschlossen' } as Record<TicketStatus, string>,
    category: { bug: 'Fehler', question: 'Frage', idea: 'Idee', other: 'Sonstiges' } as Record<TicketCategory, string>,
    locale: 'de-DE',
  },
  en: {
    title: 'Support',
    intro: 'Write directly to {dev} if something is off, you have a question or an idea. The answer shows up here.',
    create: 'New message',
    empty: 'No messages yet',
    emptyHint: 'Questions, bugs or ideas? Just start writing.',
    back: 'Back',
    topic: 'What is it about?',
    subject: 'Subject',
    message: 'Message',
    messageHint: 'What happened and what did you expect? The more precise, the faster the help.',
    name: 'Name (optional)',
    email: 'Email (optional)',
    emailHint: 'Only if {dev} should be able to reach you by email',
    diagnostics: 'Attach diagnostics',
    diagnosticsHint: 'Version, system, disk space and the latest errors, cleaned and without personal data',
    send: 'Send',
    sending: 'Sending …',
    privacy: 'Your message goes to {dev} and is only used for this request.',
    you: 'You',
    reply: 'Your answer',
    answer: 'Reply',
    keys: 'Ctrl + Enter sends',
    reopen: 'This ticket is closed. Replying opens it again.',
    close: 'Close ticket',
    unread: 'New answer',
    retry: 'Try again',
    failed: 'Loading failed.',
    status: { open: 'Open', answered: 'Answered', closed: 'Closed' } as Record<TicketStatus, string>,
    category: { bug: 'Bug', question: 'Question', idea: 'Idea', other: 'Other' } as Record<TicketCategory, string>,
    locale: 'en-GB',
  },
};

const icon = (path: string) =>
  function Icon(props: SvgIconProps) {
    return (
      <SvgIcon {...props}>
        <path d={path} />
      </SvgIcon>
    );
  };

const BackIcon = icon('M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z');
const SendIcon = icon('M3 20v-6l8-2-8-2V4l19 8z');
const AddIcon = icon('M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z');
const ChatIcon = icon('M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2');

const STATUS_COLOR: Record<TicketStatus, 'primary' | 'success' | 'default'> = { open: 'primary', answered: 'success', closed: 'default' };

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

type View = { kind: 'list' } | { kind: 'new' } | { kind: 'ticket'; id: string };

function Bubble({
  message,
  you,
  developer,
  time,
}: {
  message: TicketMessage;
  you: string;
  developer: string;
  time: (at: number) => string;
}) {
  if (message.author === 'system') {
    return (
      <Typography
        variant="caption"
        sx={{
          alignSelf: 'center',
          color: 'text.secondary',
          px: 1.5,
          py: 0.5,
          borderRadius: '999px',
          bgcolor: 'action.hover',
          textAlign: 'center',
        }}
      >
        {message.body} · {time(message.createdAt)}
      </Typography>
    );
  }
  const mine = message.author === 'user';
  return (
    <Box
      sx={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: { xs: '94%', sm: '80%' },
        display: 'flex',
        flexDirection: 'column',
        alignItems: mine ? 'flex-end' : 'flex-start',
        gap: 0.5,
      }}
    >
      <Typography variant="caption" sx={{ color: 'text.secondary', px: 1 }}>
        <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
          {mine ? you : developer}
        </Box>{' '}
        · {time(message.createdAt)}
      </Typography>
      <Box
        sx={{
          px: 2,
          py: 1.25,
          borderRadius: '18px',
          borderTopRightRadius: mine ? '4px' : '18px',
          borderTopLeftRadius: mine ? '18px' : '4px',
          bgcolor: mine ? 'primary.main' : 'action.selected',
          color: mine ? 'primary.contrastText' : 'text.primary',
        }}
      >
        <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {message.body}
        </Typography>
      </Box>
    </Box>
  );
}

export function PulseSupport({
  support,
  language = 'de',
  developer = 'MoeStudio',
  defaults,
  diagnostics = false,
  privacy,
  poll = 60_000,
  onUnread,
}: PulseSupportProps) {
  const t = LABELS[language];
  const fill = (text: string) => text.replace('{dev}', developer);
  const format = new Intl.DateTimeFormat(t.locale, { dateStyle: 'medium', timeStyle: 'short' });
  const time = (at: number) => format.format(at);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<TicketCategory>('question');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [name, setName] = useState(defaults?.name ?? '');
  const [email, setEmail] = useState(defaults?.email ?? '');
  const [attach, setAttach] = useState(diagnostics);
  const [answer, setAnswer] = useState('');
  const unreadRef = useRef(onUnread);
  unreadRef.current = onUnread;

  const loadList = useCallback(async () => {
    try {
      const result = await support.list();
      setTickets(result.tickets);
      unreadRef.current?.(result.tickets.filter((ticket) => ticket.unread).length);
      setProblem(null);
    } catch (error) {
      setProblem(errorText(error, t.failed));
    }
  }, [support, t.failed]);

  const loadTicket = useCallback(
    async (id: string) => {
      try {
        const next = await support.get(id);
        setDetail(next);
        setTickets((list) => {
          const updated = (list ?? []).map((ticket) => (ticket.id === id ? { ...ticket, unread: false, status: next.status } : ticket));
          unreadRef.current?.(updated.filter((ticket) => ticket.unread).length);
          return updated;
        });
        setProblem(null);
      } catch (error) {
        setProblem(errorText(error, t.failed));
      }
    },
    [support, t.failed]
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (view.kind !== 'ticket') return;
    void loadTicket(view.id);
    const timer = setInterval(
      () => {
        if (document.visibilityState === 'visible') void loadTicket(view.id);
      },
      Math.max(poll, 15_000)
    );
    return () => clearInterval(timer);
  }, [view, loadTicket, poll]);

  const open = (id: string) => {
    setDetail(null);
    setAnswer('');
    setView({ kind: 'ticket', id });
  };

  const back = () => {
    setView({ kind: 'list' });
    setProblem(null);
    void loadList();
  };

  const create = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const ticket = await support.create({ subject, message, category, name, email, diagnostics: attach });
      setTickets((list) => [ticket, ...(list ?? []).filter((entry) => entry.id !== ticket.id)]);
      setSubject('');
      setMessage('');
      setDetail(ticket);
      setView({ kind: 'ticket', id: ticket.id });
    } catch (error) {
      setProblem(errorText(error, t.failed));
    } finally {
      setBusy(false);
    }
  };

  const send = async (close = false) => {
    if (!detail) return;
    setBusy(true);
    setProblem(null);
    try {
      const next = close ? await support.close(detail.id) : await support.reply(detail.id, answer);
      setDetail(next);
      if (!close) setAnswer('');
      setTickets((list) =>
        (list ?? []).map((ticket) => (ticket.id === next.id ? { ...ticket, status: next.status, updatedAt: next.updatedAt } : ticket))
      );
    } catch (error) {
      setProblem(errorText(error, t.failed));
    } finally {
      setBusy(false);
    }
  };

  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && answer.trim() && !busy) {
      event.preventDefault();
      void send();
    }
  };

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
      <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {t.title}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', textWrap: 'pretty' }}>
          {fill(t.intro)}
        </Typography>
      </Box>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => setView({ kind: 'new' })} sx={{ flex: 'none' }}>
        {t.create}
      </Button>
    </Box>
  );

  if (view.kind === 'new') {
    const ready = subject.trim().length >= 3 && message.trim().length >= 10;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Button startIcon={<BackIcon />} onClick={back} sx={{ ml: -1 }} disabled={busy}>
            {t.back}
          </Button>
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {t.create}
        </Typography>
        <Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75 }}>
            {t.topic}
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={category}
            onChange={(_event, next: TicketCategory | null) => next && setCategory(next)}
            aria-label={t.topic}
            sx={{ flexWrap: 'wrap' }}
          >
            {(Object.keys(t.category) as TicketCategory[]).map((key) => (
              <ToggleButton key={key} value={key} sx={{ px: 2 }}>
                {t.category[key]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        <TextField
          label={t.subject}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          required
          slotProps={{ htmlInput: { maxLength: 120 } }}
        />
        <TextField
          label={t.message}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          required
          multiline
          minRows={5}
          maxRows={16}
          helperText={t.messageHint}
          slotProps={{ htmlInput: { maxLength: 5000 } }}
        />
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label={t.name}
            value={name}
            onChange={(event) => setName(event.target.value)}
            sx={{ flex: '1 1 200px' }}
            slotProps={{ htmlInput: { maxLength: 80, autoComplete: 'name' } }}
          />
          <TextField
            label={t.email}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            helperText={fill(t.emailHint)}
            sx={{ flex: '1 1 240px' }}
            slotProps={{ htmlInput: { maxLength: 200, autoComplete: 'email' } }}
          />
        </Box>
        <FormControlLabel
          control={<Checkbox checked={attach} onChange={(event) => setAttach(event.target.checked)} />}
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {t.diagnostics}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t.diagnosticsHint}
              </Typography>
            </Box>
          }
          sx={{ m: 0, gap: 0.5, alignItems: 'flex-start', '& .MuiCheckbox-root': { mt: -0.5 } }}
        />
        {problem && <Alert severity="error">{problem}</Alert>}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', flex: '1 1 240px' }}>
            {fill(privacy ?? t.privacy)}
          </Typography>
          <Button
            variant="contained"
            onClick={create}
            disabled={!ready || busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
          >
            {busy ? t.sending : t.send}
          </Button>
        </Box>
      </Box>
    );
  }

  if (view.kind === 'ticket') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Button startIcon={<BackIcon />} onClick={back} sx={{ ml: -1 }}>
            {t.back}
          </Button>
        </Box>
        {!detail ? (
          problem ? (
            <Alert
              severity="error"
              action={
                <Button color="inherit" onClick={() => void loadTicket(view.id)}>
                  {t.retry}
                </Button>
              }
            >
              {problem}
            </Alert>
          ) : (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          )
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                  {detail.subject}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  #{detail.number} · {t.category[detail.category]} · {time(detail.createdAt)}
                </Typography>
              </Box>
              <Chip size="small" color={STATUS_COLOR[detail.status]} label={t.status[detail.status]} />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }} aria-live="polite">
              {detail.messages.map((entry) => (
                <Bubble key={entry.id} message={entry} you={t.you} developer={developer} time={time} />
              ))}
            </Box>
            {detail.status === 'closed' && <Alert severity="info">{t.reopen}</Alert>}
            {problem && <Alert severity="error">{problem}</Alert>}
            <TextField
              label={t.reply}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={keys}
              multiline
              minRows={3}
              maxRows={12}
              helperText={t.keys}
              slotProps={{ htmlInput: { maxLength: 5000 } }}
            />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {detail.status !== 'closed' && (
                <Button onClick={() => send(true)} disabled={busy}>
                  {t.close}
                </Button>
              )}
              <Button
                variant="contained"
                onClick={() => send()}
                disabled={!answer.trim() || busy}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
              >
                {t.answer}
              </Button>
            </Box>
          </>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {header}
      {problem && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => void loadList()}>
              {t.retry}
            </Button>
          }
        >
          {problem}
        </Alert>
      )}
      {!tickets && !problem && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {tickets && tickets.length === 0 && (
        <Box sx={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 0.75, py: 4, color: 'text.secondary' }}>
          <ChatIcon sx={{ fontSize: 40, opacity: 0.6 }} />
          <Typography variant="subtitle2" sx={{ color: 'text.primary' }}>
            {t.empty}
          </Typography>
          <Typography variant="body2">{t.emptyHint}</Typography>
        </Box>
      )}
      {tickets && tickets.length > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {tickets.map((ticket) => (
            <Box component="li" key={ticket.id}>
              <ButtonBase
                onClick={() => open(ticket.id)}
                aria-label={`${ticket.unread ? `${t.unread}: ` : ''}${ticket.subject}`}
                sx={{
                  width: '100%',
                  textAlign: 'left',
                  justifyContent: 'stretch',
                  borderRadius: '12px',
                  px: 1.5,
                  py: 1.25,
                  gap: 1.5,
                  '&:hover': { bgcolor: 'action.hover' },
                  '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                }}
              >
                <Badge color="primary" variant="dot" invisible={!ticket.unread} sx={{ flex: 'none' }}>
                  <ChatIcon sx={{ color: ticket.unread ? 'primary.main' : 'text.secondary' }} />
                </Badge>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: ticket.unread ? 800 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {ticket.subject}
                  </Typography>
                  <Typography
                    variant="caption"
                    component="div"
                    sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {ticket.unread ? `${t.unread} · ` : ''}
                    {ticket.last
                      ? `${ticket.last.author === 'developer' ? `${developer}: ` : ''}${ticket.last.body}`
                      : time(ticket.createdAt)}
                  </Typography>
                </Box>
                <Box sx={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                  <Chip size="small" color={STATUS_COLOR[ticket.status]} label={t.status[ticket.status]} />
                  <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                    #{ticket.number}
                  </Typography>
                </Box>
              </ButtonBase>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
