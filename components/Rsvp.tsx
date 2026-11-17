'use client';
import { useEffect, useRef, useState } from 'react';
import { pivotIndex, wordDelay, type TextModel } from '@/lib/text';
import type { Doc, Mark, MarkColor, Settings, TextRange } from '@/lib/types';
import { SPOKEN_WPM, useSpeech } from '@/lib/useSpeech';
import { Close, Forward, NextSentence, Pause, Play, PrevSentence, Rewind, Speaker } from './icons';
import { StyleSwitch, Swatches } from './MarkBar';
import { segClass } from './Reader';

export default function Rsvp({
  doc,
  model,
  marks,
  startIdx,
  settings,
  update,
  onMark,
  onClose,
}: {
  doc: Doc;
  model: TextModel;
  marks: Mark[];
  startIdx: number;
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  onMark: (range: TextRange, color: MarkColor) => void;
  onClose: (i: number) => void;
}) {
  const { tokens, sentences } = model;
  const last = Math.max(0, tokens.length - 1);
  const [idx, setIdx] = useState(Math.min(startIdx, last));
  const [timerPlaying, setPlaying] = useState(false);
  const [count, setCount] = useState(0);
  const curRef = useRef<HTMLSpanElement | null>(null);
  const idxRef = useRef(idx);
  idxRef.current = idx;

  // With voice on, the spoken word drives the display instead of the timer.
  const speech = useSpeech({ doc, model, rate: settings.rate, voiceURI: settings.voiceURI, onWord: setIdx });
  const voice = settings.rsvpVoice && speech.supported;
  const playing = voice ? speech.playing : timerPlaying;

  const tok = tokens[idx];
  const sent = tok ? sentences[tok.sent] : null;
  // Words shown together never cross a sentence end.
  const n = tok && sent && !voice ? Math.max(1, Math.min(settings.chunk, sent.last - idx + 1)) : 1;

  // Countdown, then advance word by word with timing that follows punctuation and word length.
  useEffect(() => {
    if (voice || !timerPlaying || !tok) return;
    if (count > 0) {
      const t = window.setTimeout(() => setCount((c) => c - 1), 450);
      return () => window.clearTimeout(t);
    }
    const lastTok = tokens[idx + n - 1];
    const delay = wordDelay(lastTok, settings.wpm) * (n > 1 ? n * 0.85 : 1);
    const t = window.setTimeout(() => {
      if (idx + n > last) setPlaying(false);
      else setIdx(idx + n);
    }, delay);
    return () => window.clearTimeout(t);
  }, [voice, timerPlaying, count, idx, n, tok, tokens, last, settings.wpm]);

  const toggle = () => {
    if (voice) {
      if (speech.playing) speech.stop();
      else speech.speakFrom(idx);
    } else if (timerPlaying) setPlaying(false);
    else {
      setCount(3);
      setPlaying(true);
    }
  };
  const jump = (i: number) => {
    const to = Math.max(0, Math.min(last, i));
    setIdx(to);
    if (voice && speech.playing) speech.speakFrom(to);
  };
  const toggleVoice = () => {
    speech.stop();
    setPlaying(false);
    update({ rsvpVoice: !settings.rsvpVoice });
  };
  const setRate = (rate: number) => {
    update({ rate });
    // Restart after the new speed has been applied.
    if (speech.playing) window.setTimeout(() => speech.speakFrom(idxRef.current), 0);
  };
  const prevSentence = () => {
    if (!sent) return;
    jump(idx > sent.first ? sent.first : sentences[Math.max(0, sent.i - 1)].first);
  };
  const nextSentence = () => {
    if (!sent) return;
    const nx = sentences[sent.i + 1];
    if (nx) jump(nx.first);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.key === ' ') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'ArrowLeft') jump(idx - 10);
      else if (e.key === 'ArrowRight') jump(idx + 10);
      else if (e.key === 'ArrowUp' && !voice) update({ wpm: Math.min(900, settings.wpm + 25) });
      else if (e.key === 'ArrowDown' && !voice) update({ wpm: Math.max(100, settings.wpm - 25) });
      else if (e.key === 'Escape') onClose(idx);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    curRef.current?.scrollIntoView({ block: 'nearest' });
  }, [idx, settings.showContext]);

  if (!tok || !sent) {
    return (
      <div className="rsvp" role="dialog" aria-label="RSVP">
        <header className="topbar">
          <button className="icon-btn" aria-label="Close RSVP" onClick={() => onClose(0)}>
            <Close />
          </button>
        </header>
        <p style={{ padding: 28 }}>There is no text to read here.</p>
      </div>
    );
  }

  const shown = tokens
    .slice(idx, idx + n)
    .map((t) => t.word)
    .join(' ');
  let p = n === 1 ? pivotIndex(shown) : Math.floor(shown.length * 0.4);
  if (shown[p] === ' ') p++;

  const remaining = tokens.length - idx;
  const pace = voice ? SPOKEN_WPM * settings.rate : settings.wpm;
  const secs = Math.round((remaining / pace) * 60);
  const left = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} left`;

  const blockText = doc.blocks[tok.block].text;
  const blockTokens = tokens.filter((t) => t.block === tok.block);
  const blockMarks = marks.filter((m) => m.block === tok.block);

  return (
    <div className="rsvp" role="dialog" aria-label="RSVP">
      <header className="topbar">
        <div className="group" style={{ flex: 1 }}>
          <button className="icon-btn" aria-label="Close RSVP and return to the article" onClick={() => onClose(idx)}>
            <Close />
          </button>
          <span className="muted" style={{ fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {doc.title}
          </span>
        </div>
        <div className="group" style={{ flex: 'none' }}>
          {speech.supported && (
            <button className="pill" aria-pressed={voice} onClick={toggleVoice}>
              <Speaker />
              <span className="txt">{voice ? 'Voice on' : 'Voice'}</span>
            </button>
          )}
          <button className="pill" aria-pressed={settings.showContext} onClick={() => update({ showContext: !settings.showContext })}>
            Context
          </button>
        </div>
      </header>

      {settings.showContext && (
        <section className="context" aria-label="Context">
          <span className="label">Tap a word to jump · select words to mark them</span>
          <p className="context-text serif" data-scope="context" data-b={tok.block} data-off={0}>
            {blockTokens.map((t, k) => {
              const gapStart = k === 0 ? 0 : blockTokens[k - 1].end;
              const before = blockText.slice(gapStart, t.start);
              const gapMarks = k === 0 ? [] : blockMarks.filter((m) => m.start < t.start && m.end > gapStart);
              const covering = blockMarks.filter((m) => m.start < t.end && m.end > t.start);
              const cls = ['w', segClass(covering, null, false, false)];
              if (t.sent === tok.sent) cls.push('in-sent');
              const isCur = t.i >= idx && t.i < idx + n;
              if (isCur) cls.push('cur');
              return (
                <span key={t.i}>
                  <span className={segClass(gapMarks, null, false, false) || undefined}>{before}</span>
                  <span
                    ref={t.i === idx ? curRef : undefined}
                    className={cls.filter(Boolean).join(' ')}
                    onClick={() => {
                      const sel = window.getSelection();
                      if (!sel || sel.isCollapsed) jump(t.i);
                    }}
                  >
                    {t.word}
                  </span>
                </span>
              );
            })}
            {blockText.slice(blockTokens[blockTokens.length - 1].end)}
          </p>
        </section>
      )}

      <button className="stage" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        <span className="tick" aria-hidden="true" />
        {playing && count > 0 ? (
          <span className="word" style={{ gridTemplateColumns: '1fr' }}>
            <span style={{ textAlign: 'center', color: 'var(--muted)' }}>{count}</span>
          </span>
        ) : (
          <span className="word">
            <span className="l">{shown.slice(0, p)}</span>
            <span className="p">{shown[p]}</span>
            <span className="r">{shown.slice(p + 1)}</span>
          </span>
        )}
        <span className="tick" aria-hidden="true" />
        <span className="muted" style={{ fontSize: 14, marginTop: 10 }}>
          {playing ? 'Tap to pause' : 'Paused · tap to resume'}
        </span>
      </button>

      <div className="rsvp-bottom">
        <div className="mark-row" style={{ justifyContent: 'center' }}>
          <span className="muted mark-label" style={{ fontSize: 13, marginRight: 4 }}>
            Mark this sentence
          </span>
          <Swatches color={null} style={settings.armedStyle} onPick={(c) => onMark(sent, c)} />
          <StyleSwitch style={settings.armedStyle} onStyle={(s) => update({ armedStyle: s })} />
        </div>

        <div className="slider">
          <label htmlFor="rsvp-pos" className="top">
            <span>
              {Math.round((idx / tokens.length) * 100)}% · word {idx + 1} of {tokens.length}
            </span>
            <span>{left}</span>
          </label>
          <input id="rsvp-pos" type="range" min={0} max={last} value={idx} onChange={(e) => jump(Number(e.target.value))} />
        </div>

        <div className="transport">
          <button className="t-btn" onClick={prevSentence}>
            <PrevSentence />
            Sentence
          </button>
          <button className="t-btn" onClick={() => jump(idx - 10)}>
            <Rewind />
            10 words
          </button>
          <button className="t-play" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
            {playing ? <Pause /> : <Play />}
          </button>
          <button className="t-btn" onClick={() => jump(idx + 10)}>
            <Forward />
            10 words
          </button>
          <button className="t-btn" onClick={nextSentence}>
            <NextSentence />
            Sentence
          </button>
        </div>

        {voice ? (
          <div className="controls">
            <div className="slider">
              <label htmlFor="rsvp-rate" className="top">
                <span>Voice speed</span>
                <b>
                  {settings.rate.toFixed(1)}x · about {Math.round(SPOKEN_WPM * settings.rate)} wpm
                </b>
              </label>
              <input
                id="rsvp-rate"
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={settings.rate}
                onChange={(e) => setRate(Number(e.target.value))}
              />
            </div>
          </div>
        ) : (
          <div className="controls">
            <div className="slider">
              <label htmlFor="rsvp-wpm" className="top">
                <span>Speed</span>
                <b>{settings.wpm} wpm</b>
              </label>
              <input
                id="rsvp-wpm"
                type="range"
                min={100}
                max={900}
                step={25}
                value={settings.wpm}
                onChange={(e) => update({ wpm: Number(e.target.value) })}
              />
            </div>
            <div className="slider" style={{ flex: 'none', minWidth: 0 }}>
              <span>Words at a time</span>
              <div className="seg">
                {([1, 2, 3] as const).map((c) => (
                  <button key={c} aria-pressed={settings.chunk === c} onClick={() => update({ chunk: c })}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
