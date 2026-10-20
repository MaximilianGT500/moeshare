import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { c, fonts, radius } from '../theme/tokens';

const UNITS = [
  { key: 'MB', factor: 1024 ** 2 },
  { key: 'GB', factor: 1024 ** 3 },
  { key: 'TB', factor: 1024 ** 4 },
] as const;

type Unit = (typeof UNITS)[number]['key'];

function split(bytes: number | null): { amount: string; unit: Unit } {
  if (!bytes) return { amount: '', unit: 'GB' };
  const unit =
    [...UNITS].reverse().find((u) => bytes >= u.factor && Number.isInteger(Math.round((bytes / u.factor) * 100) / 100)) ?? UNITS[0];
  const amount = Math.round((bytes / unit.factor) * 100) / 100;
  return { amount: String(amount).replace('.', ','), unit: unit.key };
}

export function BytesField({
  label,
  value,
  onChange,
  nullLabel = 'Unbegrenzt',
  error,
  helperText,
  disabled,
}: {
  label: string;
  value: number | null;
  onChange: (bytes: number | null) => void;
  nullLabel?: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const initial = split(value);
  const [amount, setAmount] = useState(initial.amount);
  const [unit, setUnit] = useState<Unit>(initial.unit);
  const last = useRef(value);

  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    const next = split(value);
    setAmount(next.amount);
    setUnit(next.unit);
  }, [value]);

  const emit = (nextAmount: string, nextUnit: Unit) => {
    const number = parseFloat(nextAmount.replace(',', '.'));
    const factor = UNITS.find((u) => u.key === nextUnit)!.factor;
    const bytes = Number.isFinite(number) && number > 0 ? Math.round(number * factor) : null;
    last.current = bytes;
    onChange(bytes);
  };

  const unlimited = value === null && amount === '';

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
      <Box sx={{ display: 'flex', gap: 1, minWidth: 0 }}>
        <TextField
          id={id}
          label={label}
          value={amount}
          disabled={disabled || unlimited}
          error={error}
          helperText={helperText}
          size="small"
          onChange={(event) => {
            const text = event.target.value.replace(/[^\d.,]/g, '').slice(0, 10);
            setAmount(text);
            emit(text, unit);
          }}
          slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': label } }}
          sx={{ width: 120 }}
        />
        <TextField
          select
          size="small"
          value={unit}
          disabled={disabled || unlimited}
          onChange={(event) => {
            const next = event.target.value as Unit;
            setUnit(next);
            emit(amount, next);
          }}
          slotProps={{ htmlInput: { 'aria-label': `${label}: Einheit` } }}
          sx={{ width: 88 }}
        >
          {UNITS.map((u) => (
            <MenuItem key={u.key} value={u.key}>
              {u.key}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <FormControlLabel
        sx={{ m: 0, mt: 0.5, gap: 0.5 }}
        disabled={disabled}
        control={
          <Switch
            size="small"
            checked={unlimited}
            onChange={(event) => {
              if (event.target.checked) {
                setAmount('');
                last.current = null;
                onChange(null);
              } else {
                const fallback = '10';
                setAmount(fallback);
                emit(fallback, unit);
              }
            }}
          />
        }
        label={nullLabel}
      />
    </Box>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorField({
  label,
  value,
  onChange,
  disabled,
  error,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
}) {
  const [text, setText] = useState(value);
  const picker = useRef<HTMLInputElement | null>(null);
  useEffect(() => setText(value), [value]);
  const valid = HEX.test(text);

  return (
    <TextField
      label={label}
      size="small"
      value={text}
      disabled={disabled}
      error={error || (!valid && text.length > 0)}
      helperText={!valid && text.length > 0 ? 'Format: #8b5cf6' : helperText}
      onChange={(event) => {
        let next = event.target.value.trim();
        if (next && !next.startsWith('#')) next = `#${next}`;
        next = next.slice(0, 7);
        setText(next);
        if (HEX.test(next)) onChange(next.toLowerCase());
      }}
      sx={{ width: 170 }}
      slotProps={{
        htmlInput: { spellCheck: false, style: { fontFamily: fonts.mono } },
        input: {
          startAdornment: (
            <InputAdornment position="start" sx={{ mr: 1 }}>
              <ButtonBase
                aria-label={`${label}: Farbe auswählen`}
                disabled={disabled}
                onClick={() => picker.current?.click()}
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: `${radius.xs + 2}px`,
                  bgcolor: valid ? text : value,
                  boxShadow: `inset 0 0 0 1px ${c.outlineVariant}`,
                  position: 'relative',
                }}
              >
                <Box
                  component="input"
                  ref={picker}
                  type="color"
                  value={valid ? text : value}
                  tabIndex={-1}
                  aria-hidden
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setText(event.target.value);
                    onChange(event.target.value.toLowerCase());
                  }}
                  sx={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', p: 0, border: 0, cursor: 'pointer' }}
                />
              </ButtonBase>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
