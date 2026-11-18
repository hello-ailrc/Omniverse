// Local-first storage. The app always reads and writes here, on the device, so it works
// offline. Every change is also noted in an outbox that the sync engine (lib/sync.ts)
// sends to the server, and changes from other devices are applied here by the same engine.
import { get, getMany, set, del } from 'idb-keyval';
import { DEFAULT_SETTINGS, type Block, type Doc, type DocMeta, type Mark, type Settings } from './types';

const INDEX = 'index';
const OUTBOX = 'outbox';

// All writes run one after another, so the reader and the sync engine never overwrite
// each other's changes. Never call serial() from inside another serial() call.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn);
  chain = p.catch(() => undefined);
  return p;
}

// Outbox keys are "d:<doc id>" and "m:<mark id>". t is when the change was made.
export type OutItem = { t: number; op: 'full' | 'pos' | 'delete' | 'put'; doc?: string };
export type Outbox = Record<string, OutItem>;

let localChange: (() => void) | null = null;
export function setLocalChangeListener(fn: () => void): void {
  localChange = fn;
}

async function enqueue(entries: [string, OutItem][]): Promise<void> {
  if (!entries.length) return;
  const box = (await get<Outbox>(OUTBOX)) ?? {};
  for (const [key, item] of entries) {
    const prev = box[key];
    // A new article still needs its full upload even if the position changed since.
    if (prev && prev.op === 'full' && item.op === 'pos') box[key] = { ...prev, t: item.t };
    else box[key] = item;
  }
  await set(OUTBOX, box);
  localChange?.();
}

function bySaved(a: DocMeta, b: DocMeta): number {
  return (b.savedAt ?? 0) - (a.savedAt ?? 0);
}

function metaOf(doc: Doc): DocMeta {
  const { blocks: _blocks, ...meta } = doc;
  return meta;
}

// Tell open screens that changes from another device have arrived.
function announce(docIds: Set<string>): void {
  if (docIds.size === 0 || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('omniverse:changed', { detail: { docs: [...docIds] } }));
}

export async function listDocs(): Promise<DocMeta[]> {
  return (await get<DocMeta[]>(INDEX)) ?? [];
}

export async function getDoc(id: string): Promise<Doc | undefined> {
  return get<Doc>('doc:' + id);
}

export function saveDoc(doc: Doc): Promise<void> {
  return serial(async () => {
    const now = Date.now();
    const stamped = { ...doc, updatedAt: now };
    await set('doc:' + doc.id, stamped);
    const index = await listDocs();
    await set(INDEX, [metaOf(stamped), ...index.filter((d) => d.id !== doc.id)]);
    await enqueue([['d:' + doc.id, { t: now, op: 'full' }]]);
  });
}

export function savePosition(id: string, pos: number): Promise<void> {
  return serial(async () => {
    const doc = await getDoc(id);
    if (!doc || doc.pos === pos) return;
    const now = Date.now();
    await set('doc:' + id, { ...doc, pos, updatedAt: now });
    const index = await listDocs();
    await set(
      INDEX,
      index.map((d) => (d.id === id ? { ...d, pos, updatedAt: now } : d)),
    );
    await enqueue([['d:' + id, { t: now, op: 'pos' }]]);
  });
}

export function deleteDoc(id: string): Promise<void> {
  return serial(async () => {
    await del('doc:' + id);
    await del('marks:' + id);
    const index = await listDocs();
    await set(INDEX, index.filter((d) => d.id !== id));
    // Unsent changes to this article's marks no longer matter: the delete covers them.
    const box = (await get<Outbox>(OUTBOX)) ?? {};
    for (const [key, item] of Object.entries(box)) if (item.doc === id) delete box[key];
    await set(OUTBOX, box);
    await enqueue([['d:' + id, { t: Date.now(), op: 'delete' }]]);
  });
}

export function getMarks(docId: string): Promise<Mark[]> {
  return serial(async () => (await get<Mark[]>('marks:' + docId)) ?? []);
}

// Add new marks or replace changed ones.
export function putMarks(docId: string, marks: Mark[]): Promise<void> {
  return serial(async () => {
    if (!marks.length) return;
    const now = Date.now();
    const list = (await get<Mark[]>('marks:' + docId)) ?? [];
    for (const m of marks) {
      const stamped = { ...m, updatedAt: now };
      const k = list.findIndex((x) => x.id === m.id);
      if (k >= 0) list[k] = stamped;
      else list.push(stamped);
    }
    await set('marks:' + docId, list);
    await enqueue(marks.map((m) => ['m:' + m.id, { t: now, op: 'put', doc: docId }]));
  });
}

export function removeMarks(docId: string, ids: string[]): Promise<void> {
  return serial(async () => {
    if (!ids.length) return;
    const now = Date.now();
    const list = (await get<Mark[]>('marks:' + docId)) ?? [];
    await set(
      'marks:' + docId,
      list.filter((m) => !ids.includes(m.id)),
    );
    await enqueue(ids.map((id) => ['m:' + id, { t: now, op: 'delete', doc: docId }]));
  });
}

// Every mark in the library, each with the article it belongs to.
export async function getAllMarks(): Promise<{ doc: DocMeta; mark: Mark }[]> {
  const docs = await listDocs();
  if (docs.length === 0) return [];
  const lists = await getMany<Mark[] | undefined>(docs.map((d) => 'marks:' + d.id));
  return docs.flatMap((d, i) => (lists[i] ?? []).map((mark) => ({ doc: d, mark })));
}

/* ---------- Used by the sync engine ---------- */

export async function readOutbox(): Promise<Outbox> {
  return (await get<Outbox>(OUTBOX)) ?? {};
}

// Remove sent changes, unless they were changed again while sending.
export function clearOutbox(sent: [string, number][]): Promise<void> {
  return serial(async () => {
    if (!sent.length) return;
    const box = (await get<Outbox>(OUTBOX)) ?? {};
    for (const [key, t] of sent) if (box[key] && box[key].t === t) delete box[key];
    await set(OUTBOX, box);
  });
}

// On the first sign-in from this device, everything already saved here is uploaded.
export function enqueueEverything(): Promise<void> {
  return serial(async () => {
    const docs = await listDocs();
    const lists = await getMany<Mark[] | undefined>(docs.map((d) => 'marks:' + d.id));
    const entries: [string, OutItem][] = [];
    docs.forEach((d, i) => {
      entries.push(['d:' + d.id, { t: d.updatedAt ?? d.savedAt ?? Date.now(), op: 'full' }]);
      (lists[i] ?? []).forEach((m) =>
        entries.push(['m:' + m.id, { t: m.updatedAt ?? m.createdAt ?? Date.now(), op: 'put', doc: d.id }]),
      );
    });
    await enqueue(entries);
  });
}

export type RemoteDoc = Omit<DocMeta, 'updatedAt'> & { updatedAt: number; deleted: boolean };

// Apply articles changed on other devices. The newer change wins.
export function applyRemoteDocs(rows: RemoteDoc[], blocks: Record<string, Block[]>): Promise<void> {
  return serial(async () => {
    if (!rows.length) return;
    const box = (await get<Outbox>(OUTBOX)) ?? {};
    let index = await listDocs();
    const changed = new Set<string>();
    for (const r of rows) {
      const pending = box['d:' + r.id];
      if (pending && (pending.op === 'delete' || pending.t > r.updatedAt)) continue;
      const local = await get<Doc>('doc:' + r.id);
      if (r.deleted) {
        if (!local) continue;
        await del('doc:' + r.id);
        await del('marks:' + r.id);
        index = index.filter((d) => d.id !== r.id);
        changed.add(r.id);
        continue;
      }
      const { deleted: _deleted, ...meta } = r;
      if (local) {
        if ((local.updatedAt ?? 0) >= r.updatedAt) continue;
        const merged: Doc = { ...local, ...meta };
        await set('doc:' + r.id, merged);
        index = [...index.filter((d) => d.id !== r.id), metaOf(merged)];
      } else {
        const b = blocks[r.id];
        if (!b) continue;
        const doc: Doc = { ...meta, blocks: b };
        await set('doc:' + r.id, doc);
        index = [...index.filter((d) => d.id !== r.id), meta];
      }
      changed.add(r.id);
    }
    if (changed.size) await set(INDEX, index.sort(bySaved));
    announce(changed);
  });
}

export type RemoteMark = Mark & { updatedAt: number; deleted: boolean };

// Apply marks changed on other devices. The newer change wins.
export function applyRemoteMarks(rows: RemoteMark[]): Promise<void> {
  return serial(async () => {
    if (!rows.length) return;
    const box = (await get<Outbox>(OUTBOX)) ?? {};
    const byDoc = new Map<string, RemoteMark[]>();
    rows.forEach((r) => byDoc.set(r.docId, [...(byDoc.get(r.docId) ?? []), r]));
    const changed = new Set<string>();
    for (const [docId, items] of byDoc) {
      if (box['d:' + docId]?.op === 'delete') continue;
      const list = (await get<Mark[]>('marks:' + docId)) ?? [];
      let dirty = false;
      for (const r of items) {
        const pending = box['m:' + r.id];
        if (pending && pending.t > r.updatedAt) continue;
        const k = list.findIndex((m) => m.id === r.id);
        if (r.deleted) {
          if (k >= 0) {
            list.splice(k, 1);
            dirty = true;
          }
          continue;
        }
        const { deleted: _deleted, ...mark } = r;
        if (k >= 0) {
          if ((list[k].updatedAt ?? list[k].createdAt) >= r.updatedAt) continue;
          list[k] = mark;
        } else list.push(mark);
        dirty = true;
      }
      if (dirty) {
        await set('marks:' + docId, list);
        changed.add(docId);
      }
    }
    announce(changed);
  });
}

/* ---------- Settings stay on each device ---------- */

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
