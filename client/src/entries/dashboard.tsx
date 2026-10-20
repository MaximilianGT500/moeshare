import { domMax } from 'motion/react';
import { mount } from '../app/mount';
import { DashboardPage } from '../pages/dashboard/DashboardPage';

mount(<DashboardPage />, { features: domMax });
