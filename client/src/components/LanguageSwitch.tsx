import { useState, type MouseEvent } from 'react';
import ButtonBase from '@mui/material/ButtonBase';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import TranslateRounded from '@mui/icons-material/TranslateRounded';
import { language, switchLanguage, t, type Language } from '../lib/i18n';

const NAMES: Record<Language, string> = { de: 'Deutsch', en: 'English' };

export function LanguageSelector() {
  const [pending, setPending] = useState<Language | null>(null);
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      fullWidth
      value={pending || language}
      aria-label={t('Sprache')}
      onChange={(_event, value: Language | null) => {
        if (!value || value === language) return;
        setPending(value);
        switchLanguage(value);
      }}
    >
      {(Object.keys(NAMES) as Language[]).map((code) => (
        <ToggleButton key={code} value={code} lang={code}>
          {NAMES[code]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export function LanguageLink({ inert }: { inert?: (event: MouseEvent) => void }) {
  const other: Language = language === 'de' ? 'en' : 'de';
  return (
    <ButtonBase
      lang={other}
      onClick={(event) => {
        if (inert) {
          inert(event);
          return;
        }
        switchLanguage(other);
      }}
      sx={{
        gap: 0.5,
        font: 'inherit',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: 'inherit',
        borderRadius: 1,
        px: 0.5,
        '& svg': { fontSize: 14 },
        '&:hover': { textDecoration: 'underline' },
        '&.Mui-focusVisible': { outline: '2px solid currentColor', outlineOffset: 2 },
      }}
    >
      <TranslateRounded aria-hidden />
      {NAMES[other]}
    </ButtonBase>
  );
}
