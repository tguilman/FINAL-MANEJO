import { useState } from 'react';
import { storage } from '../utils';

interface Props {
  onClose: () => void;
}

export default function History({ onClose }: Props) {
  const simulacros = storage.getSimulacros();
  const [expanded, setExpanded] = useState<string | null>(null);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const fmtDur = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec}s`;
  };

  const scoreColor = (score: number) => {
    if (score >= 10) return '#22c55e';
    if (score >= 7) return '#eab308';
    return '#ef4444';
  };

  return (
    <div className="history-container">
      <div className="history-header">
        <h2 className="history-title">📊 Historial de simulacros</h2>
        <button className="btn btn-ghost" onClick={onClose}>← Volver</button>
      </div>

      {simulacros.length === 0 ? (
        <div className="history-empty">
          <p>Todavía no hiciste ningún simulacro.</p>
          <button className="btn btn-primary" onClick={onClose}>Volver al tablero</button>
        </div>
      ) : (
        <>
          <div className="history-evolution">
            <h3>Evolución de puntajes</h3>
            <div className="history-chart">
              {[...simulacros].reverse().map((s, i) => (
                <div key={s.id} className="history-chart-bar-wrap">
                  <div
                    className="history-chart-bar"
                    style={{
                      height: `${(s.puntajeTotal / 15) * 100}%`,
                      backgroundColor: scoreColor(s.puntajeTotal),
                    }}
                    title={`${s.puntajeTotal}/15`}
                  />
                  <span className="history-chart-label">{i + 1}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="history-list">
            {simulacros.map((s) => {
              const isOpen = expanded === s.id;
              const failed = s.preguntas.filter((p) => p.puntajeIA < 5);
              return (
                <div key={s.id} className="history-item">
                  <button
                    className="history-item-header"
                    onClick={() => setExpanded(isOpen ? null : s.id)}
                  >
                    <div className="history-item-meta">
                      <span className="history-item-fecha">{fmt(s.fecha)}</span>
                      <span className="history-item-dur">{fmtDur(s.duracionSegundos)}</span>
                    </div>
                    <div className="history-item-score-wrap">
                      <span
                        className="history-item-score"
                        style={{ color: scoreColor(s.puntajeTotal) }}
                      >
                        {s.puntajeTotal} / 15
                      </span>
                      {failed.length > 0 && (
                        <span className="history-item-failed">
                          🔴 {failed.length} fallidas
                        </span>
                      )}
                    </div>
                    <span className="history-expand-icon">{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {isOpen && (
                    <div className="history-detail">
                      {s.preguntas.map((p, i) => {
                        const color = p.puntajeIA >= 7 ? '#22c55e' : p.puntajeIA >= 5 ? '#eab308' : '#ef4444';
                        return (
                          <div key={i} className="history-detail-item">
                            <div className="history-detail-header">
                              <span className="history-detail-num">#{i + 1}</span>
                              <span className="history-detail-score" style={{ color }}>
                                {p.puntajeIA} / 10
                              </span>
                            </div>
                            <p className="history-detail-pregunta">{p.pregunta}</p>
                            <div className="history-detail-section">
                              <strong>Tu respuesta:</strong>
                              <p>{p.respuestaEstudiante || '(sin respuesta)'}</p>
                            </div>
                            {p.correccion && (
                              <details className="history-detail-correccion">
                                <summary>Ver corrección IA</summary>
                                <p>{p.correccion}</p>
                              </details>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
