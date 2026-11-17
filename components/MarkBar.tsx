'use client';
import { COLORS, COLOR_LABEL, swatchVar, type MarkColor, type MarkStyle } from '@/lib/types';
import { Flag } from './icons';

// The five colours plus the underline/highlight switch. Used in the side rail,
// the phone bar, and the "mark this sentence" rows, always in the same order.
export function Swatches({
  color,
  style,
  onPick,
}: {
  color: MarkColor | null;
  style: MarkStyle;
  onPick: (c: MarkColor) => void;
}) {
  return (
    <>
      {COLORS.map((c) => (
        <button
          key={c}
          className={'swatch' + (style === 'underline' ? ' under' : '')}
          aria-label={COLOR_LABEL[c]}
          aria-pressed={color === c}
          title={COLOR_LABEL[c]}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onPick(c)}
        >
          <span style={{ background: swatchVar(c, style) }} />
        </button>
      ))}
    </>
  );
}

export function StyleSwitch({ style, onStyle }: { style: MarkStyle; onStyle: (s: MarkStyle) => void }) {
  return (
    <>
      <button
        className="mode u"
        aria-label="Underline: solid, worth noting"
        aria-pressed={style === 'underline'}
        title="Underline (U)"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onStyle('underline')}
      >
        U
      </button>
      <button
        className="mode"
        aria-label="Highlight: important, core"
        aria-pressed={style === 'highlight'}
        title="Highlight (H)"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onStyle('highlight')}
      >
        H
      </button>
    </>
  );
}

export function FlagButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      className="icon-btn"
      aria-label="Flag to reference later"
      aria-pressed={on}
      title="Reference later (F)"
      style={{ color: 'var(--sw-flag)' }}
      onPointerDown={(e) => e.preventDefault()}
      onClick={onToggle}
    >
      <Flag />
    </button>
  );
}
