import { mount } from '../app/mount';
import { readBoot } from '../lib/boot';
import { accentOf, withDefaults } from '../lib/design';
import { SAMPLE_COLOR } from '../lib/samples';
import type { ViewBoot } from '../lib/types';
import { ViewPage } from '../pages/view/ViewPage';

const boot = readBoot<ViewBoot>();
const design = withDefaults(boot.design);
const designed = !boot.locked;
const scheme = designed && !boot.preview && design.scheme !== 'visitor' ? design.scheme : null;
const seed = designed ? accentOf(design, boot.sample ? SAMPLE_COLOR : boot.accent, boot.site.seedColor) : boot.site.seedColor;

mount(<ViewPage />, { seed, scheme, isolated: !!boot.preview });
