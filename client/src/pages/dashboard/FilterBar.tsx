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
import TuneRounded from '@mui/icons-material/TuneRounded';
import NoteAddOutlined from '@mui/icons-material/NoteAddOutlined';
import SellOutlined from '@mui/icons-material/SellOutlined';
import CloseRounded from '@mui/icons-material/CloseRounded';
import Badge from '@mui/material/Badge';
import Chip from '@mui/material/Chip';
import type { SortKey, TypeFilter } from '../../lib/api';
import type { TagCount } from '../../lib/types';
import { formatNumber } from '../../lib/format';
import { t } from '../../lib/i18n';
import { mix } from '../../lib/color';
import { c, css, fileTypeColor, radius } from '../../theme/tokens';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: t('Neueste zuerst') },
  { key: 'oldest', label: t('Älteste zuerst') },
  { key: 'views', label: t('Meiste Aufrufe') },
  { key: 'size', label: t('Größte zuerst') },
  { key: 'name', label: t('Name (A–Z)') },
  { key: 'expiring', label: t('Läuft bald ab') },
];

export interface TypeCounts {
  all: number;
  image: number;
  video: number;
  audio: number;
  text: number;
  file: number;
}

const CHIPS: { key: TypeFilter; label: string; countKey: keyof TypeCounts; color?: string }[] = [
  { key: '', label: t('Alle'), countKey: 'all' },
  { key: 'image', label: t('Bilder'), countKey: 'image', color: fileTypeColor.image },
  { key: 'video', label: t('Videos'), countKey: 'video', color: fileTypeColor.video },
  { key: 'audio', label: t('Audio'), countKey: 'audio', color: fileTypeColor.audio },
  { key: 'text', label: t('Texte'), countKey: 'text', color: fileTypeColor.text },
  { key: 'file', label: t('Dateien'), countKey: 'file', color: fileTypeColor.other },
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
  onText,
  onOptions,
  optionsActive = false,
  tags = [],
  tag = '',
  onTag,
  selecting,
  onSelectMode,
}: {
  type: TypeFilter;
  onType: (type: TypeFilter) => void;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  counts: TypeCounts;
  onUrl?: () => void;
  onText?: () => void;
  onOptions?: () => void;
  optionsActive?: boolean;
  tags?: TagCount[];
  tag?: string;
  onTag?: (tag: string) => void;
  selecting: boolean;
  onSelectMode: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [tagAnchor, setTagAnchor] = useState<HTMLElement | null>(null);
  const sortLabel = SORT_OPTIONS.find((option) => option.key === sort)?.label ?? '';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' }, columnGap: 1, rowGap: 0.5, mb: 2 }}>
      <Box
        role="group"
        aria-label={t('Nach Typ filtern')}
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
        {tag && onTag && (
          <Chip
            label={`#${tag}`}
            onDelete={() => onTag('')}
            deleteIcon={<CloseRounded />}
            sx={{ bgcolor: c.tertiaryContainer, color: c.onTertiaryContainer, fontWeight: 600, flexShrink: 0 }}
          />
        )}
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

      {onTag && tags.length > 0 && (
        <>
          <Tooltip title={t('Nach Tag filtern')}>
            <IconButton aria-label={t('Nach Tag filtern')} aria-haspopup="menu" onClick={(event) => setTagAnchor(event.currentTarget)}>
              <SellOutlined />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={tagAnchor}
            open={!!tagAnchor}
            onClose={() => setTagAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { maxHeight: 360, minWidth: 220 } } }}
          >
            {tags.map((entry) => (
              <MenuItem
                key={entry.tag}
                selected={entry.tag === tag}
                onClick={() => {
                  onTag(entry.tag === tag ? '' : entry.tag);
                  setTagAnchor(null);
                }}
              >
                <ListItemIcon sx={{ width: 20 }}>{entry.tag === tag && <CheckRounded />}</ListItemIcon>
                <Box component="span" sx={{ flex: 1 }}>
                  #{entry.tag}
                </Box>
                <Box component="span" sx={{ color: 'text.secondary', ml: 2, fontSize: '0.8125rem' }}>
                  {formatNumber(entry.files)}
                </Box>
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
      {onText && (
        <Tooltip title={t('Neuer Text')}>
          <IconButton aria-label={t('Neuer Text')} onClick={onText}>
            <NoteAddOutlined />
          </IconButton>
        </Tooltip>
      )}
      {onUrl && (
        <Tooltip title={t('Von URL hochladen')}>
          <IconButton aria-label={t('Von URL hochladen')} onClick={onUrl}>
            <AddLinkRounded />
          </IconButton>
        </Tooltip>
      )}
      {onOptions && (
        <Tooltip title={optionsActive ? t('Upload-Optionen (aktiv)') : t('Upload-Optionen')}>
          <IconButton aria-label={t('Upload-Optionen')} onClick={onOptions} aria-pressed={optionsActive}>
            <Badge variant="dot" color="primary" invisible={!optionsActive}>
              <TuneRounded />
            </Badge>
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title={selecting ? t('Auswahl beenden') : t('Mehrere auswählen')}>
        <IconButton
          aria-label={selecting ? t('Auswahl beenden') : t('Mehrere auswählen')}
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
