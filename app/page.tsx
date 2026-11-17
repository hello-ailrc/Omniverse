'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { deleteDoc, getAllMarks, listDocs, newId, saveDoc } from '@/lib/store';
import { buildText } from '@/lib/text';
import { TAG_ORDER, swatchVar, tagOf, type Block, type Doc, type DocMeta, type Mark } from '@/lib/types';
import { useSettings } from '@/lib/useSettings';
import { Trash } from '@/components/icons';

function textToBlocks(text: string): Block[] {
  return text
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((p) => ({ type: 'p' as const, text: p }));
}

type Row = { doc: DocMeta; mark: Mark };

// Every mark across the library, newest first, with search and filters.
// Tapping one opens its article at that exact spot.
function Highlights() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    getAllMarks().then((r) => setRows(r.sort((a, b) => b.mark.createdAt - a.mark.createdAt)));
  }, []);

  const chips = useMemo(() => {
    if (!rows) return [];
    const present = new Set(rows.map((r) => tagOf(r.mark.color, r.mark.style)));
    const out = ['All', ...TAG_ORDER.filter((t) => present.has(t))];
    if (rows.some((r) => r.mark.flag)) out.push('Reference');
    if (rows.some((r) => r.mark.note)) out.push('With notes');
    return out;
  }, [rows]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows.filter(({ doc, mark }) => {
      if (filter === 'Reference' && !mark.flag) return false;
      if (filter === 'With notes' && !mark.note) return false;
      if (!['All', 'Reference', 'With notes'].includes(filter) && tagOf(mark.color, mark.style) !== filter) return false;
      if (!needle) return true;
      return [mark.text, mark.note ?? '', doc.title].some((x) => x.toLowerCase().includes(needle));
    });
  }, [rows, q, filter]);

  if (!rows) return null;
  if (rows.length === 0) {
    return <p className="muted">No highlights yet. Open an article, select some text and pick a colour.</p>;
  }

  return (
    <>
      <label htmlFor="hq" style={{ position: 'absolute', left: -9999 }}>
        Search highlights
      </label>
      <input
        id="hq"
        className="field"
        style={{ flex: 'none' }}
        type="search"
        placeholder="Search highlights, notes and titles"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="chips" role="group" aria-label="Filter highlights">
        {chips.map((c) => (
          <button key={c} className="chip" aria-pressed={filter === c} onClick={() => setFilter(c)}>
            {c}
          </button>
        ))}
      </div>
      <p className="doc-meta" style={{ margin: 0 }}>
        {shown.length} of {rows.length}
      </p>
      <ul className="doc-list">
        {shown.map(({ doc, mark }) => (
          <li key={mark.id}>
            <Link href={`/read/${doc.id}#m=${mark.id}`} className="hl-item">
              <span className="hl-top">
                <span
                  className={'nb-dot' + (mark.style === 'underline' ? ' under' : '')}
                  style={{ background: swatchVar(mark.color, mark.style) }}
                />
                {tagOf(mark.color, mark.style)}
                {mark.flag && <span className="nb-flag" style={{ marginTop: 0 }} role="img" aria-label="Flagged to reference later" />}
              </span>
              <span className="hl-text serif">{mark.text}</span>
              {mark.note && <span className="nb-note">{mark.note}</span>}
              <span className="doc-meta">
                {doc.title} · {new Date(mark.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="muted">Nothing matches that search or filter.</p>}
    </>
  );
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
  const [tab, setTab] = useState<'articles' | 'highlights'>('articles');

  // Come back to the same tab after opening an article.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('lib-tab') === 'highlights') setTab('highlights');
    } catch {
      // storage unavailable: start on Articles
    }
  }, []);
  const pickTab = (t: 'articles' | 'highlights') => {
    setTab(t);
    try {
      sessionStorage.setItem('lib-tab', t);
    } catch {
      // storage unavailable: the choice lasts for this visit only
    }
  };

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
      <div className="lib-head">
        <h1>Library</h1>
        <div className="seg" role="group" aria-label="Library section">
          <button aria-pressed={tab === 'articles'} onClick={() => pickTab('articles')}>
            Articles
          </button>
          <button aria-pressed={tab === 'highlights'} onClick={() => pickTab('highlights')}>
            Highlights
          </button>
        </div>
      </div>

      {tab === 'highlights' && <Highlights />}

      {tab === 'articles' && (
        <>

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
        </>
      )}
    </main>
  );
}
