import { useState, useEffect } from 'react';
import type { Card, CardEstado, PracticeState } from '../types';
import { updateCardEstado } from '../utils';

interface Props {
  state: PracticeState;
  deck: Card[];
  onDeckUpdate: (deck: Card[]) => void;
  onClose: () => void;
}

export default function FlipMode({ state, deck, onDeckUpdate, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);

  const card = state.queue[index];
  const total = state.queue.length;

  useEffect(() => {
    setFlipped(false);
  }, [index]);

  const handleClassify = (estado: CardEstado) => {
    const updated = updateCardEstado(deck, card.id, estado);
    onDeckUpdate(updated);
    if (index >= total - 1) {
      setDone(true);
    } else {
      setIndex((i) => i + 1);
    }
  };

  if (done) {
    return (
      <div className="flip-container">
        <div className="flip-done">
          <h2>🎉 ¡Mazo terminado!</h2>
          <p>Repasaste {total} pregunta{total !== 1 ? 's' : ''}</p>
          <button className="btn btn-primary" onClick={onClose}>Volver al tablero</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flip-container">
      <div className="flip-header">
        <span className="practice-source">{state.source}</span>
        <span className="practice-progress">{index + 1} / {total}</span>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Salir</button>
      </div>

      <div className="flip-progress-bar">
        <div className="flip-progress-fill" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <div
        className={`flip-card-scene`}
        onClick={() => setFlipped((v) => !v)}
        title="Click para voltear"
      >
        <div className={`flip-card ${flipped ? 'flip-card--flipped' : ''}`}>
          <div className="flip-card-face flip-card-face--front">
            <span className="flip-card-label">Pregunta</span>
            <p className="flip-card-text">{card.pregunta}</p>
            <span className="flip-hint">Tap para ver respuesta →</span>
          </div>
          <div className="flip-card-face flip-card-face--back">
            <span className="flip-card-label">Respuesta</span>
            <p className="flip-card-text">{card.respuesta}</p>
            <span className="flip-hint">← Tap para volver</span>
          </div>
        </div>
      </div>

      {flipped && (
        <div className="classify-buttons">
          <p className="classify-label">¿Cómo te fue?</p>
          <button className="btn btn-rojo" onClick={() => handleClassify('rojo')}>🔴 No la sé</button>
          <button className="btn btn-amarillo" onClick={() => handleClassify('amarillo')}>🟡 Más o menos</button>
          <button className="btn btn-verde" onClick={() => handleClassify('verde')}>🟢 La sé</button>
        </div>
      )}

      {!flipped && (
        <div className="classify-buttons">
          <button className="btn btn-ghost" onClick={() => setFlipped(true)}>
            👁 Ver respuesta
          </button>
        </div>
      )}
    </div>
  );
}
