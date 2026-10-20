import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import TuneRounded from '@mui/icons-material/TuneRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import LoginRounded from '@mui/icons-material/LoginRounded';
import HubRounded from '@mui/icons-material/HubRounded';
import GavelRounded from '@mui/icons-material/GavelRounded';
import NotificationsRounded from '@mui/icons-material/NotificationsRounded';
import DnsRounded from '@mui/icons-material/DnsRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import type { SettingsPayload, SettingValue, SiteLink } from '../../lib/types';
import { LinkListEditor } from '../../components/LinkListEditor';
import { providerIcon } from '../../lib/providers';
import { ApiError, errorMessage, saveSettings, testWebhook } from '../../lib/api';
import { SaveBar, SettingRow, SettingsSection, SwitchRow } from '../../components/SettingsKit';
import { BytesField, ColorField } from '../../components/Fields';
import { BrandMark } from '../../components/BrandMark';
import { CopyIconButton } from '../../components/CopyButton';
import { useToast } from '../../components/Toaster';
import { isCancelled, useSudo } from '../../components/Sudo';
import { buildScheme } from '../../theme/scheme';
import { useThemeSeed } from '../../app/mount';
import { c, ease, fonts, radius } from '../../theme/tokens';

type Values = Record<string, SettingValue>;
type SectionKey = 'allgemein' | 'uploads' | 'anmeldung' | 'dienste' | 'rechtliches' | 'benachrichtigungen' | 'system';

const SECTIONS: Array<{ key: SectionKey; label: string; icon: ReactNode; prefixes: string[] }> = [
  { key: 'allgemein', label: 'Allgemein', icon: <TuneRounded />, prefixes: ['site.'] },
  { key: 'uploads', label: 'Uploads', icon: <CloudUploadRounded />, prefixes: ['uploads.'] },
  {
    key: 'anmeldung',
    label: 'Anmeldung',
    icon: <LoginRounded />,
    prefixes: ['auth.registration', 'auth.sessionDays', 'auth.passwordMinLength', 'auth.enforceMfa', 'auth.passkeys', 'auth.tokenLogin'],
  },
  {
    key: 'dienste',
    label: 'Anmeldedienste',
    icon: <HubRounded />,
    prefixes: ['auth.discord.', 'auth.github.', 'auth.google.', 'auth.microsoft.', 'auth.gitlab.', 'auth.oidc.'],
  },
  { key: 'rechtliches', label: 'Rechtliches und Links', icon: <GavelRounded />, prefixes: ['legal.', 'site.links'] },
  { key: 'benachrichtigungen', label: 'Benachrichtigungen', icon: <NotificationsRounded />, prefixes: ['webhook.'] },
  { key: 'system', label: 'System', icon: <DnsRounded />, prefixes: ['system.'] },
];

const sectionOf = (key: string) =>
  SECTIONS.flatMap((s) => s.prefixes.map((prefix) => ({ prefix, key: s.key })))
    .filter(({ prefix }) => key === prefix || key.startsWith(prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]?.key;

type ProviderKey = 'discord' | 'github' | 'google' | 'microsoft' | 'gitlab' | 'oidc';

const PROVIDERS: Array<{ key: ProviderKey; label: string; steps: string; console?: (values: Values) => string }> = [
  {
    key: 'discord',
    label: 'Discord',
    steps: 'Lege im Developer Portal eine Anwendung an und füge unter OAuth2 die Redirect-Adresse hinzu.',
    console: () => 'https://discord.com/developers/applications',
  },
  {
    key: 'github',
    label: 'GitHub',
    steps:
      'Lege unter Settings › Developer settings › OAuth Apps eine App an und trage die Redirect-Adresse als Authorization callback URL ein.',
    console: (values) => `${String(values['auth.github.baseUrl'] || 'https://github.com')}/settings/developers`,
  },
  {
    key: 'google',
    label: 'Google',
    steps:
      'Lege in der Google Cloud Console unter APIs und Dienste › Anmeldedaten eine OAuth-Client-ID vom Typ Webanwendung an und trage die Redirect-Adresse als autorisierte Weiterleitungs-URI ein.',
    console: () => 'https://console.cloud.google.com/apis/credentials',
  },
  {
    key: 'microsoft',
    label: 'Microsoft',
    steps:
      'Registriere im Microsoft Entra Admin Center unter App-Registrierungen eine App mit der Plattform Web und der Redirect-Adresse. Unter Zertifikate und Geheimnisse erstellst du das Client-Secret.',
    console: () => 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
  },
  {
    key: 'gitlab',
    label: 'GitLab',
    steps:
      'Lege unter Einstellungen › Anwendungen eine vertrauliche Anwendung mit den Scopes openid und profile und der Redirect-Adresse an.',
    console: (values) => `${String(values['auth.gitlab.baseUrl'] || 'https://gitlab.com')}/-/user_settings/applications`,
  },
  {
    key: 'oidc',
    label: 'OIDC',
    steps:
      'Für Authentik, Keycloak, Authelia, Zitadel, Pocket ID und andere OpenID-Connect-Anbieter. Lege dort einen vertraulichen Client (Authorization Code) mit der Redirect-Adresse an.',
  },
];

const WEBHOOK_EVENTS = [
  { key: 'upload', label: 'Uploads' },
  { key: 'delete', label: 'Löschungen' },
  { key: 'user', label: 'Benutzer' },
  { key: 'security', label: 'Sicherheit' },
  { key: 'processing', label: 'Verarbeitung' },
  { key: 'system', label: 'Systemfehler' },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function SchemeSwatches({ seed }: { seed: string }) {
  const swatches = useMemo(() => {
    try {
      const dark = buildScheme(seed, true);
      const light = buildScheme(seed, false);
      return [
        { label: 'Primär', colors: [light.primary, dark.primary] },
        { label: 'Container', colors: [light.primaryContainer, dark.primaryContainer] },
        { label: 'Sekundär', colors: [light.secondaryContainer, dark.secondaryContainer] },
        { label: 'Tertiär', colors: [light.tertiaryContainer, dark.tertiaryContainer] },
        { label: 'Fläche', colors: [light.surfaceContainer, dark.surfaceContainer] },
      ];
    } catch {
      return [];
    }
  }, [seed]);
  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }} aria-label="Farbvorschau hell und dunkel">
      {swatches.map((swatch) => (
        <Box key={swatch.label} sx={{ textAlign: 'center' }}>
          <Box
            sx={{ display: 'flex', borderRadius: `${radius.sm}px`, overflow: 'hidden', boxShadow: `inset 0 0 0 1px ${c.outlineVariant}` }}
          >
            {swatch.colors.map((color, index) => (
              <Box key={index} sx={{ width: 26, height: 32, bgcolor: color, transition: 'background-color 300ms ease' }} />
            ))}
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {swatch.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export function SettingsPanel({
  initial,
  currentUserTotp,
  initialSection = 'allgemein',
  onSaved,
}: {
  initial: SettingsPayload;
  currentUserTotp: boolean;
  initialSection?: string;
  onSaved: (payload: SettingsPayload) => void;
}) {
  const toast = useToast();
  const sudo = useSudo();
  const applySeed = useThemeSeed();
  const [saved, setSaved] = useState<Values>(initial.values);
  const [draft, setDraft] = useState<Values>(initial.values);
  const [secretSet, setSecretSet] = useState(initial.secrets);
  const [secrets, setSecrets] = useState<Record<string, string | undefined>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [section, setSection] = useState<SectionKey>(() =>
    SECTIONS.some((candidate) => candidate.key === initialSection) ? (initialSection as SectionKey) : 'allgemein'
  );
  const [provider, setProvider] = useState<ProviderKey>(
    () => PROVIDERS.find(({ key }) => initial.values[`auth.${key}.enabled`] === true)?.key || 'discord'
  );
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const changedKeys = useMemo(() => {
    const keys = Object.keys(draft).filter((key) => !same(draft[key], saved[key]));
    for (const [key, value] of Object.entries(secrets)) if (value !== undefined) keys.push(key);
    return keys;
  }, [draft, saved, secrets]);
  const dirtySections = new Set(changedKeys.map(sectionOf));

  const v = <T extends SettingValue>(key: string) => draft[key] as T;
  const set = (key: string, value: SettingValue) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const save = async () => {
    setBusy(true);
    setErrors({});
    const patch: Values = {};
    for (const key of changedKeys) patch[key] = key in secrets && secrets[key] !== undefined ? (secrets[key] as string) : draft[key];
    try {
      const result = await sudo(() => saveSettings(patch));
      setSaved(result.values);
      setDraft(result.values);
      setSecretSet(result.secrets);
      setSecrets({});
      onSaved({ ...initial, values: result.values, secrets: result.secrets });
      toast('Einstellungen gespeichert', { variant: 'success' });
      if (patch['site.uiColor'] !== undefined) applySeed(result.values['site.uiColor'] as string);
      if (patch['site.title'] !== undefined || patch['site.favicon'] !== undefined) {
        toast('Name und Symbol siehst du nach dem Neuladen der Seite.', { variant: 'info' });
      }
    } catch (failure) {
      if (isCancelled(failure)) return;
      if (failure instanceof ApiError && failure.field) {
        setErrors({ [failure.field]: failure.message });
        const target = sectionOf(failure.field);
        if (target) setSection(target);
      }
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setDraft(saved);
    setSecrets({});
    setErrors({});
  };

  const text = (
    key: string,
    label: string,
    description: ReactNode,
    options: { placeholder?: string; mono?: boolean; helper?: string } = {}
  ) => (
    <SettingRow label={label} description={description} stacked>
      <TextField
        value={(v<string>(key) ?? '') as string}
        onChange={(event) => set(key, event.target.value)}
        placeholder={options.placeholder}
        size="small"
        fullWidth
        error={!!errors[key]}
        helperText={errors[key] || options.helper}
        slotProps={{ htmlInput: { 'aria-label': label, spellCheck: false, style: options.mono ? { fontFamily: fonts.mono } : undefined } }}
      />
    </SettingRow>
  );

  const toggle = (key: string, label: string, description: ReactNode) => (
    <SwitchRow
      id={`setting-${key}`}
      label={label}
      description={errors[key] || description}
      checked={Boolean(v<boolean>(key))}
      onChange={(value) => set(key, value)}
    />
  );

  const number = (key: string, label: string, description: ReactNode, { min, max, unit }: { min: number; max: number; unit: string }) => (
    <SettingRow label={label} description={description}>
      <TextField
        type="number"
        size="small"
        value={v<number>(key)}
        onChange={(event) => set(key, event.target.value === '' ? '' : Number(event.target.value))}
        error={!!errors[key]}
        helperText={errors[key]}
        sx={{ width: 150 }}
        slotProps={{
          htmlInput: { min, max, 'aria-label': label },
          input: {
            endAdornment: (
              <Typography variant="body2" sx={{ color: 'text.secondary', ml: 1 }}>
                {unit}
              </Typography>
            ),
          },
        }}
      />
    </SettingRow>
  );

  const choice = (key: string, label: string, description: ReactNode, options: Array<{ value: string; label: string }>) => (
    <SettingRow label={label} description={errors[key] || description} stacked>
      <ToggleButtonGroup
        exclusive
        value={v<string>(key)}
        onChange={(_e, next) => next && set(key, next)}
        aria-label={label}
        sx={{ flexWrap: 'wrap' }}
      >
        {options.map((option) => (
          <ToggleButton key={option.value} value={option.value}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </SettingRow>
  );

  const list = (key: string, label: string, description: ReactNode, placeholder: string) => (
    <SettingRow label={label} description={description} stacked>
      <Autocomplete
        multiple
        freeSolo
        options={[]}
        value={(v<string[]>(key) || []) as string[]}
        onChange={(_e, next) => set(key, (next as string[]).map((item) => item.trim()).filter(Boolean))}
        renderValue={(value, getItemProps) =>
          value.map((option, index) => <Chip size="small" label={option} {...getItemProps({ index })} key={option} />)
        }
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            placeholder={placeholder}
            error={!!errors[key]}
            helperText={errors[key] || 'Mit Enter hinzufügen'}
          />
        )}
      />
    </SettingRow>
  );

  const secret = (key: string, label: string, description: ReactNode) => {
    const stored = secretSet[key];
    const pending = secrets[key];
    return (
      <SettingRow label={label} description={description} stacked>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            type="password"
            size="small"
            fullWidth
            value={pending ?? ''}
            placeholder={stored && pending === undefined ? 'Gespeichert. Zum Ändern neu eingeben.' : ''}
            onChange={(event) =>
              setSecrets((prev) => ({ ...prev, [key]: event.target.value === '' && !stored ? undefined : event.target.value }))
            }
            error={!!errors[key]}
            helperText={errors[key] || (pending === '' ? 'Wird beim Speichern entfernt.' : undefined)}
            slotProps={{ htmlInput: { autoComplete: 'off', 'aria-label': label, spellCheck: false } }}
          />
          {stored && pending === undefined && (
            <Button onClick={() => setSecrets((prev) => ({ ...prev, [key]: '' }))} sx={{ flexShrink: 0 }}>
              Entfernen
            </Button>
          )}
        </Box>
      </SettingRow>
    );
  };

  const longText = (key: string, label: string, description: ReactNode, max: number) => (
    <SettingRow label={label} description={description} stacked>
      <TextField
        fullWidth
        multiline
        minRows={5}
        maxRows={18}
        value={(v<string>(key) ?? '') as string}
        onChange={(event) => set(key, event.target.value)}
        error={!!errors[key]}
        helperText={
          errors[key] || `${((v<string>(key) as string) || '').length.toLocaleString('de-DE')} von ${max.toLocaleString('de-DE')} Zeichen`
        }
        slotProps={{ htmlInput: { 'aria-label': label, maxLength: max } }}
      />
    </SettingRow>
  );

  const redirectBox = (value: string) => (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        mt: 0.75,
        pl: 1.5,
        pr: 0.5,
        py: 0.5,
        borderRadius: `${radius.sm}px`,
        bgcolor: c.surfaceContainerHighest,
        color: 'text.primary',
        fontFamily: fonts.mono,
        fontSize: '0.8125rem',
        wordBreak: 'break-all',
      }}
    >
      <Box sx={{ flex: 1 }}>{value}</Box>
      <CopyIconButton
        value={value}
        label="Adresse kopieren"
        message="Redirect-Adresse kopiert"
        icon={<ContentCopyRounded fontSize="inherit" />}
        size="small"
      />
    </Box>
  );

  const providerPanel = (key: ProviderKey) => {
    const meta = PROVIDERS.find((candidate) => candidate.key === key)!;
    const name = key === 'oidc' ? v<string>('auth.oidc.name') || 'SSO' : meta.label;
    const consoleUrl = meta.console ? meta.console(draft) : null;
    return (
      <Stack spacing={4}>
        <SettingsSection title={`${meta.label} verbinden`} description={meta.steps}>
          <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.25 }}>
            <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
              Redirect-Adresse:
              {redirectBox(initial.redirectUris[key] || '')}
            </Typography>
            {consoleUrl && (
              <Link
                href={consoleUrl}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                variant="body2"
                sx={{ display: 'inline-block', mt: 1.5 }}
              >
                Zur Einrichtung bei {meta.label} <OpenInNewRounded sx={{ fontSize: 14, verticalAlign: 'middle' }} />
              </Link>
            )}
          </Box>
          {key === 'oidc' && text('auth.oidc.name', 'Name auf dem Knopf', 'Zum Beispiel „Authentik“ oder der Name deines Vereins.')}
          {key === 'oidc' &&
            text('auth.oidc.issuer', 'Issuer', 'Die Adresse des Anbieters, unter der /.well-known/openid-configuration liegt.', {
              mono: true,
              placeholder: 'https://auth.example.com/application/o/moeshare',
            })}
          {key === 'github' &&
            text('auth.github.baseUrl', 'GitHub-Adresse', 'Nur für GitHub Enterprise Server ändern.', {
              mono: true,
              placeholder: 'https://github.com',
            })}
          {key === 'gitlab' &&
            text('auth.gitlab.baseUrl', 'GitLab-Adresse', 'Für eine eigene GitLab-Instanz deren Adresse eintragen.', {
              mono: true,
              placeholder: 'https://gitlab.com',
            })}
          {key === 'microsoft' &&
            text(
              'auth.microsoft.tenant',
              'Mandant',
              'common für alle Konten, organizations nur Arbeits- und Schulkonten, consumers nur private Konten, oder die Mandanten-ID.',
              {
                mono: true,
              }
            )}
          {text(`auth.${key}.clientId`, 'Client-ID', undefined, { mono: true })}
          {secret(`auth.${key}.clientSecret`, 'Client-Secret', 'Wird nach dem Speichern nicht wieder angezeigt.')}
          {key === 'oidc' &&
            text('auth.oidc.scopes', 'Scopes', 'Durch Leerzeichen getrennt, beginnend mit openid.', {
              mono: true,
              placeholder: 'openid profile email',
            })}
          {toggle(
            `auth.${key}.enabled`,
            `Anmeldung mit ${name}`,
            `Zeigt „Mit ${name} anmelden“. Wer schon ein Konto hat, verknüpft ${name} unter Konto › Sicherheit.`
          )}
          {toggle(
            `auth.${key}.allowRegistration`,
            `Neue Konten mit ${name}`,
            'Wer noch kein Konto hat, kann eins anlegen. Es gelten die Regeln unter Anmeldung › Registrierung.'
          )}
        </SettingsSection>
        {key === 'discord' && (
          <SettingsSection title="Discord-Server" description="Neue Konten nur für Mitglieder deines Discord-Servers.">
            {text(
              'auth.discord.guildId',
              'Server-ID',
              'Rechtsklick auf den Server › Server-ID kopieren, dafür den Entwicklermodus aktivieren. Leer: jedes Discord-Konto.',
              { mono: true, placeholder: '123456789012345678' }
            )}
            {v<string>('auth.discord.guildId') &&
              list(
                'auth.discord.roleIds',
                'Benötigte Rollen',
                'Optional: Rollen-IDs, von denen man mindestens eine haben muss.',
                'Rollen-ID'
              )}
            {v<string>('auth.discord.guildId') &&
              toggle(
                'auth.discord.guildSkipsInvite',
                'Mitglieder brauchen keine Einladung',
                'Mitglieder deines Servers dürfen sich auch dann registrieren, wenn sonst eine Einladung nötig ist.'
              )}
          </SettingsSection>
        )}
      </Stack>
    );
  };

  const runWebhookTest = async () => {
    setTesting(true);
    try {
      await testWebhook(secrets['webhook.url'] || undefined);
      toast('Testnachricht gesendet. Schau in deinen Discord-Kanal.', { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setTesting(false);
    }
  };

  const baseUrl = v<string>('site.baseUrl');
  const originMismatch = baseUrl && baseUrl !== window.location.origin;
  const enforce = v<string>('auth.enforceMfa');
  const lockoutRisk = enforce !== 'off' && !currentUserTotp;

  const content: Record<SectionKey, ReactNode> = {
    allgemein: (
      <Stack spacing={4}>
        <SettingsSection title="Seite">
          {text('site.title', 'Name', 'Erscheint im Browser-Tab, auf der Anmeldeseite und in Link-Vorschauen.')}
          {text(
            'site.baseUrl',
            'Basis-URL',
            'Die öffentliche Adresse, unter der MoeShare erreichbar ist. Daraus entstehen alle Links, und Passkeys sind an diese Domain gebunden.',
            { mono: true, placeholder: 'https://share.example.com' }
          )}
          {originMismatch && (
            <Box sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
              <Alert severity="warning">
                Du öffnest die Seite gerade über {window.location.origin}. Links und Passkeys verwenden {baseUrl}.
              </Alert>
            </Box>
          )}
          <SettingRow
            label="Symbol"
            description="Adresse eines Bildes (PNG oder SVG). Eigene Dateien legst du in den Ordner public und gibst den Pfad an, z. B. /logo.png."
            stacked
          >
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <BrandMark src={v<string>('site.favicon') || ''} title={v<string>('site.title') || 'M'} size={40} />
              <TextField
                size="small"
                fullWidth
                value={v<string>('site.favicon') || ''}
                onChange={(event) => set('site.favicon', event.target.value)}
                error={!!errors['site.favicon']}
                helperText={errors['site.favicon']}
                slotProps={{ htmlInput: { 'aria-label': 'Symbol', spellCheck: false, style: { fontFamily: fonts.mono } } }}
              />
            </Box>
          </SettingRow>
          {text('site.copyright', 'Fußzeile', 'Kurzer Text unter Ansichts- und Anmeldeseiten, z. B. © 2026 Dein Name.')}
        </SettingsSection>
        <SettingsSection
          title="Farbe der Oberfläche"
          description="Aus einer Grundfarbe berechnet MoeShare alle Farben für helles und dunkles Design."
        >
          <SettingRow label="Grundfarbe" description="Wird nach dem Speichern sofort übernommen." stacked>
            <Stack spacing={2}>
              <ColorField
                label="Grundfarbe"
                value={v<string>('site.uiColor')}
                onChange={(hex) => set('site.uiColor', hex)}
                error={!!errors['site.uiColor']}
                helperText={errors['site.uiColor']}
              />
              <SchemeSwatches seed={v<string>('site.uiColor')} />
            </Stack>
          </SettingRow>
        </SettingsSection>
      </Stack>
    ),

    uploads: (
      <Stack spacing={4}>
        <SettingsSection
          title="Größe und Speicher"
          description="Gilt für alle, die kein eigenes Limit haben. Einzelne Benutzer stellst du unter Benutzer ein."
        >
          <SettingRow label="Größte erlaubte Datei" description="Pro Upload." stacked>
            <BytesField
              label="Dateigröße"
              value={v<number | null>('uploads.maxFileBytes')}
              onChange={(value) => set('uploads.maxFileBytes', value)}
              error={!!errors['uploads.maxFileBytes']}
              helperText={errors['uploads.maxFileBytes']}
            />
          </SettingRow>
          <SettingRow label="Speicher pro Benutzer" description="Wie viel jedes Konto insgesamt belegen darf." stacked>
            <BytesField
              label="Speicher"
              value={v<number | null>('uploads.defaultQuotaBytes')}
              onChange={(value) => set('uploads.defaultQuotaBytes', value)}
              error={!!errors['uploads.defaultQuotaBytes']}
              helperText={errors['uploads.defaultQuotaBytes']}
            />
          </SettingRow>
        </SettingsSection>
        <SettingsSection title="Verarbeitung">
          {toggle(
            'uploads.preview',
            'Vorschaubilder',
            'Kleinere Vorschauen für Bilder und Standbilder für Videos. Macht die Galerie deutlich schneller.'
          )}
          {toggle(
            'uploads.removeMetadata',
            'Standortdaten entfernen',
            'Löscht GPS-Koordinaten aus Fotos, bevor sie öffentlich erreichbar sind.'
          )}
          {toggle(
            'uploads.dominantColor',
            'Hauptfarbe erkennen',
            'Bestimmt die prägende Farbe eines Bildes für Ansichtsseite und Discord-Rand.'
          )}
          {toggle(
            'uploads.hls',
            'Videos als Stream (HLS)',
            'Wandelt Videos zusätzlich in einen Stream um. Lädt große Videos schneller, braucht aber mehr Speicher und Rechenzeit.'
          )}
          {toggle(
            'uploads.urlFetch',
            'Hochladen per Link',
            'Im Dashboard Dateien direkt aus dem Internet übernehmen. Adressen im internen Netz sind immer gesperrt.'
          )}
        </SettingsSection>
        <SettingsSection
          title="Dateitypen"
          description="Bestimmt, welche Endungen als Bild, Video oder Audio gelten. Andere Dateien werden als Datei gespeichert."
        >
          {list('uploads.formats.image', 'Bilder', 'GIFs sind immer dabei.', 'Endung, z. B. .avif')}
          {list('uploads.formats.video', 'Videos', undefined, 'Endung, z. B. .m4v')}
          {list('uploads.formats.audio', 'Audio', undefined, 'Endung, z. B. .opus')}
        </SettingsSection>
      </Stack>
    ),

    anmeldung: (
      <Stack spacing={4}>
        <SettingsSection title="Registrierung">
          {choice('auth.registration', 'Neue Konten', 'Admins können unter Benutzer immer Konten anlegen.', [
            { value: 'closed', label: 'Nur durch Admins' },
            { value: 'invite', label: 'Mit Einladung' },
            { value: 'open', label: 'Für alle offen' },
          ])}
        </SettingsSection>
        <SettingsSection title="Sicherheit">
          {choice(
            'auth.enforceMfa',
            'Zwei-Faktor-Pflicht',
            'Betroffene müssen eine Authenticator-App einrichten, bevor sie weiterarbeiten können.',
            [
              { value: 'off', label: 'Freiwillig' },
              { value: 'admins', label: 'Für Admins' },
              { value: 'all', label: 'Für alle' },
            ]
          )}
          {lockoutRisk && (
            <Box sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
              <Alert severity="warning">
                Du selbst hast noch keine Authenticator-App. Nach dem Speichern wirst du direkt zur Einrichtung geschickt.
              </Alert>
            </Box>
          )}
          {number('auth.passwordMinLength', 'Mindestlänge für Passwörter', 'Gilt für neue und geänderte Passwörter.', {
            min: 8,
            max: 64,
            unit: 'Zeichen',
          })}
          {number(
            'auth.sessionDays',
            'Angemeldet bleiben',
            'So lange bleibt man mit „Angemeldet bleiben“ eingeloggt, solange man die Seite ab und zu benutzt.',
            { min: 1, max: 365, unit: 'Tage' }
          )}
        </SettingsSection>
        <SettingsSection title="Anmeldeverfahren">
          {toggle(
            'auth.passkeys',
            'Passkeys',
            'Anmeldung mit Fingerabdruck, Gesicht oder Geräte-PIN. Braucht HTTPS und eine korrekte Basis-URL.'
          )}
          {toggle(
            'auth.tokenLogin',
            'Anmeldung mit ShareX-Token',
            'Übergangshilfe für Konten aus der alten Version, die ihr Passwort nicht kennen. Schalte sie ab, sobald alle ein Passwort haben.'
          )}
        </SettingsSection>
      </Stack>
    ),

    dienste: (
      <Stack spacing={3}>
        <ToggleButtonGroup
          exclusive
          value={provider}
          onChange={(_event, next: ProviderKey | null) => next && setProvider(next)}
          aria-label="Anmeldedienst"
          sx={{
            flexWrap: 'wrap',
            gap: 1,
            '& .MuiToggleButtonGroup-grouped': {
              borderRadius: `${radius.full}px !important`,
              border: `1px solid ${c.outlineVariant} !important`,
            },
          }}
        >
          {PROVIDERS.map(({ key, label }) => (
            <ToggleButton key={key} value={key} sx={{ gap: 1, px: 2, textTransform: 'none' }}>
              <Box component="span" aria-hidden sx={{ display: 'flex', '& svg': { fontSize: 18 } }}>
                {providerIcon(key)}
              </Box>
              {key === 'oidc' ? v<string>('auth.oidc.name') || label : label}
              {v<boolean>(`auth.${key}.enabled`) && (
                <Box component="span" aria-label="aktiv" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c.primary }} />
              )}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {providerPanel(provider)}
      </Stack>
    ),

    rechtliches: (
      <Stack spacing={4}>
        <SettingsSection
          title="Impressum"
          description="Erscheint unten auf jeder Seite. Verlinke eine bestehende Seite oder schreib den Text hier, dann zeigt MoeShare ihn unter /impressum."
        >
          {text('legal.imprintUrl', 'Link', 'Hat Vorrang vor dem eigenen Text.', {
            mono: true,
            placeholder: 'https://example.com/impressum',
          })}
          {longText('legal.imprintText', 'Eigener Text', 'Zeilenumbrüche bleiben erhalten, Adressen und E-Mails werden zu Links.', 20000)}
        </SettingsSection>
        <SettingsSection
          title="Datenschutz"
          description="Erscheint unten auf jeder Seite. Verlinke deine Datenschutzerklärung oder schreib sie hier, dann zeigt MoeShare sie unter /datenschutz."
        >
          {text('legal.privacyUrl', 'Link', 'Hat Vorrang vor dem eigenen Text.', {
            mono: true,
            placeholder: 'https://example.com/datenschutz',
          })}
          {longText('legal.privacyText', 'Eigener Text', 'Zeilenumbrüche bleiben erhalten, Adressen und E-Mails werden zu Links.', 100000)}
        </SettingsSection>
        <SettingsSection
          title="Eigene Links"
          description="Zum Beispiel dein Discord-Server, eine Status-Seite oder Kontakt. Sie stehen neben Impressum und Datenschutz im Fuß jeder Seite."
        >
          <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.25 }}>
            <LinkListEditor
              links={(v<SiteLink[]>('site.links') as SiteLink[]) || []}
              onChange={(links) => set('site.links', links)}
              error={errors['site.links']}
              max={8}
            />
          </Box>
        </SettingsSection>
      </Stack>
    ),

    benachrichtigungen: (
      <Stack spacing={4}>
        <SettingsSection title="Discord-Webhook" description="MoeShare meldet ausgewählte Ereignisse in einen Discord-Kanal.">
          {secret('webhook.url', 'Webhook-Adresse', 'In Discord unter Kanal bearbeiten › Integrationen › Webhooks.')}
          <SettingRow label="Test" description="Schickt eine Testnachricht an die eingetragene Adresse.">
            <Button
              variant="tonal"
              startIcon={testing ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
              disabled={testing || (!secretSet['webhook.url'] && !secrets['webhook.url'])}
              onClick={runWebhookTest}
            >
              Testnachricht senden
            </Button>
          </SettingRow>
          {toggle('webhook.enabled', 'Benachrichtigungen senden', 'Schickt die gewählten Ereignisse an den Webhook.')}
          {text('webhook.name', 'Absendername', 'Name, unter dem die Nachrichten erscheinen.')}
          <SettingRow label="Farben" description="Rand der Nachrichten für Erfolg und Fehler." stacked>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <ColorField label="Erfolg" value={v<string>('webhook.successColor')} onChange={(hex) => set('webhook.successColor', hex)} />
              <ColorField label="Fehler" value={v<string>('webhook.errorColor')} onChange={(hex) => set('webhook.errorColor', hex)} />
            </Box>
          </SettingRow>
          <SettingRow label="Ereignisse" stacked>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {WEBHOOK_EVENTS.map((event) => {
                const selected = ((v<string[]>('webhook.events') || []) as string[]).includes(event.key);
                return (
                  <Chip
                    key={event.key}
                    label={event.label}
                    onClick={() => {
                      const current = (v<string[]>('webhook.events') || []) as string[];
                      set('webhook.events', selected ? current.filter((k) => k !== event.key) : [...current, event.key]);
                    }}
                    variant={selected ? 'filled' : 'outlined'}
                    aria-pressed={selected}
                    sx={selected ? { bgcolor: c.secondaryContainer, color: c.onSecondaryContainer } : undefined}
                  />
                );
              })}
            </Box>
          </SettingRow>
        </SettingsSection>
      </Stack>
    ),

    system: (
      <Stack spacing={4}>
        <SettingsSection title="Betrieb">
          {toggle(
            'system.trustProxy',
            'Hinter einem Reverse-Proxy',
            'Einschalten, wenn nginx, Caddy, Traefik oder Cloudflare vor MoeShare sitzen. Sonst sehen alle Besucher gleich aus und das Bremsen falscher Anmeldungen trifft alle.'
          )}
          {initial.environment.errorReports === 'off' ? (
            <SettingRow
              label="Fehlerberichte"
              description="Abgeschaltet über die Umgebungsvariable GLITCHTIP_DSN. Ohne sie gehen Berichte an das GlitchTip des MoeShare-Projekts, sobald du sie hier erlaubst."
            />
          ) : (
            toggle(
              'system.errorReports',
              initial.environment.errorReports === 'custom' ? 'Fehlerberichte an dein GlitchTip' : 'Fehlerberichte an die Entwickler',
              `Schickt Fehlermeldungen und vom Browser blockierte Inhalte an ${
                initial.environment.errorReports === 'custom' ? 'das GlitchTip aus GLITCHTIP_DSN' : 'das GlitchTip des MoeShare-Projekts'
              }, damit Fehler schneller behoben werden. Benutzernamen, IP-Adressen, Dateinamen und Links werden vorher entfernt.`
            )
          )}
        </SettingsSection>
        <SettingsSection
          title="Datenschutz"
          description="Aktivitäten wie Anmeldungen werden protokolliert, damit du fremde Zugriffe erkennst."
        >
          {toggle('system.logIps', 'IP-Adressen speichern', 'Bei Sitzungen und im Aktivitätsprotokoll. Werden mit den Einträgen gelöscht.')}
          {number('system.auditRetentionDays', 'Aktivität aufbewahren', 'Ältere Einträge löscht MoeShare automatisch.', {
            min: 7,
            max: 730,
            unit: 'Tage',
          })}
        </SettingsSection>
        <SettingsSection
          title="Server"
          description="Der Port steht schon vor dem Start fest. Ändern kannst du ihn mit der Umgebungsvariable PORT, er gilt dann nach einem Neustart."
        >
          <SettingRow
            label="Port"
            description={
              <Box component="span" sx={{ fontFamily: fonts.mono }}>
                {initial.environment.port}
              </Box>
            }
          />
          <SettingRow
            label="Protokoll"
            description={
              <>
                Stufe{' '}
                <Box component="span" sx={{ fontFamily: fonts.mono }}>
                  {initial.environment.logLevel}
                </Box>
                , Format{' '}
                <Box component="span" sx={{ fontFamily: fonts.mono }}>
                  {initial.environment.logFormat}
                </Box>
                . Ändern mit LOG_LEVEL (debug, info, warn, error) und LOG_FORMAT (text, json).
              </>
            }
          />
        </SettingsSection>
      </Stack>
    ),
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '220px minmax(0, 1fr)' },
        gap: { xs: 2, md: 4 },
        alignItems: 'start',
        pb: 10,
      }}
    >
      <Box
        component="nav"
        aria-label="Einstellungsbereiche"
        sx={{
          position: { md: 'sticky' },
          top: { md: 96 },
          display: 'flex',
          flexDirection: { xs: 'row', md: 'column' },
          flexWrap: { xs: 'wrap', md: 'nowrap' },
          gap: { xs: 1, md: 0.5 },
        }}
      >
        {SECTIONS.map((s) => {
          const active = section === s.key;
          return (
            <ButtonBase
              key={s.key}
              onClick={() => setSection(s.key)}
              aria-current={active ? 'true' : undefined}
              sx={{
                justifyContent: 'flex-start',
                gap: 1.5,
                px: { xs: 1.75, md: 2 },
                py: { xs: 0.875, md: 1.25 },
                borderRadius: `${radius.full}px`,
                border: { xs: `1px solid ${active ? 'transparent' : c.outlineVariant}`, md: 'none' },
                bgcolor: active ? c.secondaryContainer : 'transparent',
                color: active ? c.onSecondaryContainer : c.onSurfaceVariant,
                fontWeight: active ? 700 : 500,
                fontSize: '0.875rem',
                transition: 'background-color 180ms ease, border-color 180ms ease',
                '&:hover': {
                  bgcolor: active ? c.secondaryContainer : 'color-mix(in srgb, var(--mui-palette-m3-onSurface) 6%, transparent)',
                },
              }}
            >
              <Box component="span" aria-hidden sx={{ display: { xs: 'none', md: 'flex' }, '& svg': { fontSize: 20 } }}>
                {s.icon}
              </Box>
              {s.label}
              {dirtySections.has(s.key) && (
                <Tooltip title="Ungespeicherte Änderungen">
                  <Box
                    component="span"
                    aria-label="geändert"
                    sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c.primary, ml: { xs: 0, md: 'auto' } }}
                  />
                </Tooltip>
              )}
            </ButtonBase>
          );
        })}
      </Box>

      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={section}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
          transition={{ duration: 0.3, ease: ease.emphasizedDecelerate }}
        >
          {content[section]}
        </m.div>
      </AnimatePresence>

      <SaveBar count={changedKeys.length} busy={busy} onSave={save} onReset={reset} />
    </Box>
  );
}
