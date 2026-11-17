import { NextResponse } from 'next/server';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

export const runtime = 'nodejs';

type Block = { type: 'h' | 'p' | 'li' | 'quote'; text: string };

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'localhost' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === '0.0.0.0' ||
    h.includes(':')
  );
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function htmlToBlocks(html: string): Block[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const blocks: Block[] = [];
  const nodes = document.querySelectorAll('h1,h2,h3,h4,h5,p,li,blockquote,pre');
  nodes.forEach((el: Element) => {
    const tag = el.tagName.toLowerCase();
    // A paragraph inside a list item or quote is reported by its parent.
    if (tag === 'p' && el.closest('li,blockquote')) return;
    if (tag === 'li' && el.querySelector('li')) return;
    const text = clean(el.textContent ?? '');
    if (!text) return;
    const type: Block['type'] = tag.startsWith('h') ? 'h' : tag === 'li' ? 'li' : tag === 'blockquote' ? 'quote' : 'p';
    blocks.push({ type, text });
  });
  return blocks;
}

export async function POST(req: Request) {
  let url: URL;
  try {
    const body = await req.json();
    url = new URL(String(body.url));
  } catch {
    return NextResponse.json({ error: 'That does not look like a web address.' }, { status: 400 });
  }
  if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) {
    return NextResponse.json({ error: 'That address cannot be saved.' }, { status: 400 });
  }

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; PersonalReader/0.1)',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `The site answered with an error (${res.status}).` }, { status: 502 });
    }
    html = await res.text();
  } catch {
    return NextResponse.json({ error: 'The page could not be reached.' }, { status: 502 });
  }

  try {
    const { document } = parseHTML(html);
    const article = new Readability(document as unknown as Document).parse();
    const blocks = article?.content ? htmlToBlocks(article.content) : [];
    if (blocks.length === 0) {
      return NextResponse.json(
        { error: 'No readable article was found on that page. Try pasting the text instead.' },
        { status: 422 },
      );
    }
    return NextResponse.json({
      title: clean(article?.title ?? '') || url.hostname,
      byline: clean(article?.byline ?? '') || undefined,
      site: clean(article?.siteName ?? '') || url.hostname.replace(/^www\./, ''),
      blocks,
    });
  } catch {
    return NextResponse.json({ error: 'The page could not be read.' }, { status: 500 });
  }
}
