import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';
import SearchRounded from '@mui/icons-material/SearchRounded';
import PhotoLibraryRounded from '@mui/icons-material/PhotoLibraryRounded';
import CollectionsRounded from '@mui/icons-material/CollectionsRounded';
import LinkRounded from '@mui/icons-material/LinkRounded';
import MoveToInboxRounded from '@mui/icons-material/MoveToInboxRounded';
import InsightsRounded from '@mui/icons-material/InsightsRounded';
import CleaningServicesRounded from '@mui/icons-material/CleaningServicesRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import BrushRounded from '@mui/icons-material/BrushRounded';
import ShieldRounded from '@mui/icons-material/ShieldRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import TerminalRounded from '@mui/icons-material/TerminalRounded';
import AdminPanelSettingsRounded from '@mui/icons-material/AdminPanelSettingsRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import NoteAddRounded from '@mui/icons-material/NoteAddRounded';
import AddLinkRounded from '@mui/icons-material/AddLinkRounded';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import KeyboardReturnRounded from '@mui/icons-material/KeyboardReturnRounded';
import type { FileItem, SessionUser } from '../lib/types';
import { listFiles } from '../lib/api';
import { formatBytes, relativeMs } from '../lib/format';
import { onPaletteOpen, usePageCommands, type PaletteCommand, type PaletteGroup } from '../lib/palette';
import { useDebouncedValue } from '../lib/hooks';
import { fileIcon } from './FileIcons';
import { mix } from '../lib/color';
import { t } from '../lib/i18n';
import { c, fonts, radius } from '../theme/tokens';

interface Entry {
  id: string;
  group: PaletteGroup | 'files';
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

export function go(href: string) {
  const target = new URL(href, window.location.origin);
  if (target.pathname === window.location.pathname && target.search === window.location.search) {
    window.location.hash = target.hash;
    if (!target.hash) window.history.replaceState(null, '', `${target.pathname}${target.search}`);
    return;
  }
  window.location.assign(target.href);
}

const ADMIN_TABS: Array<[string, string]> = [
  ['benutzer', 'konten rollen sperren'],
  ['einladungen', 'invite registrierung'],
  ['zugaenge', 'einmal-link integration'],
  ['dateien', 'moderation'],
  ['meldungen', 'report moderation'],
  ['startseite', 'homepage'],
  ['hinweise', 'ankündigung wartungsmodus'],
  ['einstellungen', 'konfiguration smtp speicher'],
  ['aktivitaet', 'protokoll audit log'],
  ['caddy', 'zertifikate https proxy'],
  ['system', 'update backup version'],
];

const ADMIN_LABELS: Record<string, string> = {
  benutzer: t('Admin: Benutzer'),
  einladungen: t('Admin: Einladungen'),
  zugaenge: t('Admin: Zugänge'),
  dateien: t('Admin: Alle Dateien'),
  meldungen: t('Admin: Meldungen'),
  startseite: t('Admin: Startseite'),
  hinweise: t('Admin: Hinweise und Wartung'),
  einstellungen: t('Admin: Einstellungen'),
  aktivitaet: t('Admin: Aktivität'),
  caddy: t('Admin: Caddy'),
  system: t('Admin: System'),
};

function useGlobalCommands(user: SessionUser): PaletteCommand[] {
  const { mode, systemMode, setMode } = useColorScheme();
  const dark = (mode === 'system' ? systemMode : mode) !== 'light';
  return useMemo(() => {
    const features = user.features;
    const on = (key: keyof NonNullable<SessionUser['features']>) => !features || features[key];
    const list: Array<PaletteCommand | false> = [
      {
        id: 'upload',
        group: 'actions',
        label: t('Dateien hochladen'),
        icon: <CloudUploadRounded />,
        keywords: 'upload',
        run: () => go('/dashboard?aktion=hochladen'),
      },
      on('texts') && {
        id: 'text',
        group: 'actions',
        label: t('Neuer Text'),
        icon: <NoteAddRounded />,
        keywords: 'paste code notiz',
        run: () => go('/dashboard?aktion=text'),
      },
      on('links') && {
        id: 'link',
        group: 'actions',
        label: t('Link kürzen'),
        icon: <AddLinkRounded />,
        keywords: 'kurzlink url',
        run: () => go('/dashboard?aktion=link'),
      },
      {
        id: 'theme',
        group: 'actions',
        label: dark ? t('Zum hellen Design wechseln') : t('Zum dunklen Design wechseln'),
        icon: dark ? <LightModeRounded /> : <DarkModeRounded />,
        keywords: 'hell dunkel theme farben',
        run: () => setMode(dark ? 'light' : 'dark'),
      },
      {
        id: 'logout',
        group: 'actions',
        label: t('Abmelden'),
        icon: <LogoutRounded />,
        keywords: 'logout',
        run: () => window.location.assign('/logout'),
      },
      {
        id: 'goto-files',
        group: 'goto',
        label: t('Dateien'),
        icon: <PhotoLibraryRounded />,
        keywords: 'übersicht galerie uploads',
        run: () => go('/dashboard'),
      },
      on('albums') && {
        id: 'goto-albums',
        group: 'goto',
        label: t('Alben'),
        icon: <CollectionsRounded />,
        run: () => go('/dashboard#alben'),
      },
      on('links') && {
        id: 'goto-links',
        group: 'goto',
        label: t('Links'),
        icon: <LinkRounded />,
        keywords: 'kurzlinks',
        run: () => go('/dashboard#links'),
      },
      on('requests') && {
        id: 'goto-requests',
        group: 'goto',
        label: t('Datei-Anfragen'),
        icon: <MoveToInboxRounded />,
        keywords: 'anfragen sammeln',
        run: () => go('/dashboard#anfragen'),
      },
      on('stats') && {
        id: 'goto-stats',
        group: 'goto',
        label: t('Statistik'),
        icon: <InsightsRounded />,
        keywords: 'aufrufe zahlen',
        run: () => go('/dashboard#statistik'),
      },
      {
        id: 'goto-cleanup',
        group: 'goto',
        label: t('Aufräumen'),
        icon: <CleaningServicesRounded />,
        keywords: 'speicher platz groß alt löschen',
        run: () => go('/dashboard#aufraeumen'),
      },
      on('trash') && {
        id: 'goto-trash',
        group: 'goto',
        label: t('Papierkorb'),
        icon: <DeleteOutlineRounded />,
        keywords: 'gelöscht wiederherstellen',
        run: () => go('/dashboard#papierkorb'),
      },
      (user.canDesign || user.canCustomizeEmbed) && {
        id: 'goto-design',
        group: 'goto',
        label: t('Gestalten'),
        icon: <BrushRounded />,
        keywords: 'design embed profil wasserzeichen',
        run: () => go('/design'),
      },
      {
        id: 'goto-security',
        group: 'goto',
        label: t('Konto: Sicherheit'),
        icon: <ShieldRounded />,
        keywords: 'passwort passkey zwei-faktor 2fa',
        run: () => go('/account#sicherheit'),
      },
      {
        id: 'goto-settings',
        group: 'goto',
        label: t('Konto: Einstellungen'),
        icon: <TuneRounded />,
        keywords: 'sprache e-mail push benachrichtigungen',
        run: () => go('/account#einstellungen'),
      },
      {
        id: 'goto-devices',
        group: 'goto',
        label: t('Konto: Geräte'),
        icon: <DevicesRounded />,
        keywords: 'sitzungen abmelden',
        run: () => go('/account#geraete'),
      },
      {
        id: 'goto-sharex',
        group: 'goto',
        label: t('ShareX und API'),
        icon: <TerminalRounded />,
        keywords: 'token api client',
        run: () => go('/account#sharex'),
      },
      ...(user.isAdmin
        ? ADMIN_TABS.map(([key, keywords]) => ({
            id: `goto-admin-${key}`,
            group: 'goto' as const,
            label: ADMIN_LABELS[key],
            icon: <AdminPanelSettingsRounded />,
            keywords: `admin ${keywords}`,
            run: () => go(`/admin#${key}`),
          }))
        : []),
    ];
    return list.filter(Boolean) as PaletteCommand[];
  }, [user, dark, setMode]);
}

function matches(query: string, command: PaletteCommand) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const label = fold(command.label);
  const haystack = `${label} ${fold(command.keywords || '')}`;
  if (!words.every((word) => haystack.includes(word))) return null;
  return label.startsWith(words[0] || '') ? 0 : label.includes(words[0] || '') ? 1 : 2;
}

const fileLabel = (file: FileItem) => file.title || file.originalName || file.filename;

function Kbd({ children }: { children: ReactNode }) {
  return (
    <Box
      component="kbd"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        minWidth: 22,
        height: 22,
        px: 0.75,
        borderRadius: `${radius.xs}px`,
        border: `1px solid ${c.outlineVariant}`,
        fontFamily: fonts.mono,
        fontSize: '0.6875rem',
        color: c.onSurfaceVariant,
      }}
    >
      {children}
    </Box>
  );
}

export function CommandPalette({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [files, setFiles] = useState<FileItem[]>([]);
  const list = useRef<HTMLDivElement>(null);
  const page = usePageCommands();
  const global = useGlobalCommands(user);
  const search = useDebouncedValue(query.trim(), 180);

  useEffect(() => onPaletteOpen(() => setOpen(true)), []);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setFiles([]);
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || search.length < 2) {
      setFiles([]);
      return;
    }
    let alive = true;
    listFiles({ page: 1, limit: 6, search, type: '', sort: 'newest' })
      .then((result) => alive && setFiles(result.files))
      .catch(() => alive && setFiles([]));
    return () => {
      alive = false;
    };
  }, [open, search]);

  const entries = useMemo(() => {
    const ids = new Set(page.map((command) => command.id));
    const commands = [...page, ...global.filter((command) => !ids.has(command.id))];
    const ranked = query.trim()
      ? commands
          .map((command, index) => ({ command, rank: matches(query, command), index }))
          .filter((item): item is { command: PaletteCommand; rank: number; index: number } => item.rank !== null)
          .sort((a, b) => a.rank - b.rank || a.index - b.index)
          .map((item) => item.command)
      : commands;
    const result: Entry[] = [
      ...ranked.filter((command) => command.group === 'actions'),
      ...ranked.filter((command) => command.group === 'goto'),
    ];
    if (query.trim().length >= 2) {
      for (const file of files) {
        result.push({
          id: `file-${file.id}`,
          group: 'files',
          label: fileLabel(file),
          hint: `${formatBytes(file.sizeBytes)}${file.createdAt ? `, ${relativeMs(file.createdAt)}` : ''}`,
          icon: fileIcon(file.filename, file.type),
          run: () => window.open(file.urls.view, '_blank', 'noopener'),
        });
      }
    }
    return result;
  }, [page, global, query, files]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (active >= entries.length) setActive(Math.max(0, entries.length - 1));
  }, [entries.length, active]);

  useEffect(() => {
    const node = list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (entry: Entry | undefined) => {
    if (!entry) return;
    setOpen(false);
    window.setTimeout(entry.run, 0);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (entries.length ? (current + 1) % entries.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (entries.length ? (current - 1 + entries.length) % entries.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(entries[active]);
    }
  };

  const headings: Record<Entry['group'], string> = { actions: t('Aktionen'), goto: t('Wechseln zu'), files: t('Dateien') };

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { 'aria-label': t('Befehle') } }}
      sx={{
        '& .MuiDialog-container': { alignItems: 'flex-start' },
        '& .MuiDialog-paper': {
          mt: { xs: 2, sm: '11vh' },
          mx: { xs: 1.5, sm: 4 },
          width: { xs: 'calc(100% - 24px)', sm: undefined },
          overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, height: 60, borderBottom: `1px solid ${c.outlineVariant}` }}>
        <SearchRounded sx={{ color: c.onSurfaceVariant }} />
        <InputBase
          autoFocus
          fullWidth
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('Befehl, Bereich oder Datei suchen')}
          slotProps={{
            input: {
              role: 'combobox',
              'aria-expanded': true,
              'aria-controls': 'palette-list',
              'aria-autocomplete': 'list',
              'aria-activedescendant': entries[active] ? `palette-${entries[active].id}` : undefined,
              'aria-label': t('Befehl, Bereich oder Datei suchen'),
            },
          }}
          sx={{ fontSize: '1.0625rem' }}
        />
        <Kbd>Esc</Kbd>
      </Box>
      <Box ref={list} id="palette-list" role="listbox" sx={{ maxHeight: { xs: '62vh', sm: '56vh' }, overflowY: 'auto', py: 1 }}>
        {entries.length === 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 5 }}>
            {search.length >= 2 ? t('Nichts gefunden für „{query}“', { query: search }) : t('Nichts gefunden')}
          </Typography>
        )}
        {entries.map((entry, index) => {
          const first = index === 0 || entries[index - 1].group !== entry.group;
          const selected = index === active;
          return (
            <Box key={entry.id}>
              {first && (
                <Typography
                  variant="caption"
                  component="div"
                  sx={{ px: 2.5, pt: index ? 1.5 : 0.5, pb: 0.5, color: 'text.secondary', fontWeight: 700 }}
                >
                  {headings[entry.group]}
                </Typography>
              )}
              <Box
                id={`palette-${entry.id}`}
                role="option"
                aria-selected={selected}
                data-index={index}
                onMouseMove={() => !selected && setActive(index)}
                onClick={() => run(entry)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.75,
                  mx: 1,
                  px: 1.5,
                  minHeight: 44,
                  borderRadius: `${radius.sm}px`,
                  cursor: 'pointer',
                  bgcolor: selected ? c.secondaryContainer : 'transparent',
                  color: selected ? c.onSecondaryContainer : c.onSurface,
                  '& > svg, & .palette-icon svg': { fontSize: 20 },
                }}
              >
                <Box className="palette-icon" sx={{ display: 'flex', color: selected ? 'inherit' : c.onSurfaceVariant }} aria-hidden>
                  {entry.icon}
                </Box>
                <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, fontWeight: selected ? 700 : 500 }}>
                  {entry.label}
                </Typography>
                {entry.hint && (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{ color: selected ? 'inherit' : 'text.secondary', opacity: 0.85, maxWidth: '45%' }}
                  >
                    {entry.hint}
                  </Typography>
                )}
                {selected && <KeyboardReturnRounded sx={{ fontSize: 16, opacity: 0.7 }} aria-hidden />}
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box
        sx={{
          display: { xs: 'none', sm: 'flex' },
          alignItems: 'center',
          gap: 2,
          px: 2.5,
          py: 1.25,
          borderTop: `1px solid ${c.outlineVariant}`,
          bgcolor: mix(c.surfaceContainerHigh, 60),
          color: 'text.secondary',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <Typography variant="caption">{t('auswählen')}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Kbd>↵</Kbd>
          <Typography variant="caption">{t('ausführen')}</Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption">{t('Dateien findest du ab zwei Buchstaben')}</Typography>
      </Box>
    </Dialog>
  );
}
