'use client';
// Cloud sync with Supabase. The device keeps working offline; this engine sends the
// outbox to the server and brings in changes made on other devices.
import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { del, get, set } from 'idb-keyval';
import { useEffect, useState } from 'react';
import * as store from './store';
import type { Block, Doc, Mark, MarkColor, MarkStyle } from './types';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
// Accepts the key under any of the names Supabase's Connect dialog has used.
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';
export const syncConfigured = Boolean(URL_ && KEY);

export type SyncState = 'off' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';
export type SyncStatus = {
  state: SyncState;
  ready: boolean; // false until the saved sign-in has been checked
  email?: string;
  lastSync?: number;
  pending: number;
  message?: string;
};

let status: SyncStatus = { state: syncConfigured ? 'signed-out' : 'off', ready: !syncConfigured, pending: 0 };
const listeners = new Set<(s: SyncStatus) => void>();
function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((fn) => fn(status));
}

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState(status);
  useEffect(() => {
    listeners.add(setS);
    setS(status);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

let client: SupabaseClient | null = null;
function sb(): SupabaseClient | null {
  if (!syncConfigured) return null;
  if (!client) {
    client = createClient(URL_, KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'omniverse-auth' },
    });
  }
  return client;
}

let session: Session | null = null;
let started = false;
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let channel: RealtimeChannel | null = null;

function schedule(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void syncNow();
  }, ms);
}

async function refreshPending(): Promise<void> {
  setStatus({ pending: Object.keys(await store.readOutbox()).length });
}

// Called once when the app opens.
export function startSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  store.setLocalChangeListener(() => {
    void refreshPending();
    schedule(2500);
  });
  void refreshPending();
  const c = sb();
  if (!c) return;
  // Fires once straight away with the saved sign-in, then on every change.
  c.auth.onAuthStateChange((_event, s) => {
    // Supabase advises not to call it again from inside this callback.
    setTimeout(() => void onSession(s), 0);
  });
  window.addEventListener('online', () => schedule(0));
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  window.addEventListener('focus', () => schedule(300));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(300);
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') schedule(0);
  }, 60000);
}

async function onSession(s: Session | null): Promise<void> {
  const before = session?.user.id;
  session = s;
  if (!s) {
    stopRealtime();
    setStatus({ state: 'signed-out', email: undefined, ready: true, message: undefined });
    return;
  }
  setStatus({ email: s.user.email ?? undefined, ready: true });
  if (before === s.user.id) return; // token refresh, nothing else to do
  if ((await get<string>('sync:user')) !== s.user.id) {
    // First sign-in on this device: upload what is here and fetch everything.
    await store.enqueueEverything();
    await del('sync:cursor:docs');
    await del('sync:cursor:marks');
    await set('sync:user', s.user.id);
  }
  startRealtime(s.user.id);
  schedule(0);
}

function startRealtime(uid: string): void {
  const c = sb();
  if (!c || channel) return;
  channel = c
    .channel('omniverse-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: `user_id=eq.${uid}` }, () => schedule(600))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'marks', filter: `user_id=eq.${uid}` }, () => schedule(600))
    .subscribe();
}

function stopRealtime(): void {
  if (channel) {
    void sb()?.removeChannel(channel);
    channel = null;
  }
}

export async function syncNow(): Promise<void> {
  if (!session) return;
  if (running) {
    again = true;
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setStatus({ state: 'offline' });
    return;
  }
  running = true;
  setStatus({ state: 'syncing' });
  try {
    await push();
    await pull();
    await refreshPending();
    setStatus({ state: 'synced', lastSync: Date.now(), message: undefined });
  } catch (e) {
    await refreshPending();
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    setStatus({ state: offline ? 'offline' : 'error', message: offline ? undefined : friendly(e) });
    schedule(30000);
  } finally {
    running = false;
    if (again) {
      again = false;
      schedule(300);
    }
  }
}

function friendly(e: unknown): string {
  const err = e as { message?: string; code?: string };
  const msg = err?.message ?? String(e);
  if (err?.code === '42P01' || err?.code === 'PGRST205' || /does not exist|schema cache/i.test(msg)) {
    return 'The sync tables are missing. Run the setup SQL in Supabase.';
  }
  if (/jwt|token/i.test(msg)) return 'Your sign-in expired. Sign out and sign in again.';
  if (/fetch|network/i.test(msg)) return 'Could not reach the sync server.';
  return msg;
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/* ---------- Sending local changes ---------- */

function docRow(uid: string, d: Doc) {
  return {
    user_id: uid,
    id: d.id,
    title: d.title,
    url: d.url ?? null,
    site: d.site ?? null,
    byline: d.byline ?? null,
    saved_at: d.savedAt,
    words: d.words,
    pos: d.pos,
    blocks: d.blocks,
    deleted: false,
    updated_at: d.updatedAt ?? d.savedAt,
  };
}

function markRow(uid: string, docId: string, m: Mark) {
  return {
    user_id: uid,
    id: m.id,
    doc_id: docId,
    block: m.block,
    start_offset: m.start,
    end_offset: m.end,
    color: m.color,
    style: m.style,
    flag: m.flag,
    note: m.note ?? null,
    text: m.text,
    created_at: m.createdAt,
    deleted: false,
    updated_at: m.updatedAt ?? m.createdAt,
  };
}

async function push(): Promise<void> {
  const c = sb()!;
  const uid = session!.user.id;
  const entries = Object.entries(await store.readOutbox());
  if (!entries.length) return;

  // Marks: new and changed.
  const puts = entries.filter(([k, v]) => k.startsWith('m:') && v.op === 'put');
  if (puts.length) {
    const sent: [string, number][] = [];
    const rows: ReturnType<typeof markRow>[] = [];
    const byDoc = new Map<string, [string, store.OutItem][]>();
    puts.forEach((e) => byDoc.set(e[1].doc ?? '', [...(byDoc.get(e[1].doc ?? '') ?? []), e]));
    for (const [docId, items] of byDoc) {
      const list = await store.getMarks(docId);
      for (const [key, item] of items) {
        const m = list.find((x) => x.id === key.slice(2));
        if (m) rows.push(markRow(uid, docId, m));
        sent.push([key, item.t]);
      }
    }
    for (const part of chunks(rows, 200)) check(await c.from('marks').upsert(part, { onConflict: 'user_id,id' }));
    await store.clearOutbox(sent);
  }

  // Marks: removed.
  const gone = entries.filter(([k, v]) => k.startsWith('m:') && v.op === 'delete');
  for (const part of chunks(gone, 100)) {
    const t = Math.max(...part.map(([, v]) => v.t));
    check(
      await c
        .from('marks')
        .update({ deleted: true, updated_at: t })
        .eq('user_id', uid)
        .in(
          'id',
          part.map(([k]) => k.slice(2)),
        ),
    );
    await store.clearOutbox(part.map(([k, v]) => [k, v.t]));
  }

  // Articles: new ones in full, then reading positions.
  const full = entries.filter(([k, v]) => k.startsWith('d:') && v.op === 'full');
  for (const part of chunks(full, 10)) {
    const rows = [];
    for (const [key] of part) {
      const d = await store.getDoc(key.slice(2));
      if (d) rows.push(docRow(uid, d));
    }
    if (rows.length) check(await c.from('docs').upsert(rows, { onConflict: 'user_id,id' }));
    await store.clearOutbox(part.map(([k, v]) => [k, v.t]));
  }
  for (const [key, item] of entries.filter(([k, v]) => k.startsWith('d:') && v.op === 'pos')) {
    const d = await store.getDoc(key.slice(2));
    if (d) {
      check(
        await c
          .from('docs')
          .update({ pos: d.pos, updated_at: d.updatedAt ?? item.t })
          .eq('user_id', uid)
          .eq('id', d.id),
      );
    }
    await store.clearOutbox([[key, item.t]]);
  }

  // Articles: deleted, with their marks. The stored text is cleared to save space.
  for (const [key, item] of entries.filter(([k, v]) => k.startsWith('d:') && v.op === 'delete')) {
    const id = key.slice(2);
    check(
      await c
        .from('docs')
        .update({ deleted: true, blocks: [], updated_at: item.t })
        .eq('user_id', uid)
        .eq('id', id),
    );
    check(await c.from('marks').update({ deleted: true, updated_at: item.t }).eq('user_id', uid).eq('doc_id', id));
    await store.clearOutbox([[key, item.t]]);
  }
}

/* ---------- Bringing in changes from other devices ---------- */

const OVERLAP = 60_000; // look back a minute each time, in case a change landed late
const PAGE = 500;

async function pullRows<T extends { synced_at: string }>(
  table: string,
  columns: string,
  cursorKey: string,
): Promise<{ rows: T[]; next?: string }> {
  const c = sb()!;
  const uid = session!.user.id;
  const cursor = await get<string>(cursorKey);
  const since = cursor ? new Date(Date.parse(cursor) - OVERLAP).toISOString() : null;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = c
      .from(table)
      .select(columns)
      .eq('user_id', uid)
      .order('synced_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (since) q = q.gte('synced_at', since);
    const page = check(await q) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  let latest = cursor ? Date.parse(cursor) : 0;
  rows.forEach((r) => {
    latest = Math.max(latest, Date.parse(r.synced_at));
  });
  return { rows, next: latest ? new Date(latest).toISOString() : undefined };
}

type DocRow = {
  id: string;
  title: string;
  url: string | null;
  site: string | null;
  byline: string | null;
  saved_at: number;
  words: number;
  pos: number;
  deleted: boolean;
  updated_at: number;
  synced_at: string;
};

type MarkRow = {
  id: string;
  doc_id: string;
  block: number;
  start_offset: number;
  end_offset: number;
  color: MarkColor;
  style: MarkStyle;
  flag: boolean;
  note: string | null;
  text: string;
  created_at: number;
  deleted: boolean;
  updated_at: number;
  synced_at: string;
};

async function pull(): Promise<void> {
  const c = sb()!;
  const uid = session!.user.id;

  // Articles: the list first, then the full text only for ones this device lacks.
  const docs = await pullRows<DocRow>(
    'docs',
    'id,title,url,site,byline,saved_at,words,pos,deleted,updated_at,synced_at',
    'sync:cursor:docs',
  );
  const missing: string[] = [];
  for (const r of docs.rows) if (!r.deleted && !(await store.getDoc(r.id))) missing.push(r.id);
  const blocks: Record<string, Block[]> = {};
  for (const part of chunks(missing, 20)) {
    const got = check(await c.from('docs').select('id,blocks').eq('user_id', uid).in('id', part)) as unknown as {
      id: string;
      blocks: Block[];
    }[];
    got.forEach((g) => {
      blocks[g.id] = g.blocks;
    });
  }
  await store.applyRemoteDocs(
    docs.rows.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url ?? undefined,
      site: r.site ?? undefined,
      byline: r.byline ?? undefined,
      savedAt: Number(r.saved_at),
      words: r.words,
      pos: r.pos,
      deleted: r.deleted,
      updatedAt: Number(r.updated_at),
    })),
    blocks,
  );
  if (docs.next) await set('sync:cursor:docs', docs.next);

  // Marks.
  const marks = await pullRows<MarkRow>(
    'marks',
    'id,doc_id,block,start_offset,end_offset,color,style,flag,note,text,created_at,deleted,updated_at,synced_at',
    'sync:cursor:marks',
  );
  await store.applyRemoteMarks(
    marks.rows.map((r) => ({
      id: r.id,
      docId: r.doc_id,
      block: r.block,
      start: r.start_offset,
      end: r.end_offset,
      color: r.color,
      style: r.style,
      flag: r.flag,
      note: r.note ?? undefined,
      text: r.text,
      createdAt: Number(r.created_at),
      deleted: r.deleted,
      updatedAt: Number(r.updated_at),
    })),
  );
  if (marks.next) await set('sync:cursor:marks', marks.next);
}

/* ---------- Signing in and out ---------- */

function authMessage(e: { message?: string }): string {
  const msg = e.message ?? 'Something went wrong.';
  if (/invalid login credentials/i.test(msg)) return 'That email and password do not match.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first: tap the link Supabase sent you, then sign in.';
  if (/signups not allowed|signup is disabled/i.test(msg)) return 'New accounts are switched off for this app.';
  if (/already registered/i.test(msg)) return 'That email already has an account. Sign in instead.';
  return msg;
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const c = sb();
  if (!c) return 'Sync is not set up.';
  const { error } = await c.auth.signInWithPassword({ email, password });
  return error ? authMessage(error) : null;
}

export async function signUp(email: string, password: string): Promise<{ error?: string; confirm?: boolean }> {
  const c = sb();
  if (!c) return { error: 'Sync is not set up.' };
  const { data, error } = await c.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) return { error: authMessage(error) };
  return { confirm: !data.session };
}

export async function signOut(): Promise<void> {
  await sb()?.auth.signOut();
}
