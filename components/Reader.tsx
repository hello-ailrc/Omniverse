'use client';
import Link from 'next/link';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getDoc, getMarks, newId, putMarks, removeMarks, savePosition } from '@/lib/store';
import { buildText, segmentsOf, selectionRanges } from '@/lib/text';
import {
  COLORS,
  TAG_ORDER,
  swatchVar,
  tagOf,
  type Block,
  type Doc,
  type Mark,
  type MarkColor,
  type MarkStyle,
  type Settings,
  type TextRange,
  type ThemeName,
} from '@/lib/types';
import { useSettings } from '@/lib/useSettings';
import { ArrowLeft, ArrowRight, Back, Bolt, Close, Copy, Flag, Headphones, Note, Panel, Pencil, Trash } from './icons';
import { FlagButton, StyleSwitch, Swatches } from './MarkBar';
import Listen from './Listen';
import Rsvp from './Rsvp';

const NO_MARKS: Mark[] = [];

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  if (d.caretRangeFromPoint) {
    const r = d.caretRangeFromPoint(x, y);
    return r ? { node: r.startContainer, offset: r.startOffset } : null;
  }
  return null;
}

export function segClass(marks: Mark[], selectedId: string | null, sentence: boolean, word: boolean): string {
  const cls: string[] = [];
  if (marks.length) {
    cls.push('mk');
    const sorted = [...marks].sort((a, b) => a.createdAt - b.createdAt);
    const hl = sorted.filter((m) => m.style === 'highlight').pop();
    const ul = sorted.filter((m) => m.style === 'underline').pop();
    if (hl) cls.push('hl-' + hl.color);
    if (ul) cls.push('ul', 'ul-' + ul.color);
    if (marks.some((m) => m.flag)) cls.push('flagged');
    if (selectedId && marks.some((m) => m.id === selectedId)) cls.push('sel');
  }
  if (sentence) cls.push('tts-sent');
  if (word) cls.push('tts-word');
  return cls.join(' ');
}

const BlockView = memo(function BlockView({
  block,
  index,
  marks,
  sentence,
  word,
  selectedId,
  onMarkTap,
}: {
  block: Block;
  index: number;
  marks: Mark[];
  sentence: TextRange | null;
  word: TextRange | null;
  selectedId: string | null;
  onMarkTap: (id: string) => void;
}) {
  const segs = segmentsOf(block.text.length, marks, sentence, word);
  const Tag = block.type === 'h' ? 'h2' : 'p';
  return (
    <Tag className={'blk ' + block.type} data-b={index}>
      {segs.map((s) => {
        const cls = segClass(s.marks, selectedId, s.sentence, s.word);
        const top = s.marks.length ? [...s.marks].sort((a, b) => b.createdAt - a.createdAt)[0] : null;
        return (
          <span
            key={s.start}
            className={cls || undefined}
            onClick={
              top
                ? () => {
                    const sel = window.getSelection();
                    if (!sel || sel.isCollapsed) onMarkTap(top.id);
                  }
                : undefined
            }
          >
            {block.text.slice(s.start, s.end)}
          </span>
        );
      })}
    </Tag>
  );
});

function Notebook({
  marks,
  onOpen,
  onExport,
}: {
  marks: Mark[];
  onOpen: (m: Mark) => void;
  onExport: () => void;
}) {
  const groups = useMemo(() => {
    const by = new Map<string, Mark[]>();
    [...marks]
      .sort((a, b) => a.block - b.block || a.start - b.start)
      .forEach((m) => {
        const tag = tagOf(m.color, m.style);
        by.set(tag, [...(by.get(tag) ?? []), m]);
      });
    return TAG_ORDER.filter((t) => by.has(t)).map((t) => ({ tag: t, items: by.get(t)! }));
  }, [marks]);

  return (
    <aside className="notebook" aria-label="Notebook">
      <div className="nb-head">
        <strong style={{ fontSize: 15 }}>Notebook</strong>
        <span className="muted">
          {marks.length} {marks.length === 1 ? 'mark' : 'marks'}
        </span>
      </div>
      {marks.length === 0 && <p className="muted" style={{ margin: 0 }}>Select text, then pick a colour to make your first mark.</p>}
      {groups.map((g) => (
        <div className="nb-group" key={g.tag}>
          <span className="nb-tag">
            <span
              className={'nb-dot' + (g.items[0].style === 'underline' ? ' under' : '')}
              style={{ background: swatchVar(g.items[0].color, g.items[0].style) }}
            />
            {g.tag}
          </span>
          {g.items.map((m) => (
            <button className="nb-item" key={m.id} onClick={() => onOpen(m)}>
              <span style={{ flex: 1 }}>
                {m.text}
                {m.note && <span className="nb-note">{m.note}</span>}
              </span>
              {m.flag && <span className="nb-flag" role="img" aria-label="Flagged to reference later" />}
            </button>
          ))}
        </div>
      ))}
      {marks.length > 0 && (
        <button className="btn" style={{ marginTop: 'auto' }} onClick={onExport}>
          Copy all marks
        </button>
      )}
    </aside>
  );
}

// The pop-up that opens next to a tapped mark: recolour, resize word by word, flag, note, copy, delete.
function MarkPopup({
  mark,
  pos,
  onColor,
  onStyle,
  onResize,
  onFlag,
  onNote,
  onCopy,
  onDelete,
  onClose,
}: {
  mark: Mark;
  pos: CSSProperties;
  onColor: (c: MarkColor) => void;
  onStyle: (s: MarkStyle) => void;
  onResize: (edge: 'start' | 'end', dir: -1 | 1) => void;
  onFlag: () => void;
  onNote: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="popup" role="dialog" aria-label="Edit this mark" style={pos} onPointerDown={(e) => e.preventDefault()}>
      <div className="row">
        <span className="nb-tag">
          <span className={'nb-dot' + (mark.style === 'underline' ? ' under' : '')} style={{ background: swatchVar(mark.color, mark.style) }} />
          {tagOf(mark.color, mark.style)}
        </span>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <Close />
        </button>
      </div>
      <div className="mark-row">
        <Swatches color={mark.color} style={mark.style} onPick={onColor} />
        <StyleSwitch style={mark.style} onStyle={onStyle} />
      </div>
      <div className="row adjust">
        <span className="muted">Start</span>
        <button className="icon-btn edge" aria-label="Start one word earlier" onClick={() => onResize('start', -1)}>
          <ArrowLeft />
        </button>
        <button className="icon-btn edge" aria-label="Start one word later" onClick={() => onResize('start', 1)}>
          <ArrowRight />
        </button>
        <span className="muted" style={{ marginLeft: 'auto' }}>
          End
        </span>
        <button className="icon-btn edge" aria-label="End one word earlier" onClick={() => onResize('end', -1)}>
          <ArrowLeft />
        </button>
        <button className="icon-btn edge" aria-label="End one word later" onClick={() => onResize('end', 1)}>
          <ArrowRight />
        </button>
      </div>
      <div className="row actions">
        <button className="btn sm" aria-pressed={mark.flag} onClick={onFlag}>
          <Flag />
          {mark.flag ? 'Flagged' : 'Flag'}
        </button>
        <button className="btn sm" onClick={onNote}>
          <Note />
          Note
        </button>
        <button className="btn sm" onClick={onCopy}>
          <Copy />
          Copy
        </button>
        <button className="btn sm danger" onClick={onDelete}>
          <Trash />
          Delete
        </button>
      </div>
    </div>
  );
}

const THEMES: { name: ThemeName; label: string; bg: string; fg: string }[] = [
  { name: 'charcoal', label: 'Charcoal', bg: '#262624', fg: '#ece9e1' },
  { name: 'gold', label: 'Gold', bg: '#1c1b19', fg: '#ddbf73' },
  { name: 'light', label: 'Light', bg: '#faf9f5', fg: '#1f1e1c' },
  { name: 'sepia', label: 'Sepia', bg: '#f3ead7', fg: '#3a2f22' },
];

function Appearance({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  return (
    <div className="sheet" role="dialog" aria-label="Appearance">
      <span className="label">Theme</span>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        {THEMES.map((t) => (
          <button
            key={t.name}
            className="theme-btn"
            aria-pressed={settings.theme === t.name}
            style={{ background: t.bg, color: t.fg }}
            onClick={() => update({ theme: t.name })}
          >
            {t.label}
          </button>
        ))}
        <button
          className="theme-btn"
          aria-pressed={settings.theme === 'custom'}
          style={{ background: settings.customBg, color: settings.customFg }}
          onClick={() => update({ theme: 'custom' })}
        >
          Custom
        </button>
      </div>
      {settings.theme === 'custom' && (
        <div className="row">
          <label htmlFor="cbg">Background</label>
          <input id="cbg" type="color" value={settings.customBg} onChange={(e) => update({ customBg: e.target.value })} />
          <label htmlFor="cfg">Text</label>
          <input id="cfg" type="color" value={settings.customFg} onChange={(e) => update({ customFg: e.target.value })} />
        </div>
      )}
      <div className="row">
        <label htmlFor="acc">Accent and RSVP focus colour</label>
        <input id="acc" type="color" value={settings.accent} onChange={(e) => update({ accent: e.target.value })} />
      </div>
      <div className="slider">
        <label htmlFor="fs" className="top">
          <span>Text size</span>
          <b>{settings.fontSize}px</b>
        </label>
        <input
          id="fs"
          type="range"
          min={15}
          max={28}
          value={settings.fontSize}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}

export default function Reader({ id }: { id: string }) {
  const [settings, update] = useSettings();
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined);
  const [marks, setMarksState] = useState<Mark[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const [showLook, setShowLook] = useState(false);
  const [listening, setListening] = useState(false);
  const [rsvp, setRsvp] = useState(false);
  const [pos, setPos] = useState(0);
  const [ttsIdx, setTtsIdx] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [popPos, setPopPos] = useState<CSSProperties | null>(null);
  // On a phone the notebook is a pull-up sheet: closed until asked for, and never over the listening panel.
  const [isPhone, setIsPhone] = useState(false);
  const [phoneNotebook, setPhoneNotebook] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsPhone(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const pendingRef = useRef<TextRange[]>([]);
  const articleRef = useRef<HTMLElement | null>(null);
  const lastUserScroll = useRef(0);
  const marksRef = useRef<Mark[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let live = true;
    Promise.all([getDoc(id), getMarks(id)]).then(([d, m]) => {
      if (!live) return;
      setDoc(d ?? null);
      setMarksState(m);
      marksRef.current = m;
      setPos(d?.pos ?? 0);
    });
    return () => {
      live = false;
    };
  }, [id]);

  const model = useMemo(() => buildText(doc?.blocks ?? []), [doc]);

  const say = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 1800);
  }, []);

  // Every local edit bumps this, so a reload started before the edit is redone after it.
  const editSeq = useRef(0);
  const setLocal = useCallback((next: Mark[]) => {
    editSeq.current++;
    marksRef.current = next;
    setMarksState(next);
  }, []);

  // Marks changed on another device: reload them from the device store.
  useEffect(() => {
    const reload = () => {
      const seq = editSeq.current;
      getMarks(id).then((m) => {
        if (seq !== editSeq.current) return reload();
        marksRef.current = m;
        setMarksState(m);
      });
    };
    const onChanged = (e: Event) => {
      const docs = (e as CustomEvent<{ docs: string[] }>).detail?.docs ?? [];
      if (docs.includes(id)) reload();
    };
    window.addEventListener('omniverse:changed', onChanged);
    return () => window.removeEventListener('omniverse:changed', onChanged);
  }, [id]);

  const addMarks = useCallback(
    (ranges: TextRange[], color: MarkColor, style: MarkStyle, flag = false) => {
      if (!doc || ranges.length === 0) return;
      const now = Date.now();
      const made: Mark[] = ranges.map((r, k) => ({
        id: newId(),
        docId: id,
        block: r.block,
        start: r.start,
        end: r.end,
        color,
        style,
        flag,
        text: doc.blocks[r.block].text.slice(r.start, r.end),
        createdAt: now + k,
      }));
      setLocal([...marksRef.current, ...made]);
      putMarks(id, made);
    },
    [doc, id, setLocal],
  );

  const patchMark = useCallback(
    (markId: string, patch: Partial<Mark>) => {
      const m = marksRef.current.find((x) => x.id === markId);
      if (!m) return;
      const updated = { ...m, ...patch };
      setLocal(marksRef.current.map((x) => (x.id === markId ? updated : x)));
      putMarks(id, [updated]);
    },
    [id, setLocal],
  );

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    pendingRef.current = [];
    setHasPending(false);
  };

  // Colour button: marks the selected text, recolours the tapped mark, or just arms the colour.
  const pickColor = useCallback(
    (color: MarkColor) => {
      const s = settingsRef.current;
      update({ armedColor: color });
      if (pendingRef.current.length) {
        addMarks(pendingRef.current, color, s.armedStyle);
        clearSelection();
      } else if (selectedId) {
        patchMark(selectedId, { color });
      }
    },
    [addMarks, patchMark, selectedId, update],
  );

  const pickStyle = useCallback(
    (style: MarkStyle) => {
      update({ armedStyle: style });
      if (!pendingRef.current.length && selectedId) patchMark(selectedId, { style });
    },
    [patchMark, selectedId, update],
  );

  const toggleFlag = useCallback(() => {
    const s = settingsRef.current;
    if (pendingRef.current.length) {
      addMarks(pendingRef.current, s.armedColor, s.armedStyle, true);
      clearSelection();
    } else if (selectedId) {
      const m = marksRef.current.find((x) => x.id === selectedId);
      if (m) patchMark(selectedId, { flag: !m.flag });
    } else {
      say('Select text or tap a mark first');
    }
  }, [addMarks, patchMark, selectedId, say]);

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    setLocal(marksRef.current.filter((m) => m.id !== selectedId));
    removeMarks(id, [selectedId]);
    setSelectedId(null);
  }, [id, setLocal, selectedId]);

  // Grow or shrink a mark by one word at either end.
  const resizeSelected = (edge: 'start' | 'end', dir: -1 | 1) => {
    const m = marksRef.current.find((x) => x.id === selectedId);
    if (!m || !doc) return;
    const toks = model.tokens.filter((t) => t.block === m.block);
    let { start, end } = m;
    if (edge === 'start') {
      const t = dir < 0 ? [...toks].reverse().find((x) => x.start < start) : toks.find((x) => x.start > start && x.start < end);
      if (t) start = t.start;
    } else {
      const t = dir > 0 ? toks.find((x) => x.end > end) : [...toks].reverse().find((x) => x.end < end && x.end > start);
      if (t) end = t.end;
    }
    if (start === m.start && end === m.end) return;
    patchMark(m.id, { start, end, text: doc.blocks[m.block].text.slice(start, end) });
  };

  const noteSelected = () => {
    const m = marksRef.current.find((x) => x.id === selectedId);
    if (!m) return;
    const note = window.prompt('Note for this mark', m.note ?? '');
    if (note !== null) patchMark(m.id, { note: note.trim() || undefined });
  };

  const copyText = async () => {
    const m = marksRef.current.find((x) => x.id === selectedId);
    const text = pendingRef.current.length
      ? pendingRef.current.map((r) => doc!.blocks[r.block].text.slice(r.start, r.end)).join('\n')
      : m?.text;
    if (!text) return say('Select text or tap a mark first');
    try {
      await navigator.clipboard.writeText(text);
      say('Copied');
    } catch {
      say('Copy was blocked by the browser');
    }
  };

  const exportMarks = async () => {
    if (!doc) return;
    const sorted = [...marksRef.current].sort((a, b) => a.block - b.block || a.start - b.start);
    const lines = [`# ${doc.title}`, doc.url ?? '', ''];
    TAG_ORDER.forEach((tag) => {
      const items = sorted.filter((m) => tagOf(m.color, m.style) === tag);
      if (!items.length) return;
      lines.push(`## ${tag}`);
      items.forEach((m) => {
        lines.push(`- ${m.text}${m.flag ? ' #reference' : ''}`);
        if (m.note) lines.push(`  - Note: ${m.note}`);
      });
      lines.push('');
    });
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      say('Marks copied');
    } catch {
      say('Copy was blocked by the browser');
    }
  };

  // Track the text selection, and in pen mode mark it as soon as the pen or mouse lifts.
  useEffect(() => {
    let timer = 0;
    const onSel = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const ranges = selectionRanges();
        pendingRef.current = ranges;
        setHasPending(ranges.length > 0);
        if (ranges.length) setSelectedId(null);
      }, 120);
    };
    const onUp = (e: PointerEvent) => {
      const s = settingsRef.current;
      if (!s.penMode || e.pointerType === 'touch') return;
      window.setTimeout(() => {
        const ranges = selectionRanges();
        if (!ranges.length) return;
        addMarks(ranges, s.armedColor, s.armedStyle);
        clearSelection();
      }, 20);
    };
    document.addEventListener('selectionchange', onSel);
    document.addEventListener('pointerup', onUp);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('selectionchange', onSel);
      document.removeEventListener('pointerup', onUp);
    };
  }, [addMarks]);

  // Pen mode with a stylus: dragging the pen across text selects it instead of scrolling.
  useEffect(() => {
    const el = articleRef.current;
    if (!el || !settings.penMode) return;
    let anchor: { node: Node; offset: number } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0] as Touch & { touchType?: string };
      if (t && t.touchType === 'stylus') e.preventDefault();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') return;
      anchor = caretAt(e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'pen' || !anchor) return;
      const head = caretAt(e.clientX, e.clientY);
      if (head) window.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
    };
    const onEnd = () => {
      anchor = null;
    };
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
    };
  }, [settings.penMode, doc]);

  // Laptop shortcuts: 1 to 5 colours, U and H weight, F flag, Delete removes the tapped mark.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (rsvp || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 5) pickColor(COLORS[n - 1]);
      else if (e.key === 'u' || e.key === 'U') pickStyle('underline');
      else if (e.key === 'h' || e.key === 'H') pickStyle('highlight');
      else if (e.key === 'f' || e.key === 'F') toggleFlag();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) removeSelected();
      else if (e.key === 'Escape') {
        setSelectedId(null);
        setShowLook(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rsvp, pickColor, pickStyle, toggleFlag, removeSelected, selectedId]);

  const scrollToBlock = useCallback((block: number, smooth = true) => {
    const el = articleRef.current?.querySelector(`[data-b="${block}"]`);
    el?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Restore the reading position once the article is on screen.
  const restored = useRef(false);
  useEffect(() => {
    if (!doc || restored.current || !model.tokens.length) return;
    restored.current = true;
    // A link from the Highlights list opens straight at that mark.
    const wanted = window.location.hash.match(/m=([\w-]+)/)?.[1];
    const target = wanted ? marksRef.current.find((m) => m.id === wanted) : null;
    if (target) {
      setSelectedId(target.id);
      scrollToBlock(target.block, false);
      return;
    }
    const t = model.tokens[Math.min(doc.pos, model.tokens.length - 1)];
    if (t && t.block > 0) scrollToBlock(t.block, false);
  }, [doc, model, scrollToBlock]);

  // Remember how far the reader has scrolled.
  useEffect(() => {
    const el = articleRef.current;
    if (!el || !doc) return;
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (listening || rsvp) return;
        const top = el.getBoundingClientRect().top + 90;
        const blocks = Array.from(el.querySelectorAll<HTMLElement>('[data-b]'));
        const first = blocks.find((b) => b.getBoundingClientRect().bottom > top);
        if (!first) return;
        const tok = model.tokens.find((t) => t.block === Number(first.dataset.b));
        if (tok) {
          setPos(tok.i);
          savePosition(id, tok.i);
        }
      }, 400);
    };
    const onUser = () => {
      lastUserScroll.current = Date.now();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onUser, { passive: true });
    el.addEventListener('touchmove', onUser, { passive: true });
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onUser);
      el.removeEventListener('touchmove', onUser);
    };
  }, [doc, model, id, listening, rsvp]);

  // While listening, keep the spoken sentence in view unless the reader just scrolled.
  const ttsTok = ttsIdx !== null ? model.tokens[ttsIdx] : null;
  const ttsSent = ttsTok ? model.sentences[ttsTok.sent] : null;
  useEffect(() => {
    if (!ttsSent) return;
    if (Date.now() - lastUserScroll.current < 4000) return;
    scrollToBlock(ttsSent.block);
  }, [ttsSent, scrollToBlock]);

  // Keep the pop-up next to the tapped mark, below it when there is room and above it otherwise.
  const placePopup = useCallback(() => {
    const els = selectedId ? articleRef.current?.querySelectorAll('.mk.sel') : null;
    if (!els || els.length === 0) {
      setPopPos(null);
      return;
    }
    const first = els[0].getBoundingClientRect();
    const lastRect = els[els.length - 1].getBoundingClientRect();
    const width = Math.min(376, window.innerWidth - 16);
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, first.left));
    if (window.innerHeight - lastRect.bottom > 300) setPopPos({ top: lastRect.bottom + 10, left, width });
    else setPopPos({ bottom: window.innerHeight - first.top + 10, left, width });
  }, [selectedId]);

  useLayoutEffect(() => {
    placePopup();
  }, [placePopup, marks]);

  useEffect(() => {
    const el = articleRef.current;
    if (!el || !selectedId) return;
    el.addEventListener('scroll', placePopup, { passive: true });
    window.addEventListener('resize', placePopup);
    return () => {
      el.removeEventListener('scroll', placePopup);
      window.removeEventListener('resize', placePopup);
    };
  }, [placePopup, selectedId, doc]);

  const marksByBlock = useMemo(() => {
    const map = new Map<number, Mark[]>();
    marks.forEach((m) => map.set(m.block, [...(map.get(m.block) ?? []), m]));
    return map;
  }, [marks]);

  const onTtsIdx = useCallback((i: number | null) => {
    setTtsIdx(i);
    if (i !== null) setPos(i);
  }, []);

  // Save the listening position once per sentence.
  useEffect(() => {
    if (ttsSent) savePosition(id, ttsSent.first);
  }, [ttsSent, id]);

  const onMarkTap = useCallback((markId: string) => setSelectedId((cur) => (cur === markId ? null : markId)), []);

  // "Mark this sentence" from the listening panel or RSVP. Uses selected words if there are any.
  const markSentence = useCallback(
    (range: TextRange, color: MarkColor) => {
      const s = settingsRef.current;
      update({ armedColor: color });
      const ranges = pendingRef.current.length ? pendingRef.current : [range];
      addMarks(ranges, color, s.armedStyle);
      clearSelection();
      say('Marked');
    },
    [addMarks, say, update],
  );

  const moveTo = useCallback(
    (i: number) => {
      setPos(i);
      savePosition(id, i);
    },
    [id],
  );

  if (doc === undefined) return <main className="library" aria-busy="true" />;
  if (doc === null) {
    return (
      <main className="library">
        <p>This article is not saved on this device.</p>
        <Link href="/" className="btn" style={{ display: 'inline-flex', alignItems: 'center', width: 'fit-content', textDecoration: 'none' }}>
          Back to library
        </Link>
      </main>
    );
  }

  const selected = marks.find((m) => m.id === selectedId) ?? null;
  const shownColor = selected ? selected.color : settings.armedColor;
  const shownStyle = selected ? selected.style : settings.armedStyle;
  const showNotebook = isPhone ? phoneNotebook && !listening : settings.notebook;
  const pct = model.tokens.length ? Math.round((pos / model.tokens.length) * 100) : 0;

  return (
    <div className={'reader' + (settings.penMode ? ' pen-on' : '') + (listening ? ' is-listening' : '')}>
      <header className="topbar">
        <div className="group">
          <Link href="/" className="icon-btn" aria-label="Back to library" style={{ color: 'inherit' }}>
            <Back />
          </Link>
          <span className="muted" style={{ fontSize: 14 }}>
            {pct}% read
          </span>
        </div>
        <div className="group">
          <button className="pill" aria-pressed={listening} onClick={() => setListening((v) => !v)}>
            <Headphones />
            <span className="txt">{listening ? 'Listening' : 'Listen'}</span>
          </button>
          <button
            className="pill"
            onClick={() => {
              setListening(false);
              setRsvp(true);
            }}
          >
            <Bolt />
            <span className="txt">RSVP</span>
          </button>
          <button className="icon-btn" aria-label="Appearance and themes" aria-expanded={showLook} onClick={() => setShowLook((v) => !v)}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Aa</span>
          </button>
          <button
            className="icon-btn"
            aria-label="Notebook"
            aria-pressed={showNotebook}
            onClick={() => (isPhone ? setPhoneNotebook((v) => !v) : update({ notebook: !settings.notebook }))}
          >
            <Panel />
          </button>
        </div>
      </header>

      {showLook && <Appearance settings={settings} update={update} />}

      <div className="reader-body">
        <nav className="rail" aria-label="Mark bar">
          <Swatches color={shownColor} style={shownStyle} onPick={pickColor} />
          <span className="sep" aria-hidden="true" />
          <StyleSwitch style={shownStyle} onStyle={pickStyle} />
          <span className="sep" aria-hidden="true" />
          <FlagButton on={!!selected?.flag} onToggle={toggleFlag} />
          <button
            className="icon-btn"
            aria-label="Pen mode: mark text as soon as you lift the pen"
            aria-pressed={settings.penMode}
            title="Pen mode"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              update({ penMode: !settings.penMode });
              say(settings.penMode ? 'Pen mode off' : 'Pen mode on: drag across text to mark');
            }}
          >
            <Pencil />
          </button>
          {hasPending && (
            <>
              <span className="sep" aria-hidden="true" />
              <button className="icon-btn" aria-label="Copy text" onPointerDown={(e) => e.preventDefault()} onClick={copyText}>
                <Copy />
              </button>
            </>
          )}
        </nav>

        <main
          className="article"
          ref={articleRef}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('.mk')) setSelectedId(null);
          }}
        >
          <div className="article-inner serif" data-scope="article">
            <p className="label" style={{ fontFamily: 'Inter, system-ui, sans-serif', margin: 0 }}>
              {[doc.site, `${Math.max(1, Math.round(doc.words / 230))} min`].filter(Boolean).join(' · ')}
            </p>
            <h1>{doc.title}</h1>
            {doc.byline && (
              <p className="muted" style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, marginTop: 0 }}>
                {doc.byline}
              </p>
            )}
            {doc.blocks.map((b, i) => (
              <BlockView
                key={i}
                block={b}
                index={i}
                marks={marksByBlock.get(i) ?? NO_MARKS}
                sentence={ttsSent && ttsSent.block === i ? ttsSent : null}
                word={ttsTok && ttsTok.block === i ? ttsTok : null}
                selectedId={selectedId}
                onMarkTap={onMarkTap}
              />
            ))}
          </div>
        </main>

        {showNotebook && (
          <Notebook
            marks={marks}
            onExport={exportMarks}
            onOpen={(m) => {
              setPhoneNotebook(false);
              setSelectedId(m.id);
              scrollToBlock(m.block);
            }}
          />
        )}
      </div>

      {selected && popPos && (
        <MarkPopup
          mark={selected}
          pos={popPos}
          onColor={pickColor}
          onStyle={pickStyle}
          onResize={resizeSelected}
          onFlag={toggleFlag}
          onNote={noteSelected}
          onCopy={copyText}
          onDelete={removeSelected}
          onClose={() => setSelectedId(null)}
        />
      )}

      {listening && (
        <Listen
          doc={doc}
          model={model}
          startIdx={pos}
          settings={settings}
          update={update}
          onIdx={onTtsIdx}
          onMark={markSentence}
          onClose={(i) => {
            setListening(false);
            setTtsIdx(null);
            moveTo(i);
          }}
        />
      )}

      {rsvp && (
        <Rsvp
          doc={doc}
          model={model}
          marks={marks}
          startIdx={pos}
          settings={settings}
          update={update}
          onMark={markSentence}
          onClose={(i) => {
            setRsvp(false);
            moveTo(i);
            const t = model.tokens[i];
            if (t) window.setTimeout(() => scrollToBlock(t.block, false), 50);
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            top: 72,
            transform: 'translateX(-50%)',
            zIndex: 60,
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 14,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
