import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import type { Release, UpdateInfo } from './client';
import { Markdown } from './markdown';

export interface PulseUpdateProps {
  load?: (force?: boolean) => Promise<UpdateInfo | null>;
  info?: UpdateInfo | null;
  app?: string;
  language?: 'de' | 'en';
  instructions?: ReactNode;
}

const LABELS = {
  de: {
    checking: 'Suche nach Updates …',
    offline: 'Die Versionsprüfung ist gerade nicht erreichbar.',
    retry: 'Erneut prüfen',
    current: (app: string, version: string) => `${app} ${version} ist aktuell.`,
    available: (app: string, version: string) => `${app} ${version} ist da`,
    using: (version: string, behind: number) => `Du nutzt ${version}${behind > 1 ? `, ${behind} Versionen dahinter` : ''}.`,
    security: 'Sicherheitsupdate',
    yanked: (version: string, latest: string | null) =>
      `Version ${version} wurde zurückgezogen. ${latest ? `Wechsel bitte auf ${latest}.` : 'Ein Ersatz folgt.'}`,
    unsupported: (version: string, minimum: string | null) =>
      `Version ${version} wird nicht mehr unterstützt${minimum ? `, mindestens ${minimum} ist nötig` : ''}. Sie bekommt keine Sicherheitsupdates mehr, bitte aktualisiere bald.`,
    changelog: 'Changelog öffnen',
    more: 'Mehr zeigen',
    less: 'Weniger zeigen',
    how: 'So aktualisierst du',
    beta: 'Beta',
    locale: 'de-DE',
  },
  en: {
    checking: 'Checking for updates …',
    offline: 'The update check is not reachable right now.',
    retry: 'Check again',
    current: (app: string, version: string) => `${app} ${version} is up to date.`,
    available: (app: string, version: string) => `${app} ${version} is available`,
    using: (version: string, behind: number) => `You are on ${version}${behind > 1 ? `, ${behind} versions behind` : ''}.`,
    security: 'Security update',
    yanked: (version: string, latest: string | null) =>
      `Version ${version} was withdrawn. ${latest ? `Please switch to ${latest}.` : 'A replacement is coming.'}`,
    unsupported: (version: string, minimum: string | null) =>
      `Version ${version} is no longer supported${minimum ? `, at least ${minimum} is required` : ''}. It gets no more security updates, please update soon.`,
    changelog: 'Open changelog',
    more: 'Show more',
    less: 'Show less',
    how: 'How to update',
    beta: 'Beta',
    locale: 'en-GB',
  },
};

function Entry({
  release,
  open,
  onToggle,
  date,
  labels,
}: {
  release: Release;
  open: boolean;
  onToggle: () => void;
  date: string;
  labels: (typeof LABELS)['de'];
}) {
  return (
    <Box sx={{ borderRadius: '16px', bgcolor: 'action.hover', overflow: 'hidden' }}>
      <ButtonBase
        onClick={onToggle}
        aria-expanded={open}
        sx={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 1, px: 2, py: 1.25, flexWrap: 'wrap' }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
          {release.version}
        </Typography>
        {release.title && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {release.title}
          </Typography>
        )}
        {release.security && <Chip size="small" color="error" label={labels.security} />}
        {release.channel === 'beta' && <Chip size="small" label={labels.beta} />}
        <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }}>
          {date}
        </Typography>
      </ButtonBase>
      {release.notes && (
        <Collapse in={open} unmountOnExit>
          <Box sx={{ px: 2, pb: 2 }}>
            <Markdown text={release.notes} dense />
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

export function PulseUpdate({ load, info: given, app = 'Die App', language = 'de', instructions }: PulseUpdateProps) {
  const labels = LABELS[language];
  const [info, setInfo] = useState<UpdateInfo | null | undefined>(given === undefined ? undefined : given);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const format = new Intl.DateTimeFormat(labels.locale, { dateStyle: 'long' });

  const refresh = useCallback(
    async (force = false) => {
      if (!load) return;
      setBusy(true);
      try {
        setInfo(await load(force));
      } catch {
        setInfo(null);
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  useEffect(() => {
    if (given !== undefined) setInfo(given);
  }, [given]);

  useEffect(() => {
    if (given === undefined) void refresh();
  }, [given, refresh]);

  const retry = load && (
    <Button
      size="small"
      onClick={() => refresh(true)}
      disabled={busy}
      startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
    >
      {labels.retry}
    </Button>
  );

  if (info === undefined)
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary' }}>
        <CircularProgress size={18} />
        <Typography variant="body2">{labels.checking}</Typography>
      </Box>
    );

  if (!info || !info.latest)
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
          {labels.offline}
        </Typography>
        {retry}
      </Box>
    );

  const dateOf = (release: Release) => release.dateText ?? (release.date ? format.format(release.date) : '');
  const latest = info.latest;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {info.supported === false && !info.yanked && (
        <Alert severity="error">{labels.unsupported(info.version ?? '', info.minimum ?? null)}</Alert>
      )}
      {info.yanked && (
        <Alert severity="error">
          {labels.yanked(info.version ?? '', info.update || info.version !== latest.version ? latest.version : null)}
        </Alert>
      )}
      {info.update ? (
        <>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  {labels.available(app, latest.version)}
                </Typography>
                {info.security && <Chip size="small" color="error" label={labels.security} />}
              </Box>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {labels.using(info.version ?? '', info.behind)}
              </Typography>
            </Box>
            {latest.url && (
              <Button component="a" href={latest.url} target="_blank" rel="noopener noreferrer" variant="contained" size="small">
                {labels.changelog}
              </Button>
            )}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {(info.releases.length ? info.releases : [latest]).map((release, index) => (
              <Entry
                key={release.version}
                release={release}
                date={dateOf(release)}
                labels={labels}
                open={open[release.version] ?? index === 0}
                onToggle={() => setOpen((state) => ({ ...state, [release.version]: !(state[release.version] ?? index === 0) }))}
              />
            ))}
          </Box>
          {instructions && (
            <Box sx={{ p: 2, borderRadius: '16px', border: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                {labels.how}
              </Typography>
              <Box sx={{ typography: 'body2' }}>{instructions}</Box>
            </Box>
          )}
          {load && <Box>{retry}</Box>}
        </>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'success.main', flex: 'none' }} />
          <Typography variant="body2" sx={{ flex: 1 }}>
            {labels.current(app, info.version ?? latest.version)}
          </Typography>
          {retry}
        </Box>
      )}
    </Box>
  );
}
