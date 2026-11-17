import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import InsightsRounded from '@mui/icons-material/InsightsRounded';
import ViewAgendaRounded from '@mui/icons-material/ViewAgendaRounded';
import ShortTextRounded from '@mui/icons-material/ShortTextRounded';
import type { LinkLayout, ProfileLink, ProfileSettings, SessionUser } from '../../lib/types';
import { ApiError, errorMessage, saveProfile } from '../../lib/api';
import { tn, t } from '../../lib/i18n';
import { formatNumber } from '../../lib/format';
import { CopyIconButton } from '../../components/CopyButton';
import { QrDialog } from '../../components/QrDialog';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import CodeRounded from '@mui/icons-material/CodeRounded';
import { ShareCodesDialog, type ShareTarget } from '../../components/ShareCodesDialog';
import { readBoot } from '../../lib/boot';
import { ProfileLinksEditor } from './ProfileLinksEditor';
import { SaveBar, SettingRow, SettingsSection, SwitchRow } from '../../components/SettingsKit';
import { AvatarButton, AvatarDialog, type AvatarLimits } from '../../components/AvatarEditor';
import { useToast } from '../../components/Toaster';
import { c, fonts, radius } from '../../theme/tokens';

type Editable = Pick<ProfileSettings, 'enabled' | 'name' | 'bio' | 'links' | 'linkLayout' | 'showAlbums' | 'showFiles' | 'contactCard'>;

const pick = (profile: ProfileSettings): Editable => ({
  enabled: profile.enabled,
  name: profile.name,
  bio: profile.bio,
  links: profile.links,
  linkLayout: profile.linkLayout,
  showAlbums: profile.showAlbums,
  showFiles: profile.showFiles,
  contactCard: profile.contactCard,
});

const filled = (link: ProfileLink) =>
  link.type === 'heading' ? Boolean(link.label.trim()) : Boolean(link.label.trim() || link.url.trim());

const countChanges = (a: Editable, b: Editable) =>
  (Object.keys(a) as Array<keyof Editable>).filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key])).length;

export function ProfileEditor({
  user,
  initial,
  avatar,
  avatars,
  onAvatar,
}: {
  user: SessionUser;
  initial: ProfileSettings;
  avatar: string | null;
  avatars: AvatarLimits & { enabled: boolean };
  onAvatar: (avatar: string | null) => void;
}) {
  const toast = useToast();
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [codes, setCodes] = useState<ShareTarget | null>(null);
  const [profile, setProfile] = useState(initial);
  const [icons, setIcons] = useState(initial.icons.items);
  const [draft, setDraft] = useState<Editable>(pick(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const saved = pick(profile);
  const dirty = countChanges(draft, saved);
  const urls = [profile.urls.profile, ...profile.urls.domains];

  const update = (patch: Partial<Editable>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors({});
  };

  const save = async () => {
    setBusy(true);
    try {
      const result = await saveProfile({ ...draft, links: draft.links.filter(filled) });
      setProfile(result.profile);
      setIcons(result.profile.icons.items);
      setDraft(pick(result.profile));
      toast(t('Profil gespeichert'), { variant: 'success' });
    } catch (failure) {
      if (failure instanceof ApiError && failure.field) {
        const field = /^links\.\d+\./.test(failure.field) ? failure.field : failure.field.startsWith('links') ? 'links' : failure.field;
        setErrors({ [field]: failure.message });
      }
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 920, pb: 6 }}>
      <Stack spacing={3.5}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2.5,
            p: { xs: 2.5, sm: 3 },
            borderRadius: `${radius.lg}px`,
            bgcolor: c.surfaceContainerLow,
            flexWrap: 'wrap',
          }}
        >
          <AvatarButton
            name={user.username}
            src={avatar}
            size={64}
            label={avatar ? t('Profilbild ändern') : t('Profilbild hinzufügen')}
            onClick={avatars.enabled ? () => setEditingAvatar(true) : undefined}
          />
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography variant="h6" component="h2">
              {draft.name || user.username}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {profile.enabled
                ? t('Deine Profilseite ist öffentlich.')
                : t('Deine Profilseite ist ausgeschaltet. Nur du siehst diese Einstellungen.')}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {tn(profile.counts.albums, '1 öffentliches Album', '{count} öffentliche Alben')},{' '}
              {tn(profile.counts.files, '1 Datei im Profil', '{count} Dateien im Profil')}
            </Typography>
          </Box>
          {profile.enabled && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {readBoot().site.frames && !profile.blocked && (
                <Button
                  startIcon={<CodeRounded />}
                  aria-haspopup="dialog"
                  onClick={() =>
                    setCodes({
                      kind: 'profile',
                      name: draft.name || user.username,
                      view: profile.urls.profile,
                      frame: `${new URL(profile.urls.profile).origin}/frame/u/${encodeURIComponent(user.username)}`,
                    })
                  }
                >
                  {t('Einbetten')}
                </Button>
              )}
              <Button
                variant="tonal"
                href={profile.urls.domains[0] || profile.urls.profile}
                target="_blank"
                rel="noopener"
                endIcon={<OpenInNewRounded />}
              >
                {t('Profil ansehen')}
              </Button>
            </Box>
          )}
          <ShareCodesDialog target={codes} onClose={() => setCodes(null)} />
        </Box>

        {profile.blocked && (
          <Alert severity="error">
            {t('Deine Profilseite wurde von der Moderation gesperrt und ist nicht öffentlich.')}
            {profile.blocked.reason ? ` ${t('Grund: {reason}', { reason: profile.blocked.reason })}` : ''}
          </Alert>
        )}

        <SettingsSection title={t('Sichtbarkeit')}>
          <SwitchRow
            id="profile-enabled"
            label={t('Profilseite einschalten')}
            description={t('Zeigt deinen Namen, deine Beschreibung, öffentliche Alben und ausgewählte Dateien.')}
            checked={draft.enabled}
            onChange={(enabled) => update({ enabled })}
          />
          <SwitchRow
            id="profile-albums"
            label={t('Öffentliche Alben zeigen')}
            description={t('Alben mit der Sichtbarkeit „Öffentlich“ erscheinen im Profil.')}
            checked={draft.showAlbums}
            onChange={(showAlbums) => update({ showAlbums })}
          />
          <SwitchRow
            id="profile-files"
            label={t('Ausgewählte Dateien zeigen')}
            description={t('Dateien, bei denen du „Im Profil zeigen“ einschaltest. Geschützte Dateien bleiben immer verborgen.')}
            checked={draft.showFiles}
            onChange={(showFiles) => update({ showFiles })}
          />
          <SwitchRow
            id="profile-contact"
            label={t('Kontakt speichern anbieten')}
            description={t(
              'Besucher speichern deinen Namen, dein Profilbild, deine Links, E-Mail-Adressen und Telefonnummern mit einem Klick als Kontakt im Handy.'
            )}
            checked={draft.contactCard}
            onChange={(contactCard) => update({ contactCard })}
          />
          <SettingRow label={t('Adresse')} description={t('Unter diesen Adressen ist dein Profil erreichbar.')} stacked>
            <Box sx={{ display: 'grid', gap: 1 }}>
              {urls.map((url) => (
                <Box
                  key={url}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    pl: 1.5,
                    pr: 0.5,
                    py: 0.5,
                    borderRadius: `${radius.tile}px`,
                    bgcolor: c.surfaceContainerHigh,
                  }}
                >
                  <Typography variant="body2" noWrap sx={{ flex: 1, fontFamily: fonts.mono, fontSize: '0.8125rem' }}>
                    {url}
                  </Typography>
                  <Tooltip title={t('QR-Code')}>
                    <IconButton size="small" aria-label={t('QR-Code')} onClick={() => setQr(url)}>
                      <QrCode2Rounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <CopyIconButton value={url} size="small" />
                </Box>
              ))}
            </Box>
            <QrDialog url={qr} title={draft.name || user.username} onClose={() => setQr(null)} />
          </SettingRow>
        </SettingsSection>

        <SettingsSection title={t('Über dich')}>
          <Box sx={{ display: 'grid', gap: 2, px: { xs: 2, sm: 3 }, py: 2.25 }}>
            <TextField
              label={t('Anzeigename')}
              placeholder={user.username}
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
              error={!!errors.name}
              helperText={errors.name}
              slotProps={{ htmlInput: { maxLength: 60 } }}
            />
            <TextField
              label={t('Beschreibung')}
              value={draft.bio}
              onChange={(event) => update({ bio: event.target.value })}
              multiline
              minRows={3}
              error={!!errors.bio}
              helperText={errors.bio || `${draft.bio.length} / 500`}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Box>
        </SettingsSection>

        <SettingsSection
          title={t('Links')}
          description={t(
            'Zu deiner Website, deinen Kanälen oder per E-Mail und Telefon. Mit Symbolen, Überschriften und auf Wunsch nur für eine bestimmte Zeit.'
          )}
        >
          <SettingRow
            label={t('Darstellung')}
            description={
              draft.linkLayout === 'list'
                ? t('Große Knöpfe untereinander, wie man es von Link-in-Bio-Seiten kennt.')
                : t('Kompakte Knöpfe nebeneinander unter deiner Beschreibung.')
            }
          >
            <ToggleButtonGroup
              exclusive
              size="small"
              value={draft.linkLayout}
              onChange={(_event, linkLayout: LinkLayout | null) => linkLayout && update({ linkLayout })}
              aria-label={t('Darstellung der Links')}
            >
              <ToggleButton value="list" sx={{ gap: 0.75 }}>
                <ViewAgendaRounded fontSize="small" />
                {t('Liste')}
              </ToggleButton>
              <ToggleButton value="row" sx={{ gap: 0.75 }}>
                <ShortTextRounded fontSize="small" />
                {t('Reihe')}
              </ToggleButton>
            </ToggleButtonGroup>
          </SettingRow>
          <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.25 }}>
            <ProfileLinksEditor
              links={draft.links}
              onChange={(links) => update({ links })}
              errors={errors}
              max={profile.maxLinks}
              icons={icons}
              customEnabled={profile.icons.enabled}
              maxCustom={profile.icons.max}
              maxIconBytes={avatars.maxBytes}
              onIconsChange={setIcons}
              clicks={profile.stats.enabled ? profile.stats.clicks : null}
            />
          </Box>
        </SettingsSection>

        {profile.stats.enabled && (
          <SettingsSection title={t('Statistik')}>
            <SettingRow
              icon={<InsightsRounded />}
              label={tn(profile.stats.views, '1 Aufruf in den letzten {days} Tagen', '{count} Aufrufe in den letzten {days} Tagen', {
                count: formatNumber(profile.stats.views),
                days: profile.stats.days,
              })}
              description={t(
                'Dazu {previews} Vorschauen in Discord, Telegram und Co. Klicks auf Links stehen direkt an den Links. Gezählt wird ohne IP-Adressen und Cookies, deine eigenen Aufrufe zählen nicht.',
                { previews: formatNumber(profile.stats.previews) }
              )}
            />
          </SettingsSection>
        )}
      </Stack>

      <SaveBar count={dirty} busy={busy} onSave={save} onReset={() => setDraft(saved)} />
      <AvatarDialog
        open={editingAvatar}
        onClose={() => setEditingAvatar(false)}
        name={user.username}
        current={avatar}
        limits={avatars}
        onSaved={onAvatar}
      />
    </Box>
  );
}
