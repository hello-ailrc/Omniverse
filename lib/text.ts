import type { Block, Mark, TextRange } from './types';

export type Token = {
  i: number;
  block: number;
  start: number;
  end: number;
  word: string;
  sent: number;
  endsSentence: boolean;
  endsBlock: boolean;
};

export type Sentence = { i: number; block: number; start: number; end: number; first: number; last: number };

export type TextModel = { tokens: Token[]; sentences: Sentence[] };

const ABBREV = /^(mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|no|fig|inc|ltd)\.$/i;

export function buildText(blocks: Block[]): TextModel {
  const tokens: Token[] = [];
  const sentences: Sentence[] = [];
  blocks.forEach((b, block) => {
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    let sentFirst = -1;
    const words: { start: number; end: number; word: string }[] = [];
    while ((m = re.exec(b.text))) words.push({ start: m.index, end: m.index + m[0].length, word: m[0] });
    words.forEach((w, k) => {
      const lastInBlock = k === words.length - 1;
      const stop = /[.!?]["')\]”’]*$/.test(w.word) && !ABBREV.test(w.word);
      const endsSentence = stop || lastInBlock;
      if (sentFirst < 0) sentFirst = tokens.length;
      tokens.push({
        i: tokens.length,
        block,
        start: w.start,
        end: w.end,
        word: w.word,
        sent: sentences.length,
        endsSentence,
        endsBlock: lastInBlock,
      });
      if (endsSentence) {
        sentences.push({
          i: sentences.length,
          block,
          start: tokens[sentFirst].start,
          end: w.end,
          first: sentFirst,
          last: tokens.length - 1,
        });
        sentFirst = -1;
      }
    });
  });
  return { tokens, sentences };
}

// The letter the eye should rest on, slightly left of centre for longer words.
export function pivotIndex(word: string): number {
  const lead = word.match(/^[^\p{L}\p{N}]*/u)?.[0].length ?? 0;
  const core = word.slice(lead).replace(/[^\p{L}\p{N}]+$/u, '').length;
  let p = 0;
  if (core <= 1) p = 0;
  else if (core <= 5) p = 1;
  else if (core <= 9) p = 2;
  else if (core <= 13) p = 3;
  else p = 4;
  return Math.min(word.length - 1, lead + p);
}

// How long a word stays on screen, in milliseconds.
export function wordDelay(t: Token, wpm: number): number {
  const base = 60000 / wpm;
  let k = 1;
  if (t.word.length > 8) k += 0.3;
  if (t.word.length > 12) k += 0.2;
  if (/[,;:—]$/.test(t.word)) k += 0.5;
  if (t.endsSentence) k += 1.0;
  if (t.endsBlock) k += 0.4;
  return base * k;
}

export type Segment = { start: number; end: number; marks: Mark[]; sentence: boolean; word: boolean };

// Cut a block's text into runs that share the same marks and reading-position overlays.
export function segmentsOf(
  textLength: number,
  marks: Mark[],
  sentence?: TextRange | null,
  word?: TextRange | null,
  from = 0,
  to = textLength,
): Segment[] {
  const cuts = new Set<number>([from, to]);
  const add = (n: number) => {
    if (n > from && n < to) cuts.add(n);
  };
  marks.forEach((m) => {
    add(m.start);
    add(m.end);
  });
  if (sentence) {
    add(sentence.start);
    add(sentence.end);
  }
  if (word) {
    add(word.start);
    add(word.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const start = points[k];
    const end = points[k + 1];
    out.push({
      start,
      end,
      marks: marks.filter((m) => m.start < end && m.end > start),
      sentence: !!sentence && sentence.start < end && sentence.end > start,
      word: !!word && word.start < end && word.end > start,
    });
  }
  return out;
}

// Turn the browser's current text selection into ranges inside blocks.
// Any element carrying data-b (block index) and optional data-off (offset of its
// first character inside the block) can be selected from.
export function selectionRanges(): TextRange[] {
  const sel = typeof window === 'undefined' ? null : window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return [];
  const range = sel.getRangeAt(0);
  const holder = (n: Node | null): HTMLElement | null => {
    const el = n instanceof HTMLElement ? n : n?.parentElement ?? null;
    return el?.closest<HTMLElement>('[data-b]') ?? null;
  };
  const first = holder(range.startContainer);
  const last = holder(range.endContainer);
  if (!first || !last) return [];
  const scope = first.closest('[data-scope]');
  if (!scope || scope !== last.closest('[data-scope]')) return [];
  const all = Array.from(scope.querySelectorAll<HTMLElement>('[data-b]'));
  const a = all.indexOf(first);
  const z = all.indexOf(last);
  if (a < 0 || z < 0) return [];
  const out: TextRange[] = [];
  for (let k = a; k <= z; k++) {
    const el = all[k];
    const base = Number(el.dataset.off ?? 0);
    const len = el.textContent?.length ?? 0;
    let s = 0;
    let e = len;
    if (k === a) {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.setEnd(range.startContainer, range.startOffset);
      s = r.toString().length;
    }
    if (k === z) {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.setEnd(range.endContainer, range.endOffset);
      e = r.toString().length;
    }
    if (e > s) out.push({ block: Number(el.dataset.b), start: base + s, end: base + e });
  }
  return out;
}
