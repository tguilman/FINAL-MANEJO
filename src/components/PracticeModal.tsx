import { useState, useEffect } from 'react';
import type { Card, CardEstado, CardProbabilidad, PracticeState } from '../types';
import { updateCardEstado, updateCardProbabilidad, countLines } from '../utils';
import { corregirRespuesta } from '../api';

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
  inline?: boolean;
}

export default function PracticeModal({ state, deck, apiKey, onDeckUpdate, onClose, inline }: Props) {
  const [index, setIndex] = useState(state.index);
  const [respuesta, setRespuesta] = useState('');
  const [correccion, setCorreccion] = useState('');
  const [puntaje, setPuntaje] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);

  const card = state.queue[index];
  const lines = countLines(respuesta);
  const isOver = lines > 7;
  const total = state.queue.length;
  const isLast = index >= total - 1;

  useEffect(() => {
    setRespuesta('');
    setCorreccion('');
    setPuntaje(null);
    setError('');
    setShowAnswer(false);
  }, [index]);

  const handleCorregir = async () => {
    if (!respuesta.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await corregirRespuesta(apiKey, card.pregunta, card.respuesta, respuesta);
      setCorreccion(result.texto);
      setPuntaje(result.puntaje);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleClassify = (estado: CardEstado) => {
    const updated = updateCardEstado(deck, card.id, estado);
    onDeckUpdate(updated);
    if (isLast) {
      onClose();
    } else {
      setIndex((i) => i + 1);
    }
  };

  const puntajeColor = puntaje !== null
    ? puntaje >= 7 ? '#22c55e' : puntaje >= 5 ? '#eab308' : '#ef4444'
    : undefined;

  const content = (
    <div className="practice-modal-inner">
      <div className="practice-header">
        <span className="practice-source">{state.source}</span>
        <span className="practice-progress">{index + 1} / {total}</span>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Cerrar</button>
      </div>

      <div className="practice-progress-bar">
        <div className="practice-progress-fill" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <div className="practice-question">
        <p className="practice-question-text">{card.pregunta}</p>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowAnswer((v) => !v)}
        >
          {showAnswer ? '🙈 Ocultar respuesta' : '👁 Ver respuesta correcta'}
        </button>
        {showAnswer && (
          <div className="practice-answer-preview">
            <strong>Respuesta correcta:</strong>
            <p>{card.respuesta}</p>
          </div>
        )}
      </div>

      <div className="practice-textarea-wrap">
        <textarea
          className={`practice-textarea ${isOver ? 'practice-textarea--over' : ''}`}
          placeholder="Escribí tu respuesta (máximo 7 líneas de examen)..."
          value={respuesta}
          onChange={(e) => setRespuesta(e.target.value)}
          rows={4}
          disabled={loading || !!correccion}
        />
        <div className={`line-counter ${isOver ? 'line-counter--over' : ''}`}>
          {lines} / 7 líneas{isOver ? ' ⚠️' : ''}
        </div>
      </div>

      {!correccion && (
        <button
          className="btn btn-primary"
          onClick={handleCorregir}
          disabled={!respuesta.trim() || loading}
        >
          {loading ? (
            <span>Corrigiendo<span className="loading-dots"><span /><span /><span /></span></span>
          ) : '🤖 Corregir con IA'}
        </button>
      )}

      {error && <p className="practice-error">⚠️ {error}</p>}

      {correccion && (
        <div className="correction-box">
          {puntaje !== null && (
            <div className="correction-score" style={{ color: puntajeColor }}>
              {puntaje} / 10
            </div>
          )}
          <div className="correction-text">{correccion}</div>
        </div>
      )}

      <div className="classify-buttons">
        <p className="classify-label">{correccion ? '¿Cómo te fue?' : 'Clasificar sin IA:'}</p>
        <button className="btn btn-rojo" onClick={() => handleClassify('rojo')}>🔴 No la sé</button>
        <button className="btn btn-amarillo" onClick={() => handleClassify('amarillo')}>🟡 Más o menos</button>
        <button className="btn btn-verde" onClick={() => handleClassify('verde')}>🟢 La sé</button>
      </div>

      <div className="prob-modal-section">
        <p className="classify-label">¿Probabilidad de que entre en el examen?</p>
        <div className="prob-selector">
          {(['seguro', 'posible', 'improbable'] as CardProbabilidad[]).map((p) => (
            <button
              key={p}
              className={`prob-btn ${PROB_CONFIG[p].className}${card.probabilidad === p ? ' active' : ''}`}
              onClick={() => {
                const next = card.probabilidad === p ? undefined : p;
                onDeckUpdate(updateCardProbabilidad(deck, card.id, next));
              }}
            >
              {PROB_CONFIG[p].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="practice-inline-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="practice-inline-card">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="practice-fullscreen">
      <div className="practice-fullscreen-inner">
        {content}
      </div>
    </div>
  );
}
