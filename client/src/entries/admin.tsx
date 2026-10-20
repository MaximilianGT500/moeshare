import { domMax } from 'motion/react';
import { mount } from '../app/mount';
import { AdminPage } from '../pages/admin/AdminPage';

mount(<AdminPage />, { features: domMax });
