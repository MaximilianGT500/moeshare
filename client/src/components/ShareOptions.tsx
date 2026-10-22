import { useState, type ReactNode } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import type { ExpiryChoice, TagCount, UrlStyle } from '../lib/types';
import { t } from '../lib/i18n';
import { formatNumber, relativeMs } from '../lib/format';
import { PasswordField } from './PasswordField';
import { c, fonts, radius } from '../theme/tokens';

export const EXPIRY_CHOICES: ExpiryChoice[] = ['never', '10m', '1h', '6h', '1d', '3d', '7d', '30d', '90d', '365d'];

const EXPIRY_MINUTES: Record<ExpiryChoice, number> = {
  never: Infinity,
  '10m': 10,
  '1h': 60,
  '6h': 360,
  '1d': 1440,
  '3d': 4320,
  '7d': 10080,
  '30d': 43200,
  '90d': 129600,
  '365d': 525600,
};

const EXPIRY_LABELS: Record<ExpiryChoice, string> = {
  never: t('Nie'),
  '10m': t('10 Minuten'),
  '1h': t('1 Stunde'),
  '6h': t('6 Stunden'),
  '1d': t('1 Tag'),
  '3d': t('3 Tage'),
  '7d': t('7 Tage'),
  '30d': t('30 Tage'),
  '90d': t('90 Tage'),
  '365d': t('1 Jahr'),
};

export const expiryLabel = (choice: ExpiryChoice) => EXPIRY_LABELS[choice] || choice;

export const expiryChoicesUpTo = (max: ExpiryChoice) => EXPIRY_CHOICES.filter((choice) => EXPIRY_MINUTES[choice] <= EXPIRY_MINUTES[max]);

export const URL_STYLES: UrlStyle[] = ['uuid', 'random', 'words', 'emoji', 'invisible', 'original'];

const STYLE_INFO: Record<UrlStyle, { label: string; example: string }> = {
  uuid: { label: t('Lange Kennung'), example: '3f2c9a1e-…-b7d4.png' },
  random: { label: t('Kurz und zufällig'), example: 'kr4D7Tc9' },
  words: { label: t('Drei Wörter'), example: 'kaktus-wolke-laterne' },
  emoji: { label: t('Emojis'), example: '🐙🌵🎈🦊' },
  invisible: { label: t('Unsichtbar'), example: '…/view/␣␣␣' },
  original: { label: t('Originaler Dateiname'), example: 'urlaub-am-meer.jpg' },
};

export const urlStyleLabel = (style: UrlStyle) => STYLE_INFO[style]?.label || style;
export const urlStyleExample = (style: UrlStyle) => STYLE_INFO[style]?.example || '';

const defaultShown = (includeDefault?: string) =>
  includeDefault !== undefined ? { select: { displayEmpty: true }, inputLabel: { shrink: true } } : {};

export function ExpirySelect({
  value,
  onChange,
  max = 'never',
  label = t('Löschen nach'),
  includeDefault,
  disabled,
}: {
  value: ExpiryChoice | '';
  onChange: (value: ExpiryChoice | '') => void;
  max?: ExpiryChoice;
  label?: string;
  includeDefault?: string;
  disabled?: boolean;
}) {
  return (
    <TextField
      select
      fullWidth
      size="small"
      label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ExpiryChoice | '')}
      slotProps={{
        ...defaultShown(includeDefault),
        input: { startAdornment: <TimerOutlined sx={{ mr: 1, color: 'text.secondary' }} fontSize="small" /> },
      }}
    >
      {includeDefault !== undefined && <MenuItem value="">{includeDefault}</MenuItem>}
      {expiryChoicesUpTo(max).map((choice) => (
        <MenuItem key={choice} value={choice}>
          {expiryLabel(choice)}
        </MenuItem>
      ))}
    </TextField>
  );
}

export function UrlStyleSelect({
  value,
  onChange,
  styles = URL_STYLES,
  includeDefault,
  label = t('Adressstil'),
}: {
  value: UrlStyle | '';
  onChange: (value: UrlStyle | '') => void;
  styles?: UrlStyle[];
  includeDefault?: string;
  label?: string;
}) {
  return (
    <TextField
      select
      fullWidth
      size="small"
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as UrlStyle | '')}
      slotProps={defaultShown(includeDefault)}
    >
      {includeDefault !== undefined && <MenuItem value="">{includeDefault}</MenuItem>}
      {styles.map((style) => (
        <MenuItem key={style} value={style}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, width: '100%', minWidth: 0 }}>
            <span>{urlStyleLabel(style)}</span>
            <Box component="span" sx={{ ml: 'auto', color: 'text.secondary', fontFamily: fonts.mono, fontSize: '0.8125rem' }}>
              {urlStyleExample(style)}
            </Box>
          </Box>
        </MenuItem>
      ))}
    </TextField>
  );
}

export function DomainSelect({
  value,
  onChange,
  domains,
  includeDefault,
}: {
  value: string;
  onChange: (value: string) => void;
  domains: string[];
  includeDefault?: string;
}) {
  if (domains.length < 2) return null;
  return (
    <TextField
      select
      fullWidth
      size="small"
      label={t('Domain')}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={defaultShown(includeDefault)}
    >
      {includeDefault !== undefined && <MenuItem value="">{includeDefault}</MenuItem>}
      <MenuItem value="base">{t('Hauptadresse ({host})', { host: new URL(domains[0]).host })}</MenuItem>
      <MenuItem value="random">{t('Zufällig wechseln')}</MenuItem>
      {domains.slice(1).map((domain) => (
        <MenuItem key={domain} value={domain}>
          {new URL(domain).host}
        </MenuItem>
      ))}
    </TextField>
  );
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  label = t('Tags'),
  placeholder = t('urlaub, arbeit …'),
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: TagCount[];
  label?: string;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const normalize = (raw: string) =>
    raw
      .trim()
      .toLowerCase()
      .replace(/^#+/, '')
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}_-]/gu, '')
      .slice(0, 32);
  const commit = (raw: string) => {
    const next = [...value];
    for (const part of raw.split(/[,\s]+/)) {
      const tag = normalize(part);
      if (tag && !next.includes(tag) && next.length < 10) next.push(tag);
    }
    onChange(next);
    setInput('');
  };
  return (
    <Autocomplete
      multiple
      freeSolo
      size="small"
      options={suggestions.map((entry) => entry.tag).filter((tag) => !value.includes(tag))}
      value={value}
      inputValue={input}
      onInputChange={(_event, next, reason) => {
        if (reason === 'reset') return;
        if (/[,\s]$/.test(next)) commit(next);
        else setInput(next);
      }}
      onChange={(_event, next) => onChange([...new Set(next.map((tag) => normalize(String(tag))).filter(Boolean))].slice(0, 10))}
      onBlur={() => input && commit(input)}
      renderValue={(tags, getItemProps) =>
        tags.map((tag, index) => {
          const { key, ...rest } = getItemProps({ index });
          return <Chip key={key} label={`#${tag}`} size="small" {...rest} />;
        })
      }
      renderOption={(props, option) => {
        const { key, ...rest } = props as typeof props & { key: string };
        const count = suggestions.find((entry) => entry.tag === option)?.files;
        return (
          <li key={key} {...rest}>
            <Box sx={{ display: 'flex', width: '100%', gap: 1 }}>
              <span>#{option}</span>
              {count ? (
                <Box component="span" sx={{ ml: 'auto', color: 'text.secondary', fontSize: '0.8125rem' }}>
                  {formatNumber(count)}
                </Box>
              ) : null}
            </Box>
          </li>
        );
      }}
      renderInput={(params) => <TextField {...params} label={label} placeholder={value.length ? '' : placeholder} />}
    />
  );
}

export interface ProtectionValue {
  passwordEnabled: boolean;
  password: string;
  once: boolean;
}

export function ProtectionFields({
  value,
  onChange,
  hasPassword = false,
  onceLabel = t('Nur einmal abrufbar'),
  onceHelp = t('Nach dem ersten Öffnen ist die Datei für alle anderen weg.'),
}: {
  value: ProtectionValue;
  onChange: (value: ProtectionValue) => void;
  hasPassword?: boolean;
  onceLabel?: string;
  onceHelp?: string;
}) {
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <FormControlLabel
        control={
          <Switch checked={value.passwordEnabled} onChange={(event) => onChange({ ...value, passwordEnabled: event.target.checked })} />
        }
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LockOutlined fontSize="small" sx={{ color: 'text.secondary' }} />
            {t('Mit Passwort schützen')}
          </Box>
        }
      />
      {value.passwordEnabled && (
        <PasswordField
          label={hasPassword ? t('Neues Passwort (leer lassen = unverändert)') : t('Passwort')}
          value={value.password}
          onChange={(password) => onChange({ ...value, password })}
          autoComplete="new-password"
        />
      )}
      <FormControlLabel
        control={<Switch checked={value.once} onChange={(event) => onChange({ ...value, once: event.target.checked })} />}
        label={
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <VisibilityOutlined fontSize="small" sx={{ color: 'text.secondary' }} />
              {onceLabel}
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {onceHelp}
            </Typography>
          </Box>
        }
        sx={{ alignItems: 'flex-start', '& .MuiSwitch-root': { mt: -0.5 } }}
      />
    </Box>
  );
}

export function ProtectionBadges({
  expiresAt,
  password,
  maxViews,
  compact = false,
}: {
  expiresAt: number | null;
  password: boolean;
  maxViews: number | null;
  compact?: boolean;
}) {
  const items: Array<{ key: string; icon: ReactNode; label: string }> = [];
  if (password) items.push({ key: 'password', icon: <LockOutlined sx={{ fontSize: 14 }} />, label: t('Passwort') });
  if (maxViews) {
    items.push({
      key: 'once',
      icon: <VisibilityOutlined sx={{ fontSize: 14 }} />,
      label: maxViews === 1 ? t('Einmal') : t('{count} Aufrufe', { count: maxViews }),
    });
  }
  if (expiresAt) items.push({ key: 'expires', icon: <TimerOutlined sx={{ fontSize: 14 }} />, label: relativeMs(expiresAt) });
  if (!items.length) return null;
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {items.map((item) => (
        <Box
          key={item.key}
          title={item.label}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            height: 22,
            px: compact ? 0.75 : 1,
            borderRadius: `${radius.full}px`,
            bgcolor: c.secondaryContainer,
            color: c.onSecondaryContainer,
            fontSize: '0.75rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {item.icon}
          {!compact && item.label}
        </Box>
      ))}
    </Box>
  );
}
