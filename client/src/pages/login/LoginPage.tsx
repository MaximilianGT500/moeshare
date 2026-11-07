import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { readBoot } from '../../lib/boot';
import type { LoginBoot, MfaChallenge } from '../../lib/types';
import { AuthLayout, stepMotion } from './AuthLayout';
import { CredentialsStep } from './CredentialsStep';
import { SecondFactorStep } from './SecondFactorStep';
import { TokenStep } from './TokenStep';
import { RegisterForm } from './AccountForms';
import { ForgotStep, ResetForm } from './ResetSteps';
import { EmailLinkStep, LinkStep } from './LinkSteps';

type Step = 'link' | 'credentials' | 'forgot' | 'email' | 'mfa' | 'token';

const ORDER: Step[] = ['link', 'credentials', 'forgot', 'email', 'token', 'mfa'];

function firstStep(boot: LoginBoot): Step {
  if (boot.mfa) return 'mfa';
  if (boot.mode === 'link' && boot.link) return 'link';
  if (window.location.hash === '#vergessen' && boot.methods.reset) return 'forgot';
  if (window.location.hash === '#link' && boot.methods.emailLink) return 'email';
  return 'credentials';
}

const clearHash = () => {
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
};

export function LoginPage() {
  const boot = readBoot<LoginBoot>();
  const [step, setStep] = useState<Step>(() => firstStep(boot));
  const [direction, setDirection] = useState(1);
  const [challenge, setChallenge] = useState<MfaChallenge | null>(boot.mfa || null);
  const [error, setError] = useState(boot.error || '');

  const go = (next: Step) => {
    setDirection(ORDER.indexOf(next) >= ORDER.indexOf(step) ? 1 : -1);
    setStep(next);
  };

  const finish = (redirect: string) => window.location.assign(redirect || '/dashboard');

  if (boot.mode === 'reset' && boot.reset) {
    return (
      <AuthLayout site={boot.site}>
        <ResetForm reset={boot.reset} canRequest={!!boot.methods.reset} />
      </AuthLayout>
    );
  }

  if (boot.mode === 'register' && boot.registration) {
    return (
      <AuthLayout site={boot.site} wide>
        <RegisterForm boot={boot} onSuccess={finish} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout site={boot.site}>
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <m.div key={step} custom={direction} variants={stepMotion} initial="initial" animate="animate" exit="exit">
          {step === 'link' && boot.link && (
            <LinkStep
              link={boot.link}
              canRequest={!!boot.methods.emailLink}
              onMfa={(next) => {
                setChallenge(next);
                setError('');
                go('mfa');
              }}
              onSuccess={finish}
            />
          )}
          {step === 'credentials' && (
            <CredentialsStep
              site={boot.site}
              methods={boot.methods}
              next={boot.next}
              initialError={error}
              notice={boot.notice}
              onForgot={
                boot.methods.reset
                  ? () => {
                      setError('');
                      go('forgot');
                    }
                  : undefined
              }
              onMfa={(next) => {
                setChallenge(next);
                setError('');
                go('mfa');
              }}
              onToken={() => go('token')}
              onEmailLink={
                boot.methods.emailLink
                  ? () => {
                      setError('');
                      go('email');
                    }
                  : undefined
              }
              onSuccess={finish}
            />
          )}
          {step === 'forgot' && (
            <ForgotStep
              onBack={() => {
                clearHash();
                go('credentials');
              }}
            />
          )}
          {step === 'email' && (
            <EmailLinkStep
              onBack={() => {
                clearHash();
                go('credentials');
              }}
            />
          )}
          {step === 'token' && (
            <TokenStep
              next={boot.next}
              passwordless={!boot.methods.password}
              onBack={() => go('credentials')}
              onMfa={(next) => {
                setChallenge(next);
                go('mfa');
              }}
              onSuccess={finish}
            />
          )}
          {step === 'mfa' && challenge && (
            <SecondFactorStep
              challenge={challenge}
              passkeyOrigin={boot.methods.passkeyOrigin}
              onBack={() => {
                setError('');
                go('credentials');
              }}
              onExpired={(message) => {
                setError(message);
                go('credentials');
              }}
              onSuccess={finish}
            />
          )}
        </m.div>
      </AnimatePresence>
    </AuthLayout>
  );
}
