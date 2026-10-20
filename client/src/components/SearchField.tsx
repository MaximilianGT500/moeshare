import { forwardRef } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import SearchRounded from '@mui/icons-material/SearchRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { mix } from '../lib/color';
import { c, css, radius } from '../theme/tokens';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  busy?: boolean;
  shortcut?: string;
  dense?: boolean;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onChange, placeholder, busy = false, shortcut, dense = false },
  ref
) {
  return (
    <Box
      role="search"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        width: '100%',
        height: dense ? 44 : { xs: 48, md: 56 },
        pl: dense ? 1.5 : 2,
        pr: 0.75,
        borderRadius: `${radius.full}px`,
        bgcolor: c.surfaceContainerHigh,
        color: c.onSurfaceVariant,
        transition: `box-shadow 200ms ${css.standard}, background-color 200ms ${css.standard}`,
        '&:focus-within': { bgcolor: c.surfaceContainerHighest, boxShadow: `inset 0 0 0 2px ${mix(c.primary, 70)}` },
      }}
    >
      {busy ? <CircularProgress size={20} thickness={5} sx={{ color: c.primary, m: '2px' }} /> : <SearchRounded sx={{ fontSize: 24 }} />}
      <InputBase
        inputRef={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onChange('');
            (event.target as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        sx={{
          flex: 1,
          ml: 1,
          color: c.onSurface,
          fontSize: dense ? '0.9rem' : '1rem',
          '& input::placeholder': { color: c.onSurfaceVariant, opacity: 1 },
        }}
        slotProps={{ input: { 'aria-label': placeholder, type: 'search', enterKeyHint: 'search' } }}
      />
      {value ? (
        <IconButton aria-label="Suche leeren" onClick={() => onChange('')} size="small">
          <CloseRounded fontSize="small" />
        </IconButton>
      ) : (
        shortcut && (
          <Box
            component="kbd"
            aria-hidden
            sx={{
              display: { xs: 'none', md: 'grid' },
              placeItems: 'center',
              minWidth: 26,
              height: 26,
              mr: 0.75,
              px: 0.75,
              borderRadius: `${radius.sm}px`,
              border: `1px solid ${c.outlineVariant}`,
              fontFamily: 'inherit',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: c.onSurfaceVariant,
            }}
          >
            {shortcut}
          </Box>
        )
      )}
    </Box>
  );
});
