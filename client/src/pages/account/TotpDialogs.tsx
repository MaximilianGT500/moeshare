import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import { beginTotpSetup, enableTotp, errorMessage } from '../../lib/api';
import { downloadText } from '../../lib/sharex';
import { OtpInput } from '../../components/OtpInput';
import { CopyTextButton } from '../../components/CopyButton';
import { GrowTransition, SlideUpTransition } from '../../components/transitions';
import { isCancelled, useSudo } from '../../components/Sudo';
import { c, ease, fonts, radius } from '../../theme/tokens';

function RecoveryCodes({ codes, siteTitle, username }: { codes: string[]; siteTitle: string; username: string }) {
  const text = `${siteTitle} – Wiederherstellungscodes für ${username}\n\n${codes.join('\n')}\n\nJeder Code funktioniert genau einmal.\n`;
  return (
    <Box>
      <Box
        component="ol"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 2,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 1,
          borderRadius: `${radius.md}px`,
          bgcolor: c.surfaceContainerHighest,
          fontFamily: fonts.mono,
          fontSize: '0.95rem',
          letterSpacing: '0.04em',
          textAlign: 'center',
        }}
      >
        {codes.map((code) => (
          <Box component="li" key={code} sx={{ py: 0.5 }}>
            {code}
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
        <CopyTextButton
          value={codes.join('\n')}
          message="Codes kopiert"
          icon={<ContentCopyRounded fontSize="inherit" />}
          variant="tonal"
          size="small"
        >
          Kopieren
        </CopyTextButton>
        <Button
          variant="tonal"
          size="small"
          startIcon={<DownloadRounded />}
          onClick={() => downloadText(`${siteTitle}-wiederherstellungscodes.txt`.replace(/\s+/g, '-'), text, 'text/plain')}
        >
          Als Datei speichern
        </Button>
      </Box>
    </Box>
  );
}

type Step = 'scan' | 'verify' | 'codes';

export function TotpSetupDialog({
  open,
  onClose,
  onEnabled,
  siteTitle,
  username,
}: {
  open: boolean;
  onClose: () => void;
  onEnabled: () => void;
  siteTitle: string;
  username: string;
}) {
  const sudo = useSudo();
  const phone = useMediaQuery('(max-width:599.95px)', { noSsr: true });
  const [step, setStep] = useState<Step>('scan');
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep('scan');
    setSetup(null);
    setCode('');
    setCodes([]);
    setSaved(false);
    setError('');
    setShowKey(false);
    setBusy(true);
    sudo(() => beginTotpSetup())
      .then(setSetup)
      .catch((failure) => {
        if (isCancelled(failure)) onClose();
        else setError(errorMessage(failure));
      })
      .finally(() => setBusy(false));
  }, [open]);

  const verify = async (value: string) => {
    setBusy(true);
    setError('');
    try {
      const result = await sudo(() => enableTotp(value));
      setCodes(result.recoveryCodes);
      setStep('codes');
      onEnabled();
    } catch (failure) {
      if (!isCancelled(failure)) setError(errorMessage(failure));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const closable = step !== 'codes' || saved;
  const titles: Record<Step, string> = {
    scan: 'Authenticator-App verbinden',
    verify: 'Code bestätigen',
    codes: 'Wiederherstellungscodes sichern',
  };

  return (
    <Dialog
      open={open}
      onClose={() => closable && !busy && onClose()}
      fullScreen={phone}
      maxWidth="xs"
      fullWidth
      slots={{ transition: phone ? SlideUpTransition : GrowTransition }}
      aria-labelledby="totp-title"
    >
      <DialogTitle id="totp-title">{titles[step]}</DialogTitle>
      <DialogContent>
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 2 }}>
          Schritt {step === 'scan' ? 1 : step === 'verify' ? 2 : 3} von 3
        </Typography>
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24, transition: { duration: 0.12 } }}
            transition={{ duration: 0.28, ease: ease.emphasizedDecelerate }}
          >
            {step === 'scan' && (
              <Stack spacing={2}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Scanne den Code mit einer Authenticator-App, zum Beispiel Aegis, 2FAS, Google Authenticator oder deinem Passwortmanager.
                </Typography>
                <Box sx={{ display: 'grid', placeItems: 'center', py: 1 }}>
                  {setup ? (
                    <Box
                      role="img"
                      aria-label="QR-Code für die Authenticator-App"
                      sx={{
                        width: 208,
                        height: 208,
                        p: 1,
                        borderRadius: `${radius.md}px`,
                        bgcolor: '#ffffff',
                        '& svg': { width: '100%', height: '100%', display: 'block' },
                      }}
                      dangerouslySetInnerHTML={{ __html: setup.qr }}
                    />
                  ) : (
                    <Box sx={{ width: 208, height: 208, display: 'grid', placeItems: 'center' }}>
                      <CircularProgress />
                    </Box>
                  )}
                </Box>
                {setup && (
                  <Box sx={{ textAlign: 'center' }}>
                    {phone && (
                      <Button variant="tonal" href={setup.uri} sx={{ mb: 1.5 }} fullWidth>
                        In der App auf diesem Gerät öffnen
                      </Button>
                    )}
                    <Link component="button" type="button" variant="body2" underline="hover" onClick={() => setShowKey((v) => !v)}>
                      {showKey ? 'Schlüssel ausblenden' : 'Kein Scanner? Schlüssel anzeigen'}
                    </Link>
                    <Collapse in={showKey}>
                      <Box
                        sx={{
                          mt: 1.5,
                          p: 1.5,
                          borderRadius: `${radius.tile}px`,
                          bgcolor: c.surfaceContainerHighest,
                          fontFamily: fonts.mono,
                          fontSize: '0.95rem',
                          wordBreak: 'break-all',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {setup.secret}
                      </Box>
                      <CopyTextButton
                        value={setup.secret.replace(/\s/g, '')}
                        message="Schlüssel kopiert"
                        icon={<ContentCopyRounded fontSize="inherit" />}
                        size="small"
                        sx={{ mt: 1 }}
                      >
                        Schlüssel kopieren
                      </CopyTextButton>
                    </Collapse>
                  </Box>
                )}
              </Stack>
            )}
            {step === 'verify' && (
              <Stack spacing={2}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Gib den 6-stelligen Code ein, den die App jetzt für {siteTitle} anzeigt.
                </Typography>
                <OtpInput value={code} onChange={setCode} onComplete={verify} disabled={busy} error={!!error} autoFocus />
              </Stack>
            )}
            {step === 'codes' && (
              <Stack spacing={2}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Fertig, die Zwei-Faktor-Anmeldung ist aktiv. Mit diesen Codes kommst du in dein Konto, falls du dein Handy verlierst.
                  Jeder Code funktioniert einmal.
                </Typography>
                <RecoveryCodes codes={codes} siteTitle={siteTitle} username={username} />
                <FormControlLabel
                  control={<Checkbox checked={saved} onChange={(event) => setSaved(event.target.checked)} />}
                  label="Ich habe die Codes sicher gespeichert"
                />
              </Stack>
            )}
          </m.div>
        </AnimatePresence>
        <Collapse in={!!error} unmountOnExit>
          <Alert severity="error" role="alert" sx={{ mt: 2 }}>
            {error}
          </Alert>
        </Collapse>
      </DialogContent>
      <DialogActions>
        {step === 'scan' && (
          <>
            <Button onClick={onClose}>Abbrechen</Button>
            <Button variant="contained" disabled={!setup} onClick={() => setStep('verify')}>
              Weiter
            </Button>
          </>
        )}
        {step === 'verify' && (
          <>
            <Button onClick={() => setStep('scan')} disabled={busy}>
              Zurück
            </Button>
            <Button
              variant="contained"
              disabled={busy || code.length !== 6}
              onClick={() => verify(code)}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
            >
              Aktivieren
            </Button>
          </>
        )}
        {step === 'codes' && (
          <Button variant="contained" disabled={!saved} onClick={onClose}>
            Fertig
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export function RecoveryCodesDialog({
  codes,
  onClose,
  siteTitle,
  username,
}: {
  codes: string[] | null;
  onClose: () => void;
  siteTitle: string;
  username: string;
}) {
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [codes]);
  return (
    <Dialog
      open={!!codes}
      onClose={() => saved && onClose()}
      maxWidth="xs"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="codes-title"
    >
      <DialogTitle id="codes-title">Neue Wiederherstellungscodes</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Die alten Codes gelten nicht mehr. Speichere die neuen an einem sicheren Ort.
        </Typography>
        {codes && <RecoveryCodes codes={codes} siteTitle={siteTitle} username={username} />}
        <FormControlLabel
          sx={{ mt: 1 }}
          control={<Checkbox checked={saved} onChange={(event) => setSaved(event.target.checked)} />}
          label="Ich habe die Codes sicher gespeichert"
        />
      </DialogContent>
      <DialogActions>
        <Button variant="contained" disabled={!saved} onClick={onClose}>
          Fertig
        </Button>
      </DialogActions>
    </Dialog>
  );
}
