import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import type { ProfileSettings, SessionUser, SiteLink } from '../../lib/types';
import { ApiError, errorMessage, saveProfile } from '../../lib/api';
import { tn, t } from '../../lib/i18n';
import { CopyIconButton } from '../../components/CopyButton';
import { LinkListEditor } from '../../components/LinkListEditor';
import { SaveBar, SettingRow, SettingsSection, SwitchRow } from '../../components/SettingsKit';
import { UserAvatar } from '../../components/UserAvatar';
import { useToast } from '../../components/Toaster';
import { c, fonts, radius } from '../../theme/tokens';

type Editable = Pick<ProfileSettings, 'enabled' | 'name' | 'bio' | 'links' | 'showAlbums' | 'showFiles'>;

const pick = (profile: ProfileSettings): Editable => ({
  enabled: profile.enabled,
  name: profile.name,
  bio: profile.bio,
  links: profile.links,
  showAlbums: profile.showAlbums,
  showFiles: profile.showFiles,
});

const countChanges = (a: Editable, b: Editable) =>
  (Object.keys(a) as Array<keyof Editable>).filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key])).length;

export function ProfileEditor({ user, initial }: { user: SessionUser; initial: ProfileSettings }) {
  const toast = useToast();
  const [profile, setProfile] = useState(initial);
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
      const cleanLinks = draft.links.filter((link: SiteLink) => link.label.trim() || link.url.trim());
      const result = await saveProfile({ ...draft, links: cleanLinks });
      setProfile(result.profile);
      setDraft(pick(result.profile));
      toast(t('Profil gespeichert'), { variant: 'success' });
    } catch (failure) {
      if (failure instanceof ApiError && failure.field)
        setErrors({ [failure.field.startsWith('links') ? 'links' : failure.field]: failure.message });
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
          <UserAvatar name={user.username} size={64} />
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
            <Button
              variant="tonal"
              href={profile.urls.domains[0] || profile.urls.profile}
              target="_blank"
              rel="noopener"
              endIcon={<OpenInNewRounded />}
            >
              {t('Profil ansehen')}
            </Button>
          )}
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
                  <CopyIconButton value={url} size="small" />
                </Box>
              ))}
            </Box>
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

        <SettingsSection title={t('Links')} description={t('Zum Beispiel zu deiner Website, deinem Portfolio oder deinen Kanälen.')}>
          <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.25 }}>
            <LinkListEditor links={draft.links} onChange={(links) => update({ links })} error={errors.links} max={6} />
          </Box>
        </SettingsSection>
      </Stack>

      <SaveBar count={dirty} busy={busy} onSave={save} onReset={() => setDraft(saved)} />
    </Box>
  );
}
