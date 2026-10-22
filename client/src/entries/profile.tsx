import { mount } from '../app/mount';
import { readBoot } from '../lib/boot';
import { accentOf, withDefaults } from '../lib/design';
import type { ProfileBoot } from '../lib/types';
import { ProfilePage } from '../pages/profile/ProfilePage';

const boot = readBoot<ProfileBoot>();
const design = withDefaults(boot.design);
const dominant = boot.files?.items.find((item) => item.color && item.color !== '#ffffff')?.color ?? null;

mount(<ProfilePage />, {
  seed: accentOf(design, dominant, boot.site.seedColor),
  scheme: design.scheme !== 'visitor' ? design.scheme : null,
});
