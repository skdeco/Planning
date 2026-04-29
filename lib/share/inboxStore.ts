// Store partagé app + extension pour l'Inbox des fichiers reçus via la
// Share Sheet. Les fichiers sont copiés vers AppGroup/inbox/<uuid>.<ext>
// et listés dans manifest.json (au même niveau).
//
// - Écrit : Share Extension (au tap "Importer dans SK DECO")
// - Lu / mis à jour : app principale (banner Inbox, écran Inbox)
// - Container : group.fr.skdeco.planning (cf. chantiersCache.ts)
//
// iOS-only. Sur Android/web : skip silencieux.

import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

import { APP_GROUP_ID } from '@/lib/share/chantiersCache';

export const INBOX_DIR_NAME = 'inbox';
export const MANIFEST_FILENAME = 'manifest.json';
export const MANIFEST_VERSION = 1;

export type InboxItemStatus = 'pending' | 'uploading' | 'uploaded';

export interface InboxItem {
  id: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  createdAt: number;
  userId?: string;
  userName?: string;
  filePath: string;
  status: InboxItemStatus;
}

export interface InboxManifest {
  version: number;
  updatedAt: number;
  items: InboxItem[];
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

export function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export function extractFilenameFromUri(uri: string): string {
  const cleaned = uri.replace(/[?#].*$/, '');
  const segments = cleaned.split('/');
  const last = segments[segments.length - 1] ?? '';
  try {
    return decodeURIComponent(last) || 'file';
  } catch {
    return last || 'file';
  }
}

function getAppGroupDirectory(): Directory | null {
  if (Platform.OS !== 'ios') return null;
  const containers = Paths.appleSharedContainers;
  if (!containers) return null;
  return containers[APP_GROUP_ID] ?? null;
}

export function getInboxDirectory(): Directory | null {
  const appGroupDir = getAppGroupDirectory();
  if (!appGroupDir) return null;

  const inboxDir = new Directory(appGroupDir, INBOX_DIR_NAME);
  try {
    if (!inboxDir.exists) {
      inboxDir.create();
    }
  } catch (err) {
    console.warn('[inboxStore] failed to ensure inbox dir', err);
    return null;
  }
  return inboxDir;
}

export function getManifestFile(): File | null {
  const inboxDir = getInboxDirectory();
  if (!inboxDir) return null;
  return new File(inboxDir, MANIFEST_FILENAME);
}

export function loadManifest(): InboxManifest {
  const empty: InboxManifest = {
    version: MANIFEST_VERSION,
    updatedAt: Date.now(),
    items: [],
  };
  const file = getManifestFile();
  if (!file || !file.exists) return empty;

  try {
    const raw = file.textSync();
    const parsed = JSON.parse(raw) as InboxManifest;
    if (parsed.version !== MANIFEST_VERSION) return empty;
    return parsed;
  } catch (err) {
    console.warn('[inboxStore] manifest parse failed', err);
    return empty;
  }
}

export function saveManifest(manifest: InboxManifest): void {
  const file = getManifestFile();
  if (!file) return;
  try {
    if (!file.exists) file.create();
    const payload: InboxManifest = { ...manifest, updatedAt: Date.now() };
    file.write(JSON.stringify(payload));
  } catch (err) {
    console.warn('[inboxStore] manifest write failed', err);
  }
}

export function listInboxItems(): InboxItem[] {
  return loadManifest().items;
}

export function getInboxItemPath(item: InboxItem): string | null {
  const inboxDir = getInboxDirectory();
  if (!inboxDir) return null;
  const relative = item.filePath.replace(/^inbox\//, '');
  const file = new File(inboxDir, relative);
  return file.exists ? file.uri : null;
}

export interface AddInboxItemParams {
  sourceUri: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  userId?: string;
  userName?: string;
}

export function addInboxItem(params: AddInboxItemParams): InboxItem | null {
  const inboxDir = getInboxDirectory();
  if (!inboxDir) {
    console.warn('[inboxStore] no inbox dir');
    return null;
  }

  const { sourceUri, filename, mimeType, fileSize, userId, userName } = params;

  const id = Crypto.randomUUID();
  const ext = filename.toLowerCase().split('.').pop();
  const destFilename = ext && ext !== filename.toLowerCase() ? `${id}.${ext}` : id;
  const filePath = `${INBOX_DIR_NAME}/${destFilename}`;

  try {
    const sourceFile = new File(sourceUri);
    if (!sourceFile.exists) {
      console.warn('[inboxStore] source file does not exist', sourceUri);
      return null;
    }
    const destFile = new File(inboxDir, destFilename);
    sourceFile.copy(destFile);
  } catch (err) {
    console.warn('[inboxStore] copy failed', err);
    return null;
  }

  const item: InboxItem = {
    id,
    filename,
    mimeType,
    fileSize,
    createdAt: Date.now(),
    userId,
    userName,
    filePath,
    status: 'pending',
  };

  const manifest = loadManifest();
  manifest.items.push(item);
  saveManifest(manifest);

  return item;
}

export function removeInboxItem(id: string): boolean {
  const inboxDir = getInboxDirectory();
  if (!inboxDir) return false;

  const manifest = loadManifest();
  const idx = manifest.items.findIndex((it) => it.id === id);
  if (idx < 0) return false;

  const item = manifest.items[idx];
  try {
    const relative = item.filePath.replace(/^inbox\//, '');
    const file = new File(inboxDir, relative);
    if (file.exists) file.delete();
  } catch (err) {
    console.warn('[inboxStore] delete file failed', err);
  }

  manifest.items.splice(idx, 1);
  saveManifest(manifest);
  return true;
}
