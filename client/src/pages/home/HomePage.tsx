import { useEffect, useState } from 'react';
import { readBoot } from '../../lib/boot';
import { fetchHomeStats } from '../../lib/api';
import type { HomeBoot, HomeStats } from '../../lib/types';
import { HomeView } from './HomeView';

const REFRESH_MS = 60_000;

export function HomePage() {
  const boot = readBoot<HomeBoot>();
  const [stats, setStats] = useState<HomeStats>(boot.stats);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchHomeStats().then(setStats, () => {});
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  return <HomeView site={boot.site} home={boot.home} stats={stats} user={boot.user} registration={boot.registration} />;
}
