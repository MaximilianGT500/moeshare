import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import TokenRounded from '@mui/icons-material/TokenRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import TerminalRounded from '@mui/icons-material/TerminalRounded';
import ScreenshotMonitorRounded from '@mui/icons-material/ScreenshotMonitorRounded';
import LaptopMacRounded from '@mui/icons-material/LaptopMacRounded';
import PhoneIphoneRounded from '@mui/icons-material/PhoneIphoneRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import { siTelegram } from 'simple-icons';
import type { ApiTokenInfo, ExpiryChoice, TelegramAccount } from '../../lib/types';
import { createToken, errorMessage, fetchTelegram, revokeToken, startTelegramLink, unlinkTelegram, updateToken } from '../../lib/api';
import { formatDate, relativeMs } from '../../lib/format';
import { TokenDialog, presetSummary, scopeLabel, type TokenDraft } from '../../components/TokenDialog';
import { GrowTransition } from '../../components/transitions';
import { CopyTextButton } from '../../components/CopyButton';
import { downloadShareX, type ShareXFeatures } from '../../lib/sharex';
import { SettingRow, SettingsSection } from '../../components/SettingsKit';
import { TokenRevealDialog } from '../../components/TokenReveal';
import { ClientSetupDialog } from '../../components/ClientSetupDialog';
import { CLIENTS, type ClientKind } from '../../lib/clients';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { isCancelled, useSudo } from '../../components/Sudo';
import { c, ease, fonts, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

const CLIENT_ICONS: Record<ClientKind, ReactNode> = {
  flameshot: <ScreenshotMonitorRounded />,
  spectacle: <ScreenshotMonitorRounded />,
  macos: <LaptopMacRounded />,
  shortcuts: <PhoneIphoneRounded />,
  curl: <TerminalRounded />,
};

const STEPS = [
  { title: t('Konfiguration holen'), text: t('„ShareX einrichten“ erstellt ein Token und lädt die passende .sxcu-Datei herunter.') },
  { title: t('Doppelklick auf die Datei'), text: t('ShareX fragt, ob es den Uploader übernehmen soll. Bestätige mit Ja.') },
  { title: t('Als Ziel wählen'), text: t('In ShareX unter Ziele › Benutzerdefinierter Uploader diesen Server auswählen.') },
];

function TelegramIcon({ size = 24 }: { size?: number }) {
  return (
    <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: size, height: size, fill: 'currentColor', flexShrink: 0 }}>
      <path d={siTelegram.path} />
    </Box>
  );
}

function TelegramSection({ initial }: { initial: TelegramAccount }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState<{ url: string; code: string; bot: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => setState(initial), [initial]);

  useEffect(() => {
    if (!pending) return undefined;
    const poll = async () => {
      try {
        const next = await fetchTelegram();
        if (next.link) {
          setState(next);
          setPending(null);
          toast(t('Telegram ist verbunden'), { variant: 'success' });
          return;
        }
      } catch {
        return;
      }
      if (Date.now() > pending.expiresAt) {
        setPending(null);
        toast(t('Der Code ist abgelaufen. Versuch es noch einmal.'), { variant: 'error' });
        return;
      }
      timer.current = window.setTimeout(poll, 2000);
    };
    timer.current = window.setTimeout(poll, 2000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [pending, toast]);

  const connect = async () => {
    setBusy(true);
    try {
      setPending(await startTelegramLink());
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: t('Telegram trennen?'),
      message: t('Der Bot nimmt danach nichts mehr für dein Konto an. Verbinden kannst du ihn jederzeit wieder.'),
      confirmLabel: t('Trennen'),
      icon: <LinkOffRounded />,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const next = await unlinkTelegram();
      setState({ enabled: next.enabled, bot: next.bot, link: next.link });
      toast(t('Telegram getrennt'), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (!state.enabled) return null;
  return (
    <SettingsSection
      id="telegram"
      title={t('Telegram')}
      description={t(
        'Schick dem Bot Fotos, Videos, Dateien, Sprachnachrichten oder Text. Er legt alles in deinem Konto ab und antwortet mit dem Link.'
      )}
    >
      <SettingRow
        icon={<TelegramIcon />}
        label={
          state.link
            ? t('Verbunden mit {name}', { name: state.link.name || t('deinem Telegram-Konto') })
            : state.bot
              ? `@${state.bot}`
              : t('Telegram-Bot')
        }
        description={
          state.link
            ? t('Seit {date}, zuletzt benutzt {when}.', {
                date: formatDate(new Date(state.link.createdAt)),
                when: relativeMs(state.link.lastUsedAt),
              })
            : t('Noch nicht verbunden. Ein Klick, dann einmal „Start“ in Telegram.')
        }
      >
        {state.link ? (
          <Button onClick={disconnect} disabled={busy} sx={{ color: c.error }}>
            {t('Trennen')}
          </Button>
        ) : (
          <Button variant="tonal" onClick={connect} disabled={busy}>
            {t('Verbinden')}
          </Button>
        )}
      </SettingRow>
      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        maxWidth="xs"
        fullWidth
        slots={{ transition: GrowTransition }}
        aria-labelledby="telegram-link-title"
      >
        <DialogTitle id="telegram-link-title">{t('Mit Telegram verbinden')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Öffne den Bot und tippe auf „Start“. Danach ist alles eingerichtet, dieses Fenster schließt sich von selbst.')}
          </Typography>
          <Button
            variant="contained"
            href={pending?.url ?? ''}
            target="_blank"
            rel="noopener"
            startIcon={<TelegramIcon size={20} />}
            endIcon={<OpenInNewRounded />}
            fullWidth
            sx={{ mt: 2.5 }}
          >
            {t('@{bot} öffnen', { bot: pending?.bot || '' })}
          </Button>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2.5 }}>
            {t('Klappt der Knopf nicht, schick dem Bot diese Nachricht:')}
          </Typography>
          <Box
            sx={{
              mt: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              p: 1,
              pl: 1.5,
              borderRadius: `${radius.md}px`,
              bgcolor: c.surfaceContainerHigh,
              fontFamily: fonts.mono,
              fontSize: '0.8125rem',
              wordBreak: 'break-all',
            }}
          >
            <Box sx={{ flex: 1 }}>{pending ? `/start ${pending.code}` : ''}</Box>
            {pending && (
              <CopyTextButton value={`/start ${pending.code}`} message={t('Kopiert')}>
                {t('Kopieren')}
              </CopyTextButton>
            )}
          </Box>
          <LinearProgress sx={{ mt: 2.5, borderRadius: 2 }} aria-label={t('Warte auf Telegram')} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>{t('Abbrechen')}</Button>
        </DialogActions>
      </Dialog>
    </SettingsSection>
  );
}

export function ApiPanel({
  tokens,
  reload,
  siteTitle,
  baseUrl,
  features,
  telegram,
  maxExpiry,
}: {
  tokens: ApiTokenInfo[];
  reload: () => Promise<void>;
  siteTitle: string;
  baseUrl: string;
  features?: ShareXFeatures;
  telegram?: TelegramAccount;
  maxExpiry: ExpiryChoice;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const sudo = useSudo();
  const [naming, setNaming] = useState(false);
  const [editing, setEditing] = useState<ApiTokenInfo | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [client, setClient] = useState<{ kind: ClientKind; token: string } | null>(null);

  const setupClient = async (kind: ClientKind, name: string) => {
    try {
      const result = await sudo(() => createToken(name));
      setClient({ kind, token: result.token });
      reload();
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const save = async (draft: TokenDraft) => {
    try {
      if (editing) {
        const target = editing;
        await sudo(() => updateToken(target.id, draft));
        setEditing(null);
        toast(t('Token gespeichert'), { variant: 'success' });
        reload();
        return;
      }
      const result = await sudo(() => createToken(draft.name, { scopes: draft.scopes, preset: draft.preset }));
      setNaming(false);
      setRevealed(result.token);
      reload();
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const create = async (name: string, download = false) => {
    try {
      const result = await sudo(() => createToken(name));
      setNaming(false);
      if (download) downloadShareX({ siteTitle, baseUrl, token: result.token, features });
      setRevealed(result.token);
      reload();
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const revoke = async (token: ApiTokenInfo) => {
    const ok = await confirm({
      title: t('„{name}“ widerrufen?', { name: token.name }),
      message: t('Programme, die dieses Token benutzen, können danach nicht mehr hochladen. ShareX braucht dann ein neues Token.'),
      confirmLabel: t('Widerrufen'),
      icon: <TokenRounded />,
    });
    if (!ok) return;
    try {
      await revokeToken(token.id);
      toast(t('Token widerrufen'), { variant: 'success' });
      reload();
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  return (
    <Stack spacing={4}>
      <SettingsSection
        id="sharex"
        title={t('ShareX einrichten')}
        description={t('Mit ShareX lädst du Screenshots und Dateien direkt in dein Konto hoch und bekommst sofort den Link.')}
      >
        <Box sx={{ px: { xs: 2, sm: 3 }, py: 3 }}>
          <Box
            component="ol"
            sx={{
              listStyle: 'none',
              m: 0,
              p: 0,
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' },
              gap: 2.5,
            }}
          >
            {STEPS.map((step, index) => (
              <Box component="li" key={step.title} sx={{ display: 'flex', gap: 1.5 }}>
                <Box
                  aria-hidden
                  sx={{
                    width: 28,
                    height: 28,
                    flexShrink: 0,
                    borderRadius: `${radius.full}px`,
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: c.primaryContainer,
                    color: c.onPrimaryContainer,
                    fontWeight: 800,
                    fontSize: '0.875rem',
                  }}
                >
                  {index + 1}
                </Box>
                <Box>
                  <Typography variant="subtitle2">{step.title}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {step.text}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
          <Button variant="contained" size="large" startIcon={<CloudUploadRounded />} sx={{ mt: 3 }} onClick={() => create('ShareX', true)}>
            {t('ShareX einrichten')}
          </Button>
        </Box>
      </SettingsSection>

      <SettingsSection
        id="programme"
        title={t('Andere Programme')}
        description={t(
          'Fertige Einstellungen für Linux, macOS, iPhone und eigene Skripte. Jedes Programm bekommt dabei ein eigenes Token.'
        )}
      >
        {CLIENTS.map((item) => (
          <SettingRow
            key={item.kind}
            icon={CLIENT_ICONS[item.kind]}
            label={
              <>
                {item.name}
                <Chip size="small" variant="outlined" label={item.platform} />
              </>
            }
            description={item.description}
          >
            <Button variant="tonal" onClick={() => setupClient(item.kind, item.name)}>
              {t('Einrichten')}
            </Button>
          </SettingRow>
        ))}
      </SettingsSection>

      {telegram && <TelegramSection initial={telegram} />}

      <SettingsSection
        id="tokens"
        title={t('API-Tokens')}
        description={t(
          'Jedes Programm bekommt am besten ein eigenes Token. So kannst du eins widerrufen, ohne die anderen neu einzurichten.'
        )}
        action={
          <Button variant="tonal" startIcon={<AddRounded />} onClick={() => setNaming(true)}>
            {t('Neues Token')}
          </Button>
        }
      >
        <AnimatePresence initial={false}>
          {tokens.map((token) => (
            <m.div
              key={token.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: ease.emphasizedDecelerate }}
            >
              <SettingRow
                icon={<TokenRounded />}
                label={
                  <>
                    {token.name}
                    {token.legacy && <Chip size="small" label={t('Aus der alten Version')} variant="outlined" />}
                    {token.scopes && (
                      <Chip size="small" variant="outlined" label={t('Darf: {list}', { list: token.scopes.map(scopeLabel).join(', ') })} />
                    )}
                    {token.preset && (
                      <Tooltip title={presetSummary(token.preset).join(', ')}>
                        <Chip
                          size="small"
                          label={t('Mit Vorgaben')}
                          sx={{ bgcolor: c.secondaryContainer, color: c.onSecondaryContainer }}
                        />
                      </Tooltip>
                    )}
                  </>
                }
                description={
                  <>
                    <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: '0.8125rem' }}>
                      {token.hint}
                    </Box>
                    {t(', erstellt am {date}, zuletzt benutzt {lastUsedAt}', {
                      date: formatDate(new Date(token.createdAt)),
                      lastUsedAt: relativeMs(token.lastUsedAt),
                    })}
                  </>
                }
              >
                <Tooltip title={t('Bearbeiten')}>
                  <IconButton aria-label={t('{name} bearbeiten', { name: token.name })} onClick={() => setEditing(token)}>
                    <EditOutlined />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('Widerrufen')}>
                  <IconButton
                    aria-label={t('{name} widerrufen', { name: token.name })}
                    onClick={() => revoke(token)}
                    sx={{ '&:hover': { color: c.error } }}
                  >
                    <DeleteOutlineRounded />
                  </IconButton>
                </Tooltip>
              </SettingRow>
            </m.div>
          ))}
        </AnimatePresence>
        {tokens.length === 0 && (
          <Box sx={{ px: { xs: 2, sm: 3 }, py: 3, display: 'flex', alignItems: 'center', gap: 2, color: 'text.secondary' }}>
            <TokenRounded />
            <Typography variant="body2">{t('Noch kein Token. Für das Hochladen im Browser brauchst du keins.')}</Typography>
          </Box>
        )}
      </SettingsSection>

      <TokenDialog
        open={naming || !!editing}
        token={editing}
        maxExpiry={maxExpiry}
        onClose={() => {
          setNaming(false);
          setEditing(null);
        }}
        onSubmit={save}
      />
      <TokenRevealDialog token={revealed} onClose={() => setRevealed(null)} siteTitle={siteTitle} baseUrl={baseUrl} features={features} />
      <ClientSetupDialog
        kind={client?.kind ?? null}
        token={client?.token ?? null}
        siteTitle={siteTitle}
        baseUrl={baseUrl}
        onClose={() => setClient(null)}
      />
    </Stack>
  );
}
