import { useMemo, useState } from 'react';
import { m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import ShuffleRounded from '@mui/icons-material/ShuffleRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import { readBoot } from '../../lib/boot';
import type { EmbedBoot, EmbedTemplate, FileItem } from '../../lib/types';
import { ApiError, errorMessage, resetOwnEmbed, saveOwnEmbed, saveSettings } from '../../lib/api';
import { render, sameTemplate, valuesFor } from '../../lib/embed';
import { meaningfulColor } from '../../lib/color';
import { storageSummary } from '../../lib/format';
import { AppShell } from '../../components/AppShell';
import { ConfirmProvider, useConfirm } from '../../components/ConfirmDialog';
import { SaveBar } from '../../components/SettingsKit';
import { SudoProvider, isCancelled, useSudo } from '../../components/Sudo';
import { useToast } from '../../components/Toaster';
import { DiscordPreview, type ChatTheme, type PreviewMedia } from './DiscordPreview';
import { EmbedForm } from './EmbedForm';
import { c, ease, radius } from '../../theme/tokens';

type Scope = 'own' | 'default';

const sampleSvg = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a8b"/><stop offset=".55" stop-color="#ff6a88"/><stop offset="1" stop-color="#7b2ff7"/></linearGradient></defs><rect width="1600" height="900" fill="url(#s)"/><circle cx="1150" cy="430" r="150" fill="#ffe29a" opacity=".9"/><path d="M0 700 L320 520 L560 650 L860 460 L1180 640 L1600 500 L1600 900 L0 900Z" fill="#3a1c71" opacity=".85"/><path d="M0 780 L400 640 L760 760 L1100 620 L1600 760 L1600 900 L0 900Z" fill="#22104a"/></svg>`
);
const SAMPLE_IMAGE = `data:image/svg+xml;charset=utf-8,${sampleSvg}`;

function berlinNow(): string {
  const parts = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('day')}.${get('month')}.${get('year')}, ${get('hour')}:${get('minute')}:${get('second')}`;
}

interface Sample {
  key: string;
  label: string;
  file: Pick<FileItem, 'filename' | 'sizeBytes' | 'date' | 'username' | 'views' | 'width' | 'height' | 'type' | 'color'>;
  media: PreviewMedia;
}

function builtinSamples(username: string): Sample[] {
  const date = berlinNow();
  const base = { sizeBytes: 1468006, date, username, views: 42, color: '#ff6a88' };
  return [
    {
      key: 'ex-image',
      label: 'Beispielbild',
      file: { ...base, filename: 'sonnenuntergang.png', width: 1600, height: 900, type: 'image' },
      media: { type: 'image', src: SAMPLE_IMAGE, width: 1600, height: 900 },
    },
    {
      key: 'ex-video',
      label: 'Beispielvideo',
      file: { ...base, filename: 'clip.mp4', sizeBytes: 18874368, width: 1920, height: 1080, type: 'video' },
      media: { type: 'video', src: SAMPLE_IMAGE, width: 1920, height: 1080 },
    },
    {
      key: 'ex-audio',
      label: 'Beispiel-Audio',
      file: { ...base, filename: 'podcast-folge-12.mp3', sizeBytes: 31457280, width: 0, height: 0, type: 'audio' },
      media: { type: 'audio', src: null, width: 0, height: 0 },
    },
    {
      key: 'ex-file',
      label: 'Beispieldatei',
      file: { ...base, filename: 'rechnung-oktober.pdf', sizeBytes: 245760, width: 0, height: 0, type: 'file' },
      media: { type: 'file', src: null, width: 0, height: 0 },
    },
  ];
}

function ownSample(file: FileItem): Sample {
  const src =
    file.type === 'image' ? (file.isGif ? file.urls.direct : file.urls.preview) : file.type === 'video' ? file.urls.preview : null;
  return { key: `file-${file.id}`, label: file.filename, file, media: { type: file.type, src, width: file.width, height: file.height } };
}

const changedFields = (a: EmbedTemplate, b: EmbedTemplate) =>
  (Object.keys(a) as Array<keyof EmbedTemplate>).filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key])).length;

const randomHex = () =>
  `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`;

function EmbedBuilder({ boot }: { boot: EmbedBoot }) {
  const toast = useToast();
  const confirm = useConfirm();
  const sudo = useSudo();
  const isAdmin = boot.user.isAdmin;
  const [allowCustom, setAllowCustom] = useState(boot.embed.allowCustom);
  const [own, setOwn] = useState<EmbedTemplate | null>(boot.embed.own);
  const [defaults, setDefaults] = useState<EmbedTemplate>(boot.embed.defaultTemplate);
  const [scope, setScope] = useState<Scope>(!allowCustom && isAdmin ? 'default' : 'own');
  const baseline = scope === 'default' ? defaults : (own ?? defaults);
  const [draft, setDraft] = useState<EmbedTemplate>(baseline);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<ChatTheme>('dark');
  const [random, setRandom] = useState(randomHex);

  const samples = useMemo(() => {
    const files = boot.embed.samples.map(ownSample);
    return { files, builtin: builtinSamples(boot.user.username) };
  }, [boot]);
  const all = [...samples.files, ...samples.builtin];
  const [sampleKey, setSampleKey] = useState(() => (samples.files.find((s) => s.file.type === 'image') || samples.builtin[0]).key);
  const sample = all.find((s) => s.key === sampleKey) || samples.builtin[0];

  const readOnly = scope === 'own' && !allowCustom;
  const dirty = readOnly ? 0 : changedFields(draft, baseline);
  const rendered = render(draft, valuesFor(sample.file, boot.embed.siteTitle));
  const color =
    draft.color.mode === 'random'
      ? random
      : draft.color.mode === 'dominant'
        ? meaningfulColor(sample.file.color) || draft.color.value
        : draft.color.value;
  const link = `${boot.site.baseUrl}/view/${sample.file.filename}`;

  const switchScope = async (next: Scope | null) => {
    if (!next || next === scope) return;
    if (dirty > 0) {
      const ok = await confirm({
        title: 'Änderungen verwerfen?',
        message: 'Du hast ungespeicherte Änderungen an dieser Vorlage.',
        confirmLabel: 'Verwerfen',
      });
      if (!ok) return;
    }
    setScope(next);
    setDraft(next === 'default' ? defaults : (own ?? defaults));
    setErrors({});
  };

  const fail = (failure: unknown) => {
    if (isCancelled(failure)) return;
    if (failure instanceof ApiError && failure.field) {
      const key = failure.field.split('.').pop() || failure.field;
      setErrors({ [key]: failure.message });
    }
    toast(errorMessage(failure), { variant: 'error' });
  };

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      if (scope === 'default') {
        const result = await sudo(() => saveSettings({ 'embed.default': draft }));
        const saved = result.values['embed.default'] as EmbedTemplate;
        setDefaults(saved);
        setDraft(saved);
        toast('Standardvorlage gespeichert', { variant: 'success' });
      } else {
        const result = await saveOwnEmbed(draft);
        setOwn(result.template);
        setDraft(result.template);
        toast('Dein Embed ist gespeichert', { variant: 'success' });
      }
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  };

  const useDefault = async () => {
    const ok = await confirm({
      title: 'Standardvorlage verwenden?',
      message: 'Dein eigenes Embed wird gelöscht. Deine Links sehen danach aus wie bei allen anderen.',
      confirmLabel: 'Zurücksetzen',
      icon: <RestartAltRounded />,
    });
    if (!ok) return;
    try {
      await resetOwnEmbed();
      setOwn(null);
      setDraft(defaults);
      toast('Du verwendest jetzt die Standardvorlage', { variant: 'success' });
    } catch (failure) {
      fail(failure);
    }
  };

  const toggleCustom = async (value: boolean) => {
    try {
      await sudo(() => saveSettings({ 'embed.allowUserTemplates': value }));
      setAllowCustom(value);
      toast(value ? 'Mitglieder können jetzt eigene Embeds bauen' : 'Ab jetzt gilt für alle die Standardvorlage', { variant: 'success' });
    } catch (failure) {
      fail(failure);
    }
  };

  return (
    <AppShell
      site={boot.site}
      user={boot.user}
      active="embed"
      topBar={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', pl: { xs: 1, md: 0 } }}>
          <Typography variant="h5" component="h1" noWrap sx={{ flex: 1, minWidth: 0 }}>
            Embed
            <Box component="span" sx={{ display: { xs: isAdmin ? 'none' : 'inline', sm: 'inline' } }}>
              {' '}
              Builder
            </Box>
          </Typography>
          {isAdmin && (
            <ToggleButtonGroup
              exclusive
              size="small"
              value={scope}
              onChange={(_event, next: Scope | null) => switchScope(next)}
              aria-label="Vorlage"
            >
              <ToggleButton value="own" disabled={!allowCustom}>
                Mein Embed
              </ToggleButton>
              <ToggleButton value="default">Standard</ToggleButton>
            </ToggleButtonGroup>
          )}
        </Box>
      }
      accountSummary={storageSummary(boot.userStats)}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(380px, 480px)' },
          gridTemplateAreas: { xs: '"intro" "preview" "form"', lg: '"intro preview" "form preview"' },
          gridTemplateRows: { lg: 'auto 1fr' },
          columnGap: 5,
          rowGap: 3,
          alignItems: 'start',
          pb: 6,
        }}
      >
        <Box sx={{ gridArea: 'intro', minWidth: 0 }}>
          <Stack spacing={3}>
            <Typography variant="body1" sx={{ color: 'text.secondary', maxWidth: 640 }}>
              {scope === 'default'
                ? 'Die Standardvorlage gilt für alle, die kein eigenes Embed gebaut haben.'
                : readOnly
                  ? 'Auf diesem Server gilt ein einheitliches Embed. So sehen deine Links aus, wenn du sie teilst.'
                  : own
                    ? 'Dein eigenes Embed gilt für alle deine Links, auch für schon geteilte, sobald Discord sie neu lädt.'
                    : 'Du verwendest die Standardvorlage. Ändere sie hier, um dein eigenes Embed zu bauen.'}
            </Typography>

            {scope === 'default' && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  p: 2,
                  borderRadius: `${radius.md}px`,
                  bgcolor: c.secondaryContainer,
                  color: c.onSecondaryContainer,
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" component="label" htmlFor="allow-custom">
                    Eigene Embeds erlauben
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.85 }}>
                    Mitglieder können ihre Links selbst gestalten. Aus: alle Links nutzen die Standardvorlage.
                  </Typography>
                </Box>
                <Switch id="allow-custom" checked={allowCustom} onChange={(event) => toggleCustom(event.target.checked)} />
              </Box>
            )}

            {readOnly && <Alert severity="info">Eigene Embeds sind auf diesem Server abgeschaltet.</Alert>}
          </Stack>
        </Box>

        <Box sx={{ gridArea: 'form', minWidth: 0 }}>
          <Stack spacing={3}>
            <EmbedForm value={draft} onChange={setDraft} errors={errors} disabled={readOnly} />

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {scope === 'own' && own && allowCustom && (
                <Button startIcon={<RestartAltRounded />} onClick={useDefault}>
                  Standardvorlage verwenden
                </Button>
              )}
              {scope === 'default' && !sameTemplate(draft, boot.embed.builtinTemplate) && (
                <Button startIcon={<RestartAltRounded />} onClick={() => setDraft(boot.embed.builtinTemplate)}>
                  Auf Werkseinstellung setzen
                </Button>
              )}
            </Box>
          </Stack>
        </Box>

        <Box sx={{ gridArea: 'preview', position: { lg: 'sticky' }, top: { lg: 96 }, minWidth: 0 }}>
          <m.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: ease.emphasizedDecelerate }}
          >
            <Box sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainerLow }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <TextField
                  select
                  size="small"
                  label="Vorschau mit"
                  value={sample.key}
                  onChange={(event) => setSampleKey(event.target.value)}
                  sx={{ flex: 1, minWidth: 0 }}
                  slotProps={{ select: { MenuProps: { slotProps: { paper: { sx: { maxHeight: 360 } } } } } }}
                >
                  {samples.files.length > 0 && <ListSubheader>Deine letzten Dateien</ListSubheader>}
                  {samples.files.map((s) => (
                    <MenuItem key={s.key} value={s.key} sx={{ maxWidth: 420 }}>
                      <Typography noWrap variant="body2">
                        {s.label}
                      </Typography>
                    </MenuItem>
                  ))}
                  <ListSubheader>Beispiele</ListSubheader>
                  {samples.builtin.map((s) => (
                    <MenuItem key={s.key} value={s.key}>
                      {s.label}
                    </MenuItem>
                  ))}
                </TextField>
                {draft.color.mode === 'random' && (
                  <Tooltip title="Neue Zufallsfarbe">
                    <IconButton aria-label="Neue Zufallsfarbe" onClick={() => setRandom(randomHex())}>
                      <ShuffleRounded />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title={theme === 'dark' ? 'Helles Chat-Design' : 'Dunkles Chat-Design'}>
                  <IconButton
                    aria-label={theme === 'dark' ? 'Helles Chat-Design zeigen' : 'Dunkles Chat-Design zeigen'}
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  >
                    {theme === 'dark' ? <LightModeRounded /> : <DarkModeRounded />}
                  </IconButton>
                </Tooltip>
              </Box>
              <DiscordPreview embed={rendered} color={color} media={sample.media} link={link} username={boot.user.username} theme={theme} />
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1.5, px: 0.5 }}>
                So ungefähr zeigt Discord deinen Link. Discord merkt sich Vorschauen eine Weile, Änderungen siehst du sicher bei neu
                geposteten Links.
              </Typography>
            </Box>
          </m.div>
        </Box>
      </Box>

      <SaveBar
        count={dirty}
        busy={busy}
        onSave={save}
        onReset={() => setDraft(baseline)}
        label={scope === 'default' ? 'Standard speichern' : 'Speichern'}
      />
    </AppShell>
  );
}

export function EmbedPage() {
  const boot = readBoot<EmbedBoot>();
  return (
    <ConfirmProvider>
      <SudoProvider methods={boot.sudo}>
        <EmbedBuilder boot={boot} />
      </SudoProvider>
    </ConfirmProvider>
  );
}
