import { useState, useEffect } from 'react';
import type { AppView, Card, CardEstado, PracticeState } from './types';
import { storage } from './utils';
import Setup from './components/Setup';
import Board from './components/Board';
import PracticeModal from './components/PracticeModal';
import FlipMode from './components/FlipMode';
import Exam from './components/Exam';
import History from './components/History';
import AudioPlayer from './components/AudioPlayer';

export default function App() {
  const [view, setView] = useState<AppView>('api-setup');
  const [apiKey, setApiKey] = useState('');
  const [deck, setDeck] = useState<Card[]>([]);
  const [filter, setFilter] = useState<CardEstado | 'todas'>('todas');
  const [practiceState, setPracticeState] = useState<PracticeState | null>(null);
  const [audioQueue, setAudioQueue] = useState<{ cards: Card[]; source: string } | null>(null);

  useEffect(() => {
    const key = storage.getApiKey();
    const savedDeck = storage.getDeck();
    if (key) {
      setApiKey(key);
      if (savedDeck.length > 0) {
        setDeck(savedDeck);
        setView('board');
      } else {
        setView('import');
      }
    }
  }, []);

  const handleApiKey = (key: string) => {
    storage.setApiKey(key);
    setApiKey(key);
    const savedDeck = storage.getDeck();
    if (savedDeck.length > 0) {
      setDeck(savedDeck);
      setView('board');
    } else {
      setView('import');
    }
  };

  const handleDeckImported = (cards: Card[]) => {
    storage.setDeck(cards);
    setDeck(cards);
    setView('board');
  };

  const handleDeckUpdate = (updated: Card[]) => {
    storage.setDeck(updated);
    setDeck(updated);
  };

  const startPractice = (queue: Card[], source: string) => {
    storage.incrementSession();
    setPracticeState({ queue, index: 0, source });
    setView('practice');
  };

  const startFlip = (queue: Card[], source: string) => {
    storage.incrementSession();
    setPracticeState({ queue, index: 0, source });
    setView('flip');
  };

  const exitPractice = () => {
    setPracticeState(null);
    setView('board');
  };

  const startAudio = (cards: Card[], source: string) => {
    if (cards.length === 0) return;
    setAudioQueue({ cards, source });
    setView('audio');
  };

  const exitAudio = () => {
    setAudioQueue(null);
    setView('board');
  };

  const counts = {
    todas: deck.length,
    verde: deck.filter((c) => c.estado === 'verde').length,
    amarillo: deck.filter((c) => c.estado === 'amarillo').length,
    rojo: deck.filter((c) => c.estado === 'rojo').length,
    sin_clasificar: deck.filter((c) => c.estado === 'sin_clasificar').length,
  };

  if (view === 'api-setup' || view === 'import' || view === 'select') {
    return <Setup view={view} onApiKey={handleApiKey} onDeckImported={handleDeckImported} />;
  }

  if (view === 'audio' && audioQueue) {
    return (
      <AudioPlayer
        cards={audioQueue.cards}
        source={audioQueue.source}
        onClose={exitAudio}
      />
    );
  }

  if (view === 'practice' && practiceState) {
    return (
      <PracticeModal
        state={practiceState}
        deck={deck}
        apiKey={apiKey}
        onDeckUpdate={handleDeckUpdate}
        onClose={exitPractice}
      />
    );
  }

  if (view === 'flip' && practiceState) {
    return (
      <FlipMode
        state={practiceState}
        deck={deck}
        onDeckUpdate={handleDeckUpdate}
        onClose={exitPractice}
      />
    );
  }

  if (view === 'exam') {
    return (
      <Exam
        deck={deck}
        apiKey={apiKey}
        onDeckUpdate={handleDeckUpdate}
        onClose={() => setView('board')}
        onSaved={() => setView('history')}
      />
    );
  }

  if (view === 'history') {
    return <History onClose={() => setView('board')} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-logo">📋 Tablero Examen</span>
          <div className="topbar-filters">
            {(['todas', 'rojo', 'amarillo', 'verde', 'sin_clasificar'] as const).map((f) => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'todas' && `Todas (${counts.todas})`}
                {f === 'rojo' && `🔴 No sé (${counts.rojo})`}
                {f === 'amarillo' && `🟡 Más o menos (${counts.amarillo})`}
                {f === 'verde' && `🟢 Las sé (${counts.verde})`}
                {f === 'sin_clasificar' && `⚪ Sin clasificar (${counts.sin_clasificar})`}
              </button>
            ))}
          </div>
        </div>
        <div className="topbar-right">
          <button
            className="btn btn-ghost"
            onClick={() => {
              const due = deck.filter(
                (c) => c.estado === 'rojo' || c.estado === 'sin_clasificar'
              );
              if (due.length > 0) startPractice(due, 'Las que no sé');
            }}
            title="Practicar las rojas y sin clasificar"
          >
            🔴 No las sé
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const due = deck.filter((c) => c.estado === 'amarillo');
              if (due.length > 0) startPractice(due, 'Las dudosas');
            }}
            title="Practicar las amarillas"
          >
            🟡 Dudosas
          </button>
          <button
            className="btn btn-audio"
            onClick={() => {
              const seguras = deck.filter((c) => c.probabilidad === 'seguro');
              const pool = seguras.length > 0 ? seguras : deck;
              startAudio(pool, seguras.length > 0 ? '🎧 Seguro' : '🎧 Todas');
            }}
            title="Escuchar las que entran seguro"
          >
            🎧 Escuchar
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => startFlip(deck, 'Flip — Todas')}
            title="Modo flip"
          >
            🔄 Flip
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setView('exam')}
          >
            📝 Simular examen
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setView('history')}
          >
            📊 Historial
          </button>
          <button
            className="btn btn-ghost"
            title="Importar / actualizar tarjetas desde un archivo JSON"
            onClick={() => setView('import')}
          >
            📥 Importar
          </button>
          <button
            className="btn btn-ghost"
            title="Exportar mazo como JSON (backup)"
            onClick={() => {
              const json = JSON.stringify(deck, null, 2);
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `tablero-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            💾 Exportar
          </button>
        </div>
      </header>
      <Board
        deck={deck}
        filter={filter}
        apiKey={apiKey}
        onDeckUpdate={handleDeckUpdate}
        onStartPractice={startPractice}
        onStartFlip={startFlip}
        onStartAudio={startAudio}
      />
    </div>
  );
}
