import { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import BrandingWatermarkOutlined from '@mui/icons-material/BrandingWatermarkOutlined';
import TextFieldsRounded from '@mui/icons-material/TextFieldsRounded';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import UploadRounded from '@mui/icons-material/UploadRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import GridViewRounded from '@mui/icons-material/GridViewRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import type { WatermarkConfig, WatermarkPosition } from '../../lib/types';
import { ApiError, errorMessage, previewWatermark, resetWatermark, saveWatermark } from '../../lib/api';
import { t } from '../../lib/i18n';
import { SettingRow, SettingsSection } from '../../components/SettingsKit';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { c, radius } from '../../theme/tokens';

const GRID: WatermarkPosition[] = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const GRID_LABELS: Record<string, () => string> = {
  'top-left': () => t('Oben links'),
  top: () => t('Oben mittig'),
  'top-right': () => t('Oben rechts'),
  left: () => t('Links mittig'),
  center: () => t('In der Mitte'),
  right: () => t('Rechts mittig'),
  'bottom-left': () => t('Unten links'),
  bottom: () => t('Unten mittig'),
  'bottom-right': () => t('Unten rechts'),
};
const SWATCHES = ['#ffffff', '#000000', '#ffd54f', '#ff8a80', '#80d8ff'];
const MAX_LOGO = 4 * 1024 * 1024;

type Draft = Omit<WatermarkConfig, 'allowed'>;

const strip = ({ allowed: _allowed, ...rest }: WatermarkConfig): Draft => rest;

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function PositionGrid({ value, onChange }: { value: WatermarkPosition; onChange: (value: WatermarkPosition) => void }) {
  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
      <Box
        role="radiogroup"
        aria-label={t('Position')}
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 40px)',
          gridTemplateRows: 'repeat(3, 30px)',
          gap: '4px',
          p: '6px',
          borderRadius: `${radius.sm}px`,
          bgcolor: c.surfaceContainerHighest,
          opacity: value === 'tile' ? 0.5 : 1,
        }}
      >
        {GRID.map((position) => {
          const selected = value === position;
          return (
            <Tooltip key={position} title={GRID_LABELS[position]()}>
              <ButtonBase
                role="radio"
                aria-checked={selected}
                aria-label={GRID_LABELS[position]()}
                onClick={() => onChange(position)}
                sx={{
                  borderRadius: '6px',
                  bgcolor: selected ? c.primary : c.surfaceContainerLow,
                  transition: 'background-color 160ms',
                  '&:hover': { bgcolor: selected ? c.primary : c.surfaceContainerHigh },
                }}
              >
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: selected ? c.onPrimary : c.outline }} />
              </ButtonBase>
            </Tooltip>
          );
        })}
      </Box>
      <ToggleButton
        value="tile"
        selected={value === 'tile'}
        onChange={() => onChange(value === 'tile' ? 'bottom-right' : 'tile')}
        size="small"
        sx={{ gap: 1, px: 1.5 }}
      >
        <GridViewRounded fontSize="small" />
        {t('Über das ganze Bild verteilen')}
      </ToggleButton>
    </Box>
  );
}

export function WatermarkEditor({ initial }: { initial: WatermarkConfig }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [saved, setSaved] = useState<Draft>(strip(initial));
  const [draft, setDraft] = useState<Draft>(strip(initial));
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string | null; loading: boolean; error: string }>({ url: null, loading: false, error: '' });
  const picker = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const shown = useRef<string | null>(null);

  const image = logo === undefined ? draft.image : logo;
  const dirty = useMemo(() => JSON.stringify({ ...draft, image }) !== JSON.stringify(saved), [draft, image, saved]);
  const ready = draft.kind === 'image' ? Boolean(image) : Boolean(draft.text.trim());

  const payload = () => {
    const { image: _stored, ...rest } = draft;
    return logo === undefined ? rest : { ...rest, image: logo };
  };

  useEffect(() => {
    if (!ready) {
      setPreview((current) => ({ ...current, loading: false, error: '' }));
      return undefined;
    }
    const id = ++request.current;
    const timer = window.setTimeout(async () => {
      setPreview((current) => ({ ...current, loading: true, error: '' }));
      try {
        const blob = await previewWatermark(payload());
        if (id !== request.current) return;
        const url = URL.createObjectURL(blob);
        if (shown.current) URL.revokeObjectURL(shown.current);
        shown.current = url;
        setPreview({ url, loading: false, error: '' });
      } catch (failure) {
        if (id !== request.current) return;
        setPreview((current) => ({ ...current, loading: false, error: errorMessage(failure) }));
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, logo, ready]);

  useEffect(
    () => () => {
      if (shown.current) URL.revokeObjectURL(shown.current);
    },
    []
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LOGO) {
      toast(t('Das Logo darf höchstens 4 MB groß sein.'), { variant: 'error' });
      return;
    }
    try {
      setLogo(await readDataUrl(file));
      set('kind', 'image');
    } catch {
      toast(t('Das Logo ließ sich nicht lesen.'), { variant: 'error' });
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const { watermark } = await saveWatermark(payload());
      const next = strip(watermark);
      setSaved(next);
      setDraft(next);
      setLogo(undefined);
      toast(next.enabled ? t('Wasserzeichen gespeichert. Es gilt ab dem nächsten Upload.') : t('Gespeichert'), { variant: 'success' });
    } catch (failure) {
      toast(failure instanceof ApiError ? failure.message : t('Das hat nicht geklappt.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const ok = await confirm({
      title: t('Wasserzeichen zurücksetzen?'),
      message: t('Text, Logo und alle Einstellungen werden gelöscht. Schon hochgeladene Bilder bleiben, wie sie sind.'),
      confirmLabel: t('Zurücksetzen'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { watermark } = await resetWatermark();
      const next = strip(watermark);
      setSaved(next);
      setDraft(next);
      setLogo(undefined);
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 1fr)' },
        gap: 3,
        alignItems: 'start',
        maxWidth: 1240,
      }}
    >
      <Stack spacing={3}>
        <SettingsSection
          id="wasserzeichen"
          title={t('Wasserzeichen')}
          description={t(
            'Schreibt deinen Namen oder dein Logo in Bilder, die du hochlädst. Gilt für JPEG, PNG, WebP, AVIF und TIFF. GIFs und Videos bleiben, wie sie sind.'
          )}
        >
          <SettingRow
            icon={<BrandingWatermarkOutlined />}
            label={t('Auf neue Bilder setzen')}
            description={t('Einzelne Uploads kannst du in den Upload-Optionen davon ausnehmen.')}
            htmlFor="watermark-enabled"
          >
            <Switch id="watermark-enabled" checked={draft.enabled} onChange={(event) => set('enabled', event.target.checked)} />
          </SettingRow>
          <SettingRow label={t('Inhalt')} stacked>
            <Box sx={{ display: 'grid', gap: 2 }}>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={draft.kind}
                onChange={(_event, value: Draft['kind'] | null) => value && set('kind', value)}
                aria-label={t('Inhalt')}
                sx={{ alignSelf: 'flex-start' }}
              >
                <ToggleButton value="text" sx={{ gap: 1, px: 2 }}>
                  <TextFieldsRounded fontSize="small" />
                  {t('Text')}
                </ToggleButton>
                <ToggleButton value="image" sx={{ gap: 1, px: 2 }}>
                  <ImageOutlined fontSize="small" />
                  {t('Logo')}
                </ToggleButton>
              </ToggleButtonGroup>
              {draft.kind === 'text' ? (
                <TextField
                  size="small"
                  label={t('Text')}
                  placeholder={t('zum Beispiel @deinname')}
                  value={draft.text}
                  onChange={(event) => set('text', event.target.value.slice(0, 80))}
                  helperText={t('{count} von 80 Zeichen', { count: draft.text.length })}
                  sx={{ maxWidth: 420 }}
                />
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <Box
                    sx={{
                      width: 96,
                      height: 64,
                      borderRadius: `${radius.sm}px`,
                      display: 'grid',
                      placeItems: 'center',
                      overflow: 'hidden',
                      backgroundColor: c.surfaceContainerHighest,
                      backgroundImage: `conic-gradient(${c.surfaceContainerHigh} 25%, transparent 0 50%, ${c.surfaceContainerHigh} 0 75%, transparent 0)`,
                      backgroundSize: '12px 12px',
                    }}
                  >
                    {image ? (
                      <Box
                        component="img"
                        src={image}
                        alt={t('Dein Logo')}
                        sx={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                      />
                    ) : (
                      <ImageOutlined sx={{ color: c.onSurfaceVariant }} />
                    )}
                  </Box>
                  <Button variant="tonal" startIcon={<UploadRounded />} onClick={() => picker.current?.click()}>
                    {image ? t('Anderes Logo') : t('Logo hochladen')}
                  </Button>
                  {image && (
                    <Tooltip title={t('Logo entfernen')}>
                      <IconButton aria-label={t('Logo entfernen')} onClick={() => setLogo(null)}>
                        <DeleteOutlineRounded />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Typography variant="caption" sx={{ color: 'text.secondary', flexBasis: '100%' }}>
                    {t('PNG mit transparentem Hintergrund oder SVG wirken am besten. Höchstens 4 MB.')}
                  </Typography>
                  <input
                    ref={picker}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    hidden
                    onChange={(event) => {
                      pickLogo(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </Box>
              )}
            </Box>
          </SettingRow>
          <SettingRow label={t('Position')} stacked>
            <PositionGrid value={draft.position} onChange={(value) => set('position', value)} />
          </SettingRow>
          <SettingRow label={t('Größe und Deckkraft')} stacked>
            <Box sx={{ display: 'grid', gap: 1, maxWidth: 460 }}>
              <Typography variant="body2" id="watermark-size">
                {t('Größe: {value} % der Bildbreite', { value: draft.size })}
              </Typography>
              <Slider
                aria-labelledby="watermark-size"
                min={2}
                max={60}
                value={draft.size}
                onChange={(_event, value) => set('size', value as number)}
              />
              <Typography variant="body2" id="watermark-opacity">
                {t('Deckkraft: {value} %', { value: draft.opacity })}
              </Typography>
              <Slider
                aria-labelledby="watermark-opacity"
                min={10}
                max={100}
                value={draft.opacity}
                onChange={(_event, value) => set('opacity', value as number)}
              />
            </Box>
          </SettingRow>
          {draft.kind === 'text' && (
            <SettingRow label={t('Farbe')} stacked>
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  {SWATCHES.map((color) => (
                    <ButtonBase
                      key={color}
                      aria-label={color}
                      aria-pressed={draft.color === color}
                      onClick={() => set('color', color)}
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        bgcolor: color,
                        boxShadow: `inset 0 0 0 1px ${c.outlineVariant}`,
                        outline: draft.color === color ? `3px solid ${c.primary}` : 'none',
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                  <Box
                    component="label"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, ml: 1, cursor: 'pointer', color: 'text.secondary' }}
                  >
                    <Box
                      component="input"
                      type="color"
                      value={draft.color}
                      onChange={(event) => set('color', event.target.value.toLowerCase())}
                      sx={{ width: 36, height: 32, p: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer' }}
                    />
                    <Typography variant="body2">{t('Eigene Farbe')}</Typography>
                  </Box>
                </Box>
                <FormControlLabel
                  control={<Switch checked={draft.shadow} onChange={(event) => set('shadow', event.target.checked)} />}
                  label={t('Schatten, damit der Text auf hellen und dunklen Bildern lesbar bleibt')}
                />
              </Box>
            </SettingRow>
          )}
          <SettingRow
            icon={<HistoryRounded />}
            label={t('Original aufheben')}
            description={t('Das Bild ohne Wasserzeichen bleibt als ältere Fassung erhalten. Nur du kommst daran.')}
            htmlFor="watermark-original"
          >
            <Switch id="watermark-original" checked={draft.keepOriginal} onChange={(event) => set('keepOriginal', event.target.checked)} />
          </SettingRow>
        </SettingsSection>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button onClick={reset} disabled={busy} color="inherit">
            {t('Zurücksetzen')}
          </Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={busy || !dirty || (draft.enabled && !ready)}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {t('Speichern')}
          </Button>
        </Box>
      </Stack>

      <Box sx={{ position: { lg: 'sticky' }, top: { lg: 96 } }}>
        <Typography variant="h6" component="h2" sx={{ mb: 1.5, px: 1 }}>
          {t('Vorschau')}
        </Typography>
        <Box
          sx={{
            position: 'relative',
            borderRadius: `${radius.lg}px`,
            overflow: 'hidden',
            bgcolor: c.surfaceContainerLow,
            minHeight: 240,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {preview.url && ready ? (
            <Box
              component="img"
              src={preview.url}
              alt={t('Vorschau des Wasserzeichens')}
              sx={{ width: '100%', display: 'block', opacity: preview.loading ? 0.6 : 1, transition: 'opacity 200ms' }}
            />
          ) : (
            <Typography variant="body2" sx={{ color: 'text.secondary', p: 4, textAlign: 'center', maxWidth: 360 }}>
              {preview.error ||
                (draft.kind === 'image'
                  ? t('Lade ein Logo hoch, um die Vorschau zu sehen.')
                  : t('Gib einen Text ein, um die Vorschau zu sehen.'))}
            </Typography>
          )}
          {preview.loading && (
            <CircularProgress size={28} sx={{ position: 'absolute', top: 16, right: 16 }} aria-label={t('Vorschau wird erstellt')} />
          )}
        </Box>
        {preview.error && preview.url && (
          <Typography variant="body2" sx={{ color: c.error, mt: 1, px: 1 }}>
            {preview.error}
          </Typography>
        )}
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1, px: 1 }}>
          {t('Die Vorschau nutzt eines deiner letzten Bilder oder ein Beispielbild.')}
        </Typography>
      </Box>
    </Box>
  );
}
