import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import TokenRounded from '@mui/icons-material/TokenRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import type { ApiTokenInfo } from '../../lib/types';
import { createToken, errorMessage, revokeToken } from '../../lib/api';
import { formatDate, relativeMs } from '../../lib/format';
import { downloadShareX, type ShareXFeatures } from '../../lib/sharex';
import { SettingRow, SettingsSection } from '../../components/SettingsKit';
import { TokenNameDialog, TokenRevealDialog } from '../../components/TokenReveal';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { isCancelled, useSudo } from '../../components/Sudo';
import { c, ease, fonts, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

const STEPS = [
  { title: t('Konfiguration holen'), text: t('„ShareX einrichten“ erstellt ein Token und lädt die passende .sxcu-Datei herunter.') },
  { title: t('Doppelklick auf die Datei'), text: t('ShareX fragt, ob es den Uploader übernehmen soll. Bestätige mit Ja.') },
  { title: t('Als Ziel wählen'), text: t('In ShareX unter Ziele › Benutzerdefinierter Uploader diesen Server auswählen.') },
];

export function ApiPanel({
  tokens,
  reload,
  siteTitle,
  baseUrl,
  features,
}: {
  tokens: ApiTokenInfo[];
  reload: () => Promise<void>;
  siteTitle: string;
  baseUrl: string;
  features?: ShareXFeatures;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const sudo = useSudo();
  const [naming, setNaming] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const create = async (name: string, download = false) => {
    try {
      const result = await sudo(() => createToken(name));
      setNaming(false);
      if (download) downloadShareX({ siteTitle, baseUrl, token: result.token, features });
      setRevealed(result.token);
      reload();
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const revoke = async (token: ApiTokenInfo) => {
    const ok = await confirm({
      title: t('„{name}“ widerrufen?', { name: token.name }),
      message: t('Programme, die dieses Token benutzen, können danach nicht mehr hochladen. ShareX braucht dann ein neues Token.'),
      confirmLabel: t('Widerrufen'),
      icon: <TokenRounded />,
    });
    if (!ok) return;
    try {
      await revokeToken(token.id);
      toast(t('Token widerrufen'), { variant: 'success' });
      reload();
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  return (
    <Stack spacing={4}>
      <SettingsSection
        id="sharex"
        title={t('ShareX einrichten')}
        description={t('Mit ShareX lädst du Screenshots und Dateien direkt in dein Konto hoch und bekommst sofort den Link.')}
      >
        <Box sx={{ px: { xs: 2, sm: 3 }, py: 3 }}>
          <Box
            component="ol"
            sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}
          >
            {STEPS.map((step, index) => (
              <Box component="li" key={step.title} sx={{ display: 'flex', gap: 1.5 }}>
                <Box
                  aria-hidden
                  sx={{
                    width: 28,
                    height: 28,
                    flexShrink: 0,
                    borderRadius: `${radius.full}px`,
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: c.primaryContainer,
                    color: c.onPrimaryContainer,
                    fontWeight: 800,
                    fontSize: '0.875rem',
                  }}
                >
                  {index + 1}
                </Box>
                <Box>
                  <Typography variant="subtitle2">{step.title}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {step.text}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
          <Button variant="contained" size="large" startIcon={<CloudUploadRounded />} sx={{ mt: 3 }} onClick={() => create('ShareX', true)}>
            {t('ShareX einrichten')}
          </Button>
        </Box>
      </SettingsSection>

      <SettingsSection
        id="tokens"
        title={t('API-Tokens')}
        description={t(
          'Jedes Programm bekommt am besten ein eigenes Token. So kannst du eins widerrufen, ohne die anderen neu einzurichten.'
        )}
        action={
          <Button variant="tonal" startIcon={<AddRounded />} onClick={() => setNaming(true)}>
            {t('Neues Token')}
          </Button>
        }
      >
        <AnimatePresence initial={false}>
          {tokens.map((token) => (
            <m.div
              key={token.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: ease.emphasizedDecelerate }}
            >
              <SettingRow
                icon={<TokenRounded />}
                label={
                  <>
                    {token.name}
                    {token.legacy && <Chip size="small" label={t('Aus der alten Version')} variant="outlined" />}
                  </>
                }
                description={
                  <>
                    <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: '0.8125rem' }}>
                      {token.hint}
                    </Box>
                    {t(', erstellt am {date}, zuletzt benutzt {lastUsedAt}', {
                      date: formatDate(new Date(token.createdAt)),
                      lastUsedAt: relativeMs(token.lastUsedAt),
                    })}
                  </>
                }
              >
                <Tooltip title={t('Widerrufen')}>
                  <IconButton
                    aria-label={t('{name} widerrufen', { name: token.name })}
                    onClick={() => revoke(token)}
                    sx={{ '&:hover': { color: c.error } }}
                  >
                    <DeleteOutlineRounded />
                  </IconButton>
                </Tooltip>
              </SettingRow>
            </m.div>
          ))}
        </AnimatePresence>
        {tokens.length === 0 && (
          <Box sx={{ px: { xs: 2, sm: 3 }, py: 3, display: 'flex', alignItems: 'center', gap: 2, color: 'text.secondary' }}>
            <TokenRounded />
            <Typography variant="body2">{t('Noch kein Token. Für das Hochladen im Browser brauchst du keins.')}</Typography>
          </Box>
        )}
      </SettingsSection>

      <TokenNameDialog open={naming} onClose={() => setNaming(false)} onCreate={(name) => create(name)} />
      <TokenRevealDialog token={revealed} onClose={() => setRevealed(null)} siteTitle={siteTitle} baseUrl={baseUrl} features={features} />
    </Stack>
  );
}
