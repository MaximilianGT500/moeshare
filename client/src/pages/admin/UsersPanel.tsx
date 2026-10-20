import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import PersonAddRounded from '@mui/icons-material/PersonAddRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import type { AdminUser } from '../../lib/types';
import { listUsers } from '../../lib/api';
import { useDebouncedValue } from '../../lib/hooks';
import { formatBytes, plural, relativeMs } from '../../lib/format';
import { SearchField } from '../../components/SearchField';
import { UserAvatar } from '../../components/UserAvatar';
import { useToast } from '../../components/Toaster';
import { CreateUserDialog, CredentialsDialog } from './CreateUserDialog';
import { UserSheet } from './UserSheet';
import { RoleChip, SecurityBadges, StatusChip } from './userBits';
import { c, ease, radius, srOnly } from '../../theme/tokens';

type Filter = 'all' | 'admin' | 'suspended' | 'no2fa';
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Alle' },
  { key: 'admin', label: 'Admins' },
  { key: 'suspended', label: 'Gesperrt' },
  { key: 'no2fa', label: 'Ohne 2FA' },
];

const matches = (user: AdminUser, filter: Filter) =>
  filter === 'all' ||
  (filter === 'admin' && user.role === 'admin') ||
  (filter === 'suspended' && user.status === 'suspended') ||
  (filter === 'no2fa' && !user.totp);

function UsageBar({ user, max }: { user: AdminUser; max: number }) {
  const limit = user.effectiveQuotaBytes;
  const share = limit ? Math.min(1, user.storageBytes / limit) : max > 0 ? user.storageBytes / max : 0;
  const color = limit && share >= 0.95 ? c.error : limit && share >= 0.8 ? c.warning : c.primary;
  return (
    <Box sx={{ minWidth: 150 }}>
      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatBytes(user.storageBytes)}
        <Box component="span" sx={{ color: 'text.secondary' }}>
          {limit ? ` von ${formatBytes(limit)}` : ''}
        </Box>
      </Typography>
      <Box sx={{ height: 4, mt: 0.75, borderRadius: `${radius.full}px`, bgcolor: c.surfaceContainerHighest, overflow: 'hidden' }}>
        <m.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: share }}
          transition={{ duration: 0.8, ease: ease.emphasizedDecelerate, delay: 0.15 }}
          style={{ height: '100%', width: '100%', transformOrigin: 'left', background: color, borderRadius: 999, opacity: limit ? 1 : 0.6 }}
        />
      </Box>
    </Box>
  );
}

export function UsersPanel({
  initial,
  currentUser,
  onChanged,
  minPasswordLength,
  defaults,
  baseUrl,
  siteTitle,
}: {
  initial: AdminUser[];
  currentUser: string;
  onChanged: () => void;
  minPasswordLength: number;
  defaults: { quotaBytes: number | null; maxFileBytes: number | null };
  baseUrl: string;
  siteTitle: string;
}) {
  const toast = useToast();
  const phone = useMediaQuery('(max-width:899.95px)', { noSsr: true });
  const [users, setUsers] = useState(initial);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const search = useDebouncedValue(query.trim(), 250);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const first = useRef(true);

  const refresh = useCallback(
    async (term: string) => {
      setBusy(true);
      try {
        setUsers((await listUsers(term)).users);
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Benutzer konnten nicht geladen werden.', { variant: 'error' });
      } finally {
        setBusy(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    refresh(search);
  }, [search, refresh]);

  const visible = useMemo(() => users.filter((u) => matches(u, filter)), [users, filter]);
  const maxStorage = useMemo(() => Math.max(0, ...users.map((u) => u.storageBytes)), [users]);

  const onSheetChange = useCallback(
    (user: AdminUser | null) => {
      if (user) setUsers((list) => list.map((u) => (u.id === user.id ? user : u)));
      else {
        refresh(search);
        onChanged();
      }
    },
    [refresh, search, onChanged]
  );

  const nameCell = (user: AdminUser) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
      <UserAvatar name={user.username} size={36} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {user.username}
          {user.username === currentUser && (
            <Box
              component="span"
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                px: 0.75,
                py: 0.125,
                borderRadius: `${radius.xs}px`,
                bgcolor: c.secondaryContainer,
                color: c.onSecondaryContainer,
              }}
            >
              Du
            </Box>
          )}
          <SecurityBadges user={user} />
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {user.lastLoginAt ? `Zuletzt ${relativeMs(user.lastLoginAt)}` : 'Noch nie angemeldet'}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 260px', maxWidth: 380 }}>
          <SearchField value={query} onChange={setQuery} placeholder="Benutzer suchen" busy={busy} dense />
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }} role="group" aria-label="Filter">
          {FILTERS.map((f) => {
            const count = users.filter((u) => matches(u, f.key)).length;
            if (f.key !== 'all' && count === 0 && filter !== f.key) return null;
            return (
              <Chip
                key={f.key}
                label={`${f.label} ${count}`}
                onClick={() => setFilter(f.key)}
                variant={filter === f.key ? 'filled' : 'outlined'}
                aria-pressed={filter === f.key}
                sx={filter === f.key ? { bgcolor: c.secondaryContainer, color: c.onSecondaryContainer } : undefined}
              />
            );
          })}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<PersonAddRounded />} onClick={() => setCreating(true)}>
          Benutzer anlegen
        </Button>
      </Box>

      {visible.length === 0 ? (
        <Typography sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
          {search ? `Kein Benutzer passt zu „${search}“.` : 'Keine Benutzer in diesem Filter.'}
        </Typography>
      ) : phone ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {visible.map((user, i) => (
            <m.div
              key={user.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.03 }}
            >
              <ButtonBase
                onClick={() => setOpen(user.id)}
                sx={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  p: 2,
                  borderRadius: `${radius.md}px`,
                  bgcolor: c.surfaceContainerLow,
                }}
                aria-label={`${user.username} bearbeiten`}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>{nameCell(user)}</Box>
                  <RoleChip role={user.role} />
                </Box>
                <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <UsageBar user={user} max={maxStorage} />
                  </Box>
                  {user.status === 'suspended' && <StatusChip user={user} />}
                </Box>
              </ButtonBase>
            </m.div>
          ))}
        </Box>
      ) : (
        <Box sx={{ borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainerLow, overflow: 'hidden' }}>
          <Table aria-label="Benutzer">
            <TableHead>
              <TableRow>
                <TableCell>Benutzer</TableCell>
                <TableCell>Rolle</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Speicher</TableCell>
                <TableCell align="right">Dateien</TableCell>
                <TableCell align="right">
                  <Box component="span" sx={srOnly}>
                    Öffnen
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((user, i) => (
                <TableRow
                  key={user.id}
                  hover
                  component={m.tr}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.03, duration: 0.35, ease: ease.emphasizedDecelerate }}
                  onClick={() => setOpen(user.id)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{nameCell(user)}</TableCell>
                  <TableCell>
                    <RoleChip role={user.role} />
                  </TableCell>
                  <TableCell>
                    <StatusChip user={user} />
                  </TableCell>
                  <TableCell>
                    <UsageBar user={user} max={maxStorage} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {user.files}
                  </TableCell>
                  <TableCell align="right" padding="checkbox">
                    <Button
                      size="small"
                      endIcon={<ChevronRightRounded />}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpen(user.id);
                      }}
                      aria-label={`${user.username} bearbeiten`}
                    >
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1.5 }}>
        {plural(users.length, 'Benutzer', 'Benutzer')}, davon {plural(users.filter((u) => u.totp).length, 'mit', 'mit')}{' '}
        Zwei-Faktor-Anmeldung
      </Typography>

      <UserSheet
        userId={open}
        currentUser={currentUser}
        onClose={() => setOpen(null)}
        onChanged={onSheetChange}
        defaults={defaults}
        baseUrl={baseUrl}
        siteTitle={siteTitle}
      />
      <CreateUserDialog
        open={creating}
        onClose={() => setCreating(false)}
        minPasswordLength={minPasswordLength}
        defaults={defaults}
        onCreated={(user, password) => {
          setCreating(false);
          setUsers((list) => [...list, user]);
          onChanged();
          if (password) setCredentials({ username: user.username, password });
          else toast(`${user.username} wurde angelegt`, { variant: 'success' });
        }}
      />
      <CredentialsDialog data={credentials} onClose={() => setCredentials(null)} baseUrl={baseUrl} />
    </Box>
  );
}
