import { useRef, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import FormatColorFillRounded from '@mui/icons-material/FormatColorFillRounded';
import ColorizeRounded from '@mui/icons-material/ColorizeRounded';
import ShuffleRounded from '@mui/icons-material/ShuffleRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import type { EmbedColorMode, EmbedTemplate } from '../../lib/types';
import { LIMITS, PLACEHOLDERS, unknownPlaceholders } from '../../lib/embed';
import { ColorField } from '../../components/Fields';
import { c, css, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

type TextKey = 'siteName' | 'siteUrl' | 'author' | 'authorUrl' | 'title' | 'description';

interface Props {
  value: EmbedTemplate;
  onChange: (next: EmbedTemplate) => void;
  errors: Partial<Record<string, string>>;
  disabled?: boolean;
}

function ModeCard({
  selected,
  onClick,
  title,
  text,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      sx={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        textAlign: 'left',
        gap: 1.5,
        p: 2,
        borderRadius: `${radius.md}px`,
        border: '2px solid',
        borderColor: selected ? c.primary : c.outlineVariant,
        bgcolor: selected ? 'color-mix(in srgb, var(--mui-palette-m3-primary) 8%, transparent)' : 'transparent',
        transition: `border-color 180ms ${css.standard}, background-color 180ms ${css.standard}`,
        position: 'relative',
      }}
    >
      {selected && <CheckCircleRounded sx={{ position: 'absolute', top: 10, right: 10, color: c.primary, fontSize: 20 }} />}
      <Box aria-hidden sx={{ height: 64, display: 'flex', alignItems: 'center' }}>
        {children}
      </Box>
      <Box>
        <Typography variant="subtitle2">{title}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {text}
        </Typography>
      </Box>
    </ButtonBase>
  );
}

const Bar = ({ w, h = 6, o = 1 }: { w: string; h?: number; o?: number }) => (
  <Box sx={{ width: w, height: h, borderRadius: 999, bgcolor: c.onSurfaceVariant, opacity: o * 0.5 }} />
);

export function EmbedForm({ value, onChange, errors, disabled }: Props) {
  const refs = useRef<Partial<Record<TextKey, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const lastFocused = useRef<TextKey>('title');
  const set = (patch: Partial<EmbedTemplate>) => onChange({ ...value, ...patch });

  const insert = (token: string) => {
    const key = lastFocused.current;
    const el = refs.current[key];
    const text = value[key];
    const start = el && typeof el.selectionStart === 'number' ? el.selectionStart : text.length;
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : text.length;
    const next = `${text.slice(0, start)}${token}${text.slice(end)}`;
    set({ [key]: next } as Partial<EmbedTemplate>);
    requestAnimationFrame(() => {
      const input = refs.current[key];
      if (input) {
        input.focus();
        const caret = start + token.length;
        input.setSelectionRange(caret, caret);
      }
    });
  };

  const field = (key: TextKey, label: string, options: { multiline?: boolean; max?: number; placeholder?: string; url?: boolean } = {}) => {
    const unknown = options.url ? [] : unknownPlaceholders(value[key]);
    const error = errors[key];
    const count = options.max ? `${value[key].length}/${options.max}` : '';
    return (
      <TextField
        label={label}
        value={value[key]}
        disabled={disabled}
        multiline={options.multiline}
        minRows={options.multiline ? 3 : undefined}
        placeholder={options.placeholder}
        fullWidth
        error={!!error}
        helperText={error || (unknown.length ? t('Unbekannter Platzhalter: {names}', { names: unknown.join(', ') }) : count)}
        inputRef={(el: HTMLInputElement | HTMLTextAreaElement | null) => {
          refs.current[key] = el;
        }}
        onFocus={() => {
          lastFocused.current = key;
        }}
        onChange={(event) => set({ [key]: event.target.value } as Partial<EmbedTemplate>)}
        slotProps={{
          htmlInput: { maxLength: options.max ?? LIMITS.url, spellCheck: !options.url, inputMode: options.url ? 'url' : undefined },
          formHelperText: {
            sx: { textAlign: unknown.length || error ? 'left' : 'right', color: unknown.length && !error ? c.warning : undefined },
          },
        }}
      />
    );
  };

  const chooseColor = (mode: EmbedColorMode | null) => {
    if (mode) set({ color: { ...value.color, mode } });
  };

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
          {t('Darstellung')}
        </Typography>
        <Box role="radiogroup" aria-label={t('Darstellung')} sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
          <ModeCard
            selected={value.enabled}
            onClick={() => set({ enabled: true })}
            title={t('Karte mit Text')}
            text={t('Seitenname, Autor, Titel und Beschreibung über dem Medium.')}
          >
            <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
              <Box sx={{ width: 4, borderRadius: 1, bgcolor: c.primary }} />
              <Stack spacing={0.75} sx={{ flex: 1, justifyContent: 'center' }}>
                <Bar w="30%" h={4} o={0.7} />
                <Bar w="55%" />
                <Bar w="80%" h={4} o={0.7} />
                <Box sx={{ width: '70%', height: 18, borderRadius: 1, bgcolor: c.surfaceContainerHighest }} />
              </Stack>
            </Box>
          </ModeCard>
          <ModeCard
            selected={!value.enabled}
            onClick={() => set({ enabled: false })}
            title={t('Nur das Medium')}
            text={t('Discord zeigt Bild oder Video ohne Text, wie einen direkten Link.')}
          >
            <Box
              sx={{
                width: '72%',
                height: 52,
                borderRadius: 1.5,
                bgcolor: c.surfaceContainerHighest,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Bar w="40%" h={4} o={0.5} />
            </Box>
          </ModeCard>
        </Box>
      </Box>

      {value.enabled && (
        <>
          <Box>
            <Typography variant="h6" component="h2">
              {t('Inhalt')}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              {t('Leere Felder lässt Discord weg. Platzhalter füllt MoeShare beim Teilen mit den Daten der Datei.')}
            </Typography>
            <Stack spacing={2}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                {field('siteName', t('Seitenname'), { max: LIMITS.siteName })}
                {field('siteUrl', t('Link des Seitennamens'), { url: true, placeholder: 'https://' })}
                {field('author', t('Autor'), { max: LIMITS.author })}
                {field('authorUrl', t('Link des Autors'), { url: true, placeholder: 'https://' })}
              </Box>
              {field('title', t('Titel'), { max: LIMITS.title })}
              {field('description', t('Beschreibung'), { multiline: true, max: LIMITS.description })}
            </Stack>
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 1 }}>
                {t('Platzhalter einfügen (an der Cursorposition des zuletzt gewählten Felds)')}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {PLACEHOLDERS.map((placeholder) => (
                  <Chip
                    key={placeholder.token}
                    label={placeholder.label}
                    size="small"
                    variant="outlined"
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insert(placeholder.token)}
                    title={placeholder.token}
                  />
                ))}
              </Box>
            </Box>
          </Box>

          <Box>
            <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
              {t('Farbe')}
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={value.color.mode}
              onChange={(_event, mode: EmbedColorMode | null) => chooseColor(mode)}
              aria-label={t('Farbe des Rands')}
              disabled={disabled}
              sx={{ flexWrap: 'wrap' }}
            >
              <ToggleButton value="dominant">
                <ColorizeRounded fontSize="small" />
                {t('Aus der Datei')}
              </ToggleButton>
              <ToggleButton value="fixed">
                <FormatColorFillRounded fontSize="small" />
                {t('Feste Farbe')}
              </ToggleButton>
              <ToggleButton value="random">
                <ShuffleRounded fontSize="small" />
                {t('Zufällig')}
              </ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2, flexWrap: 'wrap' }}>
              {value.color.mode !== 'random' && (
                <ColorField
                  label={value.color.mode === 'dominant' ? t('Ersatzfarbe') : t('Farbe')}
                  value={value.color.value}
                  disabled={disabled}
                  onChange={(hex) => set({ color: { ...value.color, value: hex } })}
                />
              )}
              <Typography variant="body2" sx={{ color: 'text.secondary', flex: '1 1 220px' }}>
                {value.color.mode === 'dominant'
                  ? t('Der Rand nimmt die Hauptfarbe des Bildes an. Für Videos, Audio und Dateien gilt die Ersatzfarbe.')
                  : value.color.mode === 'random'
                    ? t('Jeder Aufruf bekommt eine neue, zufällige Farbe.')
                    : t('Alle Links haben dieselbe Randfarbe.')}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: `${radius.md}px`, bgcolor: c.surfaceContainerLow }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" component="label" htmlFor="embed-large">
                {t('Großes Bild')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('Bilder erscheinen in voller Breite statt als kleines Vorschaubild rechts.')}
              </Typography>
            </Box>
            <Switch
              id="embed-large"
              checked={value.largeImage}
              disabled={disabled}
              onChange={(event) => set({ largeImage: event.target.checked })}
            />
          </Box>
        </>
      )}
    </Stack>
  );
}
