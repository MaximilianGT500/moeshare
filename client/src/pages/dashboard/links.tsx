import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddLinkRounded from '@mui/icons-material/AddLinkRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import InsertLinkRounded from '@mui/icons-material/InsertLinkRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import AdsClickRounded from '@mui/icons-material/AdsClickRounded';
import BarChartRounded from '@mui/icons-material/BarChartRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import { ApiError, createLink, deleteLink, listLinks } from '../../lib/api';
import type { ExpiryChoice, ShortLink, UploadOptionsInfo, UrlStyle } from '../../lib/types';
import { formatNumber, relativeMs } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { useDebouncedValue, useInView } from '../../lib/hooks';
import { CopyIconButton, CopyTextButton } from '../../components/CopyButton';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { SearchField } from '../../components/SearchField';
import { GrowTransition } from '../../components/transitions';
import { DomainSelect, ExpirySelect, URL_STYLES, UrlStyleSelect } from '../../components/ShareOptions';
import { PasswordField } from '../../components/PasswordField';
import { StatsDialog, type StatsTarget } from '../../components/StatsView';
import { c, css, fonts, radius } from '../../theme/tokens';

const LINK_STYLES = URL_STYLES.filter((style) => style !== 'original');

export function LinkDialog({
  open,
  info,
  initialUrl = '',
  onClose,
  onCreated,
}: {
  open: boolean;
  info: UploadOptionsInfo;
  initialUrl?: string;
  onClose: () => void;
  onCreated: (short: string) => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState('');
  const [expires, setExpires] = useState<'' | ExpiryChoice>('');
  const [password, setPassword] = useState('');
  const [maxClicks, setMaxClicks] = useState('');
  const [style, setStyle] = useState<'' | UrlStyle>('');
  const [domain, setDomain] = useState('');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState('');

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl);
    setCreated('');
    setError('');
  }, [open, initialUrl]);

  const reset = () => {
    setUrl('');
    setTitle('');
    setExpires('');
    setPassword('');
    setMaxClicks('');
    setStyle('');
    setDomain('');
    setMore(false);
  };

  const submit = async () => {
    const value = url.trim();
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    } catch {
      setError(t('Gib eine vollständige Adresse ein, die mit http:// oder https:// beginnt.'));
      return;
    }
    const clicks = maxClicks ? Number(maxClicks) : null;
    if (clicks !== null && (!Number.isInteger(clicks) || clicks < 1)) {
      setError(t('Die Anzahl der Klicks muss eine ganze Zahl ab 1 sein.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await createLink(value, {
        title: title.trim() || undefined,
        expires: expires || undefined,
        password: password || undefined,
        maxViews: clicks,
        urlStyle: style || undefined,
        domain: domain || undefined,
      });
      setCreated(result.url);
      reset();
      onCreated(result.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Der Link konnte nicht gekürzt werden.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="link-title"
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, color: c.secondary }}>
        <AddLinkRounded sx={{ fontSize: 28 }} />
      </Box>
      <DialogTitle id="link-title" sx={{ textAlign: 'center' }}>
        {created ? t('Kurzlink erstellt') : t('Link kürzen')}
      </DialogTitle>
      <DialogContent>
        {created ? (
          <Box sx={{ textAlign: 'center' }}>
            <Box
              sx={{
                mx: 'auto',
                px: 2,
                py: 1.5,
                borderRadius: `${radius.md}px`,
                bgcolor: c.surfaceContainerHigh,
                fontFamily: fonts.mono,
                fontSize: '1rem',
                wordBreak: 'break-all',
              }}
            >
              {created}
            </Box>
            <CopyTextButton value={created} variant="contained" message={t('Kurzlink kopiert')} sx={{ mt: 2 }}>
              {t('Kopieren')}
            </CopyTextButton>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 2, pt: 0.5 }}>
            <TextField
              autoFocus
              label={t('Lange Adresse')}
              placeholder="https://beispiel.de/ein/sehr/langer/link"
              value={url}
              error={!!error}
              helperText={error || ' '}
              onChange={(event) => {
                setUrl(event.target.value);
                if (error) setError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
              slotProps={{ htmlInput: { inputMode: 'url', spellCheck: false, autoComplete: 'off' } }}
            />
            <Button
              onClick={() => setMore((value) => !value)}
              endIcon={
                <ExpandMoreRounded sx={{ transform: more ? 'rotate(180deg)' : 'none', transition: `transform 200ms ${css.standard}` }} />
              }
              sx={{ justifySelf: 'start', mt: -1.5 }}
            >
              {t('Weitere Optionen')}
            </Button>
            <Collapse in={more}>
              <Box sx={{ display: 'grid', gap: 2 }}>
                <TextField
                  label={t('Notiz (nur für dich)')}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  size="small"
                />
                <ExpirySelect
                  value={expires}
                  onChange={setExpires}
                  max={info.maxExpiry}
                  label={t('Gültig für')}
                  includeDefault={t('Unbegrenzt')}
                />
                <PasswordField label={t('Passwort (optional)')} value={password} onChange={setPassword} autoComplete="new-password" />
                <TextField
                  label={t('Höchstens so viele Klicks (optional)')}
                  value={maxClicks}
                  onChange={(event) => setMaxClicks(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  size="small"
                  slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                />
                <UrlStyleSelect value={style} onChange={setStyle} styles={LINK_STYLES} includeDefault={t('Standard')} />
                <DomainSelect value={domain} onChange={setDomain} domains={info.domains} includeDefault={t('Standard')} />
              </Box>
            </Collapse>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {created ? (
          <>
            <Button onClick={() => setCreated('')}>{t('Noch einen kürzen')}</Button>
            <Button variant="contained" onClick={onClose}>
              {t('Fertig')}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              {t('Abbrechen')}
            </Button>
            <Button
              variant="contained"
              onClick={submit}
              disabled={busy || !url.trim()}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AddLinkRounded />}
            >
              {t('Kürzen')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

function LinkRow({ link, onDelete, onStats }: { link: ShortLink; onDelete: () => void; onStats?: () => void }) {
  let host = '';
  try {
    host = new URL(link.url).host;
  } catch {}
  const used = link.maxClicks !== null && link.clicks >= link.maxClicks;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minWidth: 0,
        px: { xs: 1.5, sm: 2 },
        py: 1.5,
        borderRadius: `${radius.md}px`,
        bgcolor: c.surfaceContainerLow,
        opacity: used ? 0.6 : 1,
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: `${radius.sm}px`,
          display: { xs: 'none', sm: 'grid' },
          placeItems: 'center',
          bgcolor: c.secondaryContainer,
          color: c.onSecondaryContainer,
          flexShrink: 0,
        }}
      >
        <InsertLinkRounded />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" noWrap sx={{ fontFamily: fonts.mono }}>
          {link.short.replace(/^https?:\/\//, '')}
        </Typography>
        <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }} title={link.url}>
          {link.title ? `${link.title} · ` : ''}
          {host ? `${host} · ` : ''}
          {link.url}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, color: 'text.secondary', fontSize: '0.75rem', flexWrap: 'wrap' }}>
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <AdsClickRounded sx={{ fontSize: 14 }} />
            {link.maxClicks
              ? t('{clicks} von {max} Klicks', { clicks: formatNumber(link.clicks), max: formatNumber(link.maxClicks) })
              : tn(link.clicks, '1 Klick', '{count} Klicks')}
          </Box>
          {link.password && (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <LockOutlined sx={{ fontSize: 14 }} />
              {t('Passwort')}
            </Box>
          )}
          {link.expiresAt && (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <TimerOutlined sx={{ fontSize: 14 }} />
              {t('läuft ab {when}', { when: relativeMs(link.expiresAt) })}
            </Box>
          )}
          <span>{t('erstellt {when}', { when: relativeMs(link.createdAt) })}</span>
          {link.blocked && (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: c.error, fontWeight: 700 }}>
              <BlockRounded sx={{ fontSize: 14 }} />
              {t('Von der Moderation gesperrt')}
            </Box>
          )}
        </Box>
      </Box>
      {onStats && (
        <Tooltip title={t('Statistik')}>
          <IconButton aria-label={t('Statistik')} onClick={onStats}>
            <BarChartRounded />
          </IconButton>
        </Tooltip>
      )}
      <CopyIconButton value={link.short} label={t('Kurzlink kopieren')} message={t('Kurzlink kopiert')} />
      <Tooltip title={t('Löschen')}>
        <IconButton aria-label={t('Kurzlink löschen')} onClick={onDelete}>
          <DeleteOutlineRounded />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export function LinksView({ info, version }: { info: UploadOptionsInfo; version: number }) {
  const toast = useToast();
  const [statsTarget, setStatsTarget] = useState<StatsTarget | null>(null);
  const confirm = useConfirm();
  const [links, setLinks] = useState<ShortLink[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query.trim(), 280);
  const [creating, setCreating] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await listLinks({ page: 1, limit: 30, search });
      setLinks(res.links);
      setPage(res.page);
      setHasNext(res.hasNext);
      setTotal(res.total);
    } catch (err) {
      setLinks([]);
      toast(err instanceof ApiError ? err.message : t('Die Links konnten nicht geladen werden.'), { variant: 'error' });
    }
  }, [search, toast]);

  useEffect(() => {
    load();
  }, [load, version]);

  const more = useCallback(async () => {
    if (!hasNext || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listLinks({ page: page + 1, limit: 30, search });
      setLinks((prev) => [...(prev || []), ...res.links.filter((link) => !(prev || []).some((known) => known.id === link.id))]);
      setPage(res.page);
      setHasNext(res.hasNext);
    } finally {
      setLoadingMore(false);
    }
  }, [hasNext, loadingMore, page, search]);

  const sentinel = useInView(more, hasNext && !loadingMore);

  const remove = async (link: ShortLink) => {
    const ok = await confirm({
      title: t('Kurzlink löschen?'),
      message: t('{short} funktioniert danach nicht mehr.', { short: link.short }),
      confirmLabel: t('Löschen'),
    });
    if (!ok) return;
    try {
      await deleteLink(link.id);
      setLinks((prev) => (prev || []).filter((entry) => entry.id !== link.id));
      setTotal((count) => Math.max(0, count - 1));
      toast(t('Kurzlink gelöscht'), { variant: 'success' });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Das hat nicht geklappt.'), { variant: 'error' });
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 220, maxWidth: 480 }}>
          <SearchField value={query} onChange={setQuery} placeholder={t('Links durchsuchen')} />
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {links ? tn(total, '1 Link', '{count} Links') : ''}
        </Typography>
        <Button variant="tonal" startIcon={<AddLinkRounded />} onClick={() => setCreating(true)} sx={{ ml: 'auto' }}>
          {t('Link kürzen')}
        </Button>
      </Box>
      {links === null ? (
        <Box sx={{ display: 'grid', gap: 1 }}>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} variant="rounded" height={84} />
          ))}
        </Box>
      ) : links.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: { xs: 8, md: 12 } }}>
          <Box
            sx={{
              width: 112,
              height: 112,
              mx: 'auto',
              borderRadius: '36px',
              display: 'grid',
              placeItems: 'center',
              bgcolor: c.primaryContainer,
              color: c.onPrimaryContainer,
            }}
          >
            <InsertLinkRounded sx={{ fontSize: 52 }} />
          </Box>
          <Typography variant="h4" component="h2" sx={{ mt: 3 }}>
            {search ? t('Nichts gefunden') : t('Noch keine Kurzlinks')}
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', mt: 1, maxWidth: 480, mx: 'auto' }}>
            {search ? t('Kein Link passt zu „{query}“.', { query: search }) : t('Kürze lange Adressen hier oder direkt aus ShareX heraus.')}
          </Typography>
          {!search && (
            <Button variant="contained" startIcon={<AddLinkRounded />} onClick={() => setCreating(true)} sx={{ mt: 3 }}>
              {t('Link kürzen')}
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gap: 1 }}>
          {links.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              onDelete={() => remove(link)}
              onStats={
                info.stats ? () => setStatsTarget({ kind: 'link', id: link.id, title: link.short.replace(/^https?:\/\//, '') }) : undefined
              }
            />
          ))}
        </Box>
      )}
      <Box ref={sentinel} sx={{ height: '1px' }} />
      {loadingMore && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}
      <StatsDialog target={statsTarget} onClose={() => setStatsTarget(null)} />
      <LinkDialog
        open={creating}
        info={info}
        onClose={() => setCreating(false)}
        onCreated={() => {
          load();
        }}
      />
    </Box>
  );
}
