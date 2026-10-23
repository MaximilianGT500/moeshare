export interface DroppedFolder {
  name: string;
  files: File[];
}

export interface DropContents {
  loose: File[];
  folders: DroppedFolder[];
}

const ignored = (name: string) => name.startsWith('.') || /^(Thumbs\.db|desktop\.ini)$/i.test(name);

const paths = new WeakMap<File, string>();

export const pathOf = (file: File) => paths.get(file) || (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

function readFile(entry: FileSystemFileEntry) {
  return new Promise<File>((resolve, reject) => entry.file(resolve, reject));
}

function readBatch(reader: FileSystemDirectoryReader) {
  return new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
}

async function collect(entry: FileSystemEntry, out: File[]) {
  if (ignored(entry.name)) return;
  if (entry.isFile) {
    const file = await readFile(entry as FileSystemFileEntry);
    paths.set(file, entry.fullPath.replace(/^\//, ''));
    out.push(file);
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (let batch = await readBatch(reader); batch.length; batch = await readBatch(reader)) {
    for (const child of batch) await collect(child, out);
  }
}

export function droppedEntries(transfer: DataTransfer | null): FileSystemEntry[] {
  if (!transfer || !transfer.items) return [];
  return Array.from(transfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => Boolean(entry));
}

export async function readDrop(entries: FileSystemEntry[]): Promise<DropContents> {
  const loose: File[] = [];
  const folders: DroppedFolder[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      const files: File[] = [];
      await collect(entry, files);
      if (files.length) folders.push({ name: entry.name, files });
    } else if (entry.isFile && !ignored(entry.name)) {
      loose.push(await readFile(entry as FileSystemFileEntry));
    }
  }
  return { loose, folders };
}

export function groupPicked(list: FileList | File[]): DropContents {
  const loose: File[] = [];
  const groups = new Map<string, File[]>();
  for (const file of Array.from(list)) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const parts = relative.split('/');
    if (parts.length < 2) {
      loose.push(file);
      continue;
    }
    if (parts.some((part) => ignored(part))) continue;
    groups.set(parts[0], [...(groups.get(parts[0]) || []), file]);
  }
  return { loose, folders: [...groups.entries()].map(([name, files]) => ({ name, files })) };
}
