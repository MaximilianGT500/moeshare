import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddRounded from '@mui/icons-material/AddRounded';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import LinkRounded from '@mui/icons-material/LinkRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import ForwardToInboxRounded from '@mui/icons-material/ForwardToInboxRounded';
import HubRounded from '@mui/icons-material/HubRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import AutorenewRounded from '@mui/icons-material/AutorenewRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import type { AdminUser, Integration, LoginLink, LoginLinkStatus } from '../../lib/types';
import {
  createIntegration,
  deleteIntegration,
  denyLoginLink,
  errorMessage,
  fetchIntegrations,
  fetchLoginLinks,
  revealLoginLink,
  revokeLoginLink,
  rotateIntegration,
  sendLoginLink,
  updateIntegration,
  ApiError,
  type IntegrationInput,
  type LoginLinkResult,
} from '../../lib/api';
import { formatNumber, relativeMs } from '../../lib/format';
import { SettingRow, SettingsSection } from '../../components/SettingsKit';
import { CopyTextButton } from '../../components/CopyButton';
import { GrowTransition } from '../../components/transitions';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { isCancelled, useSudo } from '../../components/Sudo';
import { LinkResultDialog, LoginLinkDialog, durationLabel, useAccess } from './LoginLinkDialog';
import { c, fonts, radius } from '../../theme/tokens';
import { t, tn } from '../../lib/i18n';

const STATUS: Record<LoginLinkStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: t('Wartet'), bg: c.warningContainer, fg: c.onWarningContainer },
  ready: { label: t('Bereit'), bg: c.secondaryContainer, fg: c.onSecondaryContainer },
  used: { label: t('Benutzt'), bg: c.surfaceContainerHighest, fg: c.onSurfaceVariant },
  expired: { label: t('Abgelaufen'), bg: c.surfaceContainerHighest, fg: c.onSurfaceVariant },
  revoked: { label: t('Zurückgezogen'), bg: c.surfaceContainerHighest, fg: c.onSurfaceVariant },
  denied: { label: t('Abgelehnt'), bg: c.surfaceContainerHighest, fg: c.onSurfaceVariant },
};

function LinkStatus({ status }: { status: LoginLinkStatus }) {
  const look = STATUS[status];
  return <Chip size="small" label={look.label} sx={{ bgcolor: look.bg, color: look.fg, fontWeight: 700 }} />;
}

function origin(link: LoginLink) {
  if (link.source === 'api') return t('Über {name}', { name: link.integration?.name || link.requestedBy || t('eine Integration') });
  if (link.source === 'email') return t('Per E-Mail angefordert');
  if (link.source === 'cli') return t('Über die Kommandozeile');
  return link.createdBy ? t('Von {name}', { name: link.createdBy }) : t('Von einem Admin');
}

function timeline(link: LoginLink) {
  const parts = [t('{origin}, {when}.', { origin: origin(link), when: relativeMs(link.createdAt) })];
  if (link.decidedBy && link.status !== 'denied' && link.source === 'api')
    parts.push(t('Freigegeben von {name}.', { name: link.decidedBy }));
  if (link.status === 'ready') parts.push(t('Läuft {when} ab.', { when: relativeMs(link.expiresAt) }));
  if (link.status === 'used' && link.usedAt) parts.push(t('Benutzt {when}.', { when: relativeMs(link.usedAt) }));
  if (link.status === 'denied' && link.decidedBy) parts.push(t('Abgelehnt von {name}.', { name: link.decidedBy }));
  return parts.join(' ');
}

const HISTORY_PREVIEW = 12;

const MODE_LABELS: Record<Integration['mode'], string> = {
  approval: t('Mit Freigabe'),
  direct: t('Sofort'),
};

function IntegrationDialog({
  open,
  integration,
  onClose,
  onSaved,
}: {
  open: boolean;
  integration: Integration | null;
  onClose: () => void;
  onSaved: (result: { integration: Integration; key?: string }) => void;
}) {
  const access = useAccess();
  const sudo = useSudo();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Integration['mode']>('approval');
  const [allowAdmins, setAllowAdmins] = useState(false);
  const [maxMinutes, setMaxMinutes] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [field, setField] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(integration?.name || '');
    setMode(integration?.mode || 'approval');
    setAllowAdmins(Boolean(integration?.allowAdmins));
    setMaxMinutes(integration?.maxMinutes ? String(integration.maxMinutes) : '');
    setEnabled(integration ? integration.enabled : true);
    setError('');
    setField('');
  }, [open, integration]);

  const submit = async () => {
    setBusy(true);
    setError('');
    setField('');
    const input: IntegrationInput = { name: name.trim(), mode, allowAdmins, maxMinutes: maxMinutes ? Number(maxMinutes) : null };
    try {
      if (integration) {
        const result = await sudo(() => updateIntegration(integration.id, { ...input, enabled }));
        onSaved({ integration: result.integration });
      } else {
        const result = await sudo(() => createIntegration(input));
        onSaved({ integration: result.integration, key: result.key });
      }
    } catch (failure) {
      if (!isCancelled(failure)) {
        setError(errorMessage(failure));
        setField(failure instanceof ApiError ? failure.field : '');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      maxWidth="sm"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="integration-title"
    >
      <DialogTitle id="integration-title">{integration ? t('Integration bearbeiten') : t('Integration hinzufügen')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label={t('Name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            fullWidth
            error={field === 'name'}
            helperText={field === 'name' ? error : t('Zum Beispiel „Support-Portal“ oder „Intranet“. Steht in jeder Anfrage.')}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('Ablauf')}
            </Typography>
            <ToggleButtonGroup exclusive value={mode} onChange={(_event, next) => next && setMode(next)} aria-label={t('Ablauf')}>
              <ToggleButton value="approval">{t('Admin gibt frei')}</ToggleButton>
              <ToggleButton value="direct">{t('Sofort ausstellen')}</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              {mode === 'approval'
                ? t('Jede Anfrage landet hier zur Freigabe. Erst danach bekommt die Integration den Link.')
                : t('Die Integration bekommt den Link direkt in der Antwort und gibt ihn selbst weiter.')}
            </Typography>
          </Box>
          <TextField
            label={t('Längste Gültigkeit in Minuten (optional)')}
            type="number"
            value={maxMinutes}
            onChange={(event) => setMaxMinutes(event.target.value)}
            error={field === 'maxMinutes'}
            helperText={
              field === 'maxMinutes'
                ? error
                : t('Leer lassen für das Limit des Servers ({limit}).', { limit: durationLabel(access.maxMinutes) })
            }
            slotProps={{ htmlInput: { min: 1, max: 43200 } }}
          />
          <FormControlLabel
            control={<Switch checked={allowAdmins} onChange={(event) => setAllowAdmins(event.target.checked)} />}
            label={t('Darf Links für Admin-Konten anfordern')}
          />
          {integration && (
            <FormControlLabel
              control={<Switch checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />}
              label={t('Eingeschaltet')}
            />
          )}
          <Collapse in={!!error && !['name', 'maxMinutes'].includes(field)} unmountOnExit>
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          </Collapse>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={busy || !name.trim()}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {integration ? t('Speichern') : t('Hinzufügen')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function KeyDialog({ data, onClose }: { data: { key: string; integration: Integration } | null; onClose: () => void }) {
  const access = useAccess();
  const example = data
    ? [
        `curl -X POST ${access.baseUrl}/api/integrations/login-links \\`,
        `  -H "Authorization: Bearer ${data.key}" \\`,
        '  -H "Content-Type: application/json" \\',
        `  -d '{"user": "max", "minutes": ${Math.min(access.defaultMinutes, data.integration.maxMinutes || access.maxMinutes)}}'`,
      ].join('\n')
    : '';
  return (
    <Dialog open={!!data} onClose={onClose} maxWidth="sm" fullWidth slots={{ transition: GrowTransition }} aria-labelledby="key-title">
      <DialogTitle id="key-title">{t('Schlüssel für {name}', { name: data?.integration.name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Alert severity="warning">
            {t('Der Schlüssel wird nur jetzt angezeigt. Wer ihn hat, kann Einmal-Links anfordern. Bewahre ihn wie ein Passwort auf.')}
          </Alert>
          <Box
            sx={{
              p: 2,
              borderRadius: `${radius.md}px`,
              bgcolor: c.surfaceContainerHighest,
              fontFamily: fonts.mono,
              fontSize: '0.875rem',
              wordBreak: 'break-all',
              userSelect: 'all',
            }}
          >
            {data?.key}
          </Box>
          <Typography variant="subtitle2">{t('So fordert die Integration einen Link an')}</Typography>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              borderRadius: `${radius.md}px`,
              bgcolor: c.surfaceContainerHighest,
              fontFamily: fonts.mono,
              fontSize: '0.75rem',
              overflowX: 'auto',
              whiteSpace: 'pre',
            }}
          >
            {example}
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {data?.integration.mode === 'approval'
              ? t('Die Antwort enthält eine ID. Nach deiner Freigabe liefert GET /api/integrations/login-links/<id> den Link.')
              : t('Die Antwort enthält den Link im Feld url. Er funktioniert genau einmal.')}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        {data && (
          <CopyTextButton value={data.key} message={t('Schlüssel kopiert')} icon={<ContentCopyRounded fontSize="inherit" />}>
            {t('Schlüssel kopieren')}
          </CopyTextButton>
        )}
        <Button variant="contained" onClick={onClose}>
          {t('Fertig')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function AccessPanel({
  users,
  onPending,
  onOpenSettings,
}: {
  users: AdminUser[];
  onPending: (count: number) => void;
  onOpenSettings: () => void;
}) {
  const access = useAccess();
  const toast = useToast();
  const confirm = useConfirm();
  const sudo = useSudo();
  const [links, setLinks] = useState<LoginLink[] | null>(null);
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState<LoginLink | null>(null);
  const [result, setResult] = useState<{
    url: string;
    username: string;
    expiresAt: number;
    sent?: string | null;
    mailError?: string | null;
  } | null>(null);
  const [editing, setEditing] = useState<Integration | null>(null);
  const [addingIntegration, setAddingIntegration] = useState(false);
  const [key, setKey] = useState<{ key: string; integration: Integration } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const [linkList, integrationList] = await Promise.all([fetchLoginLinks(), fetchIntegrations()]);
      setLinks(linkList.links);
      setIntegrations(integrationList.integrations);
      onPending(linkList.pending);
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  }, [onPending, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await sudo(action);
      toast(success, { variant: 'success' });
      await load();
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const finished = (outcome: LoginLinkResult, username: string) => {
    setCreating(false);
    setApproving(null);
    setResult({ url: outcome.url, username, expiresAt: outcome.link.expiresAt, sent: outcome.sent, mailError: outcome.mailError });
    load();
  };

  const reveal = async (link: LoginLink) => {
    try {
      const { url } = await sudo(() => revealLoginLink(link.id));
      setResult({ url, username: link.user.username || '', expiresAt: link.expiresAt });
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const deny = async (link: LoginLink) => {
    const ok = await confirm({
      title: t('Anfrage ablehnen?'),
      message: t('{who} bekommt keinen Link für {username}.', {
        who: link.integration?.name || link.requestedBy || t('Die Integration'),
        username: link.user.username,
      }),
      confirmLabel: t('Ablehnen'),
      icon: <LinkOffRounded />,
    });
    if (ok) run(() => denyLoginLink(link.id), t('Anfrage abgelehnt'));
  };

  const revoke = async (link: LoginLink) => {
    const ok = await confirm({
      title: t('Link zurückziehen?'),
      message: t('Der Link für {username} funktioniert danach nicht mehr.', { username: link.user.username }),
      confirmLabel: t('Zurückziehen'),
      icon: <LinkOffRounded />,
    });
    if (ok) run(() => revokeLoginLink(link.id), t('Link zurückgezogen'));
  };

  const rotate = async (integration: Integration) => {
    const ok = await confirm({
      title: t('Neuen Schlüssel erzeugen?'),
      message: t('Der bisherige Schlüssel von {name} gilt sofort nicht mehr. Trage den neuen danach dort ein.', { name: integration.name }),
      confirmLabel: t('Neu erzeugen'),
      destructive: false,
      icon: <AutorenewRounded />,
    });
    if (!ok) return;
    try {
      const next = await sudo(() => rotateIntegration(integration.id));
      setKey({ key: next.key, integration: next.integration });
      load();
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const remove = async (integration: Integration) => {
    const ok = await confirm({
      title: t('{name} entfernen?', { name: integration.name }),
      message: t(
        'Der Schlüssel gilt danach nicht mehr, offene Anfragen und noch nicht benutzte Links dieser Integration werden zurückgezogen.'
      ),
      confirmLabel: t('Entfernen'),
    });
    if (ok) run(() => deleteIntegration(integration.id), t('{name} entfernt', { name: integration.name }));
  };

  const pending = (links || []).filter((link) => link.status === 'pending');
  const history = (links || []).filter((link) => link.status !== 'pending');
  const visible = showAll ? history : history.slice(0, HISTORY_PREVIEW);

  return (
    <Stack spacing={4}>
      {!access.linksEnabled && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={onOpenSettings}>
              {t('Einstellungen')}
            </Button>
          }
        >
          {t('Einmal-Links sind abgeschaltet. Offene Links funktionieren nicht, Integrationen bekommen eine Fehlermeldung.')}
        </Alert>
      )}

      <SettingsSection
        id="anfragen"
        title={t('Anfragen')}
        description={t('Integrationen mit Freigabe fragen hier an. Eine Anfrage verfällt nach 24 Stunden.')}
      >
        {links === null ? (
          <Box sx={{ px: 3, py: 2 }}>
            <Skeleton height={40} />
          </Box>
        ) : pending.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', px: 3, py: 2.5 }}>
            {t('Keine offenen Anfragen.')}
          </Typography>
        ) : (
          <AnimatePresence initial={false}>
            {pending.map((link) => (
              <m.div
                key={link.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <SettingRow
                  icon={<HourglassTopRounded />}
                  label={
                    <>
                      {link.user.username}
                      <Chip size="small" variant="outlined" label={link.integration?.name || link.requestedBy || t('unbekannt')} />
                    </>
                  }
                  description={
                    <>
                      {t('Angefragt {when} für {duration}, verfällt {expires}.', {
                        when: relativeMs(link.createdAt),
                        duration: durationLabel(link.minutes),
                        expires: relativeMs(link.expiresAt),
                      })}
                      {link.note && (
                        <Box component="span" sx={{ display: 'block', mt: 0.5, color: 'text.primary' }}>
                          {link.note}
                        </Box>
                      )}
                    </>
                  }
                >
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" onClick={() => deny(link)}>
                      {t('Ablehnen')}
                    </Button>
                    <Button variant="contained" onClick={() => setApproving(link)} disabled={!access.linksEnabled}>
                      {t('Freigeben')}
                    </Button>
                  </Box>
                </SettingRow>
              </m.div>
            ))}
          </AnimatePresence>
        )}
      </SettingsSection>

      <SettingsSection
        id="einmal-links"
        title={t('Einmal-Links')}
        description={t('Jeder Link meldet genau einmal an und läuft danach ab. Verlauf der letzten 30 Tage.')}
        action={
          <Button size="small" startIcon={<AddRounded />} onClick={() => setCreating(true)} disabled={!access.linksEnabled}>
            {t('Link erstellen')}
          </Button>
        }
      >
        {links === null ? (
          <Box sx={{ px: 3, py: 2 }}>
            <Skeleton height={40} />
            <Skeleton height={40} />
          </Box>
        ) : history.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', px: 3, py: 2.5 }}>
            {t('Noch keine Einmal-Links. Erstelle einen, wenn jemand ohne Passwort hinein muss.')}
          </Typography>
        ) : (
          visible.map((link) => (
            <SettingRow
              key={link.id}
              icon={<LinkRounded />}
              label={
                <>
                  {link.user.username}
                  <LinkStatus status={link.status} />
                </>
              }
              description={
                <>
                  {timeline(link)}
                  {link.note && (
                    <Box component="span" sx={{ display: 'block', mt: 0.25 }}>
                      {link.note}
                    </Box>
                  )}
                </>
              }
            >
              {link.status === 'ready' && (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Tooltip title={t('Link anzeigen')}>
                    <IconButton
                      aria-label={t('Link für {username} anzeigen', { username: link.user.username })}
                      onClick={() => reveal(link)}
                    >
                      <VisibilityRounded />
                    </IconButton>
                  </Tooltip>
                  {access.mailReady && (
                    <Tooltip title={t('Per E-Mail schicken')}>
                      <IconButton
                        aria-label={t('Link per E-Mail an {username} schicken', { username: link.user.username })}
                        onClick={() =>
                          run(() => sendLoginLink(link.id), t('Link per E-Mail an {username} verschickt', { username: link.user.username }))
                        }
                      >
                        <ForwardToInboxRounded />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title={t('Zurückziehen')}>
                    <IconButton
                      aria-label={t('Link für {username} zurückziehen', { username: link.user.username })}
                      onClick={() => revoke(link)}
                      sx={{ '&:hover': { color: c.error } }}
                    >
                      <LinkOffRounded />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </SettingRow>
          ))
        )}
        {history.length > visible.length && (
          <Box sx={{ px: { xs: 2, sm: 3 }, py: 1.5 }}>
            <Button size="small" onClick={() => setShowAll(true)}>
              {t('Alle {count} anzeigen', { count: formatNumber(history.length) })}
            </Button>
          </Box>
        )}
      </SettingsSection>

      <SettingsSection
        id="integrationen"
        title={t('Integrationen')}
        description={t(
          'Externe Systeme fordern mit eigenem Schlüssel Einmal-Links über die API an, etwa ein Support-Portal oder ein Intranet. Ein Schlüssel kann nichts anderes.'
        )}
        action={
          <Button size="small" startIcon={<AddRounded />} onClick={() => setAddingIntegration(true)}>
            {t('Hinzufügen')}
          </Button>
        }
      >
        {integrations === null ? (
          <Box sx={{ px: 3, py: 2 }}>
            <Skeleton height={40} />
          </Box>
        ) : integrations.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', px: 3, py: 2.5 }}>
            {t('Noch keine Integration. Füge eine hinzu, um Einmal-Links aus einem anderen System anzufordern.')}
          </Typography>
        ) : (
          integrations.map((integration) => (
            <SettingRow
              key={integration.id}
              icon={<HubRounded />}
              label={
                <>
                  {integration.name}
                  <Chip size="small" variant="outlined" label={MODE_LABELS[integration.mode]} />
                  {!integration.enabled && (
                    <Chip size="small" label={t('Aus')} sx={{ bgcolor: c.surfaceContainerHighest, color: c.onSurfaceVariant }} />
                  )}
                  {integration.pending > 0 && (
                    <Chip
                      size="small"
                      label={tn(integration.pending, '1 offen', '{count} offen')}
                      sx={{ bgcolor: c.warningContainer, color: c.onWarningContainer, fontWeight: 700 }}
                    />
                  )}
                </>
              }
              description={
                <>
                  <Box component="span" sx={{ fontFamily: fonts.mono }}>
                    {integration.hint}
                  </Box>
                  {t(', zuletzt benutzt {when}.', { when: relativeMs(integration.lastUsedAt) })}{' '}
                  {tn(integration.issued, 'Bisher 1 Link.', 'Bisher {count} Links.', { count: formatNumber(integration.issued) })}
                  {integration.allowAdmins ? ` ${t('Darf auch für Admins anfragen.')}` : ''}
                </>
              }
            >
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Tooltip title={t('Bearbeiten')}>
                  <IconButton aria-label={t('{name} bearbeiten', { name: integration.name })} onClick={() => setEditing(integration)}>
                    <EditRounded />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('Neuer Schlüssel')}>
                  <IconButton aria-label={t('Neuer Schlüssel für {name}', { name: integration.name })} onClick={() => rotate(integration)}>
                    <AutorenewRounded />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('Entfernen')}>
                  <IconButton
                    aria-label={t('{name} entfernen', { name: integration.name })}
                    onClick={() => remove(integration)}
                    sx={{ '&:hover': { color: c.error } }}
                  >
                    <DeleteOutlineRounded />
                  </IconButton>
                </Tooltip>
              </Box>
            </SettingRow>
          ))
        )}
      </SettingsSection>

      <LoginLinkDialog open={creating} users={users} onClose={() => setCreating(false)} onDone={finished} />
      <LoginLinkDialog open={!!approving} request={approving} onClose={() => setApproving(null)} onDone={finished} />
      <LinkResultDialog result={result} onClose={() => setResult(null)} />
      <IntegrationDialog
        open={addingIntegration || !!editing}
        integration={editing}
        onClose={() => {
          setAddingIntegration(false);
          setEditing(null);
        }}
        onSaved={({ integration, key: secret }) => {
          setAddingIntegration(false);
          setEditing(null);
          if (secret) setKey({ key: secret, integration });
          else toast(t('{name} gespeichert', { name: integration.name }), { variant: 'success' });
          load();
        }}
      />
      <KeyDialog data={key} onClose={() => setKey(null)} />
    </Stack>
  );
}
