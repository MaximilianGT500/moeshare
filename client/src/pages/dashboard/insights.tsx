import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import AccessibilityNewRounded from '@mui/icons-material/AccessibilityNewRounded';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import type { FileItem, RecentComment, StatsOverview } from '../../lib/types';
import { fetchRecentComments, fetchStatsOverview } from '../../lib/api';
import { formatNumber, relativeMs } from '../../lib/format';
import { UserAvatar } from '../../components/UserAvatar';
import { t, tn } from '../../lib/i18n';
import { FileThumb } from '../../components/FileThumb';
import { StatsPanel } from '../../components/StatsView';
import { displayName } from './MediaTile';
import { YearReviewSection } from './yearReview';
import { UploadCalendarSection } from './calendar';
import { c, css, radius } from '../../theme/tokens';

function breakdown(entry: StatsOverview['top'][number]) {
  const parts: string[] = [];
  if (entry.views) parts.push(tn(entry.views, '1 Aufruf', '{count} Aufrufe'));
  if (entry.downloads) parts.push(tn(entry.downloads, '1 Download', '{count} Downloads'));
  if (entry.direct) parts.push(tn(entry.direct, '1-mal direkt', '{count}-mal direkt'));
  return parts.join(', ');
}

type RankEntry = { id: number; total: number; file: FileItem; detail?: string };

function TopFiles({ entries, onOpen }: { entries: StatsOverview['top']; onOpen: (file: FileItem) => void }) {
  return (
    <RankList
      title={t('Am häufigsten abgerufen')}
      entries={entries.map((entry) => ({ ...entry, detail: breakdown(entry) || t('Nur Vorschauen') }))}
      empty={t('In diesem Zeitraum hat noch niemand deine Dateien abgerufen.')}
      onOpen={onOpen}
    />
  );
}

function RankList({
  title,
  entries,
  empty,
  onOpen,
}: {
  title: string;
  entries: RankEntry[];
  empty: string;
  onOpen: (file: FileItem) => void;
}) {
  return (
    <Box>
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1.25 }}>
        {title}
      </Typography>
      {entries.length ? (
        <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 0.5 }}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <ButtonBase
                onClick={() => onOpen(entry.file)}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 0.75,
                  pr: 1.5,
                  textAlign: 'left',
                  borderRadius: `${radius.md}px`,
                  transition: `background-color 160ms ${css.standard}`,
                  '&:hover': { bgcolor: c.surfaceContainerHigh },
                  '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
                }}
              >
                <FileThumb file={entry.file} size={44} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    {displayName(entry.file)}
                  </Typography>
                  {entry.detail && (
                    <Typography variant="caption" component="p" noWrap sx={{ color: 'text.secondary' }}>
                      {entry.detail}
                    </Typography>
                  )}
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatNumber(entry.total)}
                </Typography>
              </ButtonBase>
            </li>
          ))}
        </Box>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {empty}
        </Typography>
      )}
    </Box>
  );
}

function Reacted({ reactions, onOpen }: { reactions: NonNullable<StatsOverview['reactions']>; onOpen: (file: FileItem) => void }) {
  return (
    <RankList
      title={tn(reactions.total, 'Reaktionen: 1 insgesamt', 'Reaktionen: {count} insgesamt')}
      entries={reactions.top.map((entry) => ({ ...entry, detail: tn(entry.total, '1 Reaktion', '{count} Reaktionen') }))}
      empty={t('Noch hat niemand auf deine Dateien reagiert.')}
      onOpen={onOpen}
    />
  );
}

function RecentComments() {
  const [items, setItems] = useState<RecentComment[] | null>(null);
  useEffect(() => {
    fetchRecentComments(8)
      .then((result) => setItems(result.enabled ? result.comments : []))
      .catch(() => setItems([]));
  }, []);
  if (!items || !items.length) return null;
  return (
    <Box component="section" aria-labelledby="recent-comments-title" sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <ChatBubbleOutlineRounded sx={{ color: c.secondary }} />
        <Typography id="recent-comments-title" variant="h6" component="h2">
          {t('Neue Kommentare')}
        </Typography>
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
        {items.map((item) => {
          const href =
            item.target.kind === 'f'
              ? `/view/${encodeURIComponent(item.target.slug)}`
              : item.target.code
                ? `/a/${encodeURIComponent(item.target.code)}`
                : null;
          return (
            <li key={item.id}>
              <ButtonBase
                component="a"
                href={href || undefined}
                target="_blank"
                rel="noopener"
                disabled={!href}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.5,
                  p: 1,
                  textAlign: 'left',
                  borderRadius: `${radius.md}px`,
                  transition: `background-color 160ms ${css.standard}`,
                  '&:hover': { bgcolor: c.surfaceContainerHigh },
                  '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
                }}
              >
                <UserAvatar name={item.name || '?'} src={item.avatar} size={32} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ display: 'flex', gap: 0.75, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <Box component="span" sx={{ fontWeight: 700 }}>
                      {item.name}
                    </Box>
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      {t('zu {target}', { target: item.target.name || t('einer Datei') })}
                    </Box>
                    <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                      {relativeMs(item.createdAt)}
                    </Box>
                    {item.hidden && (
                      <VisibilityOffOutlined sx={{ fontSize: 14, color: c.tertiary, alignSelf: 'center' }} aria-label={t('Ausgeblendet')} />
                    )}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {item.body}
                  </Typography>
                </Box>
              </ButtonBase>
            </li>
          );
        })}
      </Box>
    </Box>
  );
}

function AltNudge({ count, onFix, onShow }: { count: number; onFix: () => void; onShow: () => void }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 2,
        p: { xs: 2, sm: 2.5 },
        mt: 3,
        borderRadius: `${radius.lg}px`,
        border: `1px dashed ${c.outline}`,
      }}
    >
      <AccessibilityNewRounded sx={{ color: c.secondary, fontSize: 28 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" component="h3">
          {tn(count, '1 Bild oder Video ohne Alternativtext', '{count} Bilder und Videos ohne Alternativtext')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('Ein kurzer Text hilft Menschen mit Screenreader und erscheint auch auf der Ansichtsseite und in eingebetteten Bildern.')}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
        <Button onClick={onShow}>{t('Anzeigen')}</Button>
        <Button variant="tonal" onClick={onFix}>
          {t('Nachtragen')}
        </Button>
      </Box>
    </Box>
  );
}

export function InsightsView({
  onOpen,
  onDay,
  missingAlt = 0,
  onAltFix,
  onAltShow,
}: {
  onOpen: (file: FileItem) => void;
  onDay?: (day: string) => void;
  missingAlt?: number;
  onAltFix?: () => void;
  onAltShow?: () => void;
}) {
  const load = useCallback((days: number) => fetchStatsOverview(days), []);
  return (
    <Box sx={{ maxWidth: 1080, pb: 4 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5, maxWidth: 680 }}>
        {t('Alle deine Dateien zusammen. Gezählt werden nur Abrufe von anderen, ohne IP-Adressen oder Geräte zu speichern.')}
      </Typography>
      <StatsPanel
        load={load}
        aside={(data) => (
          <Box sx={{ display: 'grid', gap: 3 }}>
            <TopFiles entries={data.top} onOpen={onOpen} />
            {data.reactions && <Reacted reactions={data.reactions} onOpen={onOpen} />}
          </Box>
        )}
      />
      {missingAlt > 0 && onAltFix && onAltShow && <AltNudge count={missingAlt} onFix={onAltFix} onShow={onAltShow} />}
      <RecentComments />
      <UploadCalendarSection onDay={onDay} />
      <YearReviewSection onOpen={onOpen} />
    </Box>
  );
}
