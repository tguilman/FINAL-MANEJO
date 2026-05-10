import type { Card, CardEstado, CardProbabilidad, Simulacro } from './types';

const KEYS = {
  API_KEY: 'tablero_api_key',
  DECK: 'tablero_deck',
  SIMULACROS: 'tablero_simulacros',
  SESSION_COUNT: 'tablero_session_count',
  UNIT_ORDER: 'tablero_unit_order',
};

export const storage = {
  getApiKey: () => localStorage.getItem(KEYS.API_KEY) ?? '',
  setApiKey: (key: string) => localStorage.setItem(KEYS.API_KEY, key),

  getDeck: (): Card[] => {
    const raw = localStorage.getItem(KEYS.DECK);
    return raw ? (JSON.parse(raw) as Card[]) : [];
  },
  setDeck: (deck: Card[]) =>
    localStorage.setItem(KEYS.DECK, JSON.stringify(deck)),

  getSimulacros: (): Simulacro[] => {
    const raw = localStorage.getItem(KEYS.SIMULACROS);
    return raw ? (JSON.parse(raw) as Simulacro[]) : [];
  },
  addSimulacro: (s: Simulacro) => {
    const all = storage.getSimulacros();
    all.unshift(s);
    localStorage.setItem(KEYS.SIMULACROS, JSON.stringify(all));
  },

  getSessionCount: () =>
    parseInt(localStorage.getItem(KEYS.SESSION_COUNT) ?? '0'),
  incrementSession: () => {
    const n = storage.getSessionCount() + 1;
    localStorage.setItem(KEYS.SESSION_COUNT, String(n));
    return n;
  },
  clearDeck: () => localStorage.removeItem(KEYS.DECK),

  getUnitOrder: (): string[] => {
    const raw = localStorage.getItem(KEYS.UNIT_ORDER);
    return raw ? (JSON.parse(raw) as string[]) : [];
  },
  setUnitOrder: (order: string[]) =>
    localStorage.setItem(KEYS.UNIT_ORDER, JSON.stringify(order)),
};

export function updateCardProbabilidad(
  deck: Card[],
  cardId: string,
  probabilidad: CardProbabilidad | undefined
): Card[] {
  return deck.map((c) => c.id === cardId ? { ...c, probabilidad } : c);
}

export function updateCardEstado(
  deck: Card[],
  cardId: string,
  estado: CardEstado
): Card[] {
  return deck.map((c) =>
    c.id === cardId
      ? {
          ...c,
          estado,
          lastPracticed: new Date().toISOString(),
          practiceSession: storage.getSessionCount(),
        }
      : c
  );
}

export function reorderCards(
  deck: Card[],
  unidad: string,
  fromId: string,
  toId: string
): Card[] {
  const col = deck
    .filter((c) => c.unidad === unidad)
    .sort((a, b) => a.order - b.order);
  const fromIdx = col.findIndex((c) => c.id === fromId);
  const toIdx = col.findIndex((c) => c.id === toId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return deck;

  const reordered = [...col];
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, moved);

  const withNewOrder = reordered.map((c, i) => ({ ...c, order: i }));
  return deck.map((c) => withNewOrder.find((u) => u.id === c.id) ?? c);
}

export function getDueCards(deck: Card[]): Card[] {
  const current = storage.getSessionCount();
  return deck.filter((c) => {
    if (c.estado === 'rojo' || c.estado === 'sin_clasificar') return true;
    if (c.estado === 'amarillo')
      return !c.practiceSession || current - c.practiceSession >= 2;
    if (c.estado === 'verde')
      return !c.practiceSession || current - c.practiceSession >= 5;
    return true;
  });
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function selectExamCards(deck: Card[]): Card[] {
  // Prefer "seguro" cards; fall back to full deck if fewer than 5 marked
  const seguras = deck.filter((c) => c.probabilidad === 'seguro');
  const pool = seguras.length >= 5 ? seguras : deck;

  const red    = shuffle(pool.filter((c) => c.estado === 'rojo'));
  const yellow = shuffle(pool.filter((c) => c.estado === 'amarillo'));
  const unclass= shuffle(pool.filter((c) => c.estado === 'sin_clasificar'));
  const green  = shuffle(pool.filter((c) => c.estado === 'verde'));
  return [...red, ...yellow, ...unclass, ...green].slice(0, 15);
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text
    .split('\n')
    .reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / 65)), 0);
}

export function estadoLabel(e: CardEstado): string {
  const map: Record<CardEstado, string> = {
    verde: '🟢 La sé',
    amarillo: '🟡 Más o menos',
    rojo: '🔴 No la sé',
    sin_clasificar: '⚪ Sin clasificar',
  };
  return map[e];
}

export function estadoColor(e: CardEstado): string {
  const map: Record<CardEstado, string> = {
    verde: '#22c55e',
    amarillo: '#eab308',
    rojo: '#ef4444',
    sin_clasificar: '#6b7280',
  };
  return map[e];
}

export function getUnidades(deck: Card[]): string[] {
  return [...new Set(deck.map((c) => c.unidad))].sort();
}
