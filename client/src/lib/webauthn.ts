import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
  WebAuthnError,
} from '@simplewebauthn/browser';
import { t } from './i18n';

export { startAuthentication, startRegistration, browserSupportsWebAuthnAutofill, WebAuthnAbortService };

interface PasskeySupport {
  ok: boolean;
  reason: string;
}

export function passkeySupport(expectedOrigin: string): PasskeySupport {
  if (!browserSupportsWebAuthn()) return { ok: false, reason: t('Dieser Browser unterstützt keine Passkeys.') };
  if (!window.isSecureContext) return { ok: false, reason: t('Passkeys funktionieren nur über HTTPS.') };
  if (expectedOrigin && window.location.origin !== expectedOrigin) {
    return {
      ok: false,
      reason: t('Passkeys funktionieren nur unter {expectedOrigin} (Basis-URL in den Einstellungen).', { expectedOrigin }),
    };
  }
  return { ok: true, reason: '' };
}

export function passkeyErrorMessage(error: unknown): string | null {
  if (error instanceof WebAuthnError) {
    switch (error.code) {
      case 'ERROR_CEREMONY_ABORTED':
        return null;
      case 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED':
        return t('Auf diesem Gerät ist schon ein Passkey für dein Konto gespeichert.');
      case 'ERROR_INVALID_DOMAIN':
      case 'ERROR_INVALID_RP_ID':
        return t('Die Adresse dieser Seite passt nicht zur Basis-URL in den Einstellungen.');
      case 'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT':
      case 'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT':
        return t('Dieser Sicherheitsschlüssel kann keine Passkeys speichern oder hat keine PIN.');
      default:
        break;
    }
  }
  if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) return null;
  if (error instanceof Error && error.message) return error.message;
  return t('Der Passkey hat nicht funktioniert. Versuche es erneut.');
}
