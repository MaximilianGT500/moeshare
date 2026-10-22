import { useEffect, useRef, useState } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DeleteForeverRounded from '@mui/icons-material/DeleteForeverRounded';
import RestoreFromTrashRounded from '@mui/icons-material/RestoreFromTrashRounded';
import type { FileItem, FileListResponse } from '../../lib/types';
import { deleteAnyFile, errorMessage, listAllFiles, purgeAnyFile, restoreAnyFile } from '../../lib/api';
import { useDebouncedValue } from '../../lib/hooks';
import { formatBytes, formatDateTime, formatNumber, parseServerDate, relativeFromServer, relativeMs } from '../../lib/format';
import { meaningfulColor, mix } from '../../lib/color';
import { SearchField } from '../../components/SearchField';
import { UserAvatar } from '../../components/UserAvatar';
import { fileIcon, typeDescription } from '../../components/FileIcons';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { c, ease, fonts, radius, srOnly } from '../../theme/tokens';
import { t, tn } from '../../lib/i18n';

function Thumb({ file, size = 44 }: { file: FileItem; size?: number }) {
  const [failed, setFailed] = useState(false);
  const visual = (file.type === 'image' || file.type === 'video') && !failed;
  const color = meaningfulColor(file.color);
  return (
    <Box
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: `${radius.sm}px`,
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        bgcolor: color ? mix(color, 30) : c.surfaceContainerHighest,
        color: c.onSurfaceVariant,
        '& svg': { fontSize: 20 },
      }}
    >
      {visual ? (
        <Box
          component="img"
          src={file.isGif ? file.urls.direct : file.urls.preview}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        fileIcon(file.filename, file.type)
      )}
    </Box>
  );
}

export function FilesPanel({
  initial,
  onChanged,
  onTotal,
  trashEnabled = false,
}: {
  initial: FileListResponse;
  onChanged: () => void;
  onTotal?: (total: number) => void;
  trashEnabled?: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const phone = useMediaQuery('(max-width:899.95px)', { noSsr: true });
  const [data, setData] = useState(initial);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState(initial.files.length > 25 ? initial.files.length : 25);
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query.trim(), 280);
  const [busy, setBusy] = useState(false);
  const [trash, setTrash] = useState(false);
  const first = useRef(true);
  const request = useRef(0);

  useEffect(() => {
    if (!search && !trash) onTotal?.(data.total);
  }, [data.total, search, trash, onTotal]);

  const load = async (nextPage = page, nextRows = rows, term = search, inTrash = trash) => {
    const id = ++request.current;
    setBusy(true);
    try {
      const res = await listAllFiles({ page: nextPage + 1, limit: nextRows, search: term, trash: inTrash });
      if (id !== request.current) return;
      setData(res);
    } catch (error) {
      if (id === request.current)
        toast(error instanceof Error ? error.message : t('Dateien konnten nicht geladen werden.'), { variant: 'error' });
    } finally {
      if (id === request.current) setBusy(false);
    }
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setPage(0);
    load(0, rows, search);
  }, [search]);

  const drop = (file: FileItem) =>
    setData((d) => ({ ...d, files: d.files.filter((f) => f.id !== file.id), total: Math.max(0, d.total - 1) }));

  const remove = async (file: FileItem) => {
    const ok = await confirm({
      title: t('Datei löschen?'),
      message: trashEnabled
        ? t('„{filename}“ von {username} landet im Papierkorb des Kontos und lässt sich dort wiederherstellen.', {
            filename: file.filename,
            username: file.username,
          })
        : t('„{filename}“ von {username} wird endgültig gelöscht. Geteilte Links funktionieren danach nicht mehr.', {
            filename: file.filename,
            username: file.username,
          }),
      confirmLabel: t('Löschen'),
    });
    if (!ok) return;
    try {
      const result = await deleteAnyFile(file.username, file.filename);
      drop(file);
      toast(result.trashed ? t('Datei in den Papierkorb gelegt') : t('Datei gelöscht'), { variant: 'success' });
      onChanged();
      load();
    } catch (error) {
      toast(error instanceof Error ? error.message : t('Löschen fehlgeschlagen.'), { variant: 'error' });
    }
  };

  const restore = async (file: FileItem) => {
    try {
      await restoreAnyFile(file.id);
      drop(file);
      toast(t('Datei wiederhergestellt'), { variant: 'success' });
      onChanged();
      load();
    } catch (error) {
      toast(errorMessage(error), { variant: 'error' });
    }
  };

  const purge = async (file: FileItem) => {
    const ok = await confirm({
      title: t('Endgültig löschen?'),
      message: t('„{filename}“ von {username} wird sofort gelöscht und lässt sich nicht wiederherstellen.', {
        filename: file.filename,
        username: file.username,
      }),
      confirmLabel: t('Endgültig löschen'),
    });
    if (!ok) return;
    try {
      await purgeAnyFile(file.id);
      drop(file);
      toast(t('Datei endgültig gelöscht'), { variant: 'success' });
      onChanged();
      load();
    } catch (error) {
      toast(errorMessage(error), { variant: 'error' });
    }
  };

  const actions = (file: FileItem) =>
    trash ? (
      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
        <Tooltip title={t('Wiederherstellen')}>
          <IconButton aria-label={t('{filename} wiederherstellen', { filename: file.filename })} onClick={() => restore(file)}>
            <RestoreFromTrashRounded />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('Endgültig löschen')}>
          <IconButton
            aria-label={t('{filename} endgültig löschen', { filename: file.filename })}
            onClick={() => purge(file)}
            sx={{ color: c.error }}
          >
            <DeleteForeverRounded />
          </IconButton>
        </Tooltip>
      </Box>
    ) : (
      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
        <Tooltip title={t('Ansichtsseite öffnen')}>
          <IconButton aria-label={t('{filename} öffnen', { filename: file.filename })} href={file.urls.view} target="_blank" rel="noopener">
            <OpenInNewRounded />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('Löschen')}>
          <IconButton
            aria-label={t('{filename} löschen', { filename: file.filename })}
            onClick={() => remove(file)}
            sx={{ '&:hover': { color: c.error, bgcolor: 'color-mix(in srgb, var(--mui-palette-m3-error) 10%, transparent)' } }}
          >
            <DeleteOutlineRounded />
          </IconButton>
        </Tooltip>
      </Box>
    );

  const nameCell = (file: FileItem) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
      <Thumb file={file} />
      <Box sx={{ minWidth: 0 }}>
        <Link
          href={file.urls.view}
          target="_blank"
          rel="noopener"
          underline="hover"
          sx={{
            display: 'block',
            fontFamily: fonts.mono,
            fontSize: '0.8125rem',
            color: 'text.primary',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: { xs: 180, md: 280, lg: 380 },
          }}
          title={file.filename}
        >
          {file.filename}
        </Link>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {typeDescription(file.filename, file.type, file.isGif)}
        </Typography>
      </Box>
    </Box>
  );

  const owner = (file: FileItem) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <UserAvatar name={file.username} size={26} />
      <Typography variant="body2" noWrap>
        {file.username}
      </Typography>
    </Box>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 280px', maxWidth: 420 }}>
          <SearchField value={query} onChange={setQuery} placeholder={t('Dateien aller Benutzer suchen')} busy={busy} dense />
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
          {search
            ? tn(data.total, '1 Datei für „{search}“', '{count} Dateien für „{search}“', { search })
            : tn(data.total, '1 Datei', '{count} Dateien')}
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={trash ? 'trash' : 'live'}
          onChange={(_event, next) => {
            if (!next) return;
            const inTrash = next === 'trash';
            setTrash(inTrash);
            setPage(0);
            load(0, rows, search, inTrash);
          }}
          aria-label={t('Ansicht')}
        >
          <ToggleButton value="live">{t('Dateien')}</ToggleButton>
          <ToggleButton value="trash">{t('Papierkorb')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {data.files.length === 0 ? (
        <Typography sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
          {trash
            ? t('Im Papierkorb liegt nichts.')
            : search
              ? t('Keine Datei passt zu dieser Suche.')
              : t('Noch keine Dateien hochgeladen.')}
        </Typography>
      ) : (
        <Box
          sx={{
            borderRadius: `${radius.lg}px`,
            bgcolor: c.surfaceContainerLow,
            overflow: 'hidden',
            opacity: busy ? 0.6 : 1,
            transition: 'opacity 200ms',
          }}
        >
          {phone ? (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 1 }}>
              {data.files.map((file) => (
                <Box
                  component="li"
                  key={file.id}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: `${radius.tile}px` }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {nameCell(file)}
                    <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.5, pl: 7 }}>
                      {file.username}, {formatBytes(file.sizeBytes)},{' '}
                      {trash && file.deletedAt ? t('gelöscht {when}', { when: relativeMs(file.deletedAt) }) : relativeFromServer(file.date)}
                    </Typography>
                  </Box>
                  {actions(file)}
                </Box>
              ))}
            </Box>
          ) : (
            <Table aria-label={t('Alle Dateien')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('Datei')}</TableCell>
                  <TableCell>{t('Besitzer')}</TableCell>
                  <TableCell align="right">{t('Größe')}</TableCell>
                  <TableCell>{trash ? t('Gelöscht') : t('Hochgeladen')}</TableCell>
                  <TableCell align="right">{t('Aufrufe')}</TableCell>
                  <TableCell align="right">
                    <Box component="span" sx={srOnly}>
                      {t('Aktionen')}
                    </Box>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.files.map((file, i) => (
                  <TableRow
                    key={file.id}
                    hover
                    component={m.tr}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i, 15) * 0.02, duration: 0.3, ease: ease.standard }}
                  >
                    <TableCell>{nameCell(file)}</TableCell>
                    <TableCell>{owner(file)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {formatBytes(file.sizeBytes)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {trash && file.deletedAt ? (
                        <Tooltip title={formatDateTime(new Date(file.deletedAt))}>
                          <span>{relativeMs(file.deletedAt)}</span>
                        </Tooltip>
                      ) : (
                        <Tooltip title={formatDateTime(parseServerDate(file.date))}>
                          <span>{relativeFromServer(file.date)}</span>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumber(file.views)}
                    </TableCell>
                    <TableCell align="right">{actions(file)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <TablePagination
            component="div"
            count={data.total}
            page={Math.min(page, Math.max(0, Math.ceil(data.total / rows) - 1))}
            rowsPerPage={rows}
            rowsPerPageOptions={[25, 50, 100]}
            onPageChange={(_event, next) => {
              setPage(next);
              load(next, rows);
            }}
            onRowsPerPageChange={(event) => {
              const next = parseInt(event.target.value, 10);
              setRows(next);
              setPage(0);
              load(0, next);
            }}
            labelRowsPerPage={t('Pro Seite')}
            labelDisplayedRows={({ from, to, count }) =>
              t('{from}–{to} von {count}', { from: formatNumber(from), to: formatNumber(to), count: formatNumber(count) })
            }
            getItemAriaLabel={(type) =>
              type === 'next'
                ? t('Nächste Seite')
                : type === 'previous'
                  ? t('Vorherige Seite')
                  : type === 'first'
                    ? t('Erste Seite')
                    : t('Letzte Seite')
            }
          />
        </Box>
      )}
    </Box>
  );
}
