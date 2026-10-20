import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import type { SettingValue, SetupBoot } from '../../lib/types';
import { ApiError, completeSetup, errorMessage, testSetupWebhook, validateSetup } from '../../lib/api';
import { useThemeSeed } from '../../app/mount';
import { useToast } from '../../components/Toaster';
import { AmbientBackdrop } from '../../components/Ambient';
import { BrandMark } from '../../components/BrandMark';
import { ThemeToggleButton } from '../../components/ThemeToggle';
import { AutoHeight, stepMotion } from '../login/AuthLayout';
import { mix } from '../../lib/color';
import { c, radius } from '../../theme/tokens';
import { isLocalOrigin, STEP_SETTINGS, STEPS, stepOfField, type StepKey, type Values } from './wizard';
import { AccountStep, HomeStep, NotifyStep, ReviewStep, SignInStep, SiteStep, UploadsStep, WelcomeStep } from './steps';
import { SetupDone, type SetupResult } from './SetupDone';

const HEX = /^#[0-9a-f]{6}$/i;

function StepRail({
  title,
  favicon,
  index,
  reached,
  done,
  onSelect,
}: {
  title: string;
  favicon: string;
  index: number;
  reached: number;
  done: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <Box component="nav" aria-label="Schritte der Einrichtung" sx={{ display: { xs: 'none', md: 'block' }, position: 'sticky', top: 64 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 4, px: 1 }}>
        <BrandMark src={favicon} title={title} size={44} ring />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title || 'MoeShare'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Einrichtung
          </Typography>
        </Box>
      </Box>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
        {STEPS.map((step, position) => {
          const current = position === index && !done;
          const complete = done || position < index;
          const available = !done && position <= reached;
          return (
            <li key={step.key}>
              <ButtonBase
                disabled={!available}
                aria-current={current ? 'step' : undefined}
                onClick={() => onSelect(position)}
                sx={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  gap: 1.5,
                  py: 1,
                  px: 1,
                  borderRadius: `${radius.full}px`,
                  bgcolor: current ? mix(c.secondaryContainer, 90) : 'transparent',
                  color: current ? c.onSecondaryContainer : available || complete ? 'text.primary' : 'text.disabled',
                  transition: 'background-color 200ms ease',
                  '&:hover': available && !current ? { bgcolor: mix(c.onSurface, 6) } : {},
                  '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
                }}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    flexShrink: 0,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '0.8125rem',
                    fontWeight: 800,
                    bgcolor: complete || current ? c.primary : 'transparent',
                    color: complete || current ? c.onPrimary : 'inherit',
                    boxShadow: complete || current ? 'none' : `inset 0 0 0 1.5px ${c.outline}`,
                    '& svg': { fontSize: 18 },
                  }}
                >
                  {complete ? <CheckRounded /> : position + 1}
                </Box>
                <Typography sx={{ fontWeight: current ? 700 : 500, fontSize: '0.9375rem' }}>{step.label}</Typography>
              </ButtonBase>
            </li>
          );
        })}
      </Box>
    </Box>
  );
}

function MobileProgress({ title, favicon, index, done }: { title: string; favicon: string; index: number; done: boolean }) {
  const step = STEPS[index];
  return (
    <Box sx={{ display: { xs: 'block', md: 'none' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, pr: 6 }}>
        <BrandMark src={favicon} title={title} size={36} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800 }}>{title || 'MoeShare'}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {done ? 'Einrichtung abgeschlossen' : `Schritt ${index + 1} von ${STEPS.length}: ${step.label}`}
          </Typography>
        </Box>
      </Box>
      <LinearProgress
        variant="determinate"
        value={done ? 100 : (index / (STEPS.length - 1)) * 100}
        aria-label="Fortschritt der Einrichtung"
        sx={{ height: 6, borderRadius: 3 }}
      />
    </Box>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        borderRadius: `${radius.xl}px`,
        bgcolor: mix(c.surfaceContainerLow, 84),
        backdropFilter: 'blur(24px) saturate(1.2)',
        border: `1px solid ${mix(c.outlineVariant, 60)}`,
      }}
    >
      <AutoHeight>
        <Box sx={{ p: { xs: 2.5, sm: 4 } }}>{children}</Box>
      </AutoHeight>
    </Box>
  );
}

export function SetupWizard({ boot }: { boot: SetupBoot }) {
  const { setup, site } = boot;
  const toast = useToast();
  const applySeed = useThemeSeed();
  const initialValues = useMemo<Values>(() => {
    const values = { ...setup.settings!.values };
    if (!values['site.baseUrl'] || isLocalOrigin(values['site.baseUrl'])) values['site.baseUrl'] = window.location.origin;
    return values;
  }, [setup.settings]);

  const [values, setValues] = useState<Values>(initialValues);
  const [account, setAccount] = useState({ username: '', password: '' });
  const [webhookUrl, setWebhookUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [reached, setReached] = useState(0);
  const [direction, setDirection] = useState(1);
  const [busy, setBusy] = useState(false);
  const [createToken, setCreateToken] = useState(true);
  const [result, setResult] = useState<SetupResult | null>(null);

  const step = STEPS[index];
  const checks = setup.checks || [];
  const blocked = checks.some((check) => !check.ok && !check.optional);
  const ffmpeg = checks.find((check) => check.key === 'ffmpeg')?.ok ?? true;
  const webhookStored = Boolean(setup.settings?.secrets['webhook.url']);
  const color = values['site.uiColor'];
  const title = typeof values['site.title'] === 'string' && values['site.title'] ? (values['site.title'] as string) : site.title;
  const favicon = typeof values['site.favicon'] === 'string' ? (values['site.favicon'] as string) : '';

  useEffect(() => {
    if (typeof color !== 'string' || !HEX.test(color)) return undefined;
    const timer = window.setTimeout(() => applySeed(color), 120);
    return () => window.clearTimeout(timer);
  }, [color, applySeed]);

  const set = (key: string, value: SettingValue) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => (previous[key] ? { ...previous, [key]: '' } : previous));
  };

  const settingsFor = (keys: string[]) => {
    const patch: Values = {};
    for (const key of keys) {
      if (key !== 'webhook.url') patch[key] = values[key];
      else if (webhookUrl.trim()) patch[key] = webhookUrl.trim();
    }
    return patch;
  };

  const goTo = (target: number) => {
    setDirection(target >= index ? 1 : -1);
    setIndex(target);
    setReached((previous) => Math.max(previous, target));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.code === 'done') return window.location.assign('/login');
    if (error instanceof ApiError && error.code === 'token') return window.location.assign('/setup');
    if (error instanceof ApiError && error.field) {
      setErrors({ [error.field]: error.message });
      const target = stepOfField(error.field);
      if (target && target !== step.key) goTo(STEPS.findIndex((candidate) => candidate.key === target));
      return undefined;
    }
    return toast(errorMessage(error), { variant: 'error' });
  };

  const finish = async () => {
    setBusy(true);
    try {
      const done = await completeSetup({
        token: setup.token,
        account,
        settings: settingsFor(Object.values(STEP_SETTINGS).flat()),
        createToken,
      });
      setResult(done);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const next = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setErrors({});
    if (step.key === 'review') {
      await finish();
      return;
    }
    if (step.key === 'account' && !account.password) {
      setErrors({ password: 'Lege ein Passwort fest.' });
      return;
    }
    setBusy(true);
    try {
      if (step.key === 'account') await validateSetup({ token: setup.token, account });
      const keys = STEP_SETTINGS[step.key];
      if (keys) await validateSetup({ token: setup.token, settings: settingsFor(keys) });
      goTo(index + 1);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const testWebhook = async () => {
    try {
      await testSetupWebhook(setup.token, webhookUrl.trim());
      toast('Testnachricht gesendet. Schau in deinen Discord-Kanal.', { variant: 'success' });
    } catch (error) {
      fail(error);
    }
  };

  const content: Record<StepKey, ReactNode> = {
    welcome: <WelcomeStep checks={checks} />,
    account: <AccountStep account={account} onChange={setAccount} errors={errors} minLength={setup.passwordMinLength} />,
    site: <SiteStep values={values} set={set} errors={errors} />,
    home: <HomeStep values={values} set={set} errors={errors} />,
    uploads: <UploadsStep values={values} set={set} errors={errors} ffmpeg={ffmpeg} />,
    signin: <SignInStep values={values} set={set} errors={errors} />,
    notify: (
      <NotifyStep
        values={values}
        set={set}
        errors={errors}
        url={webhookUrl}
        onUrl={setWebhookUrl}
        stored={webhookStored}
        onTest={testWebhook}
      />
    ),
    review: (
      <ReviewStep
        values={values}
        username={account.username}
        webhookUrl={webhookUrl}
        createToken={createToken}
        onCreateToken={setCreateToken}
        onEdit={(key) => goTo(STEPS.findIndex((candidate) => candidate.key === key))}
      />
    ),
  };

  const submitLabel = step.key === 'welcome' ? 'Los geht’s' : step.key === 'review' ? 'MoeShare einrichten' : 'Weiter';

  return (
    <Box sx={{ position: 'relative', minHeight: '100dvh', overflow: 'hidden' }}>
      <AmbientBackdrop src={favicon || null} color={c.primary} strength={0.9} />
      <Box sx={{ position: 'fixed', top: 12, right: 12, zIndex: 2 }}>
        <ThemeToggleButton />
      </Box>
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 1040,
          mx: 'auto',
          px: { xs: 2, md: 3 },
          py: { xs: 2.5, md: 8 },
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '232px minmax(0, 1fr)' },
          gap: { xs: 2.5, md: 6 },
          alignItems: 'start',
        }}
      >
        <StepRail title={title} favicon={favicon} index={index} reached={reached} done={Boolean(result)} onSelect={goTo} />
        <MobileProgress title={title} favicon={favicon} index={index} done={Boolean(result)} />
        <Panel>
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            {result ? (
              <m.div key="done" custom={1} variants={stepMotion} initial="initial" animate="animate">
                <SetupDone result={result} siteTitle={title} homeEnabled={values['home.enabled'] === true} />
              </m.div>
            ) : (
              <m.form
                key={step.key}
                custom={direction}
                variants={stepMotion}
                initial="initial"
                animate="animate"
                exit="exit"
                onSubmit={next}
                noValidate
              >
                <Typography variant="h4" component="h1">
                  {step.title}
                </Typography>
                <Typography sx={{ color: 'text.secondary', mt: 1, maxWidth: '62ch' }}>{step.intro}</Typography>
                <Box sx={{ mt: 3.5 }}>{content[step.key]}</Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 4, pt: 3, borderTop: `1px solid ${c.outlineVariant}` }}>
                  {index > 0 && (
                    <Button onClick={() => goTo(index - 1)} disabled={busy} startIcon={<ArrowBackRounded />}>
                      Zurück
                    </Button>
                  )}
                  <Box sx={{ flex: 1 }} />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={busy || (step.key === 'welcome' && blocked)}
                    startIcon={
                      busy ? <CircularProgress size={18} color="inherit" /> : step.key === 'review' ? <RocketLaunchRounded /> : null
                    }
                  >
                    {submitLabel}
                  </Button>
                </Box>
              </m.form>
            )}
          </AnimatePresence>
        </Panel>
      </Box>
    </Box>
  );
}
