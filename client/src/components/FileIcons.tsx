import type { ReactElement } from 'react';
import ImageRounded from '@mui/icons-material/ImageRounded';
import MovieRounded from '@mui/icons-material/MovieRounded';
import MusicNoteRounded from '@mui/icons-material/MusicNoteRounded';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import FolderZipRounded from '@mui/icons-material/FolderZipRounded';
import DataObjectRounded from '@mui/icons-material/DataObjectRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import CodeRounded from '@mui/icons-material/CodeRounded';
import InsertDriveFileRounded from '@mui/icons-material/InsertDriveFileRounded';
import NotesRounded from '@mui/icons-material/NotesRounded';
import type { FileType } from '../lib/types';
import { extensionOf } from '../lib/format';
import { t } from '../lib/i18n';

const ARCHIVES = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']);
const TEXT = new Set(['txt', 'md', 'log', 'csv', 'rtf', 'doc', 'docx', 'odt']);
const CODE = new Set([
  'js',
  'ts',
  'tsx',
  'jsx',
  'html',
  'css',
  'py',
  'java',
  'c',
  'cpp',
  'cs',
  'go',
  'rs',
  'php',
  'sh',
  'xml',
  'yml',
  'yaml',
]);

export function fileIcon(filename: string, type: FileType, fontSize: 'small' | 'medium' | 'large' | 'inherit' = 'inherit'): ReactElement {
  if (type === 'image') return <ImageRounded fontSize={fontSize} />;
  if (type === 'video') return <MovieRounded fontSize={fontSize} />;
  if (type === 'audio') return <MusicNoteRounded fontSize={fontSize} />;
  const ext = extensionOf(filename);
  if (type === 'text' && !CODE.has(ext) && ext !== 'json') return <NotesRounded fontSize={fontSize} />;
  if (ext === 'pdf') return <PictureAsPdfRounded fontSize={fontSize} />;
  if (ARCHIVES.has(ext)) return <FolderZipRounded fontSize={fontSize} />;
  if (ext === 'json') return <DataObjectRounded fontSize={fontSize} />;
  if (CODE.has(ext)) return <CodeRounded fontSize={fontSize} />;
  if (TEXT.has(ext)) return <DescriptionRounded fontSize={fontSize} />;
  return <InsertDriveFileRounded fontSize={fontSize} />;
}

const TYPE_LABEL: Record<FileType, string> = {
  image: t('Bild'),
  video: t('Video'),
  audio: t('Audio'),
  text: t('Text'),
  file: t('Datei'),
};

export function typeDescription(filename: string, type: FileType, isGif = false) {
  const ext = extensionOf(filename).toUpperCase();
  if (isGif) return t('Animiertes GIF');
  return ext ? `${TYPE_LABEL[type]} (${ext})` : TYPE_LABEL[type];
}
