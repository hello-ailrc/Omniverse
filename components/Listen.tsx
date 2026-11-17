'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pivotIndex, segmentsOf, type TextModel } from '@/lib/text';
import type { Doc, MarkColor, Settings, TextRange } from '@/lib/types';
import { SPOKEN_WPM, useSpeech } from '@/lib/useSpeech';
import { ChevronDown, Close, NextSentence, Pause, Play, PrevSentence } from './icons';
import { StyleSwitch, Swatches } from './MarkBar';

export default function Listen({
  doc,
  model,
  startIdx,
  settings,
  update,
  onIdx,
  onMark,
  onClose,
}: {
  doc: Doc;
  model: TextModel;
  startIdx: number;
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  onIdx: (i: number | null) => void;
  onMark: (range: TextRange, color: MarkColor) => void;
  onClose: (i: number) => void;
}) {
  const { tokens, sentences } = model;
  const [idx, setIdx] = useState(Math.min(startIdx, Math.max(0, tokens.length - 1)));
  const [view, setView] = useState<'sentence' | 'rsvp'>('sentence');
  const [showText, setShowText] = useState(true);
  const idxRef = useRef(idx);

  const setCur = useCallback(
    (i: number) => {
      idxRef.current = i;
      setIdx(i);
      onIdx(i);
    },
    [onIdx],
  );

  const { supported, playing, voices, speakFrom, stop } = useSpeech({
    doc,
    model,
    rate: settings.rate,
    voiceURI: settings.voiceURI,
    onWord: setCur,
  });

  // Start on open, stop on close.
  useEffect(() => {
    onIdx(idxRef.current);
    speakFrom(idxRef.current);
    return () => onIdx(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jump = (i: number) => {
    const to = Math.max(0, Math.min(tokens.length - 1, i));
    if (playing) speakFrom(to);
    else setCur(to);
  };

  const tok = tokens[idx];
  const sent = tok ? sentences[tok.sent] : null;

  const prevSentence = () => {
    if (!tok || !sent) return;
    jump(idx > sent.first + 2 ? sent.first : sentences[Math.max(0, sent.i - 1)].first);
  };
  const nextSentence = () => {
    if (!sent) return;
    const n = sentences[sent.i + 1];
    if (n) jump(n.first);
  };
  const seekSeconds = (sec: number) => jump(idx + Math.round(((sec * SPOKEN_WPM) / 60) * settings.rate));

  // Restart after the new setting has been applied.
  const restart = () => {
    if (playing) window.setTimeout(() => speakFrom(idxRef.current), 0);
  };
  const setRate = (rate: number) => {
    update({ rate });
    restart();
  };
  const setVoice = (voiceURI: string) => {
    update({ voiceURI });
    restart();
  };

  if (!supported) {
    return (
      <section className="now" aria-label="Now reading">
        <div className="now-head">
          <span>This browser has no built-in voice, so listening is unavailable here.</span>
          <button className="icon-btn" aria-label="Close listening" onClick={() => onClose(idx)}>
            <Close />
          </button>
        </div>
      </section>
    );
  }
  if (!tok || !sent) return null;

  const textOf = (s: { block: number; start: number; end: number } | undefined) =>
    s ? doc.blocks[s.block].text.slice(s.start, s.end) : '';
  const prev = sentences[sent.i - 1];
  const next = sentences[sent.i + 1];
  const remaining = tokens.length - idx;
  const minsLeft = Math.max(1, Math.round(remaining / (SPOKEN_WPM * settings.rate)));
  const p = pivotIndex(tok.word);
  const blockText = doc.blocks[sent.block].text;

  return (
    <section className="now" aria-label="Now reading">
      <div className="now-head">
        <span className="label">Now reading</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="seg">
            <button aria-pressed={view === 'sentence'} onClick={() => setView('sentence')}>
              Sentence
            </button>
            <button aria-pressed={view === 'rsvp'} onClick={() => setView('rsvp')}>
              RSVP
            </button>
          </div>
          <button
            className="icon-btn"
            aria-label={showText ? 'Hide the words being read' : 'Show the words being read'}
            aria-pressed={!showText}
            onClick={() => setShowText((v) => !v)}
          >
            <ChevronDown />
          </button>
          <button className="icon-btn" aria-label="Close listening" onClick={() => onClose(idx)}>
            <Close />
          </button>
        </div>
      </div>

      {showText && view === 'sentence' && (
        <div className="now-text serif" data-scope="now">
          <p className="now-side">{textOf(prev)}</p>
          <p className="now-cur" data-b={sent.block} data-off={sent.start}>
            {segmentsOf(blockText.length, [], null, tok, sent.start, sent.end).map((s) => (
              <span key={s.start} className={s.word ? 'tts-word' : undefined}>
                {blockText.slice(s.start, s.end)}
              </span>
            ))}
          </p>
          <p className="now-side">{textOf(next)}</p>
        </div>
      )}

      {showText && view === 'rsvp' && (
        <div className="word" style={{ fontSize: 'clamp(30px, 6vw, 48px)', padding: '10px 0' }} aria-live="off">
          <span className="l">{tok.word.slice(0, p)}</span>
          <span className="p">{tok.word[p]}</span>
          <span className="r">{tok.word.slice(p + 1)}</span>
        </div>
      )}

      <div className="mark-row">
        <span className="muted" style={{ fontSize: 13, marginRight: 4 }}>
          Mark this sentence
        </span>
        <Swatches color={null} style={settings.armedStyle} onPick={(c) => onMark(sent, c)} />
        <StyleSwitch style={settings.armedStyle} onStyle={(s) => update({ armedStyle: s })} />
      </div>

      <div className="slider">
        <label htmlFor="tts-pos" className="top">
          <span>{Math.round((idx / tokens.length) * 100)}%</span>
          <span>about {minsLeft} min left</span>
        </label>
        <input id="tts-pos" type="range" min={0} max={tokens.length - 1} value={idx} onChange={(e) => jump(Number(e.target.value))} />
      </div>

      <div className="transport">
        <button className="t-btn" onClick={prevSentence}>
          <PrevSentence />
          Sentence
        </button>
        <button className="t-btn" onClick={() => seekSeconds(-5)} aria-label="Back 5 seconds">
          <span style={{ fontSize: 16, fontWeight: 600 }}>-5</span>
          sec
        </button>
        <button className="t-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => (playing ? stop() : speakFrom(idx))}>
          {playing ? <Pause /> : <Play />}
        </button>
        <button className="t-btn" onClick={() => seekSeconds(5)} aria-label="Forward 5 seconds">
          <span style={{ fontSize: 16, fontWeight: 600 }}>+5</span>
          sec
        </button>
        <button className="t-btn" onClick={nextSentence}>
          <NextSentence />
          Sentence
        </button>
      </div>

      <div className="controls">
        <div className="slider">
          <label htmlFor="tts-rate" className="top">
            <span>Speed</span>
            <b>{settings.rate.toFixed(1)}x</b>
          </label>
          <input
            id="tts-rate"
            type="range"
            min={0.5}
            max={3}
            step={0.1}
            value={settings.rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </div>
        <div className="slider" style={{ flex: 'none', minWidth: 0 }}>
          <label htmlFor="tts-voice">Voice</label>
          <select id="tts-voice" className="btn" value={settings.voiceURI} onChange={(e) => setVoice(e.target.value)}>
            <option value="">Device default</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
