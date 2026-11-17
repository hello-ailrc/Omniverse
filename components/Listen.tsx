'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pivotIndex, segmentsOf, type TextModel } from '@/lib/text';
import type { Doc, MarkColor, Settings, TextRange } from '@/lib/types';
import { ChevronDown, Close, NextSentence, Pause, Play, PrevSentence } from './icons';
import { StyleSwitch, Swatches } from './MarkBar';

const WORDS_PER_SECOND = 2.7; // typical speaking pace at 1x

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
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [idx, setIdx] = useState(Math.min(startIdx, Math.max(0, tokens.length - 1)));
  const [playing, setPlaying] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [view, setView] = useState<'sentence' | 'rsvp'>('sentence');
  const [showText, setShowText] = useState(true);

  const gen = useRef(0);
  const idxRef = useRef(idx);
  const live = useRef({ rate: settings.rate, voiceURI: settings.voiceURI, voices });
  live.current = { rate: settings.rate, voiceURI: settings.voiceURI, voices };

  const setCur = useCallback(
    (i: number) => {
      idxRef.current = i;
      setIdx(i);
      onIdx(i);
    },
    [onIdx],
  );

  const stop = useCallback(() => {
    gen.current++;
    if (supported) window.speechSynthesis.cancel();
    setPlaying(false);
  }, [supported]);

  // Speak from a given word to the end of its sentence, then carry on with the next sentence.
  const speakFrom = useCallback(
    (i: number) => {
      if (!supported) return;
      const synth = window.speechSynthesis;
      const mine = ++gen.current;
      synth.cancel();
      const t = tokens[i];
      if (!t) {
        setPlaying(false);
        return;
      }
      const s = sentences[t.sent];
      const u = new SpeechSynthesisUtterance(doc.blocks[s.block].text.slice(t.start, s.end));
      u.rate = live.current.rate;
      const v = live.current.voices.find((x) => x.voiceURI === live.current.voiceURI);
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }
      u.onboundary = (e) => {
        if (mine !== gen.current) return;
        if (e.name && e.name !== 'word') return;
        const abs = t.start + e.charIndex;
        let k = t.i;
        while (k < s.last && tokens[k].end <= abs) k++;
        setCur(k);
      };
      u.onend = () => {
        if (mine !== gen.current) return;
        const next = s.last + 1;
        if (next < tokens.length) speakFrom(next);
        else setPlaying(false);
      };
      u.onerror = () => {
        if (mine !== gen.current) return;
        setPlaying(false);
      };
      setCur(i);
      setPlaying(true);
      // A short gap after cancel() avoids the utterance being dropped in some browsers.
      window.setTimeout(() => {
        if (mine === gen.current) synth.speak(u);
      }, 60);
    },
    [supported, tokens, sentences, doc, setCur],
  );

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const load = () => setVoices(synth.getVoices());
    load();
    synth.addEventListener('voiceschanged', load);
    return () => synth.removeEventListener('voiceschanged', load);
  }, [supported]);

  // Start on open, stop on close.
  useEffect(() => {
    onIdx(idxRef.current);
    speakFrom(idxRef.current);
    return () => {
      gen.current++;
      if (supported) window.speechSynthesis.cancel();
      onIdx(null);
    };
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
  const seekSeconds = (sec: number) => jump(idx + Math.round(sec * WORDS_PER_SECOND * settings.rate));

  const setRate = (rate: number) => {
    update({ rate });
    live.current.rate = rate;
    if (playing) speakFrom(idxRef.current);
  };
  const setVoice = (voiceURI: string) => {
    update({ voiceURI });
    live.current.voiceURI = voiceURI;
    if (playing) speakFrom(idxRef.current);
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
  const minsLeft = Math.max(1, Math.round(remaining / (WORDS_PER_SECOND * 60 * settings.rate)));
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
