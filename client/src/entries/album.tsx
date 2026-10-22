import { mount } from '../app/mount';
import { readBoot } from '../lib/boot';
import { meaningfulColor } from '../lib/color';
import { accentOf, withDefaults } from '../lib/design';
import type { AlbumBoot } from '../lib/types';
import { AlbumPage } from '../pages/album/AlbumPage';

const boot = readBoot<AlbumBoot>();
const design = withDefaults(boot.design);
const designed = !boot.locked && !!boot.album;
const dominant = meaningfulColor(boot.items?.find((item) => item.color)?.color);

mount(<AlbumPage />, {
  seed: designed ? accentOf(design, dominant, boot.site.seedColor) : (dominant ?? boot.site.seedColor),
  scheme: designed && design.scheme !== 'visitor' ? design.scheme : null,
});
