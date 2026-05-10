import React, { useState, useRef } from 'react';
import type { AppView, Card } from '../types';
import { storage } from '../utils';

interface Props {
  view: AppView;
  onApiKey: (key: string) => void;
  onDeckImported: (cards: Card[]) => void;
}

const CATEGORY_MAP: Record<string, Card['estado']> = {
  lo_se: 'verde',
  a_repasar: 'amarillo',
  no_lo_se: 'rojo',
  sin_ver: 'sin_clasificar',
};

function parseData(data: unknown): Card[] {
  const ts = Date.now();

  // Format: { fc_units: [{ id, name, cards: [{ id, q, a, category }] }] }
  if (data && typeof data === 'object' && 'fc_units' in data) {
    const units = (data as { fc_units: { id?: string; name: string; cards: { id?: string; q: string; a: string; category?: string }[] }[] }).fc_units;
    const cards: Card[] = [];
    let globalOrder = 0;
    for (const unit of units) {
      for (const c of unit.cards) {
        cards.push({
          id: c.id ?? `card-${globalOrder}-${ts}`,
          pregunta: c.q,
          respuesta: c.a,
          unidad: unit.name,
          estado: CATEGORY_MAP[c.category ?? ''] ?? 'sin_clasificar',
          importancia: 1,
          order: globalOrder++,
        });
      }
    }
    return cards;
  }

  // Format: flat array [{ id?, pregunta, respuesta, unidad, estado?, importancia? }]
  const arr: { id?: string; pregunta: string; respuesta: string; unidad: string; estado?: string; importancia?: number }[] =
    Array.isArray(data) ? data : (data as { cards?: unknown[]; preguntas?: unknown[] }).cards as typeof arr ?? (data as { preguntas?: unknown[] }).preguntas as typeof arr ?? [];

  return arr.map((c, i) => ({
    id: c.id ?? `card-${i}-${ts}`,
    pregunta: c.pregunta,
    respuesta: c.respuesta,
    unidad: c.unidad,
    estado: (['verde', 'amarillo', 'rojo', 'sin_clasificar'].includes(c.estado ?? '')
      ? c.estado
      : 'sin_clasificar') as Card['estado'],
    importancia: c.importancia ?? 1,
    order: i,
  }));
}

export default function Setup({ view, onApiKey, onDeckImported }: Props) {
  const [keyInput, setKeyInput] = useState(storage.getApiKey());
  const [keyError, setKeyError] = useState('');

  const [rawJson, setRawJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [parsed, setParsed] = useState<Card[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleKeySubmit = () => {
    if (!keyInput.trim()) {
      setKeyError('Ingresá tu API key de Anthropic');
      return;
    }
    if (!keyInput.startsWith('sk-ant-')) {
      setKeyError('La API key debe empezar con sk-ant-');
      return;
    }
    setKeyError('');
    onApiKey(keyInput.trim());
  };

  const parseJson = (text: string) => {
    try {
      const data = JSON.parse(text);
      const cards = parseData(data);
      if (!cards.length) throw new Error('No se encontraron cards en el JSON');
      setParsed(cards);
      setSelected(new Set(cards.map((c) => c.id)));
      setJsonError('');
    } catch (e) {
      setJsonError((e as Error).message);
      setParsed([]);
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRawJson(text);
      parseJson(text);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleConfirm = () => {
    const chosen = parsed.filter((c) => selected.has(c.id));
    if (!chosen.length) return;
    onDeckImported(chosen);
  };

  const units = [...new Set(parsed.map((c) => c.unidad))].sort();
  const visible = unitFilter === 'all' ? parsed : parsed.filter((c) => c.unidad === unitFilter);
  const visibleIds = visible.map((c) => c.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...visibleIds]));
    }
  };

  if (view === 'api-setup') {
    return (
      <div className="setup-container">
        <div className="setup-card">
          <h1 className="setup-title">📋 Tablero de Examen</h1>
          <p className="setup-subtitle">Ingresá tu API key de Anthropic para empezar</p>
          <div className="form-group">
            <label className="form-label">API Key</label>
            <input
              className="form-input"
              type="password"
              placeholder="sk-ant-..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleKeySubmit()}
              autoFocus
            />
            {keyError && <p className="form-error">{keyError}</p>}
          </div>
          <a
            className="setup-hint"
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            ¿No tenés? Creá una en console.anthropic.com →
          </a>
          <button className="btn btn-primary setup-btn" onClick={handleKeySubmit}>
            Continuar →
          </button>
        </div>
      </div>
    );
  }

  if (view === 'import') {
    return (
      <div className="setup-container">
        <div className="setup-card setup-card--wide">
          <h2 className="setup-title">Importar preguntas</h2>
          <p className="setup-subtitle">
            Subí un archivo JSON con el mazo de preguntas
          </p>

          <div
            className={`drop-zone ${isDragging ? 'drop-zone--active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
            />
            <p className="drop-zone-text">
              {isDragging ? '¡Soltá acá!' : 'Arrastrá un JSON o hacé click para seleccionar'}
            </p>
            <p className="drop-zone-hint">Formato: [{'{'}id, pregunta, respuesta, unidad, estado, importancia{'}'}]</p>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label">O pegá el JSON acá</label>
            <textarea
              className="form-input form-textarea"
              placeholder='[{"id":"1","pregunta":"¿Qué es...?","respuesta":"Es...","unidad":"Unidad 1"}]'
              value={rawJson}
              onChange={(e) => { setRawJson(e.target.value); parseJson(e.target.value); }}
              rows={6}
            />
            {jsonError && <p className="form-error">{jsonError}</p>}
          </div>

          {parsed.length > 0 && (
            <div className="import-preview">
              <p className="import-count">
                ✅ {parsed.length} preguntas encontradas en {units.length} unidades
              </p>
              <button className="btn btn-primary setup-btn" onClick={() => onDeckImported(parsed)}>
                Importar todas → Seleccionar →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // select view (unreachable in current flow — import goes straight to board, but kept for completeness)
  return (
    <div className="setup-container">
      <div className="setup-card setup-card--wide">
        <div className="select-header">
          <h2 className="setup-title">Seleccioná las preguntas</h2>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={selected.size === 0}>
            Confirmar {selected.size} preguntas →
          </button>
        </div>

        <div className="select-controls">
          <div className="unit-filters">
            <button
              className={`filter-btn ${unitFilter === 'all' ? 'active' : ''}`}
              onClick={() => setUnitFilter('all')}
            >
              Todas las unidades
            </button>
            {units.map((u) => (
              <button
                key={u}
                className={`filter-btn ${unitFilter === u ? 'active' : ''}`}
                onClick={() => setUnitFilter(u)}
              >
                {u}
              </button>
            ))}
          </div>
          <label className="select-all-label">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} />
            Seleccionar todas visibles
          </label>
        </div>

        <div className="select-list">
          {visible.map((card) => (
            <label key={card.id} className="select-item">
              <input
                type="checkbox"
                checked={selected.has(card.id)}
                onChange={(e) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(card.id);
                    else next.delete(card.id);
                    return next;
                  });
                }}
              />
              <span className="select-unit">{card.unidad}</span>
              <span className="select-pregunta">{card.pregunta}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
