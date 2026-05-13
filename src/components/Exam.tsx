import { useState, useEffect, useRef } from 'react';
import type { Card, Simulacro, SimulacroQuestion } from '../types';
import { selectExamCards, countLines, updateCardEstado } from '../utils';
import { corregirExamen } from '../api';
import { storage } from '../utils';

interface Props {
  deck: Card[];
  apiKey: string;
  onDeckUpdate: (deck: Card[]) => void;
  onClose: () => void;
  onSaved: () => void;
}

const DURACION = 45 * 60; // 45 min in seconds

type Phase = 'writing' | 'correcting' | 'results';

export default function Exam({ deck, apiKey, onDeckUpdate, onClose, onSaved }: Props) {
  const [cards] = useState<Card[]>(() => selectExamCards(deck));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DURACION);
  const [phase, setPhase] = useState<Phase>('writing');
  const [corrections, setCorrections] = useState<{ texto: string; puntaje: number; aprobada: boolean }[]>([]);
  const [progress, setProgress] = useState(0);
  const [corrError, setCorrError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase !== 'writing') return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          submitExam();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const submitExam = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('correcting');
    runCorrections();
  };

  const runCorrections = async () => {
    setCorrError('');
    try {
      const preguntas = cards.map((c) => ({
        pregunta: c.pregunta,
        respuesta: c.respuesta,
        respuestaEstudiante: answers[c.id] ?? '',
      }));
      const results = await corregirExamen(apiKey, preguntas, (i) => setProgress(i));
      setCorrections(results);
      setPhase('results');

      // Update card states based on score
      let updatedDeck = deck;
      results.forEach((r, i) => {
        const estado = r.puntaje >= 7 ? 'verde' : r.puntaje >= 5 ? 'amarillo' : 'rojo';
        updatedDeck = updateCardEstado(updatedDeck, cards[i].id, estado);
      });
      onDeckUpdate(updatedDeck);

      // Save simulacro — puntajeTotal = count of aprobadas
      const aprobadas = results.filter((r) => r.aprobada).length;
      const simulacro: Simulacro = {
        id: `sim-${Date.now()}`,
        fecha: new Date().toISOString(),
        puntajeTotal: aprobadas,
        duracionSegundos: DURACION - timeLeft,
        preguntas: cards.map((c, i) => ({
          cardId: c.id,
          pregunta: c.pregunta,
          respuesta: c.respuesta,
          respuestaEstudiante: answers[c.id] ?? '',
          correccion: results[i]?.texto ?? '',
          puntajeIA: results[i]?.puntaje ?? 0,
          aprobada: results[i]?.aprobada ?? false,
        })) as SimulacroQuestion[],
      };
      storage.addSimulacro(simulacro);
    } catch (e) {
      setCorrError((e as Error).message);
      setPhase('writing');
    }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const answered = cards.filter((c) => (answers[c.id] ?? '').trim().length > 0).length;
  const aprobadas = corrections.filter((r) => r.aprobada).length;

  if (phase === 'correcting') {
    return (
      <div className="exam-container">
        <div className="exam-correcting">
          <div className="loading-spinner" />
          <h2>Corrigiendo con IA...</h2>
          <p>{progress} / {cards.length} preguntas</p>
          <div className="exam-progress-bar">
            <div className="exam-progress-fill" style={{ width: `${(progress / cards.length) * 100}%` }} />
          </div>
          {corrError && (
            <div>
              <p className="form-error">⚠️ {corrError}</p>
              <button className="btn btn-primary" onClick={runCorrections}>Reintentar</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'results') {
    const pct = cards.length > 0 ? aprobadas / cards.length : 0;
    const totalColor = pct >= 0.7 ? '#22c55e' : pct >= 0.5 ? '#eab308' : '#ef4444';
    return (
      <div className="exam-container">
        <div className="exam-results-header">
          <h2>Resultados del simulacro</h2>
          <div className="exam-total-score">
            <span className="exam-score-num" style={{ color: totalColor }}>{aprobadas}</span>
            <span className="exam-score-denom"> / {cards.length} aprobadas</span>
          </div>
          <div className="exam-results-actions">
            <button className="btn btn-ghost" onClick={onSaved}>📊 Ver historial</button>
            <button className="btn btn-primary" onClick={onClose}>Volver al tablero</button>
          </div>
        </div>
        <div className="exam-results-list">
          {cards.map((card, i) => {
            const corr = corrections[i];
            const score = corr?.puntaje ?? 0;
            const scoreColor = score >= 7 ? '#22c55e' : score >= 5 ? '#eab308' : '#ef4444';
            const isAprobada = corr?.aprobada ?? false;
            return (
              <div key={card.id} className="exam-result-item">
                <div className="exam-result-header">
                  <span className="exam-result-num">#{i + 1}</span>
                  <span className="exam-result-unidad">{card.unidad}</span>
                  <span className={`exam-verdict-badge ${isAprobada ? 'exam-verdict--aprobada' : 'exam-verdict--desaprobada'}`}>
                    {isAprobada ? '✅ Aprobada' : '❌ Desaprobada'}
                  </span>
                  <span className="exam-result-score" style={{ color: scoreColor }}>{score} / 10</span>
                </div>
                <p className="exam-result-pregunta">{card.pregunta}</p>
                <div className="exam-result-section">
                  <strong>Tu respuesta:</strong>
                  <p>{answers[card.id] || '(sin respuesta)'}</p>
                </div>
                <div className="exam-result-section">
                  <strong>Respuesta correcta:</strong>
                  <p>{card.respuesta}</p>
                </div>
                {corr && (
                  <div className="exam-result-section exam-result-correccion">
                    <strong>Corrección IA:</strong>
                    <p>{corr.texto}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // writing phase
  const card = cards[current];
  const lines = countLines(answers[card.id] ?? '');
  const isOver = lines > 7;
  const timerWarning = timeLeft < 300;

  return (
    <div className="exam-container">
      <div className="exam-header">
        <div className="exam-header-left">
          <span className="exam-title">📝 Simulacro de examen</span>
          <span className="exam-answered">{answered}/{cards.length} respondidas</span>
        </div>
        <div className={`exam-timer ${timerWarning ? 'exam-timer--warning' : ''}`}>
          ⏱ {fmt(timeLeft)}
        </div>
        <button className="btn btn-primary" onClick={submitExam}>
          Entregar examen
        </button>
      </div>

      <div className="exam-body">
        <div className="exam-nav">
          {cards.map((c, i) => {
            const hasAnswer = (answers[c.id] ?? '').trim().length > 0;
            return (
              <button
                key={c.id}
                className={`exam-nav-btn ${i === current ? 'active' : ''} ${hasAnswer ? 'answered' : ''}`}
                onClick={() => setCurrent(i)}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        <div className="exam-question-area">
          <div className="exam-question-header">
            <span className="exam-q-num">Pregunta {current + 1} de {cards.length}</span>
            <span className="exam-q-unidad">{card.unidad}</span>
          </div>
          <p className="exam-question-text">{card.pregunta}</p>

          <div className="practice-textarea-wrap">
            <textarea
              className={`practice-textarea ${isOver ? 'practice-textarea--over' : ''}`}
              placeholder="Escribí tu respuesta (máximo 7 líneas de examen)..."
              value={answers[card.id] ?? ''}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [card.id]: e.target.value }))
              }
              rows={4}
              autoFocus
            />
            <div className={`line-counter ${isOver ? 'line-counter--over' : ''}`}>
              {lines} / 7 líneas{isOver ? ' ⚠️' : ''}
            </div>
          </div>

          <div className="exam-nav-buttons">
            {current > 0 && (
              <button className="btn btn-ghost" onClick={() => setCurrent((i) => i - 1)}>
                ← Anterior
              </button>
            )}
            {current < cards.length - 1 && (
              <button className="btn btn-primary" onClick={() => setCurrent((i) => i + 1)}>
                Siguiente →
              </button>
            )}
            {current === cards.length - 1 && (
              <button className="btn btn-primary" onClick={submitExam}>
                Entregar →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
