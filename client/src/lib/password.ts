import { t } from './i18n';
interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

const LABELS = [t('Zu kurz'), t('Schwach'), t('Brauchbar'), t('Gut'), t('Stark')];

export function passwordStrength(password: string, minLength: number, username = ''): Strength {
  if (password.length < minLength) return { score: 0, label: LABELS[0] };
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (/[^A-Za-z0-9]/.test(password)) pool += 20;

  let effective = 0;
  for (let i = 0; i < password.length; i++) {
    const prev = password.charCodeAt(i - 1);
    const code = password.charCodeAt(i);
    effective += i > 0 && (code === prev || code === prev + 1 || code === prev - 1) ? 0.3 : 1;
  }
  let bits = effective * Math.log2(Math.max(pool, 10));
  if (username && password.toLowerCase().includes(username.toLowerCase())) bits *= 0.5;

  const score = bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  return { score, label: LABELS[score] } as Strength;
}
