import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import SignpostOutlined from '@mui/icons-material/SignpostOutlined';
import TranslateRounded from '@mui/icons-material/TranslateRounded';
import LinkRounded from '@mui/icons-material/LinkRounded';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import LanguageRounded from '@mui/icons-material/LanguageRounded';
import PhotoSizeSelectLargeRounded from '@mui/icons-material/PhotoSizeSelectLargeRounded';
import type { AccountOverview, ExpiryChoice, Preferences, UrlStyle } from '../../lib/types';
import { ApiError, clearLinkPath, errorMessage, saveLinkPath, savePreferences } from '../../lib/api';
import { t } from '../../lib/i18n';
import { SettingRow, SettingsSection } from '../../components/SettingsKit';
import { DomainSelect, ExpirySelect, UrlStyleSelect, expiryLabel, urlStyleExample, urlStyleLabel } from '../../components/ShareOptions';
import { useToast } from '../../components/Toaster';
import { EmailSection } from './EmailSection';
import { PushSection } from './PushSection';
import { readBoot } from '../../lib/boot';
import { fonts } from '../../theme/tokens';

const LANGUAGE_NAMES: Record<'de' | 'en', string> = { de: 'Deutsch', en: 'English' };

function LinkPathRow({ initial, base }: { initial: AccountOverview['linkPath']; base: string }) {
  const toast = useToast();
  const [current, setCurrent] = useState(initial.current);
  const [value, setValue] = useState(initial.current || initial.suggestion);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const wanted = value
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '');
  const dirty = wanted !== (current || '');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await saveLinkPath(wanted);
      setCurrent(result.path);
      setValue(result.path);
      toast(t('Pfad gespeichert. Neue Links sehen jetzt so aus.'), { variant: 'success' });
    } catch (failure) {
      if (failure instanceof ApiError && failure.field === 'path') setError(failure.message);
      else toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError('');
    try {
      await clearLinkPath();
      setCurrent(null);
      toast(t('Pfad entfernt. Neue Links nutzen wieder /view/.'), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingRow
      icon={<SignpostOutlined />}
      label={t('Eigener Pfad')}
      description={t('Statt /view/ steht dein Pfad in deinen Links. Ändern kannst du ihn jederzeit, alte Links leiten weiter.')}
      htmlFor="pref-link-path"
      stacked
    >
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <TextField
          id="pref-link-path"
          size="small"
          value={value}
          placeholder={t('dein-name')}
          disabled={busy}
          error={!!error}
          helperText={error || undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && dirty && wanted) save();
          }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start">/</InputAdornment> },
            htmlInput: { maxLength: 32, spellCheck: false, autoCapitalize: 'off', autoComplete: 'off' },
          }}
          sx={{ width: { xs: '100%', sm: 260 } }}
        />
        <Button variant="tonal" onClick={save} disabled={busy || !dirty || !wanted}>
          {current ? t('Ändern') : t('Speichern')}
        </Button>
        {current && (
          <Button onClick={clear} disabled={busy}>
            {t('Entfernen')}
          </Button>
        )}
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: fonts.mono, wordBreak: 'break-all' }}>
        {base}/
        <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>
          {wanted || current || t('dein-name')}
        </Box>
        /JrinQR99
      </Typography>
    </SettingRow>
  );
}

export function PreferencesPanel({ account, onSaved }: { account: AccountOverview; onSaved: (preferences: Preferences) => void }) {
  const toast = useToast();
  const { choices } = account;
  const [prefs, setPrefs] = useState<Preferences>(account.preferences);
  useEffect(() => setPrefs(account.preferences), [account.preferences]);
  const [busy, setBusy] = useState(false);

  const save = async <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    setBusy(true);
    try {
      const result = await savePreferences({ [key]: value } as Partial<Preferences>);
      if (key === 'language') {
        window.location.reload();
        return;
      }
      setPrefs(result.preferences);
      onSaved(result.preferences);
      toast(t('Gespeichert'), { variant: 'success' });
    } catch (failure) {
      setPrefs(previous);
      toast(errorMessage(failure), { variant: 'error' });
    }
    setBusy(false);
  };

  const style = prefs.urlStyle || choices.defaults.urlStyle;

  return (
    <Stack spacing={4}>
      {account.email.available && (
        <EmailSection
          initial={account.email}
          isAdmin={account.user.isAdmin}
          notify={prefs.notify}
          busy={busy}
          onNotify={(next) => save('notify', next)}
        />
      )}
      {readBoot().site.push && <PushSection isAdmin={account.user.isAdmin} />}
      <SettingsSection id="sprache" title={t('Sprache')} description={t('Gilt für dich auf allen Geräten, auf denen du angemeldet bist.')}>
        <SettingRow icon={<TranslateRounded />} label={t('Sprache der Oberfläche')} htmlFor="pref-language">
          <Box sx={{ width: { xs: '100%', sm: 280 } }}>
            <TextField
              id="pref-language"
              select
              fullWidth
              size="small"
              value={prefs.language || ''}
              disabled={busy}
              slotProps={{ select: { displayEmpty: true } }}
              onChange={(event) => save('language', (event.target.value || null) as Preferences['language'])}
            >
              <MenuItem value="">{t('Wie der Server ({language})', { language: LANGUAGE_NAMES[choices.defaults.language] })}</MenuItem>
              {choices.languages.map((code) => (
                <MenuItem key={code} value={code} lang={code}>
                  {LANGUAGE_NAMES[code]}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        id="uploads"
        title={t('Uploads')}
        description={t('Gilt für Uploads im Browser, mit ShareX und über die API. Beim einzelnen Upload kannst du alles noch ändern.')}
      >
        <SettingRow
          icon={<LinkRounded />}
          label={t('Adressstil')}
          description={
            <>
              {t('So sehen deine Links aus, zum Beispiel')}{' '}
              <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: '0.8125rem' }}>
                {urlStyleExample(style)}
              </Box>
            </>
          }
        >
          <Box sx={{ width: { xs: '100%', sm: 320 } }}>
            <UrlStyleSelect
              label=""
              value={prefs.urlStyle || ''}
              styles={choices.urlStyles}
              includeDefault={t('Server-Standard ({style})', { style: urlStyleLabel(choices.defaults.urlStyle) })}
              onChange={(value) => save('urlStyle', (value || null) as UrlStyle | null)}
            />
          </Box>
        </SettingRow>
        <SettingRow
          icon={<TimerOutlined />}
          label={t('Automatisch löschen')}
          description={
            choices.maxExpiry !== 'never'
              ? t('Auf diesem Server bleibt nichts länger als {max}.', { max: expiryLabel(choices.maxExpiry) })
              : t('Neue Uploads werden nach dieser Zeit gelöscht.')
          }
        >
          <Box sx={{ width: { xs: '100%', sm: 320 } }}>
            <ExpirySelect
              label=""
              value={prefs.expiry || ''}
              max={choices.maxExpiry}
              includeDefault={t('Server-Standard ({expiry})', { expiry: expiryLabel(choices.defaults.expiry) })}
              onChange={(value) => save('expiry', (value || null) as ExpiryChoice | null)}
            />
          </Box>
        </SettingRow>
        {choices.optimize && (
          <SettingRow
            icon={<PhotoSizeSelectLargeRounded />}
            label={t('Bilder optimieren')}
            description={t(
              'Bilder werden beim Hochladen kleiner gespeichert. Sichtbar ändert sich nichts, deine Links laden aber schneller.'
            )}
            htmlFor="pref-optimize"
          >
            <Switch
              id="pref-optimize"
              checked={prefs.optimize !== false}
              disabled={busy}
              onChange={(event) => save('optimize', event.target.checked ? null : false)}
            />
          </SettingRow>
        )}
        {account.linkPath.enabled && <LinkPathRow initial={account.linkPath} base={choices.domains[0] || window.location.origin} />}
        {choices.domains.length > 1 && (
          <SettingRow
            icon={<LanguageRounded />}
            label={t('Domain')}
            description={t('Unter welcher Adresse deine Links verschickt werden.')}
          >
            <Box sx={{ width: { xs: '100%', sm: 320 } }}>
              <DomainSelect
                value={prefs.domain || ''}
                domains={choices.domains}
                includeDefault={t('Server-Standard')}
                onChange={(value) => save('domain', value || null)}
              />
            </Box>
          </SettingRow>
        )}
      </SettingsSection>
    </Stack>
  );
}
