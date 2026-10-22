import { useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorRounded from '@mui/icons-material/ErrorRounded';
import WarningRounded from '@mui/icons-material/WarningRounded';
import InsightsRounded from '@mui/icons-material/InsightsRounded';
import LoginRounded from '@mui/icons-material/LoginRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import MailRounded from '@mui/icons-material/MailRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import StorageRounded from '@mui/icons-material/StorageRounded';
import DnsRounded from '@mui/icons-material/DnsRounded';
import CableRounded from '@mui/icons-material/CableRounded';
import type { DatabaseChoice, SettingValue, SetupCheck, UrlStyle } from '../../lib/types';
import { UrlStyleSelect, urlStyleLabel } from '../../components/ShareOptions';
import { PasswordField } from '../../components/PasswordField';
import { BytesField, ColorField } from '../../components/Fields';
import { SwitchRow } from '../../components/SettingsKit';
import { BrandMark } from '../../components/BrandMark';
import { formatBytes } from '../../lib/format';
import { mix } from '../../lib/color';
import { c, fonts, radius, srOnly } from '../../theme/tokens';
import { COLOR_PRESETS, DEFAULT_PORTS, WEBHOOK_EVENTS, type DatabaseForm, type StepKey, type Values } from './wizard';
import { rich, t, tn } from '../../lib/i18n';

interface SettingsStepProps {
  values: Values;
  set: (key: string, value: SettingValue) => void;
  errors: Record<string, string>;
}

const str = (values: Values, key: string) => (typeof values[key] === 'string' ? (values[key] as string) : '');
const bool = (values: Values, key: string) => values[key] === true;

function Group({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        borderRadius: `${radius.lg}px`,
        bgcolor: c.surfaceContainer,
        overflow: 'hidden',
        '& > * + *': { borderTop: `1px solid ${c.outlineVariant}` },
      }}
    >
      {children}
    </Box>
  );
}

function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <Box sx={{ mb: 1.25 }}>
      <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>
        {children}
      </Typography>
      {hint && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

interface Choice<T extends string> {
  value: T;
  title: string;
  text: string;
  icon?: ReactNode;
}

function ChoiceCards<T extends string>({
  name,
  value,
  options,
  onChange,
  columns = 1,
}: {
  name: string;
  value: T;
  options: Choice<T>[];
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <Box
      role="radiogroup"
      sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', sm: `repeat(${columns}, minmax(0, 1fr))` } }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Box
            key={option.value}
            component="label"
            sx={{
              position: 'relative',
              display: 'flex',
              gap: 1.5,
              alignItems: 'flex-start',
              p: 2,
              borderRadius: `${radius.md}px`,
              cursor: 'pointer',
              bgcolor: selected ? c.secondaryContainer : c.surfaceContainer,
              color: selected ? c.onSecondaryContainer : 'text.primary',
              boxShadow: `inset 0 0 0 ${selected ? 2 : 1}px ${selected ? c.primary : c.outlineVariant}`,
              transition: 'background-color 180ms ease, box-shadow 180ms ease',
              '&:hover': { bgcolor: selected ? c.secondaryContainer : c.surfaceContainerHigh },
              '&:has(input:focus-visible)': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
            }}
          >
            <Box component="input" type="radio" name={name} checked={selected} onChange={() => onChange(option.value)} sx={srOnly} />
            {option.icon && (
              <Box sx={{ display: 'flex', mt: 0.25, color: selected ? 'inherit' : c.primary, '& svg': { fontSize: 22 } }}>
                {option.icon}
              </Box>
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>{option.title}</Typography>
              <Typography variant="body2" sx={{ color: selected ? 'inherit' : 'text.secondary', mt: 0.25 }}>
                {option.text}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

export function WelcomeStep({ checks }: { checks: SetupCheck[] }) {
  return (
    <Stack spacing={1}>
      {checks.map((check) => {
        const icon = check.ok ? <CheckCircleRounded /> : check.optional ? <WarningRounded /> : <ErrorRounded />;
        const tone = check.ok ? c.success : check.optional ? c.warning : c.error;
        return (
          <Box
            key={check.key}
            sx={{
              display: 'flex',
              gap: 1.5,
              alignItems: 'flex-start',
              p: 1.5,
              borderRadius: `${radius.md}px`,
              bgcolor: c.surfaceContainer,
            }}
          >
            <Box sx={{ color: tone, display: 'flex', mt: 0.125, '& svg': { fontSize: 22 } }}>{icon}</Box>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>{check.label}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {check.detail}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}

const DATABASE_LABELS: Record<DatabaseForm['client'], string> = {
  sqlite: 'SQLite',
  postgres: 'PostgreSQL',
  mysql: t('MySQL oder MariaDB'),
};

export function DatabaseStep({
  current,
  form,
  onChange,
  error,
  testing,
  tested,
  onTest,
  keepsPassword,
}: {
  current: DatabaseChoice;
  form: DatabaseForm;
  onChange: (next: DatabaseForm) => void;
  error?: string;
  testing: boolean;
  tested: { label: string; version: string; accounts: number } | null;
  onTest: () => void;
  keepsPassword: boolean;
}) {
  if (current.locked) {
    return (
      <Alert severity="info" icon={<StorageRounded />}>
        {t('Die Datenbank ist über die Umgebungsvariable DATABASE_URL festgelegt: {label}.', { label: current.label })}
      </Alert>
    );
  }
  const field = (key: 'host' | 'port' | 'database' | 'user', label: string, extra: { placeholder?: string; mono?: boolean } = {}) => (
    <TextField
      label={label}
      fullWidth
      value={form[key]}
      onChange={(event) => onChange({ ...form, [key]: event.target.value })}
      placeholder={extra.placeholder}
      slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'off', style: extra.mono ? { fontFamily: fonts.mono } : undefined } }}
    />
  );
  const server = form.client !== 'sqlite';
  return (
    <Stack spacing={3}>
      <ChoiceCards<DatabaseForm['client']>
        name="database-client"
        value={form.client}
        onChange={(client) => onChange({ ...form, client, port: client === 'sqlite' ? form.port : DEFAULT_PORTS[client] })}
        columns={3}
        options={[
          {
            value: 'sqlite',
            title: t('SQLite'),
            text: t('Eine Datei im Ordner db. Nichts weiter einzurichten.'),
            icon: <StorageRounded />,
          },
          {
            value: 'postgres',
            title: 'PostgreSQL',
            text: t('Für große Server oder wenn schon eine Datenbank läuft.'),
            icon: <DnsRounded />,
          },
          { value: 'mysql', title: t('MySQL oder MariaDB'), text: t('Läuft auf fast jedem Webspace.'), icon: <DnsRounded /> },
        ]}
      />
      {server && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(6, minmax(0, 1fr))' } }}>
          <Box sx={{ gridColumn: { sm: 'span 4' } }}>{field('host', t('Server'), { placeholder: 'localhost', mono: true })}</Box>
          <Box sx={{ gridColumn: { sm: 'span 2' } }}>{field('port', t('Port'), { mono: true })}</Box>
          <Box sx={{ gridColumn: { sm: 'span 3' } }}>{field('database', t('Datenbank'), { placeholder: 'moeshare', mono: true })}</Box>
          <Box sx={{ gridColumn: { sm: 'span 3' } }}>{field('user', t('Benutzer'), { placeholder: 'moeshare', mono: true })}</Box>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <PasswordField
              label={t('Passwort')}
              value={form.password}
              onChange={(password) => onChange({ ...form, password })}
              autoComplete="new-password"
              helperText={keepsPassword && !form.password ? t('Leer lassen, um das gespeicherte Passwort zu behalten.') : undefined}
            />
          </Box>
          <FormControlLabel
            sx={{ gridColumn: '1 / -1' }}
            control={<Checkbox checked={form.ssl} onChange={(event) => onChange({ ...form, ssl: event.target.checked })} />}
            label={t('Verschlüsselt verbinden (TLS)')}
          />
        </Box>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {tested && !error && (
        <Alert severity={tested.accounts ? 'warning' : 'success'}>
          {tested.accounts
            ? tn(
                tested.accounts,
                'Verbunden mit {label}, Version {version}. In dieser Datenbank gibt es schon ein Konto. Nach dem Wechsel meldest du dich damit an, die Einrichtung ist dann schon erledigt.',
                'Verbunden mit {label}, Version {version}. In dieser Datenbank gibt es schon {count} Konten. Nach dem Wechsel meldest du dich damit an, die Einrichtung ist dann schon erledigt.',
                { label: tested.label, version: tested.version }
              )
            : t('Verbunden mit {label}, Version {version}.', { label: tested.label, version: tested.version })}
        </Alert>
      )}
      {server && (
        <Box>
          <Button
            variant="tonal"
            onClick={onTest}
            disabled={testing || !form.host.trim() || !form.database.trim()}
            startIcon={testing ? <CircularProgress size={16} color="inherit" /> : <CableRounded />}
          >
            {t('Verbindung testen')}
          </Button>
        </Box>
      )}
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t(
          'Gerade verbunden: {label}. Die Tabellen legt MoeShare selbst an, die Datenbank muss nur existieren und der Benutzer Tabellen erstellen dürfen.',
          { label: current.label }
        )}
      </Typography>
    </Stack>
  );
}

export function databaseSummary(form: DatabaseForm, current: DatabaseChoice) {
  if (current.locked) return current.label;
  if (form.client === 'sqlite') return t('SQLite (db/datenbank.sqlite)');
  return `${DATABASE_LABELS[form.client]} ${form.user ? `${form.user}@` : ''}${form.host}:${form.port}/${form.database}`;
}

export function AccountStep({
  account,
  onChange,
  errors,
  minLength,
}: {
  account: { username: string; password: string };
  onChange: (next: { username: string; password: string }) => void;
  errors: Record<string, string>;
  minLength: number;
}) {
  return (
    <Stack spacing={2.5}>
      <TextField
        label={t('Benutzername')}
        autoFocus
        fullWidth
        value={account.username}
        onChange={(event) => onChange({ ...account, username: event.target.value })}
        error={!!errors.username}
        helperText={errors.username || t('Buchstaben, Ziffern, Punkt, Unterstrich oder Bindestrich.')}
        slotProps={{ htmlInput: { autoComplete: 'username', autoCapitalize: 'off', spellCheck: false, maxLength: 32 } }}
      />
      <PasswordField
        label={t('Passwort')}
        value={account.password}
        onChange={(password) => onChange({ ...account, password })}
        autoComplete="new-password"
        error={!!errors.password}
        helperText={errors.password}
        strength={{ minLength, username: account.username }}
      />
    </Stack>
  );
}

export function SiteStep({ values, set, errors }: SettingsStepProps) {
  const baseUrl = str(values, 'site.baseUrl');
  const color = str(values, 'site.uiColor');
  const mismatch = baseUrl && baseUrl !== window.location.origin;
  return (
    <Stack spacing={3}>
      <TextField
        label={t('Name der Seite')}
        fullWidth
        value={str(values, 'site.title')}
        onChange={(event) => set('site.title', event.target.value)}
        error={!!errors['site.title']}
        helperText={errors['site.title'] || t('Steht im Browser-Tab, auf der Startseite und in Link-Vorschauen.')}
        slotProps={{ htmlInput: { maxLength: 60 } }}
      />
      <Box>
        <TextField
          label={t('Adresse')}
          fullWidth
          value={baseUrl}
          onChange={(event) => set('site.baseUrl', event.target.value)}
          error={!!errors['site.baseUrl']}
          helperText={
            errors['site.baseUrl'] ||
            t('Unter dieser Adresse erreichen andere deine Seite. Daraus entstehen alle Links, und Passkeys sind an sie gebunden.')
          }
          placeholder="https://share.example.com"
          slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'off', style: { fontFamily: fonts.mono } } }}
        />
        {mismatch && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            {rich(
              'Du hast den Assistenten über {origin} geöffnet. Stimmt die Adresse oben, ist alles gut, sonst übernimm {link}.',
              {
                link: (
                  <ButtonBase
                    onClick={() => set('site.baseUrl', window.location.origin)}
                    sx={{ font: 'inherit', fontWeight: 700, textDecoration: 'underline', verticalAlign: 'baseline' }}
                  >
                    {t('diese Adresse')}
                  </ButtonBase>
                ),
              },
              { origin: window.location.origin }
            )}
          </Alert>
        )}
      </Box>
      <Box>
        <Label hint={t('Die Seite färbt sich sofort um, damit du das Ergebnis siehst.')}>{t('Grundfarbe')}</Label>
        <Box role="radiogroup" aria-label={t('Farbvorlagen')} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center' }}>
          {COLOR_PRESETS.map((preset) => {
            const selected = preset.hex === color;
            return (
              <ButtonBase
                key={preset.hex}
                role="radio"
                aria-checked={selected}
                aria-label={preset.name}
                title={preset.name}
                onClick={() => set('site.uiColor', preset.hex)}
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  bgcolor: preset.hex,
                  boxShadow: selected
                    ? `0 0 0 3px ${c.surfaceContainerLow}, 0 0 0 5px ${preset.hex}`
                    : `inset 0 0 0 1px ${mix('#000000', 18)}`,
                  transition: 'box-shadow 160ms ease, transform 160ms ease',
                  '&:hover': { transform: 'scale(1.08)' },
                  '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 4 },
                }}
              />
            );
          })}
          <ColorField
            label={t('Eigene Farbe')}
            value={color}
            onChange={(hex) => set('site.uiColor', hex)}
            error={!!errors['site.uiColor']}
            helperText={errors['site.uiColor']}
          />
        </Box>
      </Box>
      <Box>
        <Label hint={t('Für Besucher und neue Konten. Jeder kann sie später für sich ändern.')}>{t('Sprache')}</Label>
        <ChoiceCards
          name="site-language"
          value={str(values, 'site.language') || 'de'}
          onChange={(language) => set('site.language', language)}
          columns={2}
          options={[
            { value: 'de', title: 'Deutsch', text: t('Die Oberfläche auf Deutsch.') },
            { value: 'en', title: 'English', text: t('The interface in English.') },
          ]}
        />
      </Box>
      <Box>
        <Label hint={t('Optional. Adresse eines Bildes (PNG oder SVG), z. B. dein Logo.')}>{t('Symbol')}</Label>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <BrandMark src={str(values, 'site.favicon')} title={str(values, 'site.title') || 'M'} size={48} />
          <TextField
            fullWidth
            size="small"
            value={str(values, 'site.favicon')}
            onChange={(event) => set('site.favicon', event.target.value)}
            error={!!errors['site.favicon']}
            helperText={errors['site.favicon']}
            placeholder="https://example.com/logo.png"
            slotProps={{ htmlInput: { 'aria-label': t('Symbol'), spellCheck: false, style: { fontFamily: fonts.mono } } }}
          />
        </Box>
      </Box>
    </Stack>
  );
}

type HomeMode = 'page' | 'login' | 'redirect';

export function HomeStep({ values, set, errors }: SettingsStepProps) {
  const [mode, setMode] = useState<HomeMode>(
    bool(values, 'home.enabled') ? 'page' : str(values, 'site.redirectUrl') ? 'redirect' : 'login'
  );
  const choose = (next: HomeMode) => {
    setMode(next);
    set('home.enabled', next === 'page');
    if (next !== 'redirect') set('site.redirectUrl', '');
  };
  return (
    <Stack spacing={2.5}>
      <ChoiceCards<HomeMode>
        name="home-mode"
        value={mode}
        onChange={choose}
        options={[
          {
            value: 'page',
            title: t('Startseite mit Statistiken'),
            text: t(
              'Zeigt Dateien, Speicher, Aufrufe und die Uploads der letzten Tage. Texte und Links passt du später unter Admin › Startseite an.'
            ),
            icon: <InsightsRounded />,
          },
          {
            value: 'login',
            title: t('Direkt zur Anmeldung'),
            text: t('Wer die Adresse öffnet, landet bei der Anmeldung oder im eigenen Dashboard.'),
            icon: <LoginRounded />,
          },
          {
            value: 'redirect',
            title: t('Auf eine andere Seite weiterleiten'),
            text: t('Zum Beispiel auf deine eigene Website.'),
            icon: <OpenInNewRounded />,
          },
        ]}
      />
      {mode === 'redirect' && (
        <TextField
          label={t('Ziel der Weiterleitung')}
          fullWidth
          autoFocus
          value={str(values, 'site.redirectUrl')}
          onChange={(event) => set('site.redirectUrl', event.target.value)}
          error={!!errors['site.redirectUrl']}
          helperText={errors['site.redirectUrl']}
          placeholder="https://example.com"
          slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'off', style: { fontFamily: fonts.mono } } }}
        />
      )}
    </Stack>
  );
}

export function UploadsStep({ values, set, errors, ffmpeg }: SettingsStepProps & { ffmpeg: boolean }) {
  const bytes = (key: string) => (typeof values[key] === 'number' ? (values[key] as number) : null);
  return (
    <Stack spacing={3}>
      <Box>
        <Label hint={t('So sehen neue Links aus. Jeder kann das für sich und beim Hochladen ändern.')}>{t('Adressen')}</Label>
        <UrlStyleSelect
          label=""
          value={(str(values, 'uploads.urlStyle') || 'uuid') as UrlStyle}
          onChange={(style) => style && set('uploads.urlStyle', style)}
        />
        {errors['uploads.urlStyle'] && (
          <Typography variant="caption" sx={{ color: c.error }}>
            {errors['uploads.urlStyle']}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <Box>
          <Label hint={t('Pro Upload.')}>{t('Größte Datei')}</Label>
          <BytesField
            label={t('Dateigröße')}
            value={bytes('uploads.maxFileBytes')}
            onChange={(value) => set('uploads.maxFileBytes', value)}
            error={!!errors['uploads.maxFileBytes']}
            helperText={errors['uploads.maxFileBytes']}
          />
        </Box>
        <Box>
          <Label hint={t('Für jedes Konto, änderbar pro Benutzer.')}>{t('Speicher pro Konto')}</Label>
          <BytesField
            label={t('Speicher')}
            value={bytes('uploads.defaultQuotaBytes')}
            onChange={(value) => set('uploads.defaultQuotaBytes', value)}
            error={!!errors['uploads.defaultQuotaBytes']}
            helperText={errors['uploads.defaultQuotaBytes']}
          />
        </Box>
      </Box>
      <Group>
        <SwitchRow
          id="setup-preview"
          label={t('Vorschaubilder')}
          description={t('Kleinere Vorschauen für Bilder und Standbilder für Videos. Die Galerie lädt dadurch deutlich schneller.')}
          checked={bool(values, 'uploads.preview')}
          onChange={(on) => set('uploads.preview', on)}
        />
        <SwitchRow
          id="setup-metadata"
          label={t('Standortdaten entfernen')}
          description={t('Löscht GPS-Koordinaten aus Fotos, bevor sie öffentlich erreichbar sind.')}
          checked={bool(values, 'uploads.removeMetadata')}
          onChange={(on) => set('uploads.removeMetadata', on)}
        />
        <SwitchRow
          id="setup-color"
          label={t('Hauptfarbe erkennen')}
          description={t('Färbt Ansichtsseite und Discord-Vorschau passend zum Bild.')}
          checked={bool(values, 'uploads.dominantColor')}
          onChange={(on) => set('uploads.dominantColor', on)}
        />
        <SwitchRow
          id="setup-hls"
          label={t('Videos als Stream')}
          description={
            ffmpeg
              ? t(
                  'Wandelt Videos zusätzlich in einen Stream um, damit lange Videos schneller starten. Braucht mehr Speicher und Rechenzeit.'
                )
              : t('Braucht FFmpeg, das auf diesem Server fehlt.')
          }
          checked={ffmpeg && bool(values, 'uploads.hls')}
          disabled={!ffmpeg}
          onChange={(on) => set('uploads.hls', on)}
        />
        <SwitchRow
          id="setup-fetch"
          label={t('Hochladen per Link')}
          description={t('Im Dashboard Dateien direkt aus dem Internet übernehmen.')}
          checked={bool(values, 'uploads.urlFetch')}
          onChange={(on) => set('uploads.urlFetch', on)}
        />
      </Group>
    </Stack>
  );
}

export function SignInStep({ values, set }: SettingsStepProps) {
  const secure = window.isSecureContext;
  return (
    <Stack spacing={3}>
      <Box>
        <Label>{t('Wer bekommt ein Konto?')}</Label>
        <ChoiceCards
          name="registration"
          value={str(values, 'auth.registration') || 'invite'}
          onChange={(value) => set('auth.registration', value)}
          columns={3}
          options={[
            { value: 'closed', title: t('Nur Admins'), text: t('Konten legst du selbst an.'), icon: <LockRounded /> },
            { value: 'invite', title: t('Mit Einladung'), text: t('Über Links, die du verschickst.'), icon: <MailRounded /> },
            { value: 'open', title: t('Alle'), text: t('Jeder kann sich registrieren.'), icon: <PublicRounded /> },
          ]}
        />
      </Box>
      <Box>
        <Label hint={t('Ein Code aus einer Authenticator-App zusätzlich zum Passwort.')}>{t('Zwei-Faktor-Pflicht')}</Label>
        <ChoiceCards
          name="mfa"
          value={str(values, 'auth.enforceMfa') || 'off'}
          onChange={(value) => set('auth.enforceMfa', value)}
          columns={3}
          options={[
            { value: 'off', title: t('Freiwillig'), text: t('Jeder entscheidet selbst.') },
            { value: 'admins', title: t('Für Admins'), text: t('Admins müssen sie nutzen.') },
            { value: 'all', title: t('Für alle'), text: t('Gilt für jedes Konto.') },
          ]}
        />
        {str(values, 'auth.enforceMfa') !== 'off' && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            {t('Du richtest die Zwei-Faktor-Anmeldung direkt nach der Einrichtung ein.')}
          </Alert>
        )}
      </Box>
      <Group>
        <SwitchRow
          id="setup-passkeys"
          label={t('Passkeys')}
          description={
            secure
              ? t('Anmelden mit Fingerabdruck, Gesicht oder Geräte-PIN.')
              : t('Anmelden mit Fingerabdruck, Gesicht oder Geräte-PIN. Funktioniert nur über HTTPS oder localhost.')
          }
          checked={bool(values, 'auth.passkeys')}
          onChange={(on) => set('auth.passkeys', on)}
        />
      </Group>
    </Stack>
  );
}

export function NotifyStep({
  values,
  set,
  errors,
  url,
  onUrl,
  stored,
  onTest,
}: SettingsStepProps & { url: string; onUrl: (url: string) => void; stored: boolean; onTest: () => Promise<void> }) {
  const [testing, setTesting] = useState(false);
  const enabled = bool(values, 'webhook.enabled');
  const events = Array.isArray(values['webhook.events']) ? (values['webhook.events'] as string[]) : [];
  const toggleEvent = (key: string) =>
    set('webhook.events', events.includes(key) ? events.filter((item) => item !== key) : [...events, key]);
  const test = async () => {
    setTesting(true);
    await onTest();
    setTesting(false);
  };
  return (
    <Stack spacing={3}>
      <Group>
        <SwitchRow
          id="setup-webhook"
          label={t('Nachrichten an Discord senden')}
          description={t('Über einen Webhook in einem Kanal deiner Wahl.')}
          checked={enabled}
          onChange={(on) => set('webhook.enabled', on)}
        />
      </Group>
      {enabled && (
        <>
          <Box>
            <TextField
              label={t('Webhook-Adresse')}
              fullWidth
              value={url}
              onChange={(event) => onUrl(event.target.value)}
              error={!!errors['webhook.url'] || !!errors['webhook.enabled']}
              helperText={
                errors['webhook.url'] ||
                errors['webhook.enabled'] ||
                (stored
                  ? t('Eine Adresse ist schon hinterlegt. Trag nur etwas ein, wenn du sie ersetzen willst.')
                  : t('In Discord unter Kanal bearbeiten › Integrationen › Webhooks.'))
              }
              placeholder="https://discord.com/api/webhooks/…"
              slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'off', style: { fontFamily: fonts.mono } } }}
            />
            <Button
              sx={{ mt: 1.5 }}
              variant="tonal"
              onClick={test}
              disabled={testing || (!url.trim() && !stored)}
              startIcon={testing ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
            >
              {t('Testnachricht senden')}
            </Button>
          </Box>
          <Box>
            <Label>{t('Worüber benachrichtigen?')}</Label>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {WEBHOOK_EVENTS.map((event) => (
                <Chip
                  key={event.key}
                  label={event.label}
                  onClick={() => toggleEvent(event.key)}
                  variant={events.includes(event.key) ? 'filled' : 'outlined'}
                  aria-pressed={events.includes(event.key)}
                  sx={events.includes(event.key) ? { bgcolor: c.secondaryContainer, color: c.onSecondaryContainer } : undefined}
                />
              ))}
            </Box>
          </Box>
        </>
      )}
    </Stack>
  );
}

const REGISTRATION = {
  closed: t('Nur Admins legen Konten an'),
  invite: t('Konten nur mit Einladung'),
  open: t('Jeder kann sich registrieren'),
} as Record<string, string>;
const MFA = {
  off: t('Zwei-Faktor freiwillig'),
  admins: t('Zwei-Faktor Pflicht für Admins'),
  all: t('Zwei-Faktor Pflicht für alle'),
} as Record<string, string>;

function Summary({
  title,
  step,
  onEdit,
  children,
}: {
  title: string;
  step: StepKey;
  onEdit: (step: StepKey) => void;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', px: 2, py: 1.75 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {title}
        </Typography>
        <Box sx={{ mt: 0.25, fontWeight: 600, overflowWrap: 'anywhere' }}>{children}</Box>
      </Box>
      <Button size="small" startIcon={<EditRounded />} onClick={() => onEdit(step)}>
        {t('Ändern')}
      </Button>
    </Box>
  );
}

export function ReviewStep({
  values,
  username,
  webhookUrl,
  createToken,
  onCreateToken,
  onEdit,
  database,
}: {
  values: Values;
  username: string;
  webhookUrl: string;
  createToken: boolean;
  onCreateToken: (value: boolean) => void;
  onEdit: (step: StepKey) => void;
  database: string;
}) {
  const bytes = (key: string) => (typeof values[key] === 'number' ? formatBytes(values[key] as number) : null);
  const fileLimit = bytes('uploads.maxFileBytes');
  const quota = bytes('uploads.defaultQuotaBytes');
  const limits = [
    fileLimit ? t('Bis {fileLimit} pro Datei', { fileLimit }) : t('Dateien ohne Größenlimit'),
    quota ? t('{quota} Speicher pro Konto', { quota }) : t('Speicher ohne Limit'),
  ].join(', ');
  const processing = [
    bool(values, 'uploads.preview') && t('Vorschaubilder'),
    bool(values, 'uploads.removeMetadata') && t('ohne Standortdaten'),
    bool(values, 'uploads.dominantColor') && t('Hauptfarbe'),
    bool(values, 'uploads.hls') && 'Video-Streams',
    bool(values, 'uploads.urlFetch') && t('Hochladen per Link'),
  ].filter(Boolean);
  const home = bool(values, 'home.enabled')
    ? t('Startseite mit Statistiken')
    : str(values, 'site.redirectUrl')
      ? t('Weiterleitung auf {url}', { url: str(values, 'site.redirectUrl') })
      : t('Direkt zur Anmeldung');

  return (
    <Stack spacing={2.5}>
      <Group>
        <Summary title={t('Datenbank')} step="database" onEdit={onEdit}>
          {database}
        </Summary>
        <Summary title={t('Admin-Konto')} step="account" onEdit={onEdit}>
          {username}
        </Summary>
        <Summary title={t('Seite')} step="site" onEdit={onEdit}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: str(values, 'site.uiColor'), flexShrink: 0 }} />
            {str(values, 'site.title')}
          </Box>
          <Box component="span" sx={{ fontFamily: fonts.mono, fontWeight: 400, fontSize: '0.8125rem' }}>
            {str(values, 'site.baseUrl')}
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {str(values, 'site.language') === 'en' ? 'English' : 'Deutsch'}
          </Typography>
        </Summary>
        <Summary title={t('Startseite')} step="home" onEdit={onEdit}>
          {home}
        </Summary>
        <Summary title={t('Uploads')} step="uploads" onEdit={onEdit}>
          {limits}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Adressen: {style}', { style: urlStyleLabel((str(values, 'uploads.urlStyle') || 'uuid') as UrlStyle) })}
          </Typography>
          {processing.length > 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {processing.join(', ')}
            </Typography>
          )}
        </Summary>
        <Summary title={t('Anmeldung')} step="signin" onEdit={onEdit}>
          {REGISTRATION[str(values, 'auth.registration')]}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {MFA[str(values, 'auth.enforceMfa')]}, {bool(values, 'auth.passkeys') ? t('Passkeys an') : t('Passkeys aus')}
          </Typography>
        </Summary>
        <Summary title={t('Benachrichtigungen')} step="notify" onEdit={onEdit}>
          {bool(values, 'webhook.enabled') ? (webhookUrl ? t('An Discord, neue Adresse') : t('An Discord')) : t('Aus')}
        </Summary>
      </Group>
      <FormControlLabel
        control={<Checkbox checked={createToken} onChange={(event) => onCreateToken(event.target.checked)} />}
        label={t('Gleich ein API-Token für ShareX erstellen')}
      />
    </Stack>
  );
}
