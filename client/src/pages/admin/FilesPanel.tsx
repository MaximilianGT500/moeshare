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
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import type { FileItem, FileListResponse } from '../../lib/types';
import { deleteAnyFile, listAllFiles } from '../../lib/api';
import { useDebouncedValue } from '../../lib/hooks';
import { formatBytes, formatDateTime, formatNumber, parseServerDate, plural, relativeFromServer } from '../../lib/format';
import { meaningfulColor, mix } from '../../lib/color';
import { SearchField } from '../../components/SearchField';
import { UserAvatar } from '../../components/UserAvatar';
import { fileIcon, typeDescription } from '../../components/FileIcons';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { c, ease, fonts, radius, srOnly } from '../../theme/tokens';

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
}: {
  initial: FileListResponse;
  onChanged: () => void;
  onTotal?: (total: number) => void;
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
  const first = useRef(true);
  const request = useRef(0);

  useEffect(() => {
    if (!search) onTotal?.(data.total);
  }, [data.total, search, onTotal]);

  const load = async (nextPage = page, nextRows = rows, term = search) => {
    const id = ++request.current;
    setBusy(true);
    try {
      const res = await listAllFiles({ page: nextPage + 1, limit: nextRows, search: term });
      if (id !== request.current) return;
      setData(res);
    } catch (error) {
      if (id === request.current)
        toast(error instanceof Error ? error.message : 'Dateien konnten nicht geladen werden.', { variant: 'error' });
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

  const remove = async (file: FileItem) => {
    const ok = await confirm({
      title: 'Datei löschen?',
      message: `„${file.filename}“ von ${file.username} wird endgültig gelöscht. Geteilte Links funktionieren danach nicht mehr.`,
      confirmLabel: 'Löschen',
    });
    if (!ok) return;
    try {
      await deleteAnyFile(file.username, file.filename);
      setData((d) => ({ ...d, files: d.files.filter((f) => f.filename !== file.filename), total: Math.max(0, d.total - 1) }));
      toast('Datei gelöscht', { variant: 'success' });
      onChanged();
      load();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Löschen fehlgeschlagen.', { variant: 'error' });
    }
  };

  const actions = (file: FileItem) => (
    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
      <Tooltip title="Ansichtsseite öffnen">
        <IconButton aria-label={`${file.filename} öffnen`} href={file.urls.view} target="_blank" rel="noopener">
          <OpenInNewRounded />
        </IconButton>
      </Tooltip>
      <Tooltip title="Löschen">
        <IconButton
          aria-label={`${file.filename} löschen`}
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
          <SearchField value={query} onChange={setQuery} placeholder="Dateien aller Benutzer suchen" busy={busy} dense />
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {plural(data.total, 'Datei', 'Dateien')}
          {search ? ` für „${search}“` : ''}
        </Typography>
      </Box>

      {data.files.length === 0 ? (
        <Typography sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
          {search ? 'Keine Datei passt zu dieser Suche.' : 'Noch keine Dateien hochgeladen.'}
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
                  key={file.filename}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: `${radius.tile}px` }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {nameCell(file)}
                    <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.5, pl: 7 }}>
                      {file.username}, {formatBytes(file.sizeBytes)}, {relativeFromServer(file.date)}
                    </Typography>
                  </Box>
                  {actions(file)}
                </Box>
              ))}
            </Box>
          ) : (
            <Table aria-label="Alle Dateien">
              <TableHead>
                <TableRow>
                  <TableCell>Datei</TableCell>
                  <TableCell>Besitzer</TableCell>
                  <TableCell align="right">Größe</TableCell>
                  <TableCell>Hochgeladen</TableCell>
                  <TableCell align="right">Aufrufe</TableCell>
                  <TableCell align="right">
                    <Box component="span" sx={srOnly}>
                      Aktionen
                    </Box>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.files.map((file, i) => (
                  <TableRow
                    key={file.filename}
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
                      <Tooltip title={formatDateTime(parseServerDate(file.date))}>
                        <span>{relativeFromServer(file.date)}</span>
                      </Tooltip>
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
            labelRowsPerPage="Pro Seite"
            labelDisplayedRows={({ from, to, count }) => `${formatNumber(from)}–${formatNumber(to)} von ${formatNumber(count)}`}
            getItemAriaLabel={(type) =>
              type === 'next'
                ? 'Nächste Seite'
                : type === 'previous'
                  ? 'Vorherige Seite'
                  : type === 'first'
                    ? 'Erste Seite'
                    : 'Letzte Seite'
            }
          />
        </Box>
      )}
    </Box>
  );
}
