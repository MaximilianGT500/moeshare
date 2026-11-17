import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import AddRounded from '@mui/icons-material/AddRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { deleteProfileIcon, errorMessage } from '../lib/api';
import type { ProfileIcon } from '../lib/types';
import { BRAND_GROUPS, BRAND_ICONS, EMOJI_CHOICES, GENERAL_ICONS, LinkIcon, autoIcon, iconTitle, loadBrandPaths } from '../lib/linkIcons';
import { t } from '../lib/i18n';
import { useConfirm } from './ConfirmDialog';
import { IconUploadDialog } from './IconUploadDialog';
import { useToast } from './Toaster';
import { c, radius } from '../theme/tokens';

type PickerTab = 'general' | 'brands' | 'emoji' | 'custom';

const EMOJI = /^(?=.*(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣))[\p{Extended_Pictographic}\p{Emoji_Component}‍️⃣]{1,16}$/u;

const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function Tile({ label, selected, onClick, children }: { label: string; selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip title={label} enterDelay={400}>
      <ButtonBase
        onClick={onClick}
        aria-label={label}
        aria-pressed={selected}
        sx={{
          flexDirection: 'column',
          gap: 0.75,
          minWidth: 0,
          py: 1.25,
          px: 0.5,
          borderRadius: `${radius.md}px`,
          color: selected ? c.onPrimaryContainer : c.onSurface,
          bgcolor: selected ? c.primaryContainer : 'transparent',
          outline: selected ? `2px solid ${c.primary}` : 'none',
          transition: 'background-color 140ms ease',
          '&:hover': { bgcolor: selected ? c.primaryContainer : c.surfaceContainerHigh },
          '&:focus-visible': { outline: `3px solid ${c.primary}`, outlineOffset: 1 },
        }}
      >
        {children}
        <Typography variant="caption" noWrap sx={{ maxWidth: '100%', px: 0.5, color: 'inherit', opacity: 0.85 }}>
          {label}
        </Typography>
      </ButtonBase>
    </Tooltip>
  );
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 0.75 };

export function LinkIconPicker({
  open,
  value,
  url,
  icons,
  customEnabled,
  maxCustom,
  maxBytes,
  onPick,
  onIconsChange,
  onClose,
}: {
  open: boolean;
  value: string | null;
  url: string;
  icons: ProfileIcon[];
  customEnabled: boolean;
  maxCustom: number;
  maxBytes: number;
  onPick: (icon: string | null) => void;
  onIconsChange: (icons: ProfileIcon[]) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const phone = useMediaQuery('(max-width:599.95px)');
  const initialTab: PickerTab = value?.startsWith('b:')
    ? 'brands'
    : value?.startsWith('e:')
      ? 'emoji'
      : value?.startsWith('c:')
        ? 'custom'
        : 'general';
  const [tab, setTab] = useState<PickerTab>(initialTab);
  const [search, setSearch] = useState('');
  const [emoji, setEmoji] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setSearch('');
    setEmoji(value?.startsWith('e:') ? value.slice(2) : '');
    void loadBrandPaths().catch(() => {});
  }, [open]);

  const query = fold(search.trim());
  const general = useMemo(
    () => GENERAL_ICONS.filter((icon) => !query || fold(`${icon.label} ${icon.keywords} ${icon.key}`).includes(query)),
    [query]
  );
  const brands = useMemo(() => BRAND_ICONS.filter((brand) => !query || fold(`${brand.title} ${brand.slug}`).includes(query)), [query]);

  const pick = (icon: string | null) => {
    onPick(icon);
    onClose();
  };

  const remove = async (icon: ProfileIcon) => {
    const ok = await confirm({
      title: t('Symbol löschen?'),
      message: t('Links mit diesem Symbol bekommen wieder ein automatisches Symbol.'),
      confirmLabel: t('Löschen'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteProfileIcon(icon.key);
      onIconsChange(icons.filter((item) => item.key !== icon.key));
      if (value === `c:${icon.key}`) onPick('auto');
      toast(t('Symbol gelöscht'), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const emojiValid = EMOJI.test(emoji.trim());
  const auto = autoIcon(url);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={phone} aria-labelledby="icon-picker-title">
      <DialogTitle id="icon-picker-title" sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1.5 }}>
        <Box component="span" sx={{ flex: 1 }}>
          {t('Symbol wählen')}
        </Box>
        <IconButton aria-label={t('Schließen')} onClick={onClose}>
          <CloseRounded />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Button
            variant={value === 'auto' ? 'contained' : 'tonal'}
            startIcon={<AutoAwesomeRounded />}
            onClick={() => pick('auto')}
            aria-pressed={value === 'auto'}
          >
            {t('Automatisch')}
            <Box component="span" sx={{ display: 'inline-flex', ml: 1, opacity: 0.85 }}>
              <LinkIcon icon={auto} url={url} size={18} />
            </Box>
          </Button>
          <Button
            variant={value === null ? 'contained' : 'text'}
            startIcon={<BlockRounded />}
            onClick={() => pick(null)}
            aria-pressed={value === null}
          >
            {t('Kein Symbol')}
          </Button>
        </Box>
        <Tabs
          value={tab}
          onChange={(_event, next: PickerTab) => setTab(next)}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label={t('Art des Symbols')}
          sx={{ mb: 2, borderBottom: `1px solid ${c.outlineVariant}` }}
        >
          <Tab value="general" label={t('Allgemein')} />
          <Tab value="brands" label={t('Dienste')} />
          <Tab value="emoji" label={t('Emoji')} />
          <Tab value="custom" label={t('Eigene')} />
        </Tabs>

        {(tab === 'general' || tab === 'brands') && (
          <TextField
            size="small"
            fullWidth
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tab === 'brands' ? t('Dienst suchen') : t('Symbol suchen')}
            slotProps={{
              htmlInput: { 'aria-label': tab === 'brands' ? t('Dienst suchen') : t('Symbol suchen') },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ mb: 2 }}
          />
        )}

        {tab === 'general' && (
          <Box sx={grid}>
            {general.map((icon) => (
              <Tile key={icon.key} label={icon.label} selected={value === `g:${icon.key}`} onClick={() => pick(`g:${icon.key}`)}>
                <LinkIcon icon={`g:${icon.key}`} size={28} />
              </Tile>
            ))}
            {!general.length && (
              <Typography variant="body2" sx={{ color: 'text.secondary', gridColumn: '1 / -1', py: 2 }}>
                {t('Nichts gefunden')}
              </Typography>
            )}
          </Box>
        )}

        {tab === 'brands' && (
          <Box sx={{ display: 'grid', gap: 2.5 }}>
            {BRAND_GROUPS.map(([group, label]) => {
              const list = brands.filter((brand) => brand.group === group);
              if (!list.length) return null;
              return (
                <Box key={group} component="section" aria-label={label}>
                  <Typography variant="subtitle2" component="h3" sx={{ color: 'text.secondary', mb: 1 }}>
                    {label}
                  </Typography>
                  <Box sx={grid}>
                    {list.map((brand) => (
                      <Tile
                        key={brand.slug}
                        label={brand.title}
                        selected={value === `b:${brand.slug}`}
                        onClick={() => pick(`b:${brand.slug}`)}
                      >
                        <LinkIcon icon={`b:${brand.slug}`} size={28} />
                      </Tile>
                    ))}
                  </Box>
                </Box>
              );
            })}
            {!brands.length && (
              <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
                {t('Nichts gefunden. Mit einem eigenen Symbol geht jeder Dienst.')}
              </Typography>
            )}
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('Die Symbole der Dienste stammen von Simple Icons. Die Marken gehören ihren Inhabern.')}
            </Typography>
          </Box>
        )}

        {tab === 'emoji' && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 0.75 }}>
              {EMOJI_CHOICES.map((choice) => (
                <ButtonBase
                  key={choice}
                  onClick={() => pick(`e:${choice}`)}
                  aria-label={choice}
                  aria-pressed={value === `e:${choice}`}
                  sx={{
                    height: 52,
                    fontSize: 26,
                    borderRadius: `${radius.md}px`,
                    bgcolor: value === `e:${choice}` ? c.primaryContainer : 'transparent',
                    '&:hover': { bgcolor: c.surfaceContainerHigh },
                    '&:focus-visible': { outline: `3px solid ${c.primary}`, outlineOffset: 1 },
                  }}
                >
                  {choice}
                </ButtonBase>
              ))}
            </Box>
            <Box
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                if (emojiValid) pick(`e:${emoji.trim()}`);
              }}
              sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}
            >
              <TextField
                size="small"
                label={t('Anderes Emoji')}
                value={emoji}
                onChange={(event) => setEmoji(event.target.value)}
                error={Boolean(emoji.trim()) && !emojiValid}
                helperText={emoji.trim() && !emojiValid ? t('Hier passt nur ein Emoji hinein.') : t('Füg ein beliebiges Emoji ein.')}
                slotProps={{ htmlInput: { maxLength: 16, autoComplete: 'off' } }}
                sx={{ flex: 1 }}
              />
              <Button type="submit" variant="tonal" disabled={!emojiValid} sx={{ height: 40 }}>
                {t('Übernehmen')}
              </Button>
            </Box>
          </Box>
        )}

        {tab === 'custom' && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            {!customEnabled ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('Eigene Symbole sind auf diesem Server abgeschaltet.')}
              </Typography>
            ) : (
              <>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('Lade Logos oder Bilder hoch und nutze sie für beliebig viele Links. Bis zu {max} eigene Symbole.', {
                    max: maxCustom,
                  })}
                </Typography>
                <Box sx={grid}>
                  {icons.map((icon, index) => (
                    <Box key={icon.key} sx={{ position: 'relative' }}>
                      <Tile
                        label={t('Eigenes Symbol {number}', { number: index + 1 })}
                        selected={value === `c:${icon.key}`}
                        onClick={() => pick(`c:${icon.key}`)}
                      >
                        <LinkIcon icon={`c:${icon.key}`} iconUrl={icon.url} size={32} />
                      </Tile>
                      <IconButton
                        size="small"
                        aria-label={t('Eigenes Symbol {number} löschen', { number: index + 1 })}
                        onClick={() => void remove(icon)}
                        sx={{
                          position: 'absolute',
                          top: 2,
                          right: 2,
                          width: 26,
                          height: 26,
                          bgcolor: c.surfaceContainerHighest,
                          '&:hover': { bgcolor: c.errorContainer, color: c.onErrorContainer },
                        }}
                      >
                        <CloseRounded sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  ))}
                  <ButtonBase
                    onClick={() => setUploading(true)}
                    disabled={icons.length >= maxCustom}
                    sx={{
                      flexDirection: 'column',
                      gap: 0.75,
                      py: 1.25,
                      borderRadius: `${radius.md}px`,
                      border: `1.5px dashed ${c.outline}`,
                      color: c.primary,
                      opacity: icons.length >= maxCustom ? 0.5 : 1,
                      '&:hover': { bgcolor: c.surfaceContainerHigh },
                      '&:focus-visible': { outline: `3px solid ${c.primary}`, outlineOffset: 1 },
                    }}
                  >
                    <AddRounded sx={{ fontSize: 28 }} />
                    <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 600 }}>
                      {t('Hochladen')}
                    </Typography>
                  </ButtonBase>
                </Box>
              </>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Typography variant="body2" sx={{ color: 'text.secondary', mr: 'auto', pl: 1 }} noWrap>
          {t('Aktuell: {name}', { name: iconTitle(value, url) })}
        </Typography>
        <Button onClick={onClose}>{t('Fertig')}</Button>
      </DialogActions>
      <IconUploadDialog
        open={uploading}
        onClose={() => setUploading(false)}
        maxBytes={maxBytes}
        onSaved={(icon) => {
          onIconsChange([...icons, icon]);
          pick(`c:${icon.key}`);
        }}
      />
    </Dialog>
  );
}
