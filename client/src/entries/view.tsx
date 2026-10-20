import { mount } from '../app/mount';
import { readBoot } from '../lib/boot';
import { meaningfulColor } from '../lib/color';
import type { ViewBoot } from '../lib/types';
import { ViewPage } from '../pages/view/ViewPage';

const boot = readBoot<ViewBoot>();
mount(<ViewPage />, { seed: meaningfulColor(boot.accent) ?? boot.site.seedColor });
