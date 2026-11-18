export type Block = { type: 'h' | 'p' | 'li' | 'quote'; text: string };

export type DocMeta = {
  id: string;
  title: string;
  url?: string;
  site?: string;
  byline?: string;
  savedAt: number;
  words: number;
  pos: number; // index of the word the reader has reached
  updatedAt?: number; // when this device last changed it, for sync
};

export type Doc = DocMeta & { blocks: Block[] };

export type MarkColor = 'neutral' | 'green' | 'red' | 'teal' | 'purple';
export type MarkStyle = 'underline' | 'highlight';

export type Mark = {
  id: string;
  docId: string;
  block: number;
  start: number;
  end: number;
  color: MarkColor;
  style: MarkStyle;
  flag: boolean;
  note?: string;
  text: string;
  createdAt: number;
  updatedAt?: number; // when it was last changed, for sync
};

export type TextRange = { block: number; start: number; end: number };

export const COLORS: MarkColor[] = ['neutral', 'green', 'red', 'teal', 'purple'];

export const COLOR_LABEL: Record<MarkColor, string> = {
  neutral: 'Neutral: a point worth keeping',
  green: 'Green: solution, do this',
  red: 'Red: stop, avoid',
  teal: 'Teal: research further',
  purple: 'Purple: quote word for word',
};

// The tag every mark carries, from its colour and weight.
export function tagOf(color: MarkColor, style: MarkStyle): string {
  const hl = style === 'highlight';
  switch (color) {
    case 'neutral':
      return hl ? 'Key' : 'Solid';
    case 'green':
      return hl ? 'Must do' : 'Good to do';
    case 'red':
      return hl ? 'Stop' : 'Caution';
    case 'teal':
      return hl ? 'Research' : 'Look into';
    case 'purple':
      return 'Quote';
  }
}

export const TAG_ORDER = ['Key', 'Solid', 'Must do', 'Good to do', 'Stop', 'Caution', 'Research', 'Look into', 'Quote'];

// CSS variable holding the solid colour of a mark.
export function swatchVar(color: MarkColor, style: MarkStyle): string {
  if (color === 'neutral') return style === 'highlight' ? 'var(--sw-neutral-h)' : 'var(--sw-neutral-u)';
  return `var(--sw-${color})`;
}

export type ThemeName = 'charcoal' | 'gold' | 'light' | 'sepia' | 'custom';

export type Settings = {
  theme: ThemeName;
  customBg: string;
  customFg: string;
  accent: string;
  fontSize: number;
  wpm: number;
  chunk: 1 | 2 | 3;
  showContext: boolean;
  rate: number;
  voiceURI: string;
  penMode: boolean;
  armedColor: MarkColor;
  armedStyle: MarkStyle;
  notebook: boolean;
  rsvpVoice: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'charcoal',
  customBg: '#1c1b19',
  customFg: '#ddbf73',
  accent: '#E8853A',
  fontSize: 19,
  wpm: 350,
  chunk: 1,
  showContext: true,
  rate: 1.2,
  voiceURI: '',
  penMode: false,
  armedColor: 'neutral',
  armedStyle: 'highlight',
  notebook: true,
  rsvpVoice: false,
};
