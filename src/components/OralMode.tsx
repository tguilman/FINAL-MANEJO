import { useState, useEffect, useRef } from 'react';
import type { Card, CardEstado, CardProbabilidad, PracticeState } from '../types';
import { updateCardEstado, updateCardProbabilidad } from '../utils';
import { corregirRespuesta } from '../api';

// ── Minimal Web Speech API types (not in standard TS lib) ────────────────────
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string };
}
interface SpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'reading' | 'thinking' | 'recording' | 'processing' | 'result';

const THINK_OPTIONS = [3, 5, 8, 12];

const PROB_CONFIG: Record<CardProbabilidad, { label: string; className: string }> = {
  seguro:    { label: '🎯 Entra seguro', className: 'prob-seguro' },
  posible:   { label: '🤔 Puede entrar', className: 'prob-posible' },
  improbable:{ label: '💤 No creo',      className: 'prob-improbable' },
};

interface Props {
  state: PracticeState;
  deck: Card[];
  apiKey: string;
  onDeckUpdate: (deck: Card[]) => void;
  onClose: () => void;
}

export default function OralMode({ state, deck, apiKey, onDeckUpdate, onClose }: Props) {
  // ── UI state ─────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle');
  const [indexUi, setIndexUi] = useState(state.index);
  const [countdown, setCountdown] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [correccion, setCorreccion] = useState('');
  const [puntaje, setPuntaje] = useState<number | null>(null);
  const [aprobada, setAprobada] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [thinkSeconds, setThinkSeconds] = useState(5);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  // ── Refs (avoid stale closures inside async callbacks) ───────────────────
  const indexRef = useRef(state.index);
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const thinkSecondsRef = useRef(thinkSeconds);
  thinkSecondsRef.current = thinkSeconds;
  const selectedVoiceRef = useRef(selectedVoice);
  selectedVoiceRef.current = selectedVoice;

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const thinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = state.queue.length;

  // ── Load voices ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      const spanish = all.filter((v) => v.lang.startsWith('es'));
      setVoices(spanish);
      if (spanish.length > 0 && !selectedVoiceRef.current) {
        const best =
          spanish.find((v) => v.lang === 'es-AR') ??
          spanish.find((v) => v.lang === 'es-MX') ??
          spanish.find((v) => v.lang === 'es-ES') ??
          spanish[0];
        setSelectedVoice(best);
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  const stopAll = () => {
    window.speechSynthesis.cancel();
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
    if (thinkTimerRef.current) { clearTimeout(thinkTimerRef.current); thinkTimerRef.current = null; }
  };
  useEffect(() => () => stopAll(), []);

  // ── TTS ──────────────────────────────────────────────────────────────────
  const speak = (text: string, onEnd: () => void) => {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    const v = selectedVoiceRef.current;
    if (v) utt.voice = v;
    utt.lang = v?.lang ?? 'es-ES';
    utt.rate = 1.0;
    utt.onend = onEnd;
    utt.onerror = onEnd;
    window.speechSynthesis.speak(utt);
  };

  // ── STT ──────────────────────────────────────────────────────────────────
  const startRecording = (card: Card) => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      setError('Tu navegador no soporta reconocimiento de voz. Usá Chrome.');
      setPhase('result');
      return;
    }

    finalTranscriptRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    setPhase('recording');

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'es-AR';
    recognitionRef.current = rec;

    rec.onresult = (e) => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscriptRef.current += e.results[i][0].transcript + ' ';
          setTranscript(finalTranscriptRef.current);
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setInterimTranscript(interim);
      // 3s of silence → stop recording
      silenceTimerRef.current = setTimeout(() => rec.stop(), 3000);
    };

    rec.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setInterimTranscript('');
      const text = finalTranscriptRef.current.trim();
      processAnswer(card, text || '(sin respuesta)');
    };

    rec.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setError(`Error de micrófono: ${e.error}`);
      }
    };

    rec.start();
    // Safety timeout: stop after 90s if user forgets
    silenceTimerRef.current = setTimeout(() => rec.stop(), 90_000);
  };

  // ── Correction ───────────────────────────────────────────────────────────
  const processAnswer = async (card: Card, text: string) => {
    setPhase('processing');
    setError('');
    try {
      const result = await corregirRespuesta(apiKey, card.pregunta, card.respuesta, text);
      setCorreccion(result.texto);
      setPuntaje(result.puntaje);
      setAprobada(result.aprobada);
      setPhase('result');
      speak(result.aprobada ? 'Aprobada' : 'Desaprobada', () => {});
    } catch (e) {
      setError((e as Error).message);
      setPhase('result');
    }
  };

  // ── Play card (uses refs, safe in callbacks) ──────────────────────────────
  const playCard = (card: Card, i: number) => {
    stopAll();
    setTranscript('');
    setInterimTranscript('');
    setCorreccion('');
    setPuntaje(null);
    setAprobada(null);
    setError('');
    setPhase('reading');

    speak(`Pregunta ${i + 1} de ${total}: ${card.pregunta}`, () => {
      const secs = thinkSecondsRef.current;
      let remaining = secs;
      setCountdown(remaining);
      setPhase('thinking');
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(countdownIntervalRef.current!);
          countdownIntervalRef.current = null;
        }
      }, 1000);
      thinkTimerRef.current = setTimeout(() => startRecording(card), secs * 1000);
    });
  };

  // ── Navigation ───────────────────────────────────────────────────────────
  const advance = (classify?: CardEstado) => {
    if (classify) {
      onDeckUpdate(updateCardEstado(deckRef.current, state.queue[indexRef.current].id, classify));
    }
    if (indexRef.current >= total - 1) {
      stopAll();
      onClose();
      return;
    }
    indexRef.current += 1;
    setIndexUi(indexRef.current);
    playCard(state.queue[indexRef.current], indexRef.current);
  };

  const handleManualStop = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  };

  // ── Derived UI values ────────────────────────────────────────────────────
  const card = state.queue[indexUi];
  const isLast = indexUi >= total - 1;
  const puntajeColor =
    puntaje !== null ? (puntaje >= 7 ? '#22c55e' : puntaje >= 5 ? '#eab308' : '#ef4444') : undefined;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="oral-fullscreen">
      <div className="oral-inner">

        {/* Header */}
        <div className="oral-header">
          <span className="oral-source">🎤 {state.source}</span>
          <span className="oral-progress">{indexUi + 1} / {total}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { stopAll(); onClose(); }}>✕ Cerrar</button>
        </div>

        {/* Progress bar */}
        <div className="oral-progressbar">
          <div className="oral-progressbar-fill" style={{ width: `${((indexUi + 1) / total) * 100}%` }} />
        </div>

        {/* Phase label */}
        {phase !== 'idle' && phase !== 'result' && (
          <div className={`oral-phase-label oral-phase-${phase}`}>
            {phase === 'reading'    && '🎙️ Escuchá la pregunta...'}
            {phase === 'thinking'   && `🧠 Pensá tu respuesta — ${countdown}s`}
            {phase === 'recording'  && '🔴 Grabando... hablá tu respuesta'}
            {phase === 'processing' && '🤖 Corrigiendo con IA...'}
          </div>
        )}

        {/* Question text */}
        <p className="oral-question">{card.pregunta}</p>

        {/* Thinking countdown */}
        {phase === 'thinking' && (
          <div className="oral-countdown-wrap">
            <div className="oral-countdown-circle">{countdown}</div>
            <p className="oral-countdown-hint">segundos para pensar</p>
          </div>
        )}

        {/* Recording */}
        {phase === 'recording' && (
          <div className="oral-recording-area">
            <div className="oral-mic-pulse" />
            <p className="oral-live-transcript">
              {transcript}
              <span className="oral-interim">{interimTranscript}</span>
            </p>
            <button className="btn btn-primary" onClick={handleManualStop}>
              ✋ Listo, terminé
            </button>
            <p className="oral-silence-hint">O callate 3 segundos para parar automáticamente</p>
          </div>
        )}

        {/* Processing */}
        {phase === 'processing' && (
          <div className="oral-processing">
            <div className="loading-spinner" />
            <p>Corrigiendo con IA...</p>
          </div>
        )}

        {/* Result */}
        {phase === 'result' && (
          <div className="oral-result">
            {error && <p className="practice-error">⚠️ {error}</p>}

            {aprobada !== null && (
              <div className={`oral-verdict ${aprobada ? 'oral-verdict--aprobada' : 'oral-verdict--desaprobada'}`}>
                {aprobada ? '✅ Aprobada' : '❌ Desaprobada'}
              </div>
            )}

            {transcript && transcript !== '(sin respuesta)' && (
              <div className="oral-transcript-box">
                <strong>Lo que dijiste:</strong>
                <p>{transcript}</p>
              </div>
            )}

            {correccion && (
              <div className="correction-box">
                {puntaje !== null && (
                  <div className="correction-score-row">
                    <span className="correction-score" style={{ color: puntajeColor }}>
                      {puntaje} / 10
                    </span>
                  </div>
                )}
                <div className="correction-text">{correccion}</div>
              </div>
            )}

            <div className="prob-modal-section">
              <p className="classify-label">¿Probabilidad de que entre en el examen?</p>
              <div className="prob-selector">
                {(['seguro', 'posible', 'improbable'] as CardProbabilidad[]).map((p) => (
                  <button
                    key={p}
                    className={`prob-btn ${PROB_CONFIG[p].className}${card.probabilidad === p ? ' active' : ''}`}
                    onClick={() => onDeckUpdate(updateCardProbabilidad(deckRef.current, card.id, card.probabilidad === p ? undefined : p))}
                  >
                    {PROB_CONFIG[p].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="classify-buttons">
              <p className="classify-label">¿Cómo te fue?</p>
              <button className="btn btn-rojo"    onClick={() => advance('rojo')}>🔴 No la sé</button>
              <button className="btn btn-amarillo" onClick={() => advance('amarillo')}>🟡 Más o menos</button>
              <button className="btn btn-verde"   onClick={() => advance('verde')}>🟢 La sé</button>
              <button className="btn btn-ghost"   onClick={() => advance()}>
                {isLast ? 'Terminar' : 'Siguiente →'}
              </button>
            </div>
          </div>
        )}

        {/* Idle: settings + start button */}
        {phase === 'idle' && (
          <div className="oral-idle">
            <div className="oral-settings">
              <div className="audio-setting-row">
                <span className="audio-pause-label">⏳ Tiempo para pensar:</span>
                {THINK_OPTIONS.map((s) => (
                  <button
                    key={s}
                    className={`audio-pause-opt${thinkSeconds === s ? ' active' : ''}`}
                    onClick={() => setThinkSeconds(s)}
                  >
                    {s}s
                  </button>
                ))}
              </div>
              {voices.length > 1 && (
                <div className="audio-setting-row">
                  <span className="audio-pause-label">🔊 Voz:</span>
                  <select
                    className="audio-voice-select"
                    value={selectedVoice?.name ?? ''}
                    onChange={(e) =>
                      setSelectedVoice(voices.find((v) => v.name === e.target.value) ?? null)
                    }
                  >
                    {voices.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <button
              className="oral-start-btn"
              onClick={() => playCard(card, indexUi)}
            >
              🎤 Empezar
            </button>
          </div>
        )}

        {/* Reset button during active phase */}
        {(phase === 'reading' || phase === 'thinking' || phase === 'recording') && (
          <button
            className="btn btn-ghost btn-sm oral-reset-btn"
            onClick={() => { stopAll(); setPhase('idle'); }}
          >
            ↩ Reiniciar pregunta
          </button>
        )}

      </div>
    </div>
  );
}
