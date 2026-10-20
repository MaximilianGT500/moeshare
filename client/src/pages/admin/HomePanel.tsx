import { useMemo, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import type { HomeOptions, HomeStatKey, HomeStatsFull, SettingsPayload, SettingValue, SiteInfo } from '../../lib/types';
import { ApiError, errorMessage, saveSettings } from '../../lib/api';
import { SaveBar, SettingRow, SettingsSection, SwitchRow } from '../../components/SettingsKit';
import { useToast } from '../../components/Toaster';
import { isCancelled, useSudo } from '../../components/Sudo';
import { useElementHeight, useElementWidth } from '../../lib/hooks';
import { HomeView, STAT_META } from '../home/HomeView';
import { c, fonts, radius } from '../../theme/tokens';

const KEYS = ['home.enabled', 'home.headline', 'home.text', 'home.stats', 'home.activity', 'home.signIn', 'site.redirectUrl'] as const;
const STAT_ORDER = Object.keys(STAT_META) as HomeStatKey[];
const PREVIEW_WIDTH = 1200;

type Values = Record<string, SettingValue>;

const pick = (values: Values) => Object.fromEntries(KEYS.map((key) => [key, values[key]])) as Values;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function ScaledPreview({ children }: { children: ReactNode }) {
  const [frame, width] = useElementWidth<HTMLDivElement>();
  const [content, height] = useElementHeight<HTMLDivElement>();
  const scaled = width >= 600;
  const scale = scaled ? width / PREVIEW_WIDTH : 1;
  return (
    <Box
      ref={frame}
      sx={{
        position: 'relative',
        borderRadius: `${radius.lg}px`,
        overflow: 'hidden',
        bgcolor: c.surface,
        boxShadow: `inset 0 0 0 1px ${c.outlineVariant}`,
        height: height ? height * scale : 'auto',
      }}
    >
      <Box
        ref={content}
        sx={{ width: scaled ? PREVIEW_WIDTH : '100%', transform: scaled ? `scale(${scale})` : 'none', transformOrigin: 'top left' }}
      >
        {children}
      </Box>
    </Box>
  );
}

export function HomePanel({
  initial,
  site,
  stats,
  registrationOpen,
  onSaved,
  onOpenSettings,
}: {
  initial: SettingsPayload;
  site: SiteInfo;
  stats: HomeStatsFull;
  registrationOpen: boolean;
  onSaved: (payload: SettingsPayload) => void;
  onOpenSettings: () => void;
}) {
  const toast = useToast();
  const sudo = useSudo();
  const [saved, setSaved] = useState<Values>(() => pick(initial.values));
  const [draft, setDraft] = useState<Values>(() => pick(initial.values));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const changed = KEYS.filter((key) => !same(draft[key], saved[key]));
  const set = (key: string, value: SettingValue) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => (previous[key] ? { ...previous, [key]: '' } : previous));
  };

  const home: HomeOptions = {
    enabled: draft['home.enabled'] === true,
    headline: (draft['home.headline'] as string) || '',
    text: (draft['home.text'] as string) || '',
    stats: (draft['home.stats'] as HomeStatKey[]) || [],
    activity: draft['home.activity'] === true,
    signIn: draft['home.signIn'] === true,
  };

  const previewStats = useMemo(
    () => ({ stats: home.stats.map((key) => ({ key, value: stats.values[key] ?? 0 })), activity: home.activity ? stats.activity : null }),
    [home.stats, home.activity, stats]
  );

  const toggleStat = (key: HomeStatKey) =>
    set(
      'home.stats',
      STAT_ORDER.filter((candidate) => (candidate === key ? !home.stats.includes(key) : home.stats.includes(candidate)))
    );

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const result = await sudo(() => saveSettings(Object.fromEntries(changed.map((key) => [key, draft[key]]))));
      setSaved(pick(result.values));
      setDraft(pick(result.values));
      onSaved({ ...initial, values: result.values, secrets: result.secrets });
      toast('Startseite gespeichert', { variant: 'success' });
    } catch (failure) {
      if (isCancelled(failure)) return;
      if (failure instanceof ApiError && failure.field) setErrors({ [failure.field]: failure.message });
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const redirect = (draft['site.redirectUrl'] as string) || '';

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 440px) minmax(0, 1fr)' },
        gap: { xs: 4, lg: 4 },
        alignItems: 'start',
        pb: 10,
      }}
    >
      <Stack spacing={4}>
        <SettingsSection title="Startseite" description="Was Besucher sehen, wenn sie die Adresse ohne Pfad öffnen.">
          <SwitchRow
            id="home-enabled"
            label="Startseite anzeigen"
            description="Mit Statistiken, Text und Links. Aus: Besucher werden weitergeleitet."
            checked={home.enabled}
            onChange={(on) => set('home.enabled', on)}
          />
          {!home.enabled && (
            <SettingRow
              label="Weiterleiten zu"
              description="Leer lassen, dann landen Besucher bei der Anmeldung oder im eigenen Dashboard."
              stacked
            >
              <TextField
                size="small"
                fullWidth
                value={redirect}
                onChange={(event) => set('site.redirectUrl', event.target.value)}
                placeholder="https://example.com"
                error={!!errors['site.redirectUrl']}
                helperText={errors['site.redirectUrl']}
                slotProps={{ htmlInput: { 'aria-label': 'Weiterleiten zu', spellCheck: false, style: { fontFamily: fonts.mono } } }}
              />
            </SettingRow>
          )}
        </SettingsSection>

        {home.enabled && (
          <>
            <SettingsSection title="Inhalt">
              <SettingRow label="Überschrift" description="Leer lassen für den Namen der Seite." stacked>
                <TextField
                  size="small"
                  fullWidth
                  value={home.headline}
                  placeholder={site.title}
                  onChange={(event) => set('home.headline', event.target.value)}
                  error={!!errors['home.headline']}
                  helperText={errors['home.headline']}
                  slotProps={{ htmlInput: { 'aria-label': 'Überschrift', maxLength: 80 } }}
                />
              </SettingRow>
              <SettingRow label="Text" description="Ein paar Sätze, worum es auf deiner Seite geht." stacked>
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  value={home.text}
                  onChange={(event) => set('home.text', event.target.value)}
                  error={!!errors['home.text']}
                  helperText={errors['home.text'] || `${home.text.length} von 600 Zeichen`}
                  slotProps={{ htmlInput: { 'aria-label': 'Text', maxLength: 600 } }}
                />
              </SettingRow>
              <SwitchRow
                id="home-signin"
                label="Knopf zum Anmelden"
                description="Angemeldete sehen stattdessen „Zum Dashboard“. „Konto erstellen“ erscheint, wenn sich jeder registrieren darf."
                checked={home.signIn}
                onChange={(on) => set('home.signIn', on)}
              />
            </SettingsSection>

            <SettingsSection title="Statistiken" description="Alle Werte gelten für den ganzen Server, nicht für einzelne Konten.">
              <SettingRow label="Angezeigte Zahlen" stacked>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {STAT_ORDER.map((key) => {
                    const active = home.stats.includes(key);
                    return (
                      <Chip
                        key={key}
                        icon={STAT_META[key].icon}
                        label={STAT_META[key].label}
                        onClick={() => toggleStat(key)}
                        aria-pressed={active}
                        variant={active ? 'filled' : 'outlined'}
                        sx={
                          active
                            ? { bgcolor: c.secondaryContainer, color: c.onSecondaryContainer, '& .MuiChip-icon': { color: 'inherit' } }
                            : undefined
                        }
                      />
                    );
                  })}
                </Box>
              </SettingRow>
              <SwitchRow
                id="home-activity"
                label="Uploads der letzten 14 Tage"
                description="Als Diagramm neben der Überschrift."
                checked={home.activity}
                onChange={(on) => set('home.activity', on)}
              />
            </SettingsSection>

            <SettingsSection
              title="Links und Rechtliches"
              description="Eigene Links, Impressum und Datenschutz erscheinen unten auf jeder Seite, auch hier."
            >
              <SettingRow label="Bearbeiten unter Einstellungen" description="Einstellungen › Rechtliches und Links">
                <Button variant="tonal" onClick={onOpenSettings}>
                  Öffnen
                </Button>
              </SettingRow>
            </SettingsSection>
          </>
        )}
      </Stack>

      <Box sx={{ position: { lg: 'sticky' }, top: { lg: 96 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1.5, px: 0.5 }}>
          <Typography variant="h6" component="h2">
            Vorschau
          </Typography>
          <Button size="small" href="/" target="_blank" rel="noopener" endIcon={<OpenInNewRounded />}>
            Seite öffnen
          </Button>
        </Box>
        {home.enabled ? (
          <ScaledPreview>
            <HomeView site={site} home={home} stats={previewStats} user={null} registration={registrationOpen} preview />
          </ScaledPreview>
        ) : (
          <Box sx={{ p: 4, borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainerLow, color: 'text.secondary' }}>
            <Typography>
              Die Startseite ist aus. Wer {site.baseUrl} öffnet, landet{' '}
              {redirect ? `auf ${redirect}` : 'bei der Anmeldung oder im eigenen Dashboard'}.
            </Typography>
          </Box>
        )}
      </Box>

      <SaveBar count={changed.length} busy={busy} onSave={save} onReset={() => setDraft(saved)} />
    </Box>
  );
}
