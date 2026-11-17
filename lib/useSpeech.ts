'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { wordDelay, type TextModel } from './text';
import type { Doc } from './types';

export const SPOKEN_WPM = 165; // typical speaking pace at 1x

// Reads the document aloud with the device's built-in voices, sentence by sentence,
// and reports each word as it is spoken. Shared by the listening panel and RSVP.
export function useSpeech({
  doc,
  model,
  rate,
  voiceURI,
  onWord,
}: {
  doc: Doc;
  model: TextModel;
  rate: number;
  voiceURI: string;
  onWord: (i: number) => void;
}) {
  const { tokens, sentences } = model;
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [playing, setPlaying] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const gen = useRef(0);
  const live = useRef({ rate, voiceURI, voices, onWord });
  live.current = { rate, voiceURI, voices, onWord };

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const load = () => setVoices(synth.getVoices());
    load();
    synth.addEventListener('voiceschanged', load);
    return () => synth.removeEventListener('voiceschanged', load);
  }, [supported]);

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
      const r = live.current.rate;
      u.rate = r;
      const v = live.current.voices.find((x) => x.voiceURI === live.current.voiceURI);
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }

      // Some devices never report individual words. Until the first report arrives,
      // estimate the current word from the speaking pace so tracking still moves.
      let reported = false;
      let k = t.i;
      const estimate = () => {
        const wait = wordDelay(tokens[k], SPOKEN_WPM * r) * 0.9;
        window.setTimeout(() => {
          if (mine !== gen.current || reported || k >= s.last) return;
          k++;
          live.current.onWord(k);
          estimate();
        }, wait);
      };

      u.onstart = () => {
        if (mine === gen.current) estimate();
      };
      u.onboundary = (e) => {
        if (mine !== gen.current) return;
        if (e.name && e.name !== 'word') return;
        reported = true;
        const abs = t.start + e.charIndex;
        let j = t.i;
        while (j < s.last && tokens[j].end <= abs) j++;
        live.current.onWord(j);
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
      live.current.onWord(i);
      setPlaying(true);
      // A short gap after cancel() avoids the utterance being dropped in some browsers.
      window.setTimeout(() => {
        if (mine === gen.current) synth.speak(u);
      }, 60);
    },
    [supported, tokens, sentences, doc],
  );

  useEffect(
    () => () => {
      gen.current++;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    },
    [],
  );

  return { supported, playing, voices, speakFrom, stop };
}
