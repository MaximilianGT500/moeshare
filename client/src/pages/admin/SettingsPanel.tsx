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
import MenuItem from '@mui/material/MenuItem';
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
import CloudRounded from '@mui/icons-material/CloudRounded';
import BackupRounded from '@mui/icons-material/BackupRounded';
import LanguageRounded from '@mui/icons-material/LanguageRounded';
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded';
import AppsRounded from '@mui/icons-material/AppsRounded';
import PaletteOutlined from '@mui/icons-material/PaletteOutlined';
import PhotoSizeSelectLargeRounded from '@mui/icons-material/PhotoSizeSelectLargeRounded';
import CoronavirusOutlined from '@mui/icons-material/CoronavirusOutlined';
import MoveDownRounded from '@mui/icons-material/MoveDownRounded';
import type { AdminBoot, BackupInfo, ExpiryChoice, SettingsPayload, SettingValue, SiteLink, StorageInfo, UrlStyle } from '../../lib/types';
import { EXPIRY_CHOICES, URL_STYLES, expiryLabel, urlStyleExample, urlStyleLabel } from '../../components/ShareOptions';
import { StorageTools } from './StorageTools';
import { BackupTools } from './BackupTools';
import { LinkListEditor } from '../../components/LinkListEditor';
import { providerIcon } from '../../lib/providers';
import { ApiError, errorMessage, saveSettings, testClamav, testMail } from '../../lib/api';
import { WebhookTargets } from './WebhookTools';
import { ImportTools } from './ImportTools';
import { CaddyHint, DomainList } from './DomainTools';
import { SaveBar, SettingRow, SettingsSection, SwitchRow } from '../../components/SettingsKit';
import { BytesField, ColorField } from '../../components/Fields';
import { formatNumber } from '../../lib/format';
import { BrandMark } from '../../components/BrandMark';
import { CopyIconButton } from '../../components/CopyButton';
import { useToast } from '../../components/Toaster';
import { isCancelled, useSudo } from '../../components/Sudo';
import { buildScheme } from '../../theme/scheme';
import { useThemeSeed } from '../../app/mount';
import { c, ease, fonts, radius } from '../../theme/tokens';
import { rich, t } from '../../lib/i18n';

type Values = Record<string, SettingValue>;
type SectionKey =
  | 'allgemein'
  | 'uploads'
  | 'bilder'
  | 'funktionen'
  | 'virenscan'
  | 'import'
  | 'domains'
  | 'speicher'
  | 'sicherungen'
  | 'email'
  | 'anmeldung'
  | 'dienste'
  | 'rechtliches'
  | 'benachrichtigungen'
  | 'system';

const SECTIONS: Array<{ key: SectionKey; label: string; icon: ReactNode; prefixes: string[] }> = [
  { key: 'allgemein', label: t('Allgemein'), icon: <TuneRounded />, prefixes: ['site.'] },
  { key: 'uploads', label: t('Uploads'), icon: <CloudUploadRounded />, prefixes: ['uploads.'] },
  { key: 'bilder', label: t('Bilder'), icon: <PhotoSizeSelectLargeRounded />, prefixes: ['images.'] },
  {
    key: 'funktionen',
    label: t('Funktionen'),
    icon: <AppsRounded />,
    prefixes: ['links.', 'albums.', 'trash.', 'stats.', 'zip.', 'reports.', 'profiles.', 'search.', 'export.'],
  },
  { key: 'virenscan', label: t('Virenscan'), icon: <CoronavirusOutlined />, prefixes: ['clamav.'] },
  { key: 'domains', label: t('Eigene Domains'), icon: <LanguageRounded />, prefixes: ['domains.'] },
  { key: 'speicher', label: t('Speicherort'), icon: <CloudRounded />, prefixes: ['storage.'] },
  { key: 'sicherungen', label: t('Sicherungen'), icon: <BackupRounded />, prefixes: ['backup.'] },
  { key: 'email', label: t('E-Mail'), icon: <MailOutlineRounded />, prefixes: ['mail.'] },
  {
    key: 'anmeldung',
    label: t('Anmeldung'),
    icon: <LoginRounded />,
    prefixes: ['auth.registration', 'auth.sessionDays', 'auth.passwordMinLength', 'auth.enforceMfa', 'auth.passkeys', 'auth.tokenLogin'],
  },
  {
    key: 'dienste',
    label: t('Anmeldedienste'),
    icon: <HubRounded />,
    prefixes: ['auth.discord.', 'auth.github.', 'auth.google.', 'auth.microsoft.', 'auth.gitlab.', 'auth.oidc.'],
  },
  { key: 'rechtliches', label: t('Rechtliches und Links'), icon: <GavelRounded />, prefixes: ['legal.', 'site.links'] },
  { key: 'benachrichtigungen', label: t('Benachrichtigungen'), icon: <NotificationsRounded />, prefixes: ['webhook.'] },
  { key: 'import', label: t('Import'), icon: <MoveDownRounded />, prefixes: [] },
  { key: 'system', label: t('System'), icon: <DnsRounded />, prefixes: ['system.'] },
];

const sectionOf = (key: string) =>
  SECTIONS.flatMap((s) => s.prefixes.map((prefix) => ({ prefix, key: s.key })))
    .filter(({ prefix }) => key === prefix || key.startsWith(prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]?.key;

type ProviderKey = 'discord' | 'github' | 'google' | 'microsoft' | 'gitlab' | 'oidc';

const PROVIDERS: Array<{ key: ProviderKey; label: string; steps: string; console?: (values: Values) => string }> = [
  {
    key: 'discord',
    label: t('Discord'),
    steps: t('Lege im Developer Portal eine Anwendung an und füge unter OAuth2 die Redirect-Adresse hinzu.'),
    console: () => 'https://discord.com/developers/applications',
  },
  {
    key: 'github',
    label: t('GitHub'),
    steps: t(
      'Lege unter Settings › Developer settings › OAuth Apps eine App an und trage die Redirect-Adresse als Authorization callback URL ein.'
    ),
    console: (values) => `${String(values['auth.github.baseUrl'] || 'https://github.com')}/settings/developers`,
  },
  {
    key: 'google',
    label: t('Google'),
    steps: t(
      'Lege in der Google Cloud Console unter APIs und Dienste › Anmeldedaten eine OAuth-Client-ID vom Typ Webanwendung an und trage die Redirect-Adresse als autorisierte Weiterleitungs-URI ein.'
    ),
    console: () => 'https://console.cloud.google.com/apis/credentials',
  },
  {
    key: 'microsoft',
    label: t('Microsoft'),
    steps: t(
      'Registriere im Microsoft Entra Admin Center unter App-Registrierungen eine App mit der Plattform Web und der Redirect-Adresse. Unter Zertifikate und Geheimnisse erstellst du das Client-Secret.'
    ),
    console: () => 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
  },
  {
    key: 'gitlab',
    label: t('GitLab'),
    steps: t(
      'Lege unter Einstellungen › Anwendungen eine vertrauliche Anwendung mit den Scopes openid und profile und der Redirect-Adresse an.'
    ),
    console: (values) => `${String(values['auth.gitlab.baseUrl'] || 'https://gitlab.com')}/-/user_settings/applications`,
  },
  {
    key: 'oidc',
    label: 'OIDC',
    steps: t(
      'Für Authentik, Keycloak, Authelia, Zitadel, Pocket ID und andere OpenID-Connect-Anbieter. Lege dort einen vertraulichen Client (Authorization Code) mit der Redirect-Adresse an.'
    ),
  },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const LINK_STYLES = URL_STYLES.filter((style) => style !== 'original');

const styleOptions = (styles: UrlStyle[]) =>
  styles.map((style) => ({
    value: style,
    label: (
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, width: '100%', minWidth: 0 }}>
        <span>{urlStyleLabel(style)}</span>
        <Box component="span" sx={{ ml: 'auto', color: 'text.secondary', fontFamily: fonts.mono, fontSize: '0.8125rem' }}>
          {urlStyleExample(style)}
        </Box>
      </Box>
    ),
  }));

const expiryOptions = (unlimited?: string) =>
  EXPIRY_CHOICES.map((choice: ExpiryChoice) => ({
    value: choice,
    label: choice === 'never' && unlimited ? unlimited : expiryLabel(choice),
  }));

function SchemeSwatches({ seed }: { seed: string }) {
  const swatches = useMemo(() => {
    try {
      const dark = buildScheme(seed, true);
      const light = buildScheme(seed, false);
      return [
        { label: t('Primär'), colors: [light.primary, dark.primary] },
        { label: t('Container'), colors: [light.primaryContainer, dark.primaryContainer] },
        { label: t('Sekundär'), colors: [light.secondaryContainer, dark.secondaryContainer] },
        { label: t('Tertiär'), colors: [light.tertiaryContainer, dark.tertiaryContainer] },
        { label: t('Fläche'), colors: [light.surfaceContainer, dark.surfaceContainer] },
      ];
    } catch {
      return [];
    }
  }, [seed]);
  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }} aria-label={t('Farbvorschau hell und dunkel')}>
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
  storage,
  backups,
  webhooks,
  imports,
}: {
  initial: SettingsPayload;
  currentUserTotp: boolean;
  initialSection?: string;
  onSaved: (payload: SettingsPayload) => void;
  storage: StorageInfo;
  backups: BackupInfo;
  webhooks: AdminBoot['webhooks'];
  imports: AdminBoot['imports'];
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
  const [clamTesting, setClamTesting] = useState(false);
  const [clamResult, setClamResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [mailTo, setMailTo] = useState('');
  const [mailTesting, setMailTesting] = useState(false);

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
      toast(t('Einstellungen gespeichert'), { variant: 'success' });
      if (patch['site.uiColor'] !== undefined) applySeed(result.values['site.uiColor'] as string);
      if (patch['site.title'] !== undefined || patch['site.favicon'] !== undefined) {
        toast(t('Name und Symbol siehst du nach dem Neuladen der Seite.'), { variant: 'info' });
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

  const select = (key: string, label: string, description: ReactNode, options: Array<{ value: string; label: ReactNode }>) => (
    <SettingRow label={label} description={errors[key] || description}>
      <TextField
        select
        size="small"
        value={(v<string>(key) ?? '') as string}
        onChange={(event) => set(key, event.target.value)}
        error={!!errors[key]}
        sx={{ width: { xs: '100%', sm: 320 }, flexShrink: 0 }}
        slotProps={{ select: { SelectDisplayProps: { 'aria-label': label } } }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
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
            helperText={errors[key] || t('Mit Enter hinzufügen')}
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
            placeholder={stored && pending === undefined ? t('Gespeichert. Zum Ändern neu eingeben.') : ''}
            onChange={(event) =>
              setSecrets((prev) => ({ ...prev, [key]: event.target.value === '' && !stored ? undefined : event.target.value }))
            }
            error={!!errors[key]}
            helperText={errors[key] || (pending === '' ? t('Wird beim Speichern entfernt.') : undefined)}
            slotProps={{ htmlInput: { autoComplete: 'off', 'aria-label': label, spellCheck: false } }}
          />
          {stored && pending === undefined && (
            <Button onClick={() => setSecrets((prev) => ({ ...prev, [key]: '' }))} sx={{ flexShrink: 0 }}>
              {t('Entfernen')}
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
          errors[key] ||
          t('{count} von {max} Zeichen', { count: formatNumber(((v<string>(key) as string) || '').length), max: formatNumber(max) })
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
        label={t('Adresse kopieren')}
        message={t('Redirect-Adresse kopiert')}
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
        <SettingsSection title={t('{label} verbinden', { label: meta.label })} description={meta.steps}>
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
                {t('Zur Einrichtung bei {label}', { label: meta.label })}{' '}
                <OpenInNewRounded sx={{ fontSize: 14, verticalAlign: 'middle' }} />
              </Link>
            )}
          </Box>
          {key === 'oidc' && text('auth.oidc.name', t('Name auf dem Knopf'), t('Zum Beispiel „Authentik“ oder der Name deines Vereins.'))}
          {key === 'oidc' &&
            text('auth.oidc.issuer', t('Issuer'), t('Die Adresse des Anbieters, unter der /.well-known/openid-configuration liegt.'), {
              mono: true,
              placeholder: 'https://auth.example.com/application/o/moeshare',
            })}
          {key === 'github' &&
            text('auth.github.baseUrl', t('GitHub-Adresse'), t('Nur für GitHub Enterprise Server ändern.'), {
              mono: true,
              placeholder: 'https://github.com',
            })}
          {key === 'gitlab' &&
            text('auth.gitlab.baseUrl', t('GitLab-Adresse'), t('Für eine eigene GitLab-Instanz deren Adresse eintragen.'), {
              mono: true,
              placeholder: 'https://gitlab.com',
            })}
          {key === 'microsoft' &&
            text(
              'auth.microsoft.tenant',
              t('Mandant'),
              t('common für alle Konten, organizations nur Arbeits- und Schulkonten, consumers nur private Konten, oder die Mandanten-ID.'),
              {
                mono: true,
              }
            )}
          {text(`auth.${key}.clientId`, 'Client-ID', undefined, { mono: true })}
          {secret(`auth.${key}.clientSecret`, t('Client-Secret'), t('Wird nach dem Speichern nicht wieder angezeigt.'))}
          {key === 'oidc' &&
            text('auth.oidc.scopes', t('Scopes'), t('Durch Leerzeichen getrennt, beginnend mit openid.'), {
              mono: true,
              placeholder: t('openid profile email'),
            })}
          {toggle(
            `auth.${key}.enabled`,
            t('Anmeldung mit {name}', { name }),
            t('Zeigt „Mit {name} anmelden“. Wer schon ein Konto hat, verknüpft {name2} unter Konto › Sicherheit.', { name, name2: name })
          )}
          {toggle(
            `auth.${key}.allowRegistration`,
            t('Neue Konten mit {name}', { name }),
            t('Wer noch kein Konto hat, kann eins anlegen. Es gelten die Regeln unter Anmeldung › Registrierung.')
          )}
        </SettingsSection>
        {key === 'discord' && (
          <SettingsSection title={t('Discord-Server')} description={t('Neue Konten nur für Mitglieder deines Discord-Servers.')}>
            {text(
              'auth.discord.guildId',
              'Server-ID',
              t('Rechtsklick auf den Server › Server-ID kopieren, dafür den Entwicklermodus aktivieren. Leer: jedes Discord-Konto.'),
              { mono: true, placeholder: '123456789012345678' }
            )}
            {v<string>('auth.discord.guildId') &&
              list(
                'auth.discord.roleIds',
                t('Benötigte Rollen'),
                t('Optional: Rollen-IDs, von denen man mindestens eine haben muss.'),
                'Rollen-ID'
              )}
            {v<string>('auth.discord.guildId') &&
              toggle(
                'auth.discord.guildSkipsInvite',
                t('Mitglieder brauchen keine Einladung'),
                t('Mitglieder deines Servers dürfen sich auch dann registrieren, wenn sonst eine Einladung nötig ist.')
              )}
          </SettingsSection>
        )}
      </Stack>
    );
  };

  const runClamTest = async () => {
    setClamTesting(true);
    setClamResult(null);
    try {
      const result = await testClamav({
        host: String(v<string>('clamav.host') || ''),
        port: v<number>('clamav.port'),
        socket: String(v<string>('clamav.socket') || ''),
      });
      setClamResult({
        ok: result.detects,
        text: result.detects
          ? t('{version} antwortet nach {ms} ms und erkennt die Testsignatur.', { version: result.version, ms: formatNumber(result.ms) })
          : t('{version} antwortet, hat die Testsignatur aber nicht erkannt. Prüfe die Signaturen von ClamAV.', {
              version: result.version,
            }),
      });
    } catch (failure) {
      setClamResult({ ok: false, text: errorMessage(failure) });
    } finally {
      setClamTesting(false);
    }
  };

  const runMailTest = async () => {
    setMailTesting(true);
    try {
      const result = await testMail(mailTo.trim());
      toast(t('Testnachricht an {to} verschickt ({ms} ms).', { to: result.to, ms: formatNumber(result.ms) }), {
        variant: 'success',
        duration: 6000,
      });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error', duration: 9000 });
    } finally {
      setMailTesting(false);
    }
  };

  const mailUnsaved = changedKeys.some((key) => key.startsWith('mail.'));

  const baseUrl = v<string>('site.baseUrl');
  const originMismatch = baseUrl && baseUrl !== window.location.origin;
  const enforce = v<string>('auth.enforceMfa');
  const lockoutRisk = enforce !== 'off' && !currentUserTotp;

  const content: Record<SectionKey, ReactNode> = {
    allgemein: (
      <Stack spacing={4}>
        <SettingsSection title={t('Seite')}>
          {text('site.title', t('Name'), t('Erscheint im Browser-Tab, auf der Anmeldeseite und in Link-Vorschauen.'))}
          {text(
            'site.baseUrl',
            'Basis-URL',
            t(
              'Die öffentliche Adresse, unter der MoeShare erreichbar ist. Daraus entstehen alle Links, und Passkeys sind an diese Domain gebunden.'
            ),
            { mono: true, placeholder: 'https://share.example.com' }
          )}
          {originMismatch && (
            <Box sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
              <Alert severity="warning">
                {t('Du öffnest die Seite gerade über {origin}. Links und Passkeys verwenden {baseUrl}.', {
                  origin: window.location.origin,
                  baseUrl,
                })}
              </Alert>
            </Box>
          )}
          <SettingRow
            label={t('Symbol')}
            description={t(
              'Adresse eines Bildes (PNG oder SVG). Eigene Dateien legst du in den Ordner public und gibst den Pfad an, z. B. /logo.png.'
            )}
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
                slotProps={{ htmlInput: { 'aria-label': t('Symbol'), spellCheck: false, style: { fontFamily: fonts.mono } } }}
              />
            </Box>
          </SettingRow>
          {text('site.copyright', t('Fußzeile'), t('Kurzer Text unter Ansichts- und Anmeldeseiten, z. B. © 2026 Dein Name.'))}
        </SettingsSection>
        <SettingsSection
          title={t('Farbe der Oberfläche')}
          description={t('Aus einer Grundfarbe berechnet MoeShare alle Farben für helles und dunkles Design.')}
        >
          <SettingRow label={t('Grundfarbe')} description={t('Wird nach dem Speichern sofort übernommen.')} stacked>
            <Stack spacing={2}>
              <ColorField
                label={t('Grundfarbe')}
                value={v<string>('site.uiColor')}
                onChange={(hex) => set('site.uiColor', hex)}
                error={!!errors['site.uiColor']}
                helperText={errors['site.uiColor']}
              />
              <SchemeSwatches seed={v<string>('site.uiColor')} />
            </Stack>
          </SettingRow>
        </SettingsSection>
        <SettingsSection title={t('Sprache')} description={t('Jeder kann die Sprache im eigenen Konto ändern.')}>
          {choice('site.language', t('Standardsprache'), t('Für Besucher und alle, die im Konto nichts anderes gewählt haben.'), [
            { value: 'de', label: 'Deutsch' },
            { value: 'en', label: 'English' },
          ])}
          {toggle(
            'site.detectLanguage',
            t('Sprache des Browsers verwenden'),
            t('Besucher ohne Konto sehen MoeShare in der Sprache ihres Browsers, wenn es sie gibt.')
          )}
        </SettingsSection>
        <SettingsSection
          title={t('Weitere Domains')}
          description={t(
            'Links lassen sich auch unter anderen Adressen verschicken, die auf diesen Server zeigen. Die Basis-URL bleibt die Hauptadresse.'
          )}
        >
          {list(
            'site.domains',
            t('Domains'),
            t('Jede Domain muss per DNS und Reverse-Proxy auf MoeShare zeigen. Anmeldung und Verwaltung laufen weiter über die Basis-URL.'),
            'https://i.example.com'
          )}
        </SettingsSection>
        <SettingsSection title={t('App')}>
          {toggle(
            'site.pwa',
            t('Als App installierbar'),
            t('MoeShare lässt sich auf Handy und Computer installieren und taucht dann im Teilen-Menü auf. Braucht HTTPS.')
          )}
        </SettingsSection>
      </Stack>
    ),

    uploads: (
      <Stack spacing={4}>
        <SettingsSection
          title={t('Größe und Speicher')}
          description={t('Gilt für alle, die kein eigenes Limit haben. Einzelne Benutzer stellst du unter Benutzer ein.')}
        >
          <SettingRow label={t('Größte erlaubte Datei')} description={t('Pro Upload.')} stacked>
            <BytesField
              label={t('Dateigröße')}
              value={v<number | null>('uploads.maxFileBytes')}
              onChange={(value) => set('uploads.maxFileBytes', value)}
              error={!!errors['uploads.maxFileBytes']}
              helperText={errors['uploads.maxFileBytes']}
            />
          </SettingRow>
          <SettingRow label={t('Speicher pro Benutzer')} description={t('Wie viel jedes Konto insgesamt belegen darf.')} stacked>
            <BytesField
              label={t('Speicher')}
              value={v<number | null>('uploads.defaultQuotaBytes')}
              onChange={(value) => set('uploads.defaultQuotaBytes', value)}
              error={!!errors['uploads.defaultQuotaBytes']}
              helperText={errors['uploads.defaultQuotaBytes']}
            />
          </SettingRow>
        </SettingsSection>
        <SettingsSection
          title={t('Adressen und Ablauf')}
          description={t('Voreinstellungen für alle. Jeder kann sie im Konto für sich ändern und beim Hochladen anpassen.')}
        >
          {select('uploads.urlStyle', t('Adressstil'), t('Wie neue Links aussehen.'), styleOptions(URL_STYLES))}
          {select(
            'uploads.defaultExpiry',
            t('Automatisch löschen nach'),
            t('Gilt, wenn beim Hochladen nichts anderes gewählt wird.'),
            expiryOptions()
          )}
          {select(
            'uploads.maxExpiry',
            t('Höchstens aufbewahren'),
            t('Spätestens nach dieser Zeit wird jeder neue Upload gelöscht, egal was gewählt wurde.'),
            expiryOptions(t('Unbegrenzt'))
          )}
        </SettingsSection>
        <SettingsSection
          title={t('Texte')}
          description={t('Text und Code direkt einfügen statt eine Datei hochzuladen, mit Syntaxhervorhebung.')}
        >
          {toggle('uploads.texts', t('Texte erlauben'), t('Im Dashboard, mit ShareX und über die API.'))}
          <SettingRow label={t('Längster Text')} description={t('Größere Texte lädt man als Datei hoch.')} stacked>
            <BytesField
              label={t('Textgröße')}
              value={v<number | null>('uploads.textMaxBytes')}
              onChange={(value) => set('uploads.textMaxBytes', value)}
              error={!!errors['uploads.textMaxBytes']}
              helperText={errors['uploads.textMaxBytes']}
            />
          </SettingRow>
        </SettingsSection>
        <SettingsSection title={t('Verarbeitung')}>
          {toggle(
            'uploads.preview',
            t('Vorschaubilder'),
            t('Kleinere Vorschauen für Bilder und Standbilder für Videos. Macht die Galerie deutlich schneller.')
          )}
          {toggle(
            'uploads.removeMetadata',
            t('Standortdaten entfernen'),
            t('Löscht GPS-Koordinaten aus Fotos, bevor sie öffentlich erreichbar sind.')
          )}
          {toggle(
            'uploads.dominantColor',
            t('Hauptfarbe erkennen'),
            t('Bestimmt die prägende Farbe eines Bildes für Ansichtsseite und Discord-Rand.')
          )}
          {toggle(
            'uploads.hls',
            t('Videos als Stream (HLS)'),
            t('Wandelt Videos zusätzlich in einen Stream um. Lädt große Videos schneller, braucht aber mehr Speicher und Rechenzeit.')
          )}
          {toggle(
            'uploads.urlFetch',
            t('Hochladen per Link'),
            t('Im Dashboard Dateien direkt aus dem Internet übernehmen. Adressen im internen Netz sind immer gesperrt.')
          )}
        </SettingsSection>
        <SettingsSection
          title={t('Große Dateien')}
          description={t('Im Browser gehen große Dateien in Teilen hoch. Bricht die Verbindung ab, geht es an derselben Stelle weiter.')}
        >
          {toggle(
            'uploads.chunked',
            t('Fortsetzbare Uploads'),
            t('Gilt im Dashboard und über die API unter /api/uploads. ShareX lädt weiter in einem Stück hoch.')
          )}
          {number(
            'uploads.resumeHours',
            t('Unfertige Uploads aufbewahren'),
            t('So lange lässt sich ein abgebrochener Upload fortsetzen. Danach räumt MoeShare die Teile weg.'),
            { min: 1, max: 168, unit: t('Stunden') }
          )}
        </SettingsSection>
        <SettingsSection
          title={t('Versionen und Duplikate')}
          description={t('Neue Fassungen ersetzen eine Datei, ohne dass sich ihre Links ändern.')}
        >
          {toggle(
            'uploads.versions',
            t('Ältere Fassungen aufbewahren'),
            t('Wer eine Datei ersetzt oder im Editor bearbeitet, kann zur vorherigen Fassung zurück. Alte Fassungen zählen zum Speicher.')
          )}
          {number('uploads.versionsKeep', t('Fassungen pro Datei'), t('Ältere werden automatisch gelöscht. Originale bleiben.'), {
            min: 1,
            max: 100,
            unit: t('Stück'),
          })}
          {toggle(
            'uploads.deduplicate',
            t('Gleiche Dateien nur einmal speichern'),
            t(
              'Lädt jemand dieselbe Datei mehrmals hoch, liegt sie nur einmal auf der Festplatte und zählt nur einmal. Gilt für Dateien auf dem Server, nicht in S3.'
            )
          )}
        </SettingsSection>
        <SettingsSection
          title={t('Dateitypen')}
          description={t('Bestimmt, welche Endungen als Bild, Video oder Audio gelten. Andere Dateien werden als Datei gespeichert.')}
        >
          {list('uploads.formats.image', t('Bilder'), t('GIFs sind immer dabei.'), t('Endung, z. B. .avif'))}
          {list('uploads.formats.video', t('Videos'), undefined, t('Endung, z. B. .m4v'))}
          {list('uploads.formats.audio', t('Audio'), undefined, t('Endung, z. B. .opus'))}
        </SettingsSection>
      </Stack>
    ),

    bilder: (
      <Stack spacing={4}>
        <SettingsSection
          title={t('Bilder optimieren')}
          description={t(
            'Rechnet hochgeladene Bilder in ein sparsameres Format um. Sichtbar ändert sich nichts, die Dateien werden aber deutlich kleiner.'
          )}
        >
          {toggle(
            'images.optimize',
            t('Beim Hochladen optimieren'),
            t('Gilt für JPEG, PNG, WebP, AVIF und TIFF. GIFs bleiben, wie sie sind. Jeder kann es im Konto für sich abschalten.')
          )}
          {choice('images.format', t('Format'), t('WebP klappt überall, AVIF ist noch kleiner, braucht aber mehr Rechenzeit.'), [
            { value: 'keep', label: t('Beibehalten') },
            { value: 'webp', label: 'WebP' },
            { value: 'avif', label: 'AVIF' },
          ])}
          {number('images.quality', t('Qualität'), t('82 ist ein guter Mittelweg. PNG-Grafiken werden immer verlustfrei gespeichert.'), {
            min: 40,
            max: 100,
            unit: '%',
          })}
          {number('images.maxDimension', t('Größte Kantenlänge'), t('Größere Bilder werden verkleinert. 0 heißt: nie verkleinern.'), {
            min: 0,
            max: 30000,
            unit: 'px',
          })}
          {toggle(
            'images.keepOriginal',
            t('Original aufheben'),
            t('Das unveränderte Bild bleibt als ältere Fassung erhalten. Braucht eingeschaltete Versionen unter Uploads.')
          )}
        </SettingsSection>
        <SettingsSection title={t('Wasserzeichen')}>
          {toggle(
            'images.watermarks',
            t('Wasserzeichen erlauben'),
            t('Jeder kann unter Gestalten einen Text oder ein Logo festlegen, das in neue Bilder geschrieben wird.')
          )}
        </SettingsSection>
      </Stack>
    ),

    virenscan: (
      <Stack spacing={4}>
        <SettingsSection
          title={t('ClamAV')}
          description={t(
            'Prüft jede hochgeladene Datei mit einem ClamAV-Daemon (clamd). Gefundene Schadsoftware wird abgewiesen und nicht gespeichert.'
          )}
        >
          {toggle('clamav.enabled', t('Uploads prüfen'), t('Erst einschalten, wenn der Test unten klappt.'))}
          {text('clamav.host', t('Host'), t('Wo clamd läuft. Im Docker-Stack heißt der Dienst clamav.'), {
            mono: true,
            placeholder: '127.0.0.1',
          })}
          {number('clamav.port', t('Port'), t('Meist 3310.'), { min: 1, max: 65535, unit: '' })}
          {text(
            'clamav.socket',
            t('Socket'),
            t('Statt Host und Port: Pfad zum Unix-Socket oder zur Named Pipe unter Windows. Hat Vorrang, wenn ausgefüllt.'),
            { mono: true, placeholder: '/run/clamav/clamd.ctl' }
          )}
          <SettingRow
            label={t('Größte geprüfte Datei')}
            description={t('Größere Dateien werden ungeprüft angenommen. Sollte zu StreamMaxLength in clamd.conf passen.')}
            stacked
          >
            <BytesField
              label={t('Dateigröße')}
              value={v<number | null>('clamav.maxBytes')}
              onChange={(value) => set('clamav.maxBytes', value)}
              nullLabel={t('Alles prüfen')}
              error={!!errors['clamav.maxBytes']}
              helperText={errors['clamav.maxBytes']}
            />
          </SettingRow>
          {choice('clamav.onError', t('Wenn ClamAV nicht antwortet'), t('Abweisen ist sicherer, Annehmen hält Uploads am Laufen.'), [
            { value: 'reject', label: t('Upload abweisen') },
            { value: 'allow', label: t('Ungeprüft annehmen') },
          ])}
        </SettingsSection>
        <SettingsSection title={t('Test')}>
          <SettingRow
            label={t('Verbindung prüfen')}
            description={t('Schickt die harmlose EICAR-Testsignatur an ClamAV. Nutzt die Werte oben, auch ungespeichert.')}
            stacked
          >
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Box>
                <Button
                  variant="tonal"
                  onClick={runClamTest}
                  disabled={clamTesting}
                  startIcon={clamTesting ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
                >
                  {t('Testen')}
                </Button>
              </Box>
              {clamResult && <Alert severity={clamResult.ok ? 'success' : 'warning'}>{clamResult.text}</Alert>}
            </Box>
          </SettingRow>
        </SettingsSection>
      </Stack>
    ),

    import: (
      <Stack spacing={4}>
        <SettingsSection
          title={t('Aus einem anderen Uploader übernehmen')}
          description={t(
            'Holt Konten, Dateien, Alben, Texte und Kurzlinks aus Zipline, XBackBone oder Chibisafe. Alte Links leiten danach auf MoeShare weiter.'
          )}
        >
          <ImportTools sources={imports.sources} argon2={imports.argon2} redirects={imports.redirects} />
        </SettingsSection>
      </Stack>
    ),

    funktionen: (
      <Stack spacing={4}>
        <SettingsSection title={t('Kurzlinks')} description={t('Lange Adressen kürzen, im Dashboard oder mit ShareX.')}>
          {toggle('links.enabled', t('Link-Kürzer'), t('Angemeldete können Kurzlinks anlegen. Sie leiten über /s/… zum Ziel weiter.'))}
          {select('links.urlStyle', t('Adressstil für Kurzlinks'), t('Wie neue Kurzlinks aussehen.'), styleOptions(LINK_STYLES))}
        </SettingsSection>
        <SettingsSection title={t('Alben')}>
          {toggle('albums.enabled', t('Alben'), t('Dateien in Alben sammeln und gemeinsam über einen Link teilen.'))}
          {toggle('zip.enabled', t('ZIP-Download'), t('Alben und ausgewählte Dateien lassen sich als ZIP-Archiv herunterladen.'))}
        </SettingsSection>
        <SettingsSection
          title={t('Papierkorb')}
          description={t('Gelöschte Dateien lassen sich eine Weile wiederherstellen. So lange zählen sie weiter zum Speicher.')}
        >
          {toggle(
            'trash.enabled',
            t('Papierkorb'),
            t('Ausgeschaltet ist Löschen sofort endgültig. Was schon im Papierkorb liegt, bleibt bis zum Ablauf.')
          )}
          {number('trash.days', t('Aufbewahren'), t('Danach löscht MoeShare die Dateien endgültig.'), {
            min: 1,
            max: 365,
            unit: t('Tage'),
          })}
        </SettingsSection>
        <SettingsSection
          title={t('Statistiken')}
          description={t(
            'Aufrufe, Downloads und Herkunft pro Tag. Gespeichert werden nur Zähler und Domains, keine IP-Adressen oder Geräte.'
          )}
        >
          {toggle('stats.enabled', t('Statistiken zählen'), t('Jeder sieht die Zahlen zu den eigenen Dateien, Alben und Kurzlinks.'))}
          {number('stats.retentionDays', t('Aufbewahren'), t('Ältere Tage löscht MoeShare automatisch.'), {
            min: 30,
            max: 1825,
            unit: t('Tage'),
          })}
        </SettingsSection>
        <SettingsSection title={t('Suche und Daten')}>
          {toggle(
            'search.content',
            t('In Texten suchen'),
            t('Die Suche im Dashboard findet auch Wörter in Texten, Code und anderen Textdateien bis 512 KB.')
          )}
          {toggle(
            'export.enabled',
            t('Datenexport'),
            t('Jeder kann unter Konto alle eigenen Dateien und Angaben als ZIP-Archiv herunterladen.')
          )}
        </SettingsSection>
        <SettingsSection title={t('Öffentliche Seiten')}>
          {toggle(
            'profiles.enabled',
            t('Profilseiten'),
            t(
              'Jeder kann unter /u/name eine öffentliche Seite mit Beschreibung, Links, öffentlichen Alben und ausgewählten Dateien einschalten.'
            )
          )}
          {toggle(
            'reports.enabled',
            t('Melden'),
            t('Besucher können Dateien, Alben, Kurzlinks und Profile melden. Die Meldungen landen unter Administration › Meldungen.')
          )}
          <SettingRow
            icon={<PaletteOutlined />}
            label={t('Vorschauseiten')}
            description={t('Designs, erlaubte Anpassungen und eigenes CSS stellst du unter Gestalten ein.')}
          >
            <Button variant="tonal" href="/design#vorschauseite">
              {t('Gestalten öffnen')}
            </Button>
          </SettingRow>
        </SettingsSection>
      </Stack>
    ),

    domains: (
      <Stack spacing={4}>
        <SettingsSection
          title={t('Eigene Domains')}
          description={t(
            'Benutzer verbinden eine eigene Domain und bestätigen sie mit einem TXT-Eintrag. Danach sind ihre Dateien, Alben, Kurzlinks und Profile auch darüber erreichbar.'
          )}
        >
          {toggle(
            'domains.enabled',
            t('Eigene Domains erlauben'),
            t('Ausgeschaltet antworten bereits verbundene Domains nicht mehr, bleiben aber gespeichert.')
          )}
          {number('domains.maxPerUser', t('Domains pro Benutzer'), t('Wie viele Domains jedes Konto verbinden darf.'), {
            min: 1,
            max: 20,
            unit: t('Domains'),
          })}
          {text(
            'domains.target',
            t('Ziel für CNAME-Einträge'),
            t('Auf diesen Hostnamen sollen eigene Domains zeigen. Meist der Hostname der Basis-URL.'),
            {
              mono: true,
              placeholder: (() => {
                try {
                  return new URL(String(v<string>('site.baseUrl') || '')).hostname;
                } catch {
                  return 'share.example.com';
                }
              })(),
            }
          )}
          {toggle(
            'domains.https',
            t('HTTPS'),
            t('Links über eigene Domains beginnen mit https://. Nur abschalten, wenn dein Proxy für sie kein HTTPS kann.')
          )}
        </SettingsSection>
        <SettingsSection title={t('Reverse-Proxy')}>
          <CaddyHint upstream={`localhost:${initial.environment.port}`} />
        </SettingsSection>
        <SettingsSection title={t('Verbundene Domains')}>
          <DomainList />
        </SettingsSection>
      </Stack>
    ),

    email: (
      <Stack spacing={4}>
        <SettingsSection
          title={t('E-Mail-Versand')}
          description={t(
            'Für „Passwort vergessen“, das Bestätigen von Adressen, Einladungen und Hinweise an Admins. Funktioniert mit jedem SMTP-Server.'
          )}
        >
          {toggle('mail.enabled', t('E-Mails verschicken'), t('Erst einschalten, wenn die Testnachricht ankommt.'))}
          {text('mail.host', t('SMTP-Server'), undefined, { mono: true, placeholder: 'smtp.example.com' })}
          {number('mail.port', t('Port'), t('Meist 587 mit STARTTLS oder 465 mit TLS.'), { min: 1, max: 65535, unit: '' })}
          {choice(
            'mail.security',
            t('Verschlüsselung'),
            t('STARTTLS beginnt unverschlüsselt und wechselt dann, TLS ist von Anfang an verschlüsselt.'),
            [
              { value: 'starttls', label: 'STARTTLS' },
              { value: 'tls', label: 'TLS' },
              { value: 'none', label: t('Keine') },
            ]
          )}
          {text('mail.username', t('Benutzername'), t('Leer lassen, wenn der Server keine Anmeldung braucht.'), { mono: true })}
          {secret('mail.password', t('Passwort'), t('Wird verschlüsselt gespeichert und nicht wieder angezeigt.'))}
        </SettingsSection>
        <SettingsSection title={t('Absender')}>
          {text('mail.from', t('Absenderadresse'), t('Muss zum SMTP-Zugang passen, sonst landen Nachrichten im Spam.'), {
            mono: true,
            placeholder: 'noreply@example.com',
          })}
          {text('mail.fromName', t('Absendername'), t('Leer: der Name der Seite.'), {
            placeholder: String(v<string>('site.title') || 'MoeShare'),
          })}
        </SettingsSection>
        <SettingsSection title={t('Test')}>
          <SettingRow
            label={t('Testnachricht')}
            description={
              mailUnsaved
                ? t('Speichere zuerst deine Änderungen. Der Test nutzt die gespeicherten Einstellungen.')
                : t('Leer: an deine eigene, bestätigte Adresse.')
            }
            stacked
          >
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
              <TextField
                size="small"
                fullWidth
                type="email"
                placeholder={t('E-Mail-Adresse')}
                value={mailTo}
                onChange={(event) => setMailTo(event.target.value)}
                slotProps={{ htmlInput: { 'aria-label': t('Empfänger der Testnachricht') } }}
              />
              <Button
                variant="tonal"
                onClick={runMailTest}
                disabled={mailTesting || mailUnsaved}
                startIcon={mailTesting ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
                sx={{ flexShrink: 0, height: 40 }}
              >
                {t('Senden')}
              </Button>
            </Box>
          </SettingRow>
        </SettingsSection>
      </Stack>
    ),

    speicher: (
      <Stack spacing={4}>
        <SettingsSection title={t('Neue Uploads')}>
          {choice('storage.driver', t('Speicherort'), t('Gilt für neue Uploads. Vorhandene Dateien verschiebst du weiter unten.'), [
            { value: 'local', label: t('Auf dem Server') },
            { value: 's3', label: 'S3' },
          ])}
        </SettingsSection>
        <SettingsSection
          title={t('S3-Zugang')}
          description={t('Für AWS S3, Cloudflare R2, Backblaze B2, MinIO, Wasabi und andere S3-kompatible Dienste.')}
        >
          {text(
            'storage.s3.endpoint',
            t('Endpoint'),
            t('Für AWS leer lassen. Bei R2 die Adresse aus dem Cloudflare-Dashboard, bei MinIO die deines Servers.'),
            { mono: true, placeholder: 'https://s3.eu-central-003.backblazeb2.com' }
          )}
          {text(
            'storage.s3.region',
            t('Region'),
            t('Bei AWS zum Beispiel eu-central-1, bei R2 auto. Leer: wird aus dem Endpoint abgeleitet.'),
            {
              mono: true,
              placeholder: 'eu-central-1',
            }
          )}
          {text('storage.s3.bucket', t('Bucket'), undefined, { mono: true })}
          {text('storage.s3.accessKeyId', t('Access Key ID'), undefined, { mono: true })}
          {secret('storage.s3.secretAccessKey', t('Secret Access Key'), t('Wird verschlüsselt gespeichert und nicht wieder angezeigt.'))}
          {text('storage.s3.prefix', t('Ordner im Bucket'), t('Optional. So kann sich MoeShare einen Bucket mit anderem teilen.'), {
            mono: true,
            placeholder: 'moeshare',
          })}
          {toggle(
            'storage.s3.pathStyle',
            t('Pfad-Adressen'),
            t('Für MinIO und andere selbst betriebene Dienste einschalten, die keine Bucket-Subdomains kennen.')
          )}
          {choice(
            'storage.s3.delivery',
            t('Auslieferung'),
            t(
              'Über den Server bleibt der Bucket privat und alles läuft durch MoeShare. Direkt laden Besucher über eine kurzlebige, signierte Adresse aus S3, das entlastet den Server.'
            ),
            [
              { value: 'proxy', label: t('Über den Server') },
              { value: 'redirect', label: t('Direkt aus S3') },
            ]
          )}
        </SettingsSection>
        <SettingsSection title={t('Dateien')} description={t('Wo die Dateien gerade liegen. Beim Verschieben bleiben alle Links gleich.')}>
          <StorageTools
            initial={storage}
            draft={draft}
            secret={secrets['storage.s3.secretAccessKey']}
            unsaved={changedKeys.some((key) => key.startsWith('storage.'))}
          />
        </SettingsSection>
      </Stack>
    ),

    sicherungen: (
      <Stack spacing={4}>
        <SettingsSection
          title={t('Automatische Sicherung')}
          description={t(
            'Sichert Datenbank und Einstellungen, auf Wunsch auch alle Dateien. Die Sicherungen liegen in db/backups oder in deinem S3-Bucket.'
          )}
        >
          {toggle('backup.enabled', t('Automatisch sichern'), t('Läuft im Hintergrund, auch wenn niemand angemeldet ist.'))}
          {number('backup.intervalHours', t('Abstand'), t('Wie oft eine neue Sicherung entsteht.'), {
            min: 1,
            max: 720,
            unit: t('Stunden'),
          })}
          {number(
            'backup.keep',
            t('Aufbewahren'),
            t('So viele automatische Sicherungen bleiben, ältere werden gelöscht. Manuelle bleiben, bis du sie löschst.'),
            { min: 1, max: 100, unit: t('Stück') }
          )}
          {toggle(
            'backup.includeUploads',
            t('Dateien mitsichern'),
            t('Die Sicherung wird dann etwa so groß wie dein Upload-Ordner. Dateien, die schon in S3 liegen, sind nicht dabei.')
          )}
          {choice('backup.target', t('Ablage'), t('S3 nutzt den Zugang unter Speicherort, im Ordner backups.'), [
            { value: 'local', label: t('Auf dem Server') },
            { value: 's3', label: t('Im S3-Bucket') },
          ])}
        </SettingsSection>
        <SettingsSection title={t('Vorhandene Sicherungen')}>
          <BackupTools initial={backups} includeUploads={Boolean(saved['backup.includeUploads'])} />
        </SettingsSection>
      </Stack>
    ),

    anmeldung: (
      <Stack spacing={4}>
        <SettingsSection title={t('Registrierung')}>
          {choice('auth.registration', t('Neue Konten'), t('Admins können unter Benutzer immer Konten anlegen.'), [
            { value: 'closed', label: t('Nur durch Admins') },
            { value: 'invite', label: t('Mit Einladung') },
            { value: 'open', label: t('Für alle offen') },
          ])}
        </SettingsSection>
        <SettingsSection title={t('Sicherheit')}>
          {choice(
            'auth.enforceMfa',
            t('Zwei-Faktor-Pflicht'),
            t('Betroffene müssen eine Authenticator-App einrichten, bevor sie weiterarbeiten können.'),
            [
              { value: 'off', label: t('Freiwillig') },
              { value: 'admins', label: t('Für Admins') },
              { value: 'all', label: t('Für alle') },
            ]
          )}
          {lockoutRisk && (
            <Box sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
              <Alert severity="warning">
                {t('Du selbst hast noch keine Authenticator-App. Nach dem Speichern wirst du direkt zur Einrichtung geschickt.')}
              </Alert>
            </Box>
          )}
          {number('auth.passwordMinLength', t('Mindestlänge für Passwörter'), t('Gilt für neue und geänderte Passwörter.'), {
            min: 8,
            max: 64,
            unit: t('Zeichen'),
          })}
          {number(
            'auth.sessionDays',
            t('Angemeldet bleiben'),
            t('So lange bleibt man mit „Angemeldet bleiben“ eingeloggt, solange man die Seite ab und zu benutzt.'),
            { min: 1, max: 365, unit: t('Tage') }
          )}
        </SettingsSection>
        <SettingsSection title={t('Anmeldeverfahren')}>
          {toggle(
            'auth.passkeys',
            t('Passkeys'),
            t('Anmeldung mit Fingerabdruck, Gesicht oder Geräte-PIN. Braucht HTTPS und eine korrekte Basis-URL.')
          )}
          {toggle(
            'auth.tokenLogin',
            t('Anmeldung mit ShareX-Token'),
            t(
              'Übergangshilfe für Konten aus der alten Version, die ihr Passwort nicht kennen. Schalte sie ab, sobald alle ein Passwort haben.'
            )
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
          aria-label={t('Anmeldedienst')}
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
                <Box component="span" aria-label={t('aktiv')} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c.primary }} />
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
          title={t('Impressum')}
          description={t(
            'Erscheint unten auf jeder Seite. Verlinke eine bestehende Seite oder schreib den Text hier, dann zeigt MoeShare ihn unter /impressum.'
          )}
        >
          {text('legal.imprintUrl', t('Link'), t('Hat Vorrang vor dem eigenen Text.'), {
            mono: true,
            placeholder: 'https://example.com/impressum',
          })}
          {longText(
            'legal.imprintText',
            t('Eigener Text'),
            t('Zeilenumbrüche bleiben erhalten, Adressen und E-Mails werden zu Links.'),
            20000
          )}
        </SettingsSection>
        <SettingsSection
          title={t('Datenschutz')}
          description={t(
            'Erscheint unten auf jeder Seite. Verlinke deine Datenschutzerklärung oder schreib sie hier, dann zeigt MoeShare sie unter /datenschutz.'
          )}
        >
          {text('legal.privacyUrl', t('Link'), t('Hat Vorrang vor dem eigenen Text.'), {
            mono: true,
            placeholder: 'https://example.com/datenschutz',
          })}
          {longText(
            'legal.privacyText',
            t('Eigener Text'),
            t('Zeilenumbrüche bleiben erhalten, Adressen und E-Mails werden zu Links.'),
            100000
          )}
        </SettingsSection>
        <SettingsSection
          title={t('Eigene Links')}
          description={t(
            'Zum Beispiel dein Discord-Server, eine Status-Seite oder Kontakt. Sie stehen neben Impressum und Datenschutz im Fuß jeder Seite.'
          )}
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
        <SettingsSection
          title={t('Benachrichtigungen')}
          description={t('MoeShare meldet Ereignisse wie neue Konten, Anmeldungen oder Virenfunde an die Dienste, die du hier einträgst.')}
        >
          <WebhookTargets initial={webhooks.targets} kinds={webhooks.kinds} events={webhooks.events} />
        </SettingsSection>
      </Stack>
    ),

    system: (
      <Stack spacing={4}>
        <SettingsSection title={t('Betrieb')}>
          {toggle(
            'system.trustProxy',
            t('Hinter einem Reverse-Proxy'),
            t(
              'Einschalten, wenn nginx, Caddy, Traefik oder Cloudflare vor MoeShare sitzen. Sonst sehen alle Besucher gleich aus und das Bremsen falscher Anmeldungen trifft alle.'
            )
          )}
          {initial.environment.errorReports === 'off' ? (
            <SettingRow
              label={t('Fehlerberichte')}
              description={t(
                'Abgeschaltet über die Umgebungsvariable GLITCHTIP_DSN. Ohne sie gehen Berichte an das GlitchTip des MoeShare-Projekts, sobald du sie hier erlaubst.'
              )}
            />
          ) : (
            toggle(
              'system.errorReports',
              initial.environment.errorReports === 'custom' ? t('Fehlerberichte an dein GlitchTip') : t('Fehlerberichte an die Entwickler'),
              initial.environment.errorReports === 'custom'
                ? t(
                    'Schickt Fehlermeldungen und vom Browser blockierte Inhalte an das GlitchTip aus GLITCHTIP_DSN, damit Fehler schneller behoben werden. Benutzernamen, IP-Adressen, Dateinamen und Links werden vorher entfernt.'
                  )
                : t(
                    'Schickt Fehlermeldungen und vom Browser blockierte Inhalte an das GlitchTip des MoeShare-Projekts, damit Fehler schneller behoben werden. Benutzernamen, IP-Adressen, Dateinamen und Links werden vorher entfernt.'
                  )
            )
          )}
        </SettingsSection>
        <SettingsSection
          title={t('Datenschutz')}
          description={t('Aktivitäten wie Anmeldungen werden protokolliert, damit du fremde Zugriffe erkennst.')}
        >
          {toggle(
            'system.logIps',
            t('IP-Adressen speichern'),
            t('Bei Sitzungen und im Aktivitätsprotokoll. Werden mit den Einträgen gelöscht.')
          )}
          {number('system.auditRetentionDays', t('Aktivität aufbewahren'), t('Ältere Einträge löscht MoeShare automatisch.'), {
            min: 7,
            max: 730,
            unit: t('Tage'),
          })}
        </SettingsSection>
        <SettingsSection
          title={t('Server')}
          description={t(
            'Der Port steht schon vor dem Start fest. Ändern kannst du ihn mit der Umgebungsvariable PORT, er gilt dann nach einem Neustart.'
          )}
        >
          <SettingRow
            label={t('Port')}
            description={
              <Box component="span" sx={{ fontFamily: fonts.mono }}>
                {initial.environment.port}
              </Box>
            }
          />
          <SettingRow
            label={t('Protokoll')}
            description={
              <>
                {rich('Stufe {level}, Format {format}. Ändern mit LOG_LEVEL (debug, info, warn, error) und LOG_FORMAT (text, json).', {
                  level: (
                    <Box component="span" sx={{ fontFamily: fonts.mono }}>
                      {initial.environment.logLevel}
                    </Box>
                  ),
                  format: (
                    <Box component="span" sx={{ fontFamily: fonts.mono }}>
                      {initial.environment.logFormat}
                    </Box>
                  ),
                })}
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
        aria-label={t('Einstellungsbereiche')}
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
                <Tooltip title={t('Ungespeicherte Änderungen')}>
                  <Box
                    component="span"
                    aria-label={t('geändert')}
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
