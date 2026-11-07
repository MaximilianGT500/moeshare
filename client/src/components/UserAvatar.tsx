import Avatar from '@mui/material/Avatar';
import { hueFromString } from '../lib/color';

export function UserAvatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const hue = hueFromString(name || '?');
  return (
    <Avatar
      aria-hidden
      src={src || undefined}
      alt=""
      slotProps={{ img: { loading: 'lazy', decoding: 'async', draggable: false } }}
      sx={(theme) => ({
        width: size,
        height: size,
        fontSize: size * 0.42,
        bgcolor: `hsl(${hue} 42% 32%)`,
        color: `hsl(${hue} 90% 90%)`,
        ...theme.applyStyles('light', { bgcolor: `hsl(${hue} 75% 88%)`, color: `hsl(${hue} 60% 24%)` }),
      })}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </Avatar>
  );
}
