import { useState, type FormEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import TextField from '@mui/material/TextField';
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded';
import MarkEmailUnreadOutlined from '@mui/icons-material/MarkEmailUnreadOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import MoveToInboxOutlined from '@mui/icons-material/MoveToInboxOutlined';
import AddReactionOutlined from '@mui/icons-material/AddReactionOutlined';
import EventRepeatOutlined from '@mui/icons-material/EventRepeatOutlined';
import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import StorageOutlined from '@mui/icons-material/StorageOutlined';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import AutoDeleteOutlined from '@mui/icons-material/AutoDeleteOutlined';
import type { EmailState, NotifyKey, Preferences } from '../../lib/types';
import { readBoot } from '../../lib/boot';
import { ApiError, errorMessage, removeEmail, startEmailVerification } from '../../lib/api';
import { relativeMs } from '../../lib/format';
import { t } from '../../lib/i18n';
import { SettingRow, SettingsSection, SwitchRow } from '../../components/SettingsKit';
import { isCancelled, useSudo } from '../../components/Sudo';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';

export function EmailSection({
  initial,
  isAdmin,
  notify,
  busy: saving,
  onNotify,
}: {
  initial: EmailState;
  isAdmin: boolean;
  notify: Preferences['notify'];
  busy: boolean;
  onNotify: (next: Preferences['notify']) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const sudo = useSudo();
  const [state, setState] = useState<EmailState>(initial);
  const [editing, setEditing] = useState(!initial.email && !initial.pending);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (event?: FormEvent, address = value.trim()) => {
    event?.preventDefault();
    if (!address) return;
    setBusy(true);
    setError('');
    try {
      const result = await sudo(() => startEmailVerification(address));
      setState(result.email);
      setValue('');
      setEditing(false);
      toast(t('Wir haben dir einen Bestätigungslink an {email} geschickt.', { email: address }), { variant: 'success', duration: 6000 });
    } catch (failure) {
      if (isCancelled(failure)) return;
      if (failure instanceof ApiError && failure.field === 'email') setError(failure.message);
      else toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t('E-Mail-Adresse entfernen?'),
      message: t('Ohne Adresse kannst du dein Passwort nicht mehr selbst zurücksetzen und bekommst keine Hinweise mehr.'),
      confirmLabel: t('Entfernen'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await sudo(() => removeEmail());
      setState(result.email);
      setEditing(true);
      toast(t('E-Mail-Adresse entfernt'), { variant: 'success' });
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: NotifyKey, on: boolean) => onNotify({ ...notify, [key]: on });

  const description = state.email
    ? state.verifiedAt
      ? t('Bestätigt {when}', { when: relativeMs(state.verifiedAt) })
      : t('Noch nicht bestätigt')
    : t('Ohne Adresse kannst du dein Passwort nicht selbst zurücksetzen.');

  return (
    <SettingsSection
      id="email"
      title={t('E-Mail')}
      description={t('Für das Zurücksetzen deines Passworts und für Hinweise zu deinem Konto. Niemand sonst sieht die Adresse.')}
    >
      <SettingRow icon={<MailOutlineRounded />} label={state.email || t('Keine Adresse hinterlegt')} description={description}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {!editing && (
            <Button variant="tonal" onClick={() => setEditing(true)} disabled={busy}>
              {state.email ? t('Ändern') : t('Hinzufügen')}
            </Button>
          )}
          {state.email && (
            <Button color="error" onClick={remove} disabled={busy}>
              {t('Entfernen')}
            </Button>
          )}
        </Box>
      </SettingRow>

      {state.pending && (
        <SettingRow
          icon={<MarkEmailUnreadOutlined />}
          label={t('Bestätigung ausstehend für {email}', { email: state.pending.email })}
          description={t('Gesendet {when}. Öffne den Link in der E-Mail, um die Adresse zu übernehmen. Er gilt 24 Stunden.', {
            when: relativeMs(state.pending.sentAt),
          })}
        >
          <Button onClick={() => send(undefined, state.pending?.email)} disabled={busy}>
            {t('Erneut senden')}
          </Button>
        </SettingRow>
      )}

      <Collapse in={editing} unmountOnExit>
        <Box
          component="form"
          onSubmit={send}
          sx={{
            display: 'flex',
            gap: 1.5,
            alignItems: 'flex-start',
            flexWrap: { xs: 'wrap', sm: 'nowrap' },
            px: { xs: 2, sm: 3 },
            py: 2.25,
          }}
        >
          <TextField
            fullWidth
            size="small"
            type="email"
            label={state.email ? t('Neue E-Mail-Adresse') : t('E-Mail-Adresse')}
            autoComplete="email"
            value={value}
            error={!!error}
            helperText={error || t('Wir schicken einen Link an die Adresse. Erst danach wird sie übernommen.')}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError('');
            }}
          />
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            {(state.email || state.pending) && (
              <Button onClick={() => setEditing(false)} disabled={busy} sx={{ height: 40 }}>
                {t('Abbrechen')}
              </Button>
            )}
            <Button
              type="submit"
              variant="contained"
              disabled={busy || !value.trim()}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ height: 40 }}
            >
              {t('Link senden')}
            </Button>
          </Box>
        </Box>
      </Collapse>

      {state.email && state.verifiedAt && (
        <SwitchRow
          id="notify-security"
          icon={<ShieldOutlined />}
          label={t('Sicherheitshinweise')}
          description={t(
            'Eine E-Mail bei einer Anmeldung auf einem neuen Gerät und wenn sich dein Passwort, deine Zwei-Faktor-Anmeldung oder deine Passkeys ändern.'
          )}
          checked={notify.security}
          disabled={saving}
          onChange={(on) => toggle('security', on)}
        />
      )}
      {state.email && state.verifiedAt && isAdmin && (
        <SwitchRow
          id="notify-reports"
          icon={<FlagOutlined />}
          label={t('Neue Meldungen')}
          description={t('Eine E-Mail, wenn jemand Inhalte meldet.')}
          checked={notify.reports}
          disabled={saving}
          onChange={(on) => toggle('reports', on)}
        />
      )}
      {state.email && state.verifiedAt && isAdmin && (
        <SwitchRow
          id="notify-users"
          icon={<PersonAddAltOutlined />}
          label={t('Neue Benutzer')}
          description={t('Eine E-Mail, wenn sich jemand registriert oder eine Einladung annimmt.')}
          checked={notify.users}
          disabled={saving}
          onChange={(on) => toggle('users', on)}
        />
      )}
      {state.email && state.verifiedAt && isAdmin && (
        <SwitchRow
          id="notify-system"
          icon={<DnsOutlined />}
          label={t('Systemmeldungen')}
          description={t('Eine E-Mail, wenn ein Zertifikat bald abläuft, Caddy ein Problem meldet oder eine neue Version erscheint.')}
          checked={notify.system}
          disabled={saving}
          onChange={(on) => toggle('system', on)}
        />
      )}
      {state.email && state.verifiedAt && (
        <SwitchRow
          id="notify-requests"
          icon={<MoveToInboxOutlined />}
          label={t('Uploads über Datei-Anfragen')}
          description={t(
            'Eine E-Mail, wenn jemand über eine deiner Datei-Anfragen etwas hochlädt. Pro Anfrage schaltest du das extra ein.'
          )}
          checked={notify.requests}
          disabled={saving}
          onChange={(on) => toggle('requests', on)}
        />
      )}
      {state.email && state.verifiedAt && readBoot().site.reactions && (
        <SwitchRow
          id="notify-reactions"
          icon={<AddReactionOutlined />}
          label={t('Reaktionen auf deine Uploads')}
          description={t('Eine gesammelte E-Mail, wenn Besucher auf deine Dateien oder Alben reagiert haben, höchstens alle paar Minuten.')}
          checked={notify.reactions}
          disabled={saving}
          onChange={(on) => toggle('reactions', on)}
        />
      )}
      {state.email && state.verifiedAt && readBoot().site.comments && (
        <SwitchRow
          id="notify-comments"
          icon={<ChatBubbleOutlineRounded />}
          label={t('Kommentare zu deinen Uploads')}
          description={t('Eine gesammelte E-Mail, wenn jemand deine Dateien oder Alben kommentiert hat, höchstens alle paar Minuten.')}
          checked={notify.comments !== false}
          disabled={saving}
          onChange={(on) => toggle('comments', on)}
        />
      )}
      {state.email && state.verifiedAt && (
        <SwitchRow
          id="notify-memories"
          icon={<EventRepeatOutlined />}
          label={t('An diesem Tag')}
          description={t('Morgens eine E-Mail, wenn du am heutigen Tag in früheren Jahren etwas hochgeladen hast.')}
          checked={notify.memories}
          disabled={saving}
          onChange={(on) => toggle('memories', on)}
        />
      )}
      {state.email && state.verifiedAt && (
        <SwitchRow
          id="notify-digest"
          icon={<InsightsOutlined />}
          label={t('Wochenbericht')}
          description={t('Montags eine E-Mail mit deinen Uploads, Aufrufen und dem belegten Speicher der letzten Woche.')}
          checked={notify.digest}
          disabled={saving}
          onChange={(on) => toggle('digest', on)}
        />
      )}
      {state.email && state.verifiedAt && (
        <SwitchRow
          id="notify-quota"
          icon={<StorageOutlined />}
          label={t('Speicher fast voll')}
          description={t('Eine E-Mail, sobald dein Speicher zu 90 % belegt ist. Danach erst wieder, wenn du Platz geschaffen hast.')}
          checked={notify.quota}
          disabled={saving}
          onChange={(on) => toggle('quota', on)}
        />
      )}
      {state.email && state.verifiedAt && (
        <SwitchRow
          id="notify-expiring"
          icon={<TimerOutlined />}
          label={t('Dateien laufen bald ab')}
          description={t(
            'Eine E-Mail einen Tag bevor Uploads mit Ablaufdatum gelöscht werden. Gilt für Dateien, die länger als drei Tage online sind.'
          )}
          checked={notify.expiring}
          disabled={saving}
          onChange={(on) => toggle('expiring', on)}
        />
      )}
      {state.email && state.verifiedAt && readBoot().site.retention && (
        <SwitchRow
          id="notify-retention"
          icon={<AutoDeleteOutlined />}
          label={t('Unbenutzte Dateien')}
          description={t(
            'Eine E-Mail, wenn Dateien lange nicht aufgerufen wurden und deshalb bald in den Papierkorb wandern. So kannst du sie vorher behalten.'
          )}
          checked={notify.retention !== false}
          disabled={saving}
          onChange={(on) => toggle('retention', on)}
        />
      )}
    </SettingsSection>
  );
}
