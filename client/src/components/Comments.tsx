import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import type { CommentItem, CommentList } from '../lib/types';
import { ApiError, deleteComment, errorMessage, fetchComments, hideComment, postComment } from '../lib/api';
import { formatDateTime, relativeMs } from '../lib/format';
import { mix } from '../lib/color';
import { rich, t, tn } from '../lib/i18n';
import { useToast } from './Toaster';
import { UserAvatar } from './UserAvatar';
import { c, ease, radius } from '../theme/tokens';

const MAX_BODY = 2000;
const TOKEN_KEY = 'ms-comment-tokens';
const TOKEN_MS = 24 * 60 * 60 * 1000;
const URL = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]|www\.[^\s<>()]+[^\s<>().,;:!?'"])/g;

type Tokens = Record<string, { token: string; at: number }>;

function readTokens(): Tokens {
  try {
    const raw = JSON.parse(window.localStorage.getItem(TOKEN_KEY) || '{}') as Tokens;
    const now = Date.now();
    return Object.fromEntries(Object.entries(raw).filter(([, entry]) => entry && now - entry.at < TOKEN_MS));
  } catch {
    return {};
  }
}

function writeTokens(tokens: Tokens) {
  try {
    window.localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  } catch {}
}

function Body({ text }: { text: string }) {
  const parts = text.split(URL);
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>;
        const href = part.startsWith('http') ? part : `https://${part}`;
        return (
          <Link
            key={index}
            href={href}
            target="_blank"
            rel="nofollow ugc noopener noreferrer"
            underline="always"
            sx={{ wordBreak: 'break-all' }}
          >
            {part}
          </Link>
        );
      })}
    </>
  );
}

const SAMPLE: CommentItem[] = [
  {
    id: -1,
    body: t('Wunderschön! Wo ist das entstanden?'),
    name: 'Mia',
    username: null,
    avatar: null,
    guest: true,
    byOwner: false,
    createdAt: Date.now() - 3 * 60 * 60 * 1000,
    hidden: false,
    mine: false,
    deletable: false,
  },
  {
    id: -2,
    body: t('Danke! Am Abend am See, kurz vor dem Regen.'),
    name: t('Du'),
    username: null,
    avatar: null,
    guest: false,
    byOwner: true,
    createdAt: Date.now() - 40 * 60 * 1000,
    hidden: false,
    mine: false,
    deletable: false,
  },
];

function Row({
  comment,
  moderate,
  removable,
  onHide,
  onRemove,
}: {
  comment: CommentItem;
  moderate: boolean;
  removable: boolean;
  onHide: (hidden: boolean) => void;
  onRemove: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const actions = moderate || removable;
  return (
    <m.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.24, ease: ease.emphasizedDecelerate }}
      style={{ listStyle: 'none' }}
    >
      <Box sx={{ display: 'flex', gap: 1.5, py: 1.5, opacity: comment.hidden ? 0.6 : 1 }}>
        <UserAvatar name={comment.name || '?'} src={comment.avatar} size={36} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
              {comment.name}
            </Typography>
            {comment.byOwner && (
              <Chip
                size="small"
                label={t('Besitzer')}
                sx={{ height: 20, fontSize: '0.6875rem', bgcolor: c.secondaryContainer, color: c.onSecondaryContainer }}
              />
            )}
            {comment.guest && !comment.byOwner && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t('Gast')}
              </Typography>
            )}
            <Typography variant="caption" sx={{ color: 'text.secondary' }} title={formatDateTime(new Date(comment.createdAt))}>
              {relativeMs(comment.createdAt)}
            </Typography>
            {comment.hidden && (
              <Typography variant="caption" sx={{ color: c.tertiary, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <VisibilityOffOutlined sx={{ fontSize: 14 }} />
                {t('Ausgeblendet')}
              </Typography>
            )}
          </Box>
          <Typography variant="body2" sx={{ mt: 0.25, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            <Body text={comment.body} />
          </Typography>
        </Box>
        {actions && (
          <>
            <IconButton
              size="small"
              aria-label={t('Aktionen für den Kommentar von {name}', { name: comment.name })}
              aria-haspopup="menu"
              onClick={(event) => setAnchor(event.currentTarget)}
              sx={{ alignSelf: 'flex-start' }}
            >
              <MoreVertRounded fontSize="small" />
            </IconButton>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} slotProps={{ root: { sx: { zIndex: 1600 } } }}>
              {moderate && (
                <MenuItem
                  onClick={() => {
                    setAnchor(null);
                    onHide(!comment.hidden);
                  }}
                >
                  <ListItemIcon>
                    {comment.hidden ? <VisibilityOutlined fontSize="small" /> : <VisibilityOffOutlined fontSize="small" />}
                  </ListItemIcon>
                  {comment.hidden ? t('Wieder zeigen') : t('Ausblenden')}
                </MenuItem>
              )}
              <MenuItem
                onClick={() => {
                  setAnchor(null);
                  onRemove();
                }}
              >
                <ListItemIcon>
                  <DeleteOutlineRounded fontSize="small" />
                </ListItemIcon>
                {t('Löschen')}
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>
    </m.li>
  );
}

export function Comments({
  base,
  sample = false,
  title = true,
  onTotal,
  header,
}: {
  base: string;
  sample?: boolean;
  title?: boolean;
  onTotal?: (total: number) => void;
  header?: ReactNode;
}) {
  const toast = useToast();
  const [data, setData] = useState<CommentList | null>(null);
  const [failed, setFailed] = useState('');
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [older, setOlder] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [tokens, setTokens] = useState<Tokens>(() => (sample ? {} : readTokens()));
  const onTotalRef = useRef(onTotal);
  onTotalRef.current = onTotal;

  useEffect(() => {
    if (sample) {
      setData({
        enabled: true,
        canPost: false,
        needsName: false,
        signInToPost: false,
        moderate: false,
        owner: false,
        admin: false,
        comments: SAMPLE,
        more: false,
        total: SAMPLE.length,
      });
      return;
    }
    let alive = true;
    fetchComments(base)
      .then((result) => {
        if (!alive) return;
        setData(result);
        onTotalRef.current?.(result.total);
      })
      .catch((failure) => alive && setFailed(errorMessage(failure)));
    return () => {
      alive = false;
    };
  }, [base, sample]);

  if (failed) return <Alert severity="warning">{failed}</Alert>;
  if (!data) {
    return (
      <Box sx={{ display: 'grid', gap: 1 }}>
        <Skeleton variant="text" width={140} />
        <Skeleton variant="rounded" height={56} />
      </Box>
    );
  }
  if (!data.enabled) return null;

  const update = (next: Partial<CommentList>) => {
    setData((current) => (current ? { ...current, ...next } : current));
    if (next.total !== undefined) onTotalRef.current?.(next.total);
  };

  const loadOlder = async () => {
    const first = data.comments[0];
    if (!first) return;
    setOlder(true);
    try {
      const result = await fetchComments(base, first.id);
      setData((current) => (current ? { ...current, comments: [...result.comments, ...current.comments], more: result.more } : current));
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setOlder(false);
    }
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    setFieldError(null);
    try {
      const result = await postComment(base, { body, name: data.needsName ? name : undefined, website });
      setBody('');
      update({ comments: [...data.comments, result.comment], total: result.total });
      if (result.token) {
        const next = { ...readTokens(), [String(result.comment.id)]: { token: result.token, at: Date.now() } };
        writeTokens(next);
        setTokens(next);
      }
    } catch (failure) {
      if (failure instanceof ApiError && (failure.field === 'body' || failure.field === 'name')) {
        setFieldError({ field: failure.field, message: failure.message });
      } else toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const hide = async (comment: CommentItem, hidden: boolean) => {
    try {
      const result = await hideComment(comment.id, hidden);
      const list = data.comments.map((entry) => (entry.id === comment.id ? { ...entry, hidden: result.comment.hidden } : entry));
      const visible = data.total + (hidden ? -1 : 1);
      update({ comments: list, total: Math.max(0, visible) });
      toast(hidden ? t('Kommentar ausgeblendet') : t('Kommentar wieder sichtbar'), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const remove = async (comment: CommentItem) => {
    try {
      const stored = tokens[String(comment.id)];
      await deleteComment(comment.id, stored ? stored.token : null);
      update({
        comments: data.comments.filter((entry) => entry.id !== comment.id),
        total: comment.hidden ? data.total : Math.max(0, data.total - 1),
      });
      if (stored) {
        const next = { ...tokens };
        delete next[String(comment.id)];
        writeTokens(next);
        setTokens(next);
      }
      toast(t('Kommentar gelöscht'), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const errorFor = (field: string) => (fieldError && fieldError.field === field ? fieldError.message : '');
  const signIn = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;

  return (
    <Box component="section" aria-labelledby="comments-title" className="ms-comments" sx={{ display: 'grid', gap: 1 }}>
      {title && (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography id="comments-title" variant="h6" component="h2">
            {t('Kommentare')}
          </Typography>
          {data.total > 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {data.total}
            </Typography>
          )}
        </Box>
      )}
      {header}
      {data.more && (
        <Box>
          <Button size="small" onClick={loadOlder} disabled={older} startIcon={older ? <CircularProgress size={14} /> : undefined}>
            {t('Ältere Kommentare laden')}
          </Button>
        </Box>
      )}
      {data.comments.length > 0 ? (
        <Box component="ul" sx={{ m: 0, p: 0, '& > li + li': { borderTop: `1px solid ${mix(c.outlineVariant, 70)}` } }} aria-live="polite">
          <AnimatePresence initial={false}>
            {data.comments.map((comment) => (
              <Row
                key={comment.id}
                comment={comment}
                moderate={data.moderate}
                removable={
                  !sample && (comment.mine || comment.deletable || data.moderate || Boolean(comment.guest && tokens[String(comment.id)]))
                }
                onHide={(hidden) => void hide(comment, hidden)}
                onRemove={() => void remove(comment)}
              />
            ))}
          </AnimatePresence>
        </Box>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {data.canPost ? t('Noch keine Kommentare. Schreib den ersten.') : t('Noch keine Kommentare.')}
        </Typography>
      )}
      {data.canPost && (
        <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 1.25, mt: 1, position: 'relative' }}>
          {data.needsName && (
            <TextField
              size="small"
              label={t('Dein Name')}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (fieldError?.field === 'name') setFieldError(null);
              }}
              error={Boolean(errorFor('name'))}
              helperText={errorFor('name') || undefined}
              autoComplete="nickname"
              slotProps={{ htmlInput: { maxLength: 60 } }}
              sx={{ maxWidth: 320 }}
            />
          )}
          <Box
            component="input"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            value={website}
            onChange={(event) => setWebsite((event.target as HTMLInputElement).value)}
            sx={{ position: 'absolute', left: '-10000px', width: 1, height: 1, opacity: 0 }}
          />
          <TextField
            label={t('Kommentar')}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              if (fieldError?.field === 'body') setFieldError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void submit();
            }}
            multiline
            minRows={2}
            maxRows={8}
            fullWidth
            error={Boolean(errorFor('body'))}
            helperText={
              errorFor('body') ||
              (body.length > MAX_BODY - 200 ? t('{count} von {max} Zeichen', { count: body.length, max: MAX_BODY }) : ' ')
            }
            slotProps={{ htmlInput: { maxLength: MAX_BODY } }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Button
              type="submit"
              variant="contained"
              disabled={busy || !body.trim() || (data.needsName && !name.trim())}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
            >
              {t('Senden')}
            </Button>
            {data.needsName && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t('Löschen kannst du deinen Kommentar 24 Stunden lang in diesem Browser.')}
              </Typography>
            )}
          </Box>
        </Box>
      )}
      {data.signInToPost && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {rich('{link}, um zu kommentieren.', {
            link: (
              <Link href={signIn} underline="hover">
                {t('Melde dich an')}
              </Link>
            ),
          })}
        </Typography>
      )}
      {data.moderate && data.comments.some((comment) => comment.hidden) && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {tn(
            data.comments.filter((comment) => comment.hidden).length,
            'Einen ausgeblendeten Kommentar siehst nur du.',
            '{count} ausgeblendete Kommentare siehst nur du.'
          )}
        </Typography>
      )}
    </Box>
  );
}

export function CommentsCard({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Box
      sx={{
        p: { xs: 2, sm: 3 },
        borderRadius: `${radius.xl}px`,
        bgcolor: mix(c.surfaceContainerLow, 86),
        backdropFilter: 'blur(24px) saturate(1.2)',
        border: `1px solid ${mix(c.outlineVariant, 55)}`,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
