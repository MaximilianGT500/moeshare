import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import BlockRounded from '@mui/icons-material/BlockRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CollectionsOutlined from '@mui/icons-material/CollectionsOutlined';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import InsertLinkRounded from '@mui/icons-material/InsertLinkRounded';
import LockOpenRounded from '@mui/icons-material/LockOpenRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PersonOffOutlined from '@mui/icons-material/PersonOffOutlined';
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded';
import type { ReportEntry, ReportKind, ReportList } from '../../lib/types';
import { errorMessage, fetchReports, resolveReport } from '../../lib/api';
import { formatDateTime, formatNumber, relativeMs } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { reasonLabel } from '../../components/ReportDialog';
import { isCancelled, useSudo } from '../../components/Sudo';
import { useToast } from '../../components/Toaster';
import { GrowTransition } from '../../components/transitions';
import { c, ease, radius } from '../../theme/tokens';

type Action = 'dismiss' | 'block' | 'unblock' | 'delete' | 'suspend';

const KIND_ICONS: Record<ReportKind, ReactElement> = {
  file: <InsertDriveFileOutlined />,
  album: <CollectionsOutlined />,
  link: <InsertLinkRounded />,
  profile: <PersonOutlineRounded />,
};

const kindLabel = (kind: ReportKind) => ({ file: t('Datei'), album: t('Album'), link: t('Kurzlink'), profile: t('Profil') })[kind];

const actionDone = (action: string | null) =>
  ({
    dismiss: t('Verworfen'),
    block: t('Inhalt gesperrt'),
    unblock: t('Entsperrt'),
    delete: t('Gelöscht'),
    suspend: t('Konto gesperrt'),
  })[action || ''] || t('Erledigt');

const DIALOG: Record<Exclude<Action, 'dismiss'>, { title: () => string; text: () => string; confirm: () => string; note: boolean }> = {
  block: {
    title: () => t('Inhalt sperren?'),
    text: () => t('Besucher sehen den Inhalt nicht mehr. Der Besitzer sieht ihn weiter und erfährt den Grund.'),
    confirm: () => t('Inhalt sperren'),
    note: true,
  },
  unblock: {
    title: () => t('Sperre aufheben?'),
    text: () => t('Der Inhalt ist danach wieder öffentlich erreichbar.'),
    confirm: () => t('Sperre aufheben'),
    note: false,
  },
  delete: {
    title: () => t('Inhalt endgültig löschen?'),
    text: () => t('Der Inhalt wird sofort gelöscht, ohne Papierkorb. Das lässt sich nicht rückgängig machen.'),
    confirm: () => t('Endgültig löschen'),
    note: false,
  },
  suspend: {
    title: () => t('Konto des Besitzers sperren?'),
    text: () => t('Der Besitzer wird abgemeldet und kann sich nicht mehr anmelden. Seine Inhalte bleiben gespeichert.'),
    confirm: () => t('Konto sperren'),
    note: true,
  },
};

function ReportCard({ report, busy, onAction }: { report: ReportEntry; busy: boolean; onAction: (action: Action) => void }) {
  const details = report.details;
  const open = report.status === 'open';
  return (
    <Box sx={{ display: 'flex', gap: 2, p: { xs: 2, sm: 2.5 }, borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainerLow }}>
      <Box
        sx={{
          width: 72,
          height: 72,
          flexShrink: 0,
          borderRadius: `${radius.md}px`,
          overflow: 'hidden',
          display: { xs: 'none', sm: 'grid' },
          placeItems: 'center',
          bgcolor: c.surfaceContainerHighest,
          color: c.onSurfaceVariant,
          '& svg': { fontSize: 30 },
        }}
      >
        {details.preview ? (
          <Box
            component="img"
            src={details.preview}
            alt=""
            loading="lazy"
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: details.blocked ? 'blur(6px) grayscale(0.4)' : 'blur(3px)',
              transition: 'filter 200ms',
              '&:hover': { filter: 'none' },
            }}
          />
        ) : (
          KIND_ICONS[report.kind]
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip size="small" icon={KIND_ICONS[report.kind]} label={kindLabel(report.kind)} sx={{ '& .MuiChip-icon': { fontSize: 16 } }} />
          <Chip
            size="small"
            icon={<FlagOutlined />}
            label={reasonLabel(report.reason)}
            sx={{ bgcolor: c.errorContainer, color: c.onErrorContainer, '& .MuiChip-icon': { color: 'inherit', fontSize: 16 } }}
          />
          {details.blocked && <Chip size="small" icon={<BlockRounded />} label={t('Inhalt gesperrt')} variant="outlined" />}
          {details.deleted && <Chip size="small" label={t('Im Papierkorb')} variant="outlined" />}
          {!details.exists && <Chip size="small" label={t('Gibt es nicht mehr')} variant="outlined" />}
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1, wordBreak: 'break-word' }}>
          {details.exists && details.url ? (
            <Link
              href={details.url}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
            >
              {details.label || report.target}
              <OpenInNewRounded sx={{ fontSize: 16 }} />
            </Link>
          ) : (
            details.label || report.target
          )}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {[
            details.owner ? t('von {owner}', { owner: details.owner }) : null,
            t('gemeldet {when}', { when: relativeMs(report.createdAt) }),
            open && report.similar > 1
              ? tn(report.similar, '1 offene Meldung zu diesem Inhalt', '{count} offene Meldungen zu diesem Inhalt')
              : null,
          ]
            .filter(Boolean)
            .join(', ')}
        </Typography>
        {details.destination && (
          <Typography variant="body2" sx={{ color: 'text.secondary', wordBreak: 'break-all', mt: 0.5 }}>
            {t('Ziel: {url}', { url: details.destination })}
          </Typography>
        )}
        {report.message && (
          <Typography
            variant="body2"
            component="blockquote"
            sx={{ m: 0, mt: 1.25, pl: 1.5, borderLeft: `3px solid ${c.outlineVariant}`, whiteSpace: 'pre-line', wordBreak: 'break-word' }}
          >
            {report.message}
          </Typography>
        )}
        {report.contact && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            {t('Kontakt:')}{' '}
            {/^[^\s@]+@[^\s@]+$/.test(report.contact) ? (
              <Link href={`mailto:${report.contact}`} underline="hover">
                {report.contact}
              </Link>
            ) : (
              report.contact
            )}
          </Typography>
        )}
        {!open && (
          <Typography
            variant="body2"
            sx={{ mt: 1.25, color: 'text.secondary' }}
            title={report.resolvedAt ? formatDateTime(new Date(report.resolvedAt)) : undefined}
          >
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {actionDone(report.action)}
            </Box>
            {report.resolvedAt ? `, ${relativeMs(report.resolvedAt)}` : ''}
            {report.note ? `: ${report.note}` : ''}
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
          {open && (
            <Button size="small" variant="tonal" onClick={() => onAction('dismiss')} disabled={busy} startIcon={<CheckRounded />}>
              {t('Verwerfen')}
            </Button>
          )}
          {open && details.exists && !details.blocked && (
            <Button size="small" variant="contained" onClick={() => onAction('block')} disabled={busy} startIcon={<BlockRounded />}>
              {t('Inhalt sperren')}
            </Button>
          )}
          {details.exists && details.blocked && (
            <Button size="small" onClick={() => onAction('unblock')} disabled={busy} startIcon={<LockOpenRounded />}>
              {t('Sperre aufheben')}
            </Button>
          )}
          {open && details.exists && report.kind !== 'profile' && (
            <Button size="small" color="error" onClick={() => onAction('delete')} disabled={busy} startIcon={<DeleteOutlineRounded />}>
              {t('Löschen')}
            </Button>
          )}
          {open && details.owner && (
            <Button size="small" color="error" onClick={() => onAction('suspend')} disabled={busy} startIcon={<PersonOffOutlined />}>
              {t('Konto sperren')}
            </Button>
          )}
          {busy && <CircularProgress size={20} sx={{ alignSelf: 'center' }} />}
        </Box>
      </Box>
    </Box>
  );
}

export function ReportsPanel({ enabled, onOpenCount }: { enabled: boolean; onOpenCount: (count: number) => void }) {
  const toast = useToast();
  const sudo = useSudo();
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [data, setData] = useState<ReportList | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [pending, setPending] = useState<{ report: ReportEntry; action: Exclude<Action, 'dismiss'> } | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(
    async (page = 1) => {
      try {
        const result = await fetchReports(status, page);
        setData((current) => (page > 1 && current ? { ...result, reports: [...current.reports, ...result.reports] } : result));
        onOpenCount(result.open);
      } catch (failure) {
        toast(errorMessage(failure), { variant: 'error' });
      }
    },
    [status, toast, onOpenCount]
  );

  useEffect(() => {
    setData(null);
    load(1);
  }, [load]);

  const run = async (report: ReportEntry, action: Action, text = '') => {
    setBusy(report.id);
    try {
      const result = await sudo(() => resolveReport(report.id, action, text));
      onOpenCount(result.open);
      toast(
        {
          dismiss: t('Meldung verworfen'),
          block: t('Inhalt gesperrt'),
          unblock: t('Sperre aufgehoben'),
          delete: t('Inhalt gelöscht'),
          suspend: t('Konto gesperrt'),
        }[action],
        { variant: 'success' }
      );
      await load(1);
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const onAction = (report: ReportEntry, action: Action) => {
    if (action === 'dismiss') {
      run(report, action);
      return;
    }
    setNote('');
    setPending({ report, action });
  };

  const confirmPending = () => {
    if (!pending) return;
    const { report, action } = pending;
    setPending(null);
    run(report, action, note.trim());
  };

  return (
    <Box sx={{ maxWidth: 980 }}>
      {!enabled && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          {t('Das Melden ist gerade abgeschaltet. Besucher sehen keinen Melden-Knopf, bestehende Meldungen bleiben hier.')}
        </Alert>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={status}
          onChange={(_event, next) => next && setStatus(next)}
          aria-label={t('Status')}
        >
          <ToggleButton value="open">
            {data && status === 'open' ? t('Offen ({count})', { count: formatNumber(data.open) }) : t('Offen')}
          </ToggleButton>
          <ToggleButton value="closed">{t('Erledigt')}</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1, minWidth: 220 }}>
          {t('Meldungen zum selben Inhalt werden gemeinsam erledigt.')}
        </Typography>
      </Box>

      {!data ? (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} variant="rounded" height={140} />
          ))}
        </Box>
      ) : data.reports.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: { xs: 8, md: 10 }, color: 'text.secondary' }}>
          <FlagOutlined sx={{ fontSize: 48, opacity: 0.6 }} />
          <Typography variant="h6" sx={{ mt: 1.5, color: 'text.primary' }}>
            {status === 'open' ? t('Keine offenen Meldungen') : t('Noch nichts erledigt')}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {status === 'open'
              ? t('Neue Meldungen erscheinen hier. Auf Wunsch bekommst du eine E-Mail.')
              : t('Erledigte Meldungen bleiben hier als Verlauf.')}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <AnimatePresence initial={false}>
            {data.reports.map((report) => (
              <m.div
                key={report.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
                transition={{ duration: 0.3, ease: ease.emphasizedDecelerate }}
              >
                <ReportCard report={report} busy={busy === report.id} onAction={(action) => onAction(report, action)} />
              </m.div>
            ))}
          </AnimatePresence>
          {data.hasNext && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
              <Button variant="tonal" onClick={() => load(data.page + 1)}>
                {t('Mehr laden')}
              </Button>
            </Box>
          )}
        </Box>
      )}

      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        maxWidth="xs"
        fullWidth
        slots={{ transition: GrowTransition }}
        aria-labelledby="moderation-title"
      >
        {pending && (
          <>
            <DialogTitle id="moderation-title">{DIALOG[pending.action].title()}</DialogTitle>
            <DialogContent>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: DIALOG[pending.action].note ? 2 : 0 }}>
                {DIALOG[pending.action].text()}
              </Typography>
              {DIALOG[pending.action].note && (
                <TextField
                  fullWidth
                  size="small"
                  label={t('Grund (optional)')}
                  placeholder={reasonLabel(pending.report.reason)}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  helperText={pending.action === 'block' ? t('Der Besitzer sieht diesen Grund.') : ' '}
                  slotProps={{ htmlInput: { maxLength: 200 } }}
                />
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPending(null)}>{t('Abbrechen')}</Button>
              <Button
                variant="contained"
                color={pending.action === 'unblock' || pending.action === 'block' ? 'primary' : 'error'}
                onClick={confirmPending}
              >
                {DIALOG[pending.action].confirm()}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
