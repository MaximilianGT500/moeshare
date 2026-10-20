import { useState } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import SortRounded from '@mui/icons-material/SortRounded';
import AddLinkRounded from '@mui/icons-material/AddLinkRounded';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import type { SortKey, TypeFilter } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { mix } from '../../lib/color';
import { c, css, fileTypeColor, radius } from '../../theme/tokens';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Neueste zuerst' },
  { key: 'oldest', label: 'Älteste zuerst' },
  { key: 'views', label: 'Meiste Aufrufe' },
  { key: 'size', label: 'Größte zuerst' },
  { key: 'name', label: 'Name (A–Z)' },
];

export interface TypeCounts {
  all: number;
  image: number;
  video: number;
  audio: number;
  file: number;
}

const CHIPS: { key: TypeFilter; label: string; countKey: keyof TypeCounts; color?: string }[] = [
  { key: '', label: 'Alle', countKey: 'all' },
  { key: 'image', label: 'Bilder', countKey: 'image', color: fileTypeColor.image },
  { key: 'video', label: 'Videos', countKey: 'video', color: fileTypeColor.video },
  { key: 'audio', label: 'Audio', countKey: 'audio', color: fileTypeColor.audio },
  { key: 'file', label: 'Dateien', countKey: 'file', color: fileTypeColor.other },
];

function FilterChip({
  label,
  count,
  color,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  color?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <m.div layout="position" transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
      <ButtonBase
        onClick={onClick}
        aria-pressed={selected}
        sx={{
          height: 32,
          pl: selected ? 1 : 1.5,
          pr: 1.5,
          gap: 0.75,
          borderRadius: `${radius.sm}px`,
          border: `1px solid ${selected ? 'transparent' : c.outlineVariant}`,
          bgcolor: selected ? c.secondaryContainer : 'transparent',
          color: selected ? c.onSecondaryContainer : c.onSurfaceVariant,
          fontSize: '0.875rem',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          transition: `background-color 200ms ${css.standard}, border-color 200ms ${css.standard}, padding 200ms ${css.standard}`,
          '&:hover': {
            bgcolor: selected ? `color-mix(in srgb, ${c.onSecondaryContainer} 8%, ${c.secondaryContainer})` : mix(c.onSurface, 8),
          },
        }}
      >
        {selected ? (
          <m.span initial={{ scale: 0, width: 0 }} animate={{ scale: 1, width: 18 }} style={{ display: 'inline-flex' }}>
            <CheckRounded sx={{ fontSize: 18 }} />
          </m.span>
        ) : (
          color && <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
        )}
        <span>{label}</span>
        <Box component="span" sx={{ opacity: 0.72, fontWeight: 700 }}>
          {formatNumber(count)}
        </Box>
      </ButtonBase>
    </m.div>
  );
}

export function FilterBar({
  type,
  onType,
  sort,
  onSort,
  counts,
  onUrl,
  selecting,
  onSelectMode,
}: {
  type: TypeFilter;
  onType: (type: TypeFilter) => void;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  counts: TypeCounts;
  onUrl?: () => void;
  selecting: boolean;
  onSelectMode: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const sortLabel = SORT_OPTIONS.find((option) => option.key === sort)?.label ?? '';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' }, columnGap: 1, rowGap: 0.5, mb: 2 }}>
      <Box
        role="group"
        aria-label="Nach Typ filtern"
        sx={{
          display: 'flex',
          gap: 1,
          flex: { xs: '1 0 100%', sm: 1 },
          minWidth: 0,
          overflowX: 'auto',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          py: 0.5,
          mx: { xs: -1.5, sm: 0 },
          px: { xs: 1.5, sm: 0 },
        }}
      >
        {CHIPS.filter((chip) => chip.key === '' || counts[chip.countKey] > 0 || chip.key === type).map((chip) => (
          <FilterChip
            key={chip.key || 'all'}
            label={chip.label}
            count={counts[chip.countKey]}
            color={chip.color}
            selected={type === chip.key}
            onClick={() => onType(chip.key)}
          />
        ))}
      </Box>

      <Button
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-haspopup="menu"
        endIcon={<ExpandMoreRounded />}
        startIcon={<SortRounded />}
        sx={{ color: c.onSurfaceVariant, flexShrink: 0, mr: { xs: 'auto', sm: 0 }, ml: { xs: -1, sm: 0 } }}
      >
        {sortLabel}
      </Button>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {SORT_OPTIONS.map((option) => (
          <MenuItem
            key={option.key}
            selected={option.key === sort}
            onClick={() => {
              onSort(option.key);
              setAnchor(null);
            }}
          >
            <ListItemIcon sx={{ width: 20 }}>{option.key === sort && <CheckRounded />}</ListItemIcon>
            {option.label}
          </MenuItem>
        ))}
      </Menu>

      {onUrl && (
        <Tooltip title="Von URL hochladen">
          <IconButton aria-label="Von URL hochladen" onClick={onUrl}>
            <AddLinkRounded />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title={selecting ? 'Auswahl beenden' : 'Mehrere auswählen'}>
        <IconButton
          aria-label={selecting ? 'Auswahl beenden' : 'Mehrere auswählen'}
          aria-pressed={selecting}
          onClick={onSelectMode}
          sx={
            selecting
              ? { bgcolor: c.secondaryContainer, color: c.onSecondaryContainer, '&:hover': { bgcolor: c.secondaryContainer } }
              : undefined
          }
        >
          <ChecklistRounded />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
