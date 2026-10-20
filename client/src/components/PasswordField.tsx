import { useId, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import { passwordStrength } from '../lib/password';
import { c, css, radius } from '../theme/tokens';

const STRENGTH_COLORS = [c.outlineVariant, c.error, c.warning, c.success, c.success];

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  autoFocus?: boolean;
  error?: boolean;
  helperText?: string;
  name?: string;
  strength?: { minLength: number; username?: string };
  disabled?: boolean;
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  error,
  helperText,
  name,
  strength,
  disabled,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const meterId = useId();
  const result = useMemo(
    () => (strength && value ? passwordStrength(value, strength.minLength, strength.username) : null),
    [strength, value]
  );

  return (
    <Box>
      <TextField
        label={label}
        name={name}
        fullWidth
        autoFocus={autoFocus}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        value={value}
        error={error}
        helperText={helperText}
        onChange={(event) => onChange(event.target.value)}
        slotProps={{
          htmlInput: {
            autoComplete,
            spellCheck: false,
            autoCapitalize: 'off',
            'aria-describedby': result ? meterId : undefined,
          },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip title={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}>
                  <IconButton
                    aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
                    onClick={() => setVisible((v) => !v)}
                    edge="end"
                    size="small"
                  >
                    {visible ? <VisibilityOffRounded fontSize="small" /> : <VisibilityRounded fontSize="small" />}
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ),
          },
        }}
      />
      {strength && (
        <Box id={meterId} aria-live="polite" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, px: 2, minHeight: 20 }}>
          <Box sx={{ display: 'flex', gap: '3px', flex: 1 }} aria-hidden>
            {[1, 2, 3, 4].map((step) => (
              <Box
                key={step}
                sx={{
                  flex: 1,
                  height: 4,
                  borderRadius: `${radius.full}px`,
                  bgcolor: result && result.score >= step ? STRENGTH_COLORS[result.score] : c.surfaceContainerHighest,
                  transition: `background-color 240ms ${css.standard}`,
                }}
              />
            ))}
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 72, textAlign: 'right' }}>
            {result ? result.label : `mind. ${strength.minLength} Zeichen`}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
