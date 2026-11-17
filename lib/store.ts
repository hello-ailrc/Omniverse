// Local-first storage. Everything the app saves goes through this file, so cloud
// sync (Supabase) can be added behind the same functions without touching the UI.
import { get, getMany, set, del } from 'idb-keyval';
import { DEFAULT_SETTINGS, type Doc, type DocMeta, type Mark, type Settings } from './types';

const INDEX = 'index';

export async function listDocs(): Promise<DocMeta[]> {
  return (await get<DocMeta[]>(INDEX)) ?? [];
}

function metaOf(doc: Doc): DocMeta {
  const { blocks: _blocks, ...meta } = doc;
  return meta;
}

export async function saveDoc(doc: Doc): Promise<void> {
  await set('doc:' + doc.id, doc);
  const index = await listDocs();
  await set(INDEX, [metaOf(doc), ...index.filter((d) => d.id !== doc.id)]);
}

export async function getDoc(id: string): Promise<Doc | undefined> {
  return get<Doc>('doc:' + id);
}

export async function savePosition(id: string, pos: number): Promise<void> {
  const doc = await getDoc(id);
  if (!doc) return;
  doc.pos = pos;
  await set('doc:' + id, doc);
  const index = await listDocs();
  await set(INDEX, index.map((d) => (d.id === id ? { ...d, pos } : d)));
}

export async function deleteDoc(id: string): Promise<void> {
  await del('doc:' + id);
  await del('marks:' + id);
  const index = await listDocs();
  await set(INDEX, index.filter((d) => d.id !== id));
}

export async function getMarks(docId: string): Promise<Mark[]> {
  return (await get<Mark[]>('marks:' + docId)) ?? [];
}

export async function setMarks(docId: string, marks: Mark[]): Promise<void> {
  await set('marks:' + docId, marks);
}

// Every mark in the library, each with the article it belongs to.
export async function getAllMarks(): Promise<{ doc: DocMeta; mark: Mark }[]> {
  const docs = await listDocs();
  if (docs.length === 0) return [];
  const lists = await getMany<Mark[] | undefined>(docs.map((d) => 'marks:' + d.id));
  return docs.flatMap((d, i) => (lists[i] ?? []).map((mark) => ({ doc: d, mark })));
}

const SETTINGS_KEY = 'reader-settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // storage unavailable: fall through to defaults
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable: settings last for this visit only
  }
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
