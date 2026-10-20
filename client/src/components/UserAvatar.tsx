import Avatar from '@mui/material/Avatar';
import { hueFromString } from '../lib/color';

export function UserAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const hue = hueFromString(name || '?');
  return (
    <Avatar
      aria-hidden
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
