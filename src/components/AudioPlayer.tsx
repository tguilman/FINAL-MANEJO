import { useState, useEffect, useRef } from 'react';
import type { Card } from '../types';

interface Props {
  cards: Card[];
  source: string;
  onClose: () => void;
}

const PAUSE_OPTIONS = [5, 8, 12, 20];
const RATE_OPTIONS = [0.9, 1.0, 1.1, 1.25];

type Phase = 'idle' | 'question' | 'pause' | 'answer' | 'between';

export default function AudioPlayer({ cards, source, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pauseSeconds, setPauseSeconds] = useState(8);
  const [rate, setRate] = useState(1.0);
  const [countdown, setCountdown] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  // Load available Spanish voices (async on some browsers)
  useEffect(() => {
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      const spanish = all.filter(v => v.lang.startsWith('es'));
      setVoices(spanish);
      if (spanish.length > 0 && !selectedVoice) {
        // Priority: es-AR → es-MX → es-ES → any es
        const best = spanish.find(v => v.lang === 'es-AR')
          ?? spanish.find(v => v.lang === 'es-MX')
          ?? spanish.find(v => v.lang === 'es-ES')
          ?? spanish[0];
        setSelectedVoice(best);
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // Refs to avoid stale closures inside speech callbacks
  const pauseSecondsRef = useRef(pauseSeconds);
  pauseSecondsRef.current = pauseSeconds;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const selectedVoiceRef = useRef(selectedVoice);
  selectedVoiceRef.current = selectedVoice;
  const isPlayingRef = useRef(false);
  const currentIndexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    window.speechSynthesis.cancel();
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  };

  const runCountdown = (seconds: number, onEnd: () => void) => {
    setCountdown(seconds);
    let remaining = seconds;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) { clearInterval(countdownRef.current!); countdownRef.current = null; }
    }, 1000);
    timerRef.current = setTimeout(onEnd, seconds * 1000);
  };

  const speak = (text: string, onEnd: () => void) => {
    const utt = new SpeechSynthesisUtterance(text);
    const voice = selectedVoiceRef.current;
    if (voice) utt.voice = voice;
    utt.lang = voice?.lang ?? 'es-ES';
    utt.rate = rateRef.current;
    utt.pitch = 1;
    utt.onend = onEnd;
    utt.onerror = onEnd;
    window.speechSynthesis.speak(utt);
  };

  const playFrom = (cardIndex: number) => {
    stop();
    currentIndexRef.current = cardIndex;
    setIndex(cardIndex);
    setShowAnswer(false);
    setPhase('question');

    const c = cards[cardIndex];
    speak(`Pregunta ${cardIndex + 1} de ${cards.length}: ${c.pregunta}`, () => {
      if (!isPlayingRef.current) return;
      setPhase('pause');
      runCountdown(pauseSecondsRef.current, () => {
        if (!isPlayingRef.current) return;
        setPhase('answer');
        setShowAnswer(true);
        speak(`Respuesta: ${c.respuesta}`, () => {
          if (!isPlayingRef.current) return;
          const next = cardIndex + 1;
          if (next < cards.length) {
            setPhase('between');
            runCountdown(3, () => {
              if (!isPlayingRef.current) return;
              playFrom(next);
            });
          } else {
            setPhase('idle');
            setIsPlaying(false);
            isPlayingRef.current = false;
          }
        });
      });
    });
  };

  const handlePlay = () => {
    isPlayingRef.current = true;
    setIsPlaying(true);
    playFrom(currentIndexRef.current);
  };

  const handlePause = () => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    stop();
    setPhase('idle');
  };

  const handleNext = () => {
    const next = currentIndexRef.current + 1;
    if (next < cards.length) {
      currentIndexRef.current = next;
      if (isPlayingRef.current) { playFrom(next); }
      else { stop(); setIndex(next); setShowAnswer(false); setPhase('idle'); }
    }
  };

  const handlePrev = () => {
    const prev = currentIndexRef.current - 1;
    if (prev >= 0) {
      currentIndexRef.current = prev;
      if (isPlayingRef.current) { playFrom(prev); }
      else { stop(); setIndex(prev); setShowAnswer(false); setPhase('idle'); }
    }
  };

  const handleClose = () => { stop(); onClose(); };

  useEffect(() => () => stop(), []);

  const card = cards[index];
  const total = cards.length;

  const phaseLabel: Record<Phase, string> = {
    idle: '▶ Presioná play para empezar',
    question: '🎙️ Escuchá la pregunta...',
    pause: `⏳ Pensá tu respuesta — ${countdown}s`,
    answer: '📖 Respuesta',
    between: `⏭️ Siguiente en ${countdown}s`,
  };

  return (
    <div className="audio-fullscreen">
      <div className="audio-inner">

        <div className="audio-header">
          <span className="audio-source">🎧 {source}</span>
          <span className="audio-progress">{index + 1} / {total}</span>
          <button className="btn btn-ghost btn-sm" onClick={handleClose}>✕ Cerrar</button>
        </div>

        <div className="audio-progressbar">
          <div className="audio-progressbar-fill" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>

        <div className={`audio-phase-label phase-${phase}`}>{phaseLabel[phase]}</div>

        <div className="audio-card-area">
          <p className="audio-question">{card.pregunta}</p>

          {phase === 'pause' && !showAnswer && (
            <div className="audio-countdown-wrap">
              <div className="audio-countdown-circle">{countdown}</div>
              <p className="audio-countdown-hint">segundos para pensar</p>
            </div>
          )}

          {showAnswer && (
            <div className="audio-answer-box">
              <span className="audio-answer-label">Respuesta</span>
              <p>{card.respuesta}</p>
            </div>
          )}
        </div>

        <div className="audio-settings">
          {/* Voice selector */}
          {voices.length > 1 && (
            <div className="audio-setting-row">
              <span className="audio-pause-label">🎤 Voz:</span>
              <select
                className="audio-voice-select"
                value={selectedVoice?.name ?? ''}
                onChange={e => {
                  const v = voices.find(v => v.name === e.target.value) ?? null;
                  setSelectedVoice(v);
                }}
              >
                {voices.map(v => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Speed */}
          <div className="audio-setting-row">
            <span className="audio-pause-label">⚡ Velocidad:</span>
            {RATE_OPTIONS.map(r => (
              <button
                key={r}
                className={`audio-pause-opt${rate === r ? ' active' : ''}`}
                onClick={() => setRate(r)}
              >{r === 0.9 ? 'Lenta' : r === 1.0 ? 'Normal' : r === 1.1 ? 'Rápida' : 'Muy rápida'}</button>
            ))}
          </div>

          {/* Pause */}
          <div className="audio-setting-row">
            <span className="audio-pause-label">⏳ Pausa para pensar:</span>
            {PAUSE_OPTIONS.map(s => (
              <button
                key={s}
                className={`audio-pause-opt${pauseSeconds === s ? ' active' : ''}`}
                onClick={() => setPauseSeconds(s)}
              >{s}s</button>
            ))}
          </div>
        </div>

        <div className="audio-controls">
          <button
            className="audio-ctrl-btn"
            onClick={handlePrev}
            disabled={index === 0}
            title="Anterior"
          >⏮</button>

          {isPlaying
            ? <button className="audio-play-btn" onClick={handlePause} title="Pausar">⏸</button>
            : <button className="audio-play-btn" onClick={handlePlay} title="Reproducir">▶</button>
          }

          <button
            className="audio-ctrl-btn"
            onClick={handleNext}
            disabled={index >= total - 1}
            title="Siguiente"
          >⏭</button>
        </div>

      </div>
    </div>
  );
}
