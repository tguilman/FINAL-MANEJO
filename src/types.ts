export type CardEstado = 'verde' | 'amarillo' | 'rojo' | 'sin_clasificar';
export type CardProbabilidad = 'seguro' | 'posible' | 'improbable';

export interface Card {
  id: string;
  pregunta: string;
  respuesta: string;
  unidad: string;
  estado: CardEstado;
  probabilidad?: CardProbabilidad;
  importancia: number;
  order: number;
  lastPracticed?: string;
  practiceSession?: number;
}

export interface SimulacroQuestion {
  cardId: string;
  pregunta: string;
  respuesta: string;
  respuestaEstudiante: string;
  correccion: string;
  puntajeIA: number;
  aprobada?: boolean;
}

export interface Simulacro {
  id: string;
  fecha: string;
  puntajeTotal: number;
  duracionSegundos: number;
  preguntas: SimulacroQuestion[];
}

export type AppView =
  | 'api-setup'
  | 'import'
  | 'select'
  | 'board'
  | 'practice'
  | 'flip'
  | 'exam'
  | 'history'
  | 'audio'
  | 'oral';

export interface PracticeState {
  queue: Card[];
  index: number;
  source: string;
}
