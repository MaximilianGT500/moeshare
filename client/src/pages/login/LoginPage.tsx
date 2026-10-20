import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { readBoot } from '../../lib/boot';
import type { LoginBoot, MfaChallenge } from '../../lib/types';
import { AuthLayout, stepMotion } from './AuthLayout';
import { CredentialsStep } from './CredentialsStep';
import { SecondFactorStep } from './SecondFactorStep';
import { TokenStep } from './TokenStep';
import { RegisterForm } from './AccountForms';

type Step = 'credentials' | 'mfa' | 'token';

const ORDER: Step[] = ['credentials', 'token', 'mfa'];

export function LoginPage() {
  const boot = readBoot<LoginBoot>();
  const [step, setStep] = useState<Step>(boot.mfa ? 'mfa' : 'credentials');
  const [direction, setDirection] = useState(1);
  const [challenge, setChallenge] = useState<MfaChallenge | null>(boot.mfa || null);
  const [error, setError] = useState(boot.error || '');

  const go = (next: Step) => {
    setDirection(ORDER.indexOf(next) >= ORDER.indexOf(step) ? 1 : -1);
    setStep(next);
  };

  const finish = (redirect: string) => window.location.assign(redirect || '/dashboard');

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
          {step === 'credentials' && (
            <CredentialsStep
              site={boot.site}
              methods={boot.methods}
              next={boot.next}
              initialError={error}
              onMfa={(next) => {
                setChallenge(next);
                setError('');
                go('mfa');
              }}
              onToken={() => go('token')}
              onSuccess={finish}
            />
          )}
          {step === 'token' && (
            <TokenStep
              next={boot.next}
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
