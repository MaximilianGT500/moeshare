import { useState } from 'react';
import { m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import GavelRounded from '@mui/icons-material/GavelRounded';
import type { AccountTerms } from '../../lib/types';
import { ApiError, acceptTerms, errorMessage, fetchAccount } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { t } from '../../lib/i18n';
import { LegalText } from '../../components/LegalText';
import { useToast } from '../../components/Toaster';
import { c, ease, radius } from '../../theme/tokens';

const nextTarget = () => {
  const next = new URLSearchParams(window.location.search).get('next') || '';
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/account') ? next : '/dashboard';
};

export function TermsGate({ initial, siteTitle }: { initial: AccountTerms; siteTitle: string }) {
  const toast = useToast();
  const [terms, setTerms] = useState(initial);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const before = terms.mine && terms.mine.version ? terms.mine.version : null;

  const accept = async () => {
    setBusy(true);
    try {
      await acceptTerms(terms.version);
      window.location.assign(nextTarget());
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'terms_changed') {
        const fresh = await fetchAccount().catch(() => null);
        if (fresh && fresh.terms) setTerms(fresh.terms);
        setAgreed(false);
        setChanged(true);
      } else {
        toast(errorMessage(failure), { variant: 'error' });
      }
      setBusy(false);
    }
  };

  return (
    <m.section
      aria-labelledby="terms-title"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: ease.emphasizedDecelerate }}
    >
      <Box
        sx={{
          mt: 3,
          borderRadius: `${radius.lg}px`,
          bgcolor: c.surfaceContainerLow,
          border: `1px solid ${c.outlineVariant}`,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', p: { xs: 2.5, md: 3 }, pb: 2 }}>
          <Box
            aria-hidden
            sx={{
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: `${radius.md}px`,
              display: 'grid',
              placeItems: 'center',
              bgcolor: c.tertiaryContainer,
              color: c.onTertiaryContainer,
            }}
          >
            <GavelRounded />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography id="terms-title" variant="h5" component="h2">
              {before ? t('Die Nutzungsbedingungen haben sich geändert') : t('Nutzungsbedingungen')}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, maxWidth: '62ch' }}>
              {before
                ? t(
                    'Lies bitte die neue Fassung und stimm ihr zu. Danach geht es direkt weiter. Deine Dateien und Links bleiben in der Zwischenzeit erreichbar.'
                  )
                : t('Bevor du {site} nutzt, lies bitte die Nutzungsbedingungen und stimm ihnen zu.', { site: siteTitle })}
            </Typography>
            {terms.publishedAt && (
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.75 }}>
                {t('Fassung {version} vom {date}', { version: terms.version, date: formatDate(new Date(terms.publishedAt)) })}
              </Typography>
            )}
          </Box>
        </Box>
        {changed && (
          <Alert severity="warning" sx={{ mx: { xs: 2.5, md: 3 }, mb: 2 }}>
            {t('Die Nutzungsbedingungen wurden gerade noch einmal geändert. Hier ist die neue Fassung.')}
          </Alert>
        )}
        <Box
          tabIndex={0}
          role="document"
          aria-label={t('Text der Nutzungsbedingungen')}
          sx={{
            mx: { xs: 2.5, md: 3 },
            p: { xs: 2, sm: 2.5 },
            maxHeight: '52vh',
            overflowY: 'auto',
            borderRadius: `${radius.md}px`,
            bgcolor: c.surface,
            border: `1px solid ${c.outlineVariant}`,
            '&:focus-visible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
          }}
        >
          <LegalText text={terms.text} dense />
        </Box>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 1.5,
            p: { xs: 2.5, md: 3 },
          }}
        >
          <FormControlLabel
            sx={{ flex: 1, mr: 0 }}
            control={<Checkbox checked={agreed} onChange={(event) => setAgreed(event.target.checked)} disabled={busy} />}
            label={t('Ich habe die Nutzungsbedingungen gelesen und stimme zu.')}
          />
          <Button
            variant="contained"
            onClick={accept}
            disabled={!agreed || busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {t('Zustimmen und weiter')}
          </Button>
        </Box>
      </Box>
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1.5 }}>
        {t('Du willst nicht zustimmen?')}{' '}
        <Link href="/logout" underline="hover">
          {t('Abmelden')}
        </Link>
      </Typography>
    </m.section>
  );
}
