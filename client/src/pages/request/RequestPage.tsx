import { useCallback, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import MoveToInboxRounded from '@mui/icons-material/MoveToInboxRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import { readBoot } from '../../lib/boot';
import type { PublicRequest, RequestBoot, RequestTypes } from '../../lib/types';
import { ApiError, errorMessage, fetchPublicRequest, unlockRequest, uploadToRequest } from '../../lib/api';
import { formatBytes, formatDate } from '../../lib/format';
import { AmbientBackdrop } from '../../components/Ambient';
import { BrandMark } from '../../components/BrandMark';
import { PasswordField } from '../../components/PasswordField';
import { SiteFooter } from '../../components/SiteFooter';
import { ThemeToggleButton } from '../../components/ThemeToggle';
import { UserAvatar } from '../../components/UserAvatar';
import { mix } from '../../lib/color';
import { c, ease, radius } from '../../theme/tokens';
import { t, tn } from '../../lib/i18n';

const DOCUMENTS = [
  '.pdf',
  '.txt',
  '.md',
  '.rtf',
  '.doc',
  '.docx',
  '.odt',
  '.xls',
  '.xlsx',
  '.ods',
  '.csv',
  '.ppt',
  '.pptx',
  '.odp',
  '.zip',
  '.7z',
  '.rar',
];

const ACCEPT: Record<RequestTypes, string | undefined> = {
  any: undefined,
  images: 'image/*',
  videos: 'video/*',
  media: 'image/*,video/*,audio/*',
  documents: [...DOCUMENTS, 'text/*'].join(','),
};

const TYPE_HINT: Record<RequestTypes, string> = {
  any: t('Alle Arten von Dateien'),
  images: t('Nur Bilder'),
  videos: t('Nur Videos'),
  media: t('Bilder, Videos und Audio'),
  documents: t('Dokumente und Archive'),
};

function matches(types: RequestTypes, file: File) {
  const type = file.type || '';
  const ext = /\.[^.]+$/.exec(file.name.toLowerCase())?.[0] || '';
  switch (types) {
    case 'images':
      return type.startsWith('image/');
    case 'videos':
      return type.startsWith('video/');
    case 'media':
      return type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/');
    case 'documents':
      return DOCUMENTS.includes(ext) || type.startsWith('text/');
    default:
      return true;
  }
}

type ItemState = 'waiting' | 'uploading' | 'done' | 'error';

interface QueueItem {
  id: number;
  file: File;
  state: ItemState;
  progress: number;
  error: string;
}

const CLOSED_TEXT: Record<string, string> = {
  closed: t('Diese Anfrage nimmt keine Dateien mehr an.'),
  expired: t('Diese Anfrage ist abgelaufen.'),
  full: t('Diese Anfrage hat schon alle Dateien bekommen, die sie annimmt.'),
};

function Unlock({ code, onUnlocked }: { code: string; onUnlocked: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await unlockRequest(code, password);
      onUnlocked();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2, mt: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
        <LockOutlined fontSize="small" />
        <Typography variant="body2">{t('Diese Anfrage ist mit einem Passwort geschützt.')}</Typography>
      </Box>
      <PasswordField
        label={t('Passwort')}
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        autoFocus
        error={!!error}
        helperText={error || ' '}
      />
      <Box>
        <Button type="submit" variant="contained" disabled={busy || !password}>
          {t('Entsperren')}
        </Button>
      </Box>
    </Box>
  );
}

function QueueRow({ item, onRetry, onRemove }: { item: QueueItem; onRetry: () => void; onRemove: () => void }) {
  return (
    <m.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: ease.emphasizedDecelerate }}
      style={{ listStyle: 'none' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25 }}>
        <Box sx={{ display: 'flex', color: item.state === 'done' ? c.success : item.state === 'error' ? c.error : c.onSurfaceVariant }}>
          {item.state === 'done' ? (
            <CheckCircleRounded />
          ) : item.state === 'error' ? (
            <ErrorOutlineRounded />
          ) : item.state === 'uploading' ? (
            <CircularProgress size={22} variant="determinate" value={Math.max(4, item.progress * 100)} />
          ) : (
            <CloudUploadRounded />
          )}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {item.file.name}
          </Typography>
          {item.state === 'uploading' ? (
            <LinearProgress
              variant="determinate"
              value={item.progress * 100}
              sx={{ mt: 0.75, height: 4, borderRadius: `${radius.full}px` }}
            />
          ) : (
            <Typography variant="caption" sx={{ color: item.state === 'error' ? c.error : 'text.secondary' }}>
              {item.state === 'error'
                ? item.error
                : item.state === 'done'
                  ? t('Angekommen, {size}', { size: formatBytes(item.file.size) })
                  : formatBytes(item.file.size)}
            </Typography>
          )}
        </Box>
        {item.state === 'error' && (
          <Tooltip title={t('Erneut versuchen')}>
            <IconButton size="small" onClick={onRetry} aria-label={t('Erneut versuchen')}>
              <ReplayRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {(item.state === 'waiting' || item.state === 'error') && (
          <Tooltip title={t('Entfernen')}>
            <IconButton size="small" onClick={onRemove} aria-label={t('Entfernen')}>
              <CloseRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </m.li>
  );
}

function Uploader({ info, onChanged }: { info: PublicRequest; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const running = useRef(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [nameError, setNameError] = useState('');
  const [dragging, setDragging] = useState(false);
  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;

  const patch = (id: number, next: Partial<QueueItem>) =>
    setQueue((list) => list.map((item) => (item.id === id ? { ...item, ...next } : item)));

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const next = queueRef.current.find((item) => item.state === 'waiting');
        if (!next) break;
        patch(next.id, { state: 'uploading', progress: 0 });
        queueRef.current = queueRef.current.map((item) => (item.id === next.id ? { ...item, state: 'uploading' } : item));
        try {
          await uploadToRequest(info.code, next.file, { name: name.trim(), note: note.trim() }, (progress) => patch(next.id, { progress }))
            .promise;
          patch(next.id, { state: 'done', progress: 1 });
        } catch (failure) {
          const message = errorMessage(failure);
          patch(next.id, { state: 'error', error: message });
          if (failure instanceof ApiError && ['closed', 'expired', 'full', 'locked'].includes(failure.code)) {
            setQueue((list) => list.map((item) => (item.state === 'waiting' ? { ...item, state: 'error', error: message } : item)));
            queueRef.current = queueRef.current.map((item) =>
              item.state === 'waiting' ? { ...item, state: 'error', error: message } : item
            );
            break;
          }
        }
      }
    } finally {
      running.current = false;
      onChanged();
    }
  }, [info.code, name, note, onChanged]);

  const add = (files: FileList | File[]) => {
    if (info.askName && !name.trim()) {
      setNameError(t('Bitte gib zuerst deinen Namen an.'));
      return;
    }
    const items: QueueItem[] = Array.from(files).map((file) => {
      counter.current += 1;
      const wrongType = !matches(info.types, file);
      const tooBig = info.maxFileBytes !== null && file.size > info.maxFileBytes;
      return {
        id: counter.current,
        file,
        state: wrongType || tooBig ? 'error' : 'waiting',
        progress: 0,
        error: wrongType
          ? t('Diese Art von Datei nimmt die Anfrage nicht an.')
          : tooBig
            ? t('Zu groß. Erlaubt sind höchstens {size}.', { size: formatBytes(info.maxFileBytes || 0) })
            : '',
      };
    });
    queueRef.current = [...queueRef.current, ...items];
    setQueue(queueRef.current);
    window.setTimeout(run, 0);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) add(event.dataTransfer.files);
  };

  const done = queue.filter((item) => item.state === 'done').length;
  const busy = queue.some((item) => item.state === 'uploading' || item.state === 'waiting');

  return (
    <Box sx={{ display: 'grid', gap: 2.5, mt: 3 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField
          label={info.askName ? t('Dein Name') : t('Dein Name (optional)')}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (nameError) setNameError('');
          }}
          required={info.askName}
          error={!!nameError}
          helperText={nameError || ' '}
          autoComplete="name"
          disabled={busy}
          slotProps={{ htmlInput: { maxLength: 80 } }}
        />
        <TextField
          label={t('Notiz (optional)')}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          helperText=" "
          disabled={busy}
          slotProps={{ htmlInput: { maxLength: 300 } }}
        />
      </Box>
      <ButtonBase
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        sx={{
          display: 'grid',
          placeItems: 'center',
          gap: 1,
          p: { xs: 3, sm: 5 },
          borderRadius: `${radius.xl}px`,
          border: `2px dashed ${dragging ? c.primary : c.outline}`,
          bgcolor: dragging ? mix(c.primaryContainer, 60) : mix(c.surfaceContainerHigh, 70),
          transition: 'background-color 150ms, border-color 150ms',
          textAlign: 'center',
          width: '100%',
        }}
      >
        <CloudUploadRounded sx={{ fontSize: 44, color: c.primary }} />
        <Typography sx={{ fontWeight: 700, fontSize: '1.0625rem' }}>{t('Dateien hierher ziehen oder auswählen')}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {[
            TYPE_HINT[info.types],
            info.maxFileBytes ? t('je bis {size}', { size: formatBytes(info.maxFileBytes) }) : null,
            info.filesLeft !== null ? tn(info.filesLeft, 'noch 1 Datei', 'noch {count} Dateien') : null,
          ]
            .filter(Boolean)
            .join(', ')}
        </Typography>
      </ButtonBase>
      <input
        ref={input}
        type="file"
        multiple={info.filesLeft === null || info.filesLeft > 1}
        accept={ACCEPT[info.types]}
        hidden
        onChange={(event) => {
          if (event.target.files?.length) add(event.target.files);
          event.target.value = '';
        }}
      />
      {queue.length > 0 && (
        <Box component="ul" sx={{ m: 0, p: 0 }} aria-live="polite">
          <AnimatePresence initial={false}>
            {queue.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                onRetry={() => {
                  queueRef.current = queueRef.current.map((entry) =>
                    entry.id === item.id ? { ...entry, state: 'waiting', error: '' } : entry
                  );
                  setQueue(queueRef.current);
                  window.setTimeout(run, 0);
                }}
                onRemove={() => {
                  queueRef.current = queueRef.current.filter((entry) => entry.id !== item.id);
                  setQueue(queueRef.current);
                }}
              />
            ))}
          </AnimatePresence>
        </Box>
      )}
      {done > 0 && !busy && (
        <Alert severity="success" icon={<CheckCircleRounded />}>
          {tn(done, 'Fertig. {owner} hat deine Datei bekommen.', 'Fertig. {owner} hat deine {count} Dateien bekommen.', {
            owner: info.owner.name,
          })}
        </Alert>
      )}
    </Box>
  );
}

export function RequestPage() {
  const boot = readBoot<RequestBoot>();
  const { site } = boot;
  const [info, setInfo] = useState<PublicRequest>(boot.request);

  const refresh = useCallback(() => {
    fetchPublicRequest(info.code)
      .then((result) => setInfo(result.request))
      .catch(() => {});
  }, [info.code]);

  const closed = info.state !== 'open';

  return (
    <Box sx={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AmbientBackdrop src={info.owner.avatar} color={c.primary} strength={0.6} />
      <Box
        component="header"
        sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 2, md: 3 }, height: 64 }}
      >
        <BrandMark src={site.favicon} title={site.title} size={34} />
        <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>
          {site.title}
        </Typography>
        <ThemeToggleButton />
      </Box>
      <Box component="main" sx={{ position: 'relative', zIndex: 1, flex: 1, px: 2, pt: { xs: 2, md: 6 }, pb: 8 }}>
        <m.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: ease.emphasizedDecelerate }}
          style={{ maxWidth: 640, margin: '0 auto' }}
          aria-labelledby="request-title"
        >
          <Box
            sx={{
              p: { xs: 2.5, sm: 4 },
              borderRadius: `${radius.xl}px`,
              bgcolor: mix(c.surfaceContainerLow, 88),
              border: `1px solid ${mix(c.outlineVariant, 60)}`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <UserAvatar name={info.owner.name} src={info.owner.avatar} size={44} />
              <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                {t('{owner} bittet dich um Dateien', { owner: info.owner.name })}
              </Typography>
            </Box>
            <Typography
              id="request-title"
              variant="h3"
              component="h1"
              sx={{ fontSize: { xs: '1.75rem', sm: '2.25rem' }, mt: 2.5, overflowWrap: 'anywhere' }}
            >
              {info.title}
            </Typography>
            {info.message && (
              <Typography variant="body1" sx={{ mt: 1.5, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                {info.message}
              </Typography>
            )}
            {info.expiresAt && !closed && (
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
                {t('Offen bis {date}', { date: formatDate(new Date(info.expiresAt)) })}
              </Typography>
            )}
            {closed ? (
              <Alert severity="info" icon={<MoveToInboxRounded />} sx={{ mt: 3 }}>
                {CLOSED_TEXT[info.state] || CLOSED_TEXT.closed}
              </Alert>
            ) : info.password && !info.unlocked ? (
              <Unlock code={info.code} onUnlocked={refresh} />
            ) : (
              <Uploader info={info} onChanged={refresh} />
            )}
          </Box>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 2, textAlign: 'center' }}>
            {t('Deine Dateien sieht nur {owner}. Du brauchst kein Konto.', { owner: info.owner.name })}
          </Typography>
        </m.section>
      </Box>
      <SiteFooter site={site} report sx={{ position: 'relative', zIndex: 1, px: 2, pb: 3 }} />
    </Box>
  );
}
