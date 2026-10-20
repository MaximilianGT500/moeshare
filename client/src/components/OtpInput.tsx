import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import { c, css, fonts, radius } from '../theme/tokens';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  label?: string;
}

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  error,
  autoFocus,
  label = 'Bestätigungscode',
}: OtpInputProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);
  const completed = useRef('');

  useEffect(() => {
    if (value.length === length && completed.current !== value) {
      completed.current = value;
      onComplete?.(value);
    }
    if (value.length < length) completed.current = '';
  }, [value, length, onComplete]);

  const active = Math.min(value.length, length - 1);

  return (
    <Box
      onClick={() => ref.current?.focus()}
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: `repeat(${length}, 1fr)`,
        gap: { xs: 0.75, sm: 1 },
        cursor: 'text',
      }}
    >
      {Array.from({ length }, (_, index) => {
        const digit = value[index] || '';
        const isActive = focused && index === active && !disabled;
        return (
          <Box
            key={index}
            aria-hidden
            sx={{
              position: 'relative',
              aspectRatio: '0.86',
              maxHeight: 64,
              display: 'grid',
              placeItems: 'center',
              borderRadius: `${radius.tile}px`,
              bgcolor: c.surfaceContainerHighest,
              border: '2px solid',
              borderColor: error ? c.error : isActive ? c.primary : 'transparent',
              fontFamily: fonts.mono,
              fontSize: { xs: '1.375rem', sm: '1.625rem' },
              fontWeight: 500,
              color: c.onSurface,
              transition: `border-color 160ms ${css.standard}, background-color 160ms ${css.standard}`,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {digit ? (
              <m.span key={digit + index} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.16 }}>
                {digit}
              </m.span>
            ) : (
              isActive && (
                <Box
                  component="span"
                  sx={{
                    width: 2,
                    height: '42%',
                    bgcolor: c.primary,
                    borderRadius: 1,
                    animation: 'otp-caret 1s steps(1) infinite',
                    '@keyframes otp-caret': { '50%': { opacity: 0 } },
                  }}
                />
              )
            )}
          </Box>
        );
      })}
      <Box
        component="input"
        ref={ref}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        aria-label={label}
        aria-invalid={error || undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value.replace(/\D/g, '').slice(0, length))}
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          border: 0,
          p: 0,
          m: 0,
          fontSize: 16,
          color: 'transparent',
          caretColor: 'transparent',
          background: 'transparent',
          cursor: 'text',
        }}
      />
    </Box>
  );
}
