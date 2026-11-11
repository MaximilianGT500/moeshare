import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ComputerRounded from '@mui/icons-material/ComputerRounded';
import SmartphoneRounded from '@mui/icons-material/SmartphoneRounded';
import TabletRounded from '@mui/icons-material/TabletRounded';
import NotificationsActiveRounded from '@mui/icons-material/NotificationsActiveRounded';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import NotificationsOffRounded from '@mui/icons-material/NotificationsOffRounded';
import InstallMobileRounded from '@mui/icons-material/InstallMobileRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import MoveToInboxOutlined from '@mui/icons-material/MoveToInboxOutlined';
import type { NotifyKey } from '../../lib/types';
import {
  ApiError,
  errorMessage,
  fetchPush,
  removePushDevice,
  savePushSubscription,
  testPushDevice,
  updatePushDevice,
  type PushDevice,
  type PushState,
} from '../../lib/api';
import { currentSubscription, endpointHash, permission, PushBlocked, pushSupport, subscribe } from '../../lib/push';
import { relativeMs } from '../../lib/format';
import { siteName } from '../../lib/boot';
import { t } from '../../lib/i18n';
import { SettingRow, SettingsSection, SwitchRow } from '../../components/SettingsKit';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { c, radius } from '../../theme/tokens';

interface PushEvent {
  key: NotifyKey;
  admin: boolean;
  icon: ReactNode;
  label: string;
  description: string;
}

const EVENTS: PushEvent[] = [
  {
    key: 'security',
    admin: false,
    icon: <ShieldOutlined />,
    label: t('Sicherheitshinweise'),
    description: t(
      'Bei einer Anmeldung auf einem neuen Gerät und wenn sich dein Passwort, deine Zwei-Faktor-Anmeldung oder deine Passkeys ändern.'
    ),
  },
  {
    key: 'requests',
    admin: false,
    icon: <MoveToInboxOutlined />,
    label: t('Uploads über Datei-Anfragen'),
    description: t('Wenn jemand über eine deiner Datei-Anfragen etwas hochlädt. Pro Anfrage schaltest du das extra ein.'),
  },
  {
    key: 'reports',
    admin: true,
    icon: <FlagOutlined />,
    label: t('Neue Meldungen'),
    description: t('Wenn jemand Inhalte meldet.'),
  },
  {
    key: 'users',
    admin: true,
    icon: <PersonAddAltOutlined />,
    label: t('Neue Benutzer'),
    description: t('Wenn sich jemand registriert oder eine Einladung annimmt.'),
  },
  {
    key: 'system',
    admin: true,
    icon: <DnsOutlined />,
    label: t('Systemmeldungen'),
    description: t('Wenn ein Zertifikat bald abläuft, Caddy ein Problem meldet oder eine neue Version erscheint.'),
  },
];

function DeviceIcon({ label }: { label: string }) {
  if (/iPhone|Android/.test(label)) return <SmartphoneRounded />;
  if (/iPad/.test(label)) return <TabletRounded />;
  return <ComputerRounded />;
}

function deliveryText(device: PushDevice) {
  const parts = [
    device.lastSuccessAt
      ? t('Zuletzt zugestellt {when}', { when: relativeMs(device.lastSuccessAt) })
      : t('Eingeschaltet {when}', { when: relativeMs(device.createdAt) }),
  ];
  if (device.lastError) parts.push(t('Letzter Fehler: {error}', { error: device.lastError }));
  return parts.join('. ');
}

function OtherDevice({
  device,
  busy,
  divider,
  onTest,
  onRemove,
}: {
  device: PushDevice;
  busy: boolean;
  divider: boolean;
  onTest: () => void;
  onRemove: () => void;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: { xs: 2, sm: 3 },
        py: 1.75,
        borderTop: divider ? `1px solid ${c.outlineVariant}` : 'none',
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: `${radius.md}px`,
          display: 'grid',
          placeItems: 'center',
          bgcolor: c.surfaceContainerHighest,
          color: c.onSurfaceVariant,
        }}
      >
        <DeviceIcon label={device.label} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ fontSize: '0.9375rem' }}>
          {device.label}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {deliveryText(device)}
        </Typography>
      </Box>
      <Tooltip title={t('Testnachricht senden')}>
        <span>
          <IconButton aria-label={t('Testnachricht an {device} senden', { device: device.label })} onClick={onTest} disabled={busy}>
            <SendRounded />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('Push ausschalten')}>
        <span>
          <IconButton
            aria-label={t('Push für {device} ausschalten', { device: device.label })}
            onClick={onRemove}
            disabled={busy}
            sx={{ '&:hover': { color: c.error } }}
          >
            <DeleteOutlineRounded />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}

export function PushSection({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [support] = useState(pushSupport);
  const [state, setState] = useState<PushState | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(() => support === 'ok' && permission() === 'denied');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [next, subscription] = await Promise.all([
      fetchPush(),
      support === 'ok' ? currentSubscription().catch(() => null) : Promise.resolve(null),
    ]);
    setState(next);
    setHash(subscription ? await endpointHash(subscription).catch(() => null) : null);
  }, [support]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  if (!state || !state.enabled) return null;

  const current = hash ? state.devices.find((device) => device.endpointHash === hash) || null : null;
  const others = state.devices.filter((device) => device !== current);
  const events = EVENTS.filter((event) => isAdmin || !event.admin);

  const enable = async () => {
    if (!state.publicKey) return;
    setBusy('on');
    try {
      const subscription = await subscribe(state.publicKey);
      const { device } = await savePushSubscription(subscription.toJSON());
      setHash(device.endpointHash);
      await load();
      toast(t('Push ist auf diesem Gerät eingeschaltet'), { variant: 'success' });
    } catch (failure) {
      if (failure instanceof PushBlocked) {
        setBlocked(permission() === 'denied');
        toast(t('Ohne deine Erlaubnis kann der Browser keine Benachrichtigungen zeigen.'), { variant: 'info', duration: 6000 });
      } else if (failure instanceof ApiError) {
        toast(errorMessage(failure), { variant: 'error', duration: 8000 });
      } else {
        toast(t('Der Browser konnte Push nicht einschalten. Versuch es noch einmal.'), { variant: 'error' });
      }
    } finally {
      setBusy(null);
    }
  };

  const disable = async () => {
    if (!current) return;
    setBusy('off');
    try {
      await removePushDevice(current.id);
      const subscription = await currentSubscription().catch(() => null);
      if (subscription) await subscription.unsubscribe().catch(() => false);
      setHash(null);
      await load();
      toast(t('Push ist auf diesem Gerät ausgeschaltet'), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const test = async (device: PushDevice) => {
    setBusy(`test-${device.id}`);
    try {
      const result = await testPushDevice(device.id);
      if (result.ok) toast(t('Testnachricht verschickt. Sie sollte gleich erscheinen.'), { variant: 'success' });
      else toast(result.error || t('Die Testnachricht kam nicht an.'), { variant: 'error', duration: 9000 });
      await load();
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (key: NotifyKey, on: boolean) => {
    if (!current) return;
    const previous = state;
    setState({
      ...state,
      devices: state.devices.map((device) => (device.id === current.id ? { ...device, events: { ...device.events, [key]: on } } : device)),
    });
    try {
      await updatePushDevice(current.id, { [key]: on });
    } catch (failure) {
      setState(previous);
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const forget = async (device: PushDevice) => {
    const ok = await confirm({
      title: t('Push für {device} ausschalten?', { device: device.label }),
      message: t('Das Gerät bekommt dann keine Push-Benachrichtigungen mehr. Wieder einschalten geht nur auf dem Gerät selbst.'),
      confirmLabel: t('Ausschalten'),
      icon: <NotificationsOffRounded />,
    });
    if (!ok) return;
    try {
      await removePushDevice(device.id);
      await load();
      toast(t('{device} bekommt keine Push-Benachrichtigungen mehr', { device: device.label }), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const spinner = (key: string, icon: ReactNode) => (busy === key ? <CircularProgress size={16} color="inherit" /> : icon);

  const thisDevice = () => {
    if (support === 'install') {
      return (
        <SettingRow
          icon={<InstallMobileRounded />}
          label={t('Erst zum Home-Bildschirm hinzufügen')}
          description={t(
            'Auf iPhone und iPad gibt es Push nur in der App. Tipp in Safari auf Teilen und dann auf „Zum Home-Bildschirm“. Öffne {name} von dort und schalte Push hier ein.',
            { name: siteName() }
          )}
        />
      );
    }
    if (support === 'insecure') {
      return (
        <SettingRow
          icon={<NotificationsOffRounded />}
          label={t('Push braucht HTTPS')}
          description={t('Browser erlauben Push-Benachrichtigungen nur über eine sichere Verbindung.')}
        />
      );
    }
    if (support === 'unsupported') {
      return (
        <SettingRow
          icon={<NotificationsOffRounded />}
          label={t('Dieser Browser kann keine Push-Benachrichtigungen empfangen')}
          description={t('Mit einem aktuellen Chrome, Edge, Firefox oder Safari klappt es.')}
        />
      );
    }
    if (blocked && !current) {
      return (
        <SettingRow
          icon={<NotificationsOffRounded />}
          label={t('Benachrichtigungen sind blockiert')}
          description={t(
            'Du hast {name} das Anzeigen von Benachrichtigungen verboten. Erlaube es in den Website-Einstellungen deines Browsers und lade die Seite neu.',
            { name: siteName() }
          )}
        />
      );
    }
    return (
      <SettingRow
        icon={current ? <NotificationsActiveRounded /> : <NotificationsNoneRounded />}
        label={
          <>
            {t('Dieses Gerät')}
            {current && <Chip size="small" label={t('Eingeschaltet')} sx={{ bgcolor: c.primary, color: c.onPrimary, fontWeight: 700 }} />}
          </>
        }
        description={current ? deliveryText(current) : t('Bekommt noch keine Push-Benachrichtigungen.')}
      >
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {current ? (
            <>
              <Button
                variant="tonal"
                onClick={() => test(current)}
                disabled={Boolean(busy)}
                startIcon={spinner(`test-${current.id}`, <SendRounded />)}
              >
                {t('Test senden')}
              </Button>
              <Button
                onClick={disable}
                disabled={Boolean(busy)}
                startIcon={busy === 'off' ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {t('Ausschalten')}
              </Button>
            </>
          ) : (
            <Button variant="contained" onClick={enable} disabled={Boolean(busy)} startIcon={spinner('on', <NotificationsActiveRounded />)}>
              {t('Einschalten')}
            </Button>
          )}
        </Box>
      </SettingRow>
    );
  };

  return (
    <SettingsSection
      id="push"
      title={t('Push-Benachrichtigungen')}
      description={t(
        'Hinweise direkt aufs Handy oder den Rechner, auch wenn {name} gerade nicht offen ist. Du schaltest sie für jedes Gerät einzeln ein.',
        {
          name: siteName(),
        }
      )}
    >
      {thisDevice()}
      {current &&
        events.map((event) => (
          <SwitchRow
            key={event.key}
            id={`push-${event.key}`}
            icon={event.icon}
            label={event.label}
            description={event.description}
            checked={Boolean(current.events[event.key])}
            onChange={(on) => toggle(event.key, on)}
          />
        ))}
      {others.length > 0 && (
        <Box>
          <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2, pb: 0.25 }}>
            <Typography variant="subtitle2" component="h3" sx={{ color: 'text.secondary' }}>
              {support === 'ok' ? t('Weitere Geräte') : t('Geräte mit Push')}
            </Typography>
          </Box>
          {others.map((device, index) => (
            <OtherDevice
              key={device.id}
              device={device}
              busy={Boolean(busy)}
              divider={index > 0}
              onTest={() => test(device)}
              onRemove={() => forget(device)}
            />
          ))}
        </Box>
      )}
    </SettingsSection>
  );
}
