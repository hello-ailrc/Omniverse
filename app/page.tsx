'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { deleteDoc, listDocs, newId, saveDoc } from '@/lib/store';
import { buildText } from '@/lib/text';
import type { Block, Doc, DocMeta } from '@/lib/types';
import { useSettings } from '@/lib/useSettings';
import { Trash } from '@/components/icons';

function textToBlocks(text: string): Block[] {
  return text
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((p) => ({ type: 'p' as const, text: p }));
}

export default function Library() {
  useSettings();
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [url, setUrl] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listDocs().then(setDocs);
  }, []);

  async function store(partial: { title: string; url?: string; site?: string; byline?: string; blocks: Block[] }) {
    const doc: Doc = {
      id: newId(),
      savedAt: Date.now(),
      words: buildText(partial.blocks).tokens.length,
      pos: 0,
      ...partial,
    };
    await saveDoc(doc);
    setDocs(await listDocs());
  }

  async function saveUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const target = /^https?:\/\//i.test(url.trim()) ? url.trim() : 'https://' + url.trim();
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The page could not be saved.');
      await store({ title: data.title, url: target, site: data.site, byline: data.byline, blocks: data.blocks });
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The page could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function savePaste() {
    const blocks = textToBlocks(text);
    if (blocks.length === 0) {
      setError('Paste some text first.');
      return;
    }
    setError('');
    await store({ title: title.trim() || blocks[0].text.slice(0, 70), site: 'Pasted text', blocks });
    setTitle('');
    setText('');
    setPasteOpen(false);
  }

  async function remove(d: DocMeta) {
    if (!window.confirm(`Delete "${d.title}" and its marks?`)) return;
    await deleteDoc(d.id);
    setDocs(await listDocs());
  }

  return (
    <main className="library">
      <h1>Library</h1>

      <section className="add" aria-label="Save something to read">
        <form className="add-row" onSubmit={saveUrl}>
          <label htmlFor="url" style={{ position: 'absolute', left: -9999 }}>
            Web address to save
          </label>
          <input
            id="url"
            className="field"
            inputMode="url"
            placeholder="Paste a link to save"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Saving' : 'Save'}
          </button>
          <button className="btn" type="button" aria-expanded={pasteOpen} onClick={() => setPasteOpen((v) => !v)}>
            Paste text
          </button>
        </form>
        {pasteOpen && (
          <div className="add">
            <label htmlFor="ptitle" className="label">
              Title
            </label>
            <input id="ptitle" className="field" style={{ flex: 'none' }} value={title} onChange={(e) => setTitle(e.target.value)} />
            <label htmlFor="ptext" className="label">
              Text
            </label>
            <textarea id="ptext" className="field" style={{ flex: 'none' }} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="add-row">
              <button className="btn primary" type="button" onClick={savePaste}>
                Save text
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="error" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        )}
      </section>

      {docs && docs.length === 0 && <p className="muted">Nothing saved yet. Paste a link above to save your first article.</p>}

      {docs && docs.length > 0 && (
        <ul className="doc-list">
          {docs.map((d) => {
            const pct = d.words ? Math.round((Math.min(d.pos, d.words) / d.words) * 100) : 0;
            return (
              <li key={d.id}>
                <Link href={`/read/${d.id}`}>
                  <span className="doc-title serif">{d.title}</span>
                  <span className="doc-meta">
                    {[d.site, `${Math.max(1, Math.round(d.words / 230))} min`, pct > 0 ? `${pct}% read` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </Link>
                <button className="icon-btn" aria-label={`Delete ${d.title}`} onClick={() => remove(d)}>
                  <Trash />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
