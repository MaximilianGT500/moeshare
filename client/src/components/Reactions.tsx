import { useMemo, useState } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import type { ReactionKey } from '../lib/types';
import { t } from '../lib/i18n';
import { useDesign } from '../lib/design';
import { formatNumber } from '../lib/format';
import { c, radius } from '../theme/tokens';

export const REACTION_KEYS: ReactionKey[] = ['like', 'love', 'laugh', 'wow', 'fire', 'clap'];
export const REACTION_EMOJI: Record<ReactionKey, string> = { like: '👍', love: '❤️', laugh: '😂', wow: '😮', fire: '🔥', clap: '👏' };
export const SAMPLE_REACTIONS: Record<ReactionKey, number> = { like: 24, love: 11, laugh: 3, wow: 0, fire: 8, clap: 5 };

const MINE_KEY = 'moeshare.reactions';
const DAY_MS = 24 * 60 * 60 * 1000;

type Stored = Record<string, { at: number; keys: ReactionKey[] }>;

function readStore(): Stored {
  try {
    return JSON.parse(window.localStorage.getItem(MINE_KEY) || '{}') as Stored;
  } catch {
    return {};
  }
}

function readMine(id: string): ReactionKey[] {
  const entry = readStore()[id];
  return entry && Date.now() - entry.at < DAY_MS ? entry.keys.filter((key) => REACTION_KEYS.includes(key)) : [];
}

function writeMine(id: string, keys: ReactionKey[]) {
  try {
    const fresh = Object.fromEntries(
      Object.entries(readStore())
        .filter(([, entry]) => entry && Date.now() - entry.at < DAY_MS)
        .slice(-200)
    );
    fresh[id] = { at: Date.now(), keys };
    window.localStorage.setItem(MINE_KEY, JSON.stringify(fresh));
  } catch {}
}

export function reactionLabels(): Record<ReactionKey, string> {
  return {
    like: t('Gefällt mir'),
    love: t('Liebe ich'),
    laugh: t('Lustig'),
    wow: t('Erstaunlich'),
    fire: t('Stark'),
    clap: t('Applaus'),
  };
}

export function Reactions({
  id,
  counts: initial,
  send,
  sample = false,
  align = 'left',
  tone = 'normal',
}: {
  id: string;
  counts: Record<ReactionKey, number>;
  send: (key: ReactionKey) => Promise<{ counts: Record<ReactionKey, number> }>;
  sample?: boolean;
  align?: 'left' | 'center';
  tone?: 'normal' | 'glass';
}) {
  const { r, inert } = useDesign();
  const [counts, setCounts] = useState<Record<ReactionKey, number>>(initial);
  const [mine, setMine] = useState<ReactionKey[]>(() => (sample ? [] : readMine(id)));
  const [busy, setBusy] = useState<ReactionKey | null>(null);
  const labels = useMemo(reactionLabels, []);
  const glass = tone === 'glass';

  const press = async (key: ReactionKey) => {
    if (mine.includes(key) || busy) return;
    const next = [...mine, key];
    setMine(next);
    setCounts((current) => ({ ...current, [key]: (current[key] || 0) + 1 }));
    if (sample || inert) return;
    setBusy(key);
    try {
      const result = await send(key);
      setCounts(result.counts);
      writeMine(id, next);
    } catch {
      setMine(mine);
      setCounts((current) => ({ ...current, [key]: Math.max(0, (current[key] || 0) - 1) }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Box
      role="group"
      aria-label={t('Reaktionen')}
      className="ms-reactions"
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: align === 'center' ? 'center' : 'flex-start' }}
    >
      {REACTION_KEYS.map((key) => {
        const pressed = mine.includes(key);
        const count = counts[key] || 0;
        return (
          <Tooltip key={key} title={pressed ? t('{label}: schon reagiert', { label: labels[key] }) : labels[key]}>
            <Box
              component={m.button}
              type="button"
              whileTap={{ scale: 0.88 }}
              aria-pressed={pressed}
              aria-label={count ? `${labels[key]}, ${formatNumber(count)}` : labels[key]}
              onClick={() => press(key)}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                minHeight: 36,
                px: 1.25,
                border: '1px solid',
                borderColor: pressed
                  ? glass
                    ? 'rgb(255 255 255 / 0.5)'
                    : c.primary
                  : glass
                    ? 'rgb(255 255 255 / 0.16)'
                    : c.outlineVariant,
                borderRadius: `${r(radius.full)}px`,
                bgcolor: pressed
                  ? glass
                    ? 'rgb(255 255 255 / 0.2)'
                    : c.primaryContainer
                  : glass
                    ? 'rgb(255 255 255 / 0.06)'
                    : 'transparent',
                color: glass ? '#fff' : pressed ? c.onPrimaryContainer : 'text.secondary',
                font: 'inherit',
                cursor: pressed ? 'default' : 'pointer',
                transition: 'background-color 150ms, border-color 150ms',
                '&:hover': pressed ? undefined : { bgcolor: glass ? 'rgb(255 255 255 / 0.12)' : c.surfaceContainerHigh },
                '&:focus-visible': { outline: `2px solid ${glass ? '#fff' : c.primary}`, outlineOffset: 2 },
              }}
            >
              <Box component="span" aria-hidden sx={{ fontSize: '1.1rem', lineHeight: 1 }}>
                {REACTION_EMOJI[key]}
              </Box>
              {count > 0 && (
                <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {formatNumber(count)}
                </Box>
              )}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
