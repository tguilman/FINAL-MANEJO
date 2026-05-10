import React, { useState, useEffect, useRef } from 'react';
import type { Card, CardEstado } from '../types';
import { getUnidades, reorderCards, estadoColor, storage, updateCardProbabilidad } from '../utils';
import type { CardProbabilidad } from '../types';
import PracticeModal from './PracticeModal';

interface Props {
  deck: Card[];
  filter: CardEstado | 'todas';
  apiKey: string;
  onDeckUpdate: (deck: Card[]) => void;
  onStartPractice: (queue: Card[], source: string) => void;
  onStartFlip: (queue: Card[], source: string) => void;
}

interface CardItemProps {
  card: Card;
  apiKey: string;
  deck: Card[];
  onDeckUpdate: (deck: Card[]) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (unidad: string) => void;
}

const PROB_CONFIG: Record<CardProbabilidad, { label: string; className: string }> = {
  seguro:    { label: '🎯 Entra seguro', className: 'prob-seguro' },
  posible:   { label: '🤔 Puede entrar', className: 'prob-posible' },
  improbable:{ label: '💤 No creo',      className: 'prob-improbable' },
};

function CardItem({ card, apiKey, deck, onDeckUpdate, onDelete, onDragStart, onDragOver, onDrop }: CardItemProps) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [showPractice, setShowPractice] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showProbBtns, setShowProbBtns] = useState(false);

  const estadoBadge: Record<CardEstado, string> = {
    verde: '🟢', amarillo: '🟡', rojo: '🔴', sin_clasificar: '⚪',
  };

  const handleProbabilidad = (p: CardProbabilidad) => {
    // toggle off if same value
    const next = card.probabilidad === p ? undefined : p;
    onDeckUpdate(updateCardProbabilidad(deck, card.id, next));
    setShowProbBtns(false);
  };

  const prob = card.probabilidad;
  const cardClass = [
    'kanban-card',
    prob === 'seguro'     ? 'card-seguro'     : '',
    prob === 'improbable' ? 'card-improbable' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div
        className={cardClass}
        draggable
        onDragStart={(e) => { e.stopPropagation(); onDragStart(card.id); }}
        onDragOver={(e) => { e.stopPropagation(); onDragOver(e, card.id); }}
        onDrop={(e) => { e.stopPropagation(); onDrop(card.unidad); }}
        style={{ borderLeft: `3px solid ${estadoColor(card.estado)}` }}
      >
        <div className="kanban-card-header">
          <span className="estado-badge">{estadoBadge[card.estado]}</span>
          {prob && (
            <span className={`prob-badge ${PROB_CONFIG[prob].className}`}>
              {PROB_CONFIG[prob].label}
            </span>
          )}
          <button
            className="card-delete-btn"
            onClick={() => setConfirmDelete(true)}
            title="Borrar tarjeta"
          >✕</button>
        </div>

        <p className="kanban-card-pregunta">{card.pregunta}</p>
        {showAnswer && <p className="kanban-card-respuesta">{card.respuesta}</p>}

        {confirmDelete ? (
          <div className="card-confirm-delete">
            <span>¿Borrar esta tarjeta?</span>
            <button className="btn btn-rojo btn-sm" onClick={() => onDelete(card.id)}>Borrar</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancelar</button>
          </div>
        ) : showProbBtns ? (
          <div className="prob-selector">
            {(['seguro', 'posible', 'improbable'] as CardProbabilidad[]).map((p) => (
              <button
                key={p}
                className={`prob-btn ${PROB_CONFIG[p].className}${card.probabilidad === p ? ' active' : ''}`}
                onClick={() => handleProbabilidad(p)}
              >
                {PROB_CONFIG[p].label}
              </button>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => setShowProbBtns(false)}>✕</button>
          </div>
        ) : (
          <div className="kanban-card-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAnswer((v) => !v)}>
              {showAnswer ? '🙈 Ocultar' : '👁 Ver respuesta'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPractice(true)}>
              ✍️ Practicar
            </button>
            <button
              className={`btn btn-sm prob-toggle-btn${prob ? ` ${PROB_CONFIG[prob].className}` : ''}`}
              onClick={() => setShowProbBtns(true)}
              title="Probabilidad de que entre en el examen"
            >
              {prob ? PROB_CONFIG[prob].label : '📊 ¿Entra?'}
            </button>
          </div>
        )}
      </div>
      {showPractice && (
        <PracticeModal
          state={{ queue: [card], index: 0, source: 'board' }}
          deck={deck}
          apiKey={apiKey}
          onDeckUpdate={onDeckUpdate}
          onClose={() => setShowPractice(false)}
          inline
        />
      )}
    </>
  );
}

// Inline form to add a new card to a column
interface AddCardFormProps {
  unidad: string;
  deck: Card[];
  onSave: (deck: Card[]) => void;
  onCancel: () => void;
}

function AddCardForm({ unidad, deck, onSave, onCancel }: AddCardFormProps) {
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const preguntaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { preguntaRef.current?.focus(); }, []);

  const handleSave = () => {
    const p = pregunta.trim();
    const r = respuesta.trim();
    if (!p) return;
    const maxOrder = deck.filter((c) => c.unidad === unidad).reduce((m, c) => Math.max(m, c.order), -1);
    const newCard: Card = {
      id: `card-${Date.now()}`,
      pregunta: p,
      respuesta: r,
      unidad,
      estado: 'sin_clasificar',
      importancia: 1,
      order: maxOrder + 1,
    };
    onSave([...deck, newCard]);
  };

  return (
    <div className="add-card-form">
      <textarea
        ref={preguntaRef}
        className="add-card-input"
        placeholder="Pregunta *"
        value={pregunta}
        onChange={(e) => setPregunta(e.target.value)}
        rows={2}
      />
      <textarea
        className="add-card-input"
        placeholder="Respuesta (opcional)"
        value={respuesta}
        onChange={(e) => setRespuesta(e.target.value)}
        rows={2}
      />
      <div className="add-card-actions">
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!pregunta.trim()}>
          Agregar
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

// Modal to add a new unit
interface NewUnitModalProps {
  existingUnits: string[];
  deck: Card[];
  onSave: (deck: Card[]) => void;
  onClose: () => void;
}

function NewUnitModal({ existingUnits, deck, onSave, onClose }: NewUnitModalProps) {
  const [nombre, setNombre] = useState('');
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSave = () => {
    const n = nombre.trim();
    const p = pregunta.trim();
    if (!n || !p) return;
    if (existingUnits.includes(n)) return;
    const newCard: Card = {
      id: `card-${Date.now()}`,
      pregunta: p,
      respuesta: respuesta.trim(),
      unidad: n,
      estado: 'sin_clasificar',
      importancia: 1,
      order: 0,
    };
    onSave([...deck, newCard]);
    onClose();
  };

  return (
    <div className="practice-inline-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="practice-inline-card" style={{ maxWidth: 480 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>Nueva unidad</h3>
        <div className="form-group">
          <label className="form-label">Nombre de la unidad</label>
          <input
            ref={inputRef}
            className="form-input"
            placeholder="Ej: Unidad 6 - Relatividad"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          {existingUnits.includes(nombre.trim()) && (
            <p className="form-error">Ya existe una unidad con ese nombre</p>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Primera pregunta *</label>
          <textarea
            className="form-input"
            placeholder="Pregunta"
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            rows={2}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Respuesta (opcional)</label>
          <textarea
            className="form-input"
            placeholder="Respuesta"
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            rows={2}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!nombre.trim() || !pregunta.trim() || existingUnits.includes(nombre.trim())}
          >
            Crear unidad
          </button>
        </div>
      </div>
    </div>
  );
}

// Per-column filter: set of active filter tags (estado values + probabilidad values)
type ColFilterTag = CardEstado | CardProbabilidad;

// AND between types, OR within each type:
//   (seguro OR posible) AND (rojo OR amarillo)
// If only one type is selected, only that constraint applies.
function applyColFilter(cards: Card[], active: Set<ColFilterTag>): Card[] {
  if (active.size === 0) return cards;
  const probTags = new Set<string>(['seguro', 'posible', 'improbable']);
  const activeProb = [...active].filter((t) => probTags.has(t)) as CardProbabilidad[];
  const activeEstado = [...active].filter((t) => !probTags.has(t)) as CardEstado[];
  return cards.filter((c) => {
    const probOk = activeProb.length === 0 || activeProb.some((p) => c.probabilidad === p);
    const estadoOk = activeEstado.length === 0 || activeEstado.some((e) => c.estado === e);
    return probOk && estadoOk;
  });
}

const COL_FILTER_OPTS: { tag: ColFilterTag; label: string; color: string }[] = [
  { tag: 'seguro',        label: '🎯',  color: '#a5b4fc' },
  { tag: 'posible',       label: '🤔',  color: '#fde047' },
  { tag: 'improbable',    label: '💤',  color: '#6b7280' },
  { tag: 'rojo',          label: '🔴',  color: '#ef4444' },
  { tag: 'amarillo',      label: '🟡',  color: '#eab308' },
  { tag: 'verde',         label: '🟢',  color: '#22c55e' },
  { tag: 'sin_clasificar',label: '⚪',  color: '#6b7280' },
];

export default function Board({ deck, filter, apiKey, onDeckUpdate, onStartPractice, onStartFlip }: Props) {
  const [cardDragFrom, setCardDragFrom] = useState<string | null>(null);
  const [cardDragOver, setCardDragOver] = useState<string | null>(null);
  const [colDragFrom, setColDragFrom] = useState<string | null>(null);
  const [colDragOver, setColDragOver] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [showNewUnit, setShowNewUnit] = useState(false);
  // per-column active filter tags
  const [colFilters, setColFilters] = useState<Record<string, Set<ColFilterTag>>>({});

  const rawUnits = getUnidades(deck);
  const [unitOrder, setUnitOrder] = useState<string[]>(() => {
    const saved = storage.getUnitOrder();
    const known = saved.filter((u) => rawUnits.includes(u));
    const newOnes = rawUnits.filter((u) => !known.includes(u));
    return [...known, ...newOnes];
  });

  useEffect(() => {
    setUnitOrder((prev) => {
      const known = prev.filter((u) => rawUnits.includes(u));
      const newOnes = rawUnits.filter((u) => !known.includes(u));
      return [...known, ...newOnes];
    });
  }, [deck]);

  const globalFiltered = filter === 'todas' ? deck : deck.filter((c) => c.estado === filter);

  const toggleColFilter = (unidad: string, tag: ColFilterTag) => {
    setColFilters((prev) => {
      const cur = new Set(prev[unidad] ?? []);
      if (cur.has(tag)) cur.delete(tag); else cur.add(tag);
      return { ...prev, [unidad]: cur };
    });
  };

  const handleCardDragStart = (id: string) => setCardDragFrom(id);
  const handleCardDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); setCardDragOver(id); };
  const handleCardDrop = (unidad: string) => {
    if (cardDragFrom && cardDragOver && cardDragFrom !== cardDragOver)
      onDeckUpdate(reorderCards(deck, unidad, cardDragFrom, cardDragOver));
    setCardDragFrom(null); setCardDragOver(null);
  };

  const handleColDragStart = (e: React.DragEvent, unidad: string) => {
    e.stopPropagation(); setColDragFrom(unidad); setCardDragFrom(null);
  };
  const handleColDragOver = (e: React.DragEvent, unidad: string) => {
    e.preventDefault(); e.stopPropagation();
    if (colDragFrom && colDragFrom !== unidad) setColDragOver(unidad);
  };
  const handleColDrop = (e: React.DragEvent, unidad: string) => {
    e.stopPropagation();
    if (colDragFrom && colDragFrom !== unidad) {
      const next = [...unitOrder];
      const fromIdx = next.indexOf(colDragFrom);
      const toIdx = next.indexOf(unidad);
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, colDragFrom);
      setUnitOrder(next);
      storage.setUnitOrder(next);
    }
    setColDragFrom(null); setColDragOver(null);
  };

  const handleDelete = (id: string) => onDeckUpdate(deck.filter((c) => c.id !== id));

  const estadoPriority: Record<string, number> = { rojo: 0, sin_clasificar: 1, amarillo: 2, verde: 3 };

  const sortCol = (cards: Card[]) =>
    [...cards].sort((a, b) => {
      const aTop = a.probabilidad === 'seguro' ? 0 : 1;
      const bTop = b.probabilidad === 'seguro' ? 0 : 1;
      if (aTop !== bTop) return aTop - bTop;
      const pd = estadoPriority[a.estado] - estadoPriority[b.estado];
      return pd !== 0 ? pd : a.order - b.order;
    });

  // All cards matching active column filters across every unit (for the global practice button)
  const allFilteredCards = unitOrder.flatMap((unidad) => {
    const activeFilters = colFilters[unidad] ?? new Set<ColFilterTag>();
    if (activeFilters.size === 0) return [];
    return applyColFilter(globalFiltered.filter((c) => c.unidad === unidad), activeFilters);
  });

  const clearAllFilters = () => setColFilters({});

  return (
    <>
      {allFilteredCards.length > 0 && (
        <div className="board-filter-bar">
          <span className="board-filter-info">
            {allFilteredCards.length} tarjetas filtradas
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onStartPractice(sortCol(allFilteredCards), 'Filtradas')}
          >
            ✍️ Practicar todas las filtradas ({allFilteredCards.length})
          </button>
          <button className="btn btn-ghost btn-sm" onClick={clearAllFilters}>
            ✕ Limpiar filtros
          </button>
        </div>
      )}
      <div className="board">
        {unitOrder.map((unidad) => {
          const allInUnit = deck.filter((c) => c.unidad === unidad);
          const activeFilters = colFilters[unidad] ?? new Set<ColFilterTag>();

          const col = sortCol(applyColFilter(
            globalFiltered.filter((c) => c.unidad === unidad),
            activeFilters
          ));

          const counts = {
            total: allInUnit.length,
            seguro: allInUnit.filter((c) => c.probabilidad === 'seguro').length,
            verde: allInUnit.filter((c) => c.estado === 'verde').length,
            amarillo: allInUnit.filter((c) => c.estado === 'amarillo').length,
            rojo: allInUnit.filter((c) => c.estado === 'rojo').length,
          };

          return (
            <div
              key={unidad}
              className={`kanban-column${colDragFrom === unidad ? ' col-dragging' : ''}${colDragOver === unidad ? ' col-drag-over' : ''}`}
              onDragOver={(e) => handleColDragOver(e, unidad)}
              onDrop={(e) => handleColDrop(e, unidad)}
              onDragEnd={() => { setColDragFrom(null); setColDragOver(null); }}
            >
              <div
                className="kanban-col-header"
                draggable
                onDragStart={(e) => handleColDragStart(e, unidad)}
                title="Arrastrá para reordenar"
              >
                <div className="kanban-col-title">
                  <span className="col-drag-handle">⠿</span>
                  <span className="kanban-col-name">{unidad}</span>
                  <span className="kanban-col-count">{col.length}/{counts.total}</span>
                </div>
                <div className="kanban-col-stats">
                  {counts.seguro > 0 && <span style={{ color: '#a5b4fc' }}>🎯{counts.seguro}</span>}
                  <span style={{ color: '#22c55e' }}>🟢{counts.verde}</span>
                  <span style={{ color: '#eab308' }}>🟡{counts.amarillo}</span>
                  <span style={{ color: '#ef4444' }}>🔴{counts.rojo}</span>
                </div>
                {/* Per-column filter pills */}
                <div className="col-filter-row" onClick={(e) => e.stopPropagation()}>
                  {COL_FILTER_OPTS.map(({ tag, label, color }) => {
                    // Only show tags that have at least one card in this unit
                    const isProbTag = tag === 'seguro' || tag === 'posible' || tag === 'improbable';
                    const hasTag = isProbTag
                      ? allInUnit.some((c) => c.probabilidad === (tag as CardProbabilidad))
                      : allInUnit.some((c) => c.estado === (tag as CardEstado));
                    if (!hasTag) return null;
                    const isActive = activeFilters.has(tag);
                    return (
                      <button
                        key={tag}
                        className={`col-filter-pill${isActive ? ' active' : ''}`}
                        style={isActive ? { borderColor: color, color } : {}}
                        onClick={() => toggleColFilter(unidad, tag)}
                        title={tag}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {activeFilters.size > 0 && (
                    <button
                      className="col-filter-clear"
                      onClick={() => setColFilters((p) => ({ ...p, [unidad]: new Set() }))}
                    >✕</button>
                  )}
                </div>
                <div className="kanban-col-actions">
                  {activeFilters.size > 0 && col.length > 0 && (
                    <button className="btn btn-primary btn-sm" onClick={() => onStartPractice(col, `Filtradas — ${unidad}`)}>
                      ✍️ Practicar estas ({col.length})
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => onStartPractice(allInUnit, unidad)}>
                    🎯 Practicar
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onStartFlip(allInUnit, unidad)}>
                    🔄 Flip
                  </button>
                </div>
              </div>

              <div
                className="kanban-col-cards"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => { e.stopPropagation(); handleCardDrop(unidad); }}
              >
                {col.length === 0 && (
                  <p className="kanban-empty">No hay preguntas{filter !== 'todas' ? ' con este filtro' : ''}</p>
                )}
                {col.map((card) => (
                  <div key={card.id} className={cardDragOver === card.id ? 'drag-over' : ''}>
                    <CardItem
                      card={card}
                      apiKey={apiKey}
                      deck={deck}
                      onDeckUpdate={onDeckUpdate}
                      onDelete={handleDelete}
                      onDragStart={handleCardDragStart}
                      onDragOver={handleCardDragOver}
                      onDrop={handleCardDrop}
                    />
                  </div>
                ))}

                {addingTo === unidad ? (
                  <AddCardForm
                    unidad={unidad}
                    deck={deck}
                    onSave={(updated) => { onDeckUpdate(updated); setAddingTo(null); }}
                    onCancel={() => setAddingTo(null)}
                  />
                ) : (
                  <button
                    className="btn-add-card"
                    onClick={() => setAddingTo(unidad)}
                  >
                    + Agregar tarjeta
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* New unit column */}
        <div className="kanban-column kanban-column--new" onClick={() => setShowNewUnit(true)}>
          <div className="new-unit-placeholder">
            <span className="new-unit-icon">+</span>
            <span>Nueva unidad</span>
          </div>
        </div>
      </div>

      {showNewUnit && (
        <NewUnitModal
          existingUnits={rawUnits}
          deck={deck}
          onSave={(updated) => { onDeckUpdate(updated); setShowNewUnit(false); }}
          onClose={() => setShowNewUnit(false)}
        />
      )}
    </>
  );
}
