import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import type { SiteLink } from '../lib/types';
import { fonts } from '../theme/tokens';

export function LinkListEditor({
  links,
  onChange,
  error,
  max,
}: {
  links: SiteLink[];
  onChange: (links: SiteLink[]) => void;
  error?: string;
  max: number;
}) {
  const update = (index: number, patch: Partial<SiteLink>) =>
    onChange(links.map((link, position) => (position === index ? { ...link, ...patch } : link)));

  return (
    <Stack spacing={1.5}>
      {links.map((link, index) => (
        <Box
          key={index}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr auto', sm: 'minmax(0, 0.8fr) minmax(0, 1.2fr) auto' },
            gap: 1,
            alignItems: 'start',
          }}
        >
          <TextField
            size="small"
            label="Beschriftung"
            value={link.label}
            onChange={(event) => update(index, { label: event.target.value })}
            slotProps={{ htmlInput: { maxLength: 40 } }}
          />
          <TextField
            size="small"
            label="Adresse"
            value={link.url}
            onChange={(event) => update(index, { url: event.target.value })}
            placeholder="https://"
            sx={{ gridColumn: { xs: '1 / 2', sm: 'auto' }, gridRow: { xs: 2, sm: 'auto' } }}
            slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: fonts.mono } } }}
          />
          <Tooltip title="Link entfernen">
            <IconButton
              aria-label={`${link.label || 'Link'} entfernen`}
              onClick={() => onChange(links.filter((_link, position) => position !== index))}
            >
              <DeleteOutlineRounded />
            </IconButton>
          </Tooltip>
        </Box>
      ))}
      {error && (
        <Typography variant="body2" sx={{ color: 'error.main' }}>
          {error}
        </Typography>
      )}
      <Box>
        <Button startIcon={<AddRounded />} disabled={links.length >= max} onClick={() => onChange([...links, { label: '', url: '' }])}>
          Link hinzufügen
        </Button>
      </Box>
    </Stack>
  );
}
