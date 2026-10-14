export type Muscle =
  | 'chest' | 'lats' | 'upper_back' | 'traps' | 'front_delts' | 'side_delts' | 'rear_delts'
  | 'biceps' | 'triceps' | 'forearms' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'abs';

export const MUSCLES: Muscle[] = [
  'chest', 'lats', 'upper_back', 'traps', 'front_delts', 'side_delts', 'rear_delts',
  'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'abs',
];

/** external: plain load. bodyweight: weight = extra load added (0 = bodyweight). assisted: weight = assistance (lower is better). */
export type LoadMode = 'external' | 'bodyweight' | 'assisted';
export type Unit = 'kg' | 'lb';
export type ThemePref = 'dark' | 'light' | 'system';

export interface ExerciseDef {
  id: string;
  name: string;
  primary: Muscle;
  secondary: Muscle[]; // each counts as indirect (0.5) volume
  equipment: string;
  compound: boolean;
  loadMode: LoadMode;
  perHand: boolean; // weight is logged per hand (dumbbells)
  incrementKg: number; // practical smallest jump, stored canonical in kg
  restSec: number;
  alternatives: string[]; // exercise ids
  custom: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TemplateExercise {
  uid: string; // stable within the template
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec?: number; // overrides exercise default
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  focus: string;
  exercises: TemplateExercise[];
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionExercise {
  uid: string;
  exerciseId: string;
  nameSnapshot: string; // keeps history readable after renames
  muscleSnapshot: Muscle;
  secondarySnapshot: Muscle[];
  loadModeSnapshot: LoadMode;
  perHandSnapshot: boolean;
  targetSets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  notes: string;
  swappedFrom?: string; // original exercise id when substituted
}

export interface Feedback {
  sleep?: number; // 1 (poor) – 5 (great)
  energy?: number; // 1 – 5
  soreness?: number; // 1 (none) – 5 (very sore)
  recovery?: number; // 1 – 5
  at: number;
}

export interface Session {
  id: string;
  templateId: string | null;
  name: string;
  focus: string;
  status: 'active' | 'completed';
  startedAt: number;
  finishedAt?: number;
  /** Seconds the session was open; for completed sessions fixed at finish. */
  durationSec?: number;
  exercises: SessionExercise[];
  notes: string;
  feedback?: Feedback;
  deload?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SetEntry {
  id: string;
  sessionId: string;
  exerciseUid: string; // SessionExercise.uid
  exerciseId: string;
  index: number; // order within exercise
  kind: 'warmup' | 'working';
  weightKg: number | null; // canonical kg, null = not entered
  reps: number | null;
  rir: number | null; // reps in reserve 0–5
  completed: boolean;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface BodyWeightEntry {
  id: string;
  date: string; // YYYY-MM-DD (local)
  kg: number;
  createdAt: number;
  updatedAt: number;
}

export type RecordType = 'weight' | 'e1rm' | 'reps' | 'setVolume';
export interface RecordEntry {
  id: string; // `${exerciseId}:${type}`
  exerciseId: string;
  type: RecordType;
  value: number; // kg, reps or kg*reps
  reps?: number;
  weightKg?: number;
  sessionId: string;
  achievedAt: number;
  updatedAt: number;
}

export interface ProgressionRule {
  mode: 'suggest' | 'off';
  incrementKg?: number;
  sessionsAtTop?: number;
}

export interface Settings {
  id: 'settings';
  unit: Unit;
  theme: ThemePref;
  schedule: (string | null)[]; // index 0 = Monday … 6 = Sunday → template id
  restCompoundSec: number;
  restIsolationSec: number;
  autoStartTimer: boolean;
  timerSound: boolean;
  progressionEnabled: boolean;
  sessionsAtTop: number; // 1 or 2
  minAvgRir: number; // do not suggest increases when average RIR is below this
  deloadEveryWeeks: number;
  lastDeloadAt?: number;
  rules: Record<string, ProgressionRule>;
  dismissed: Record<string, number>; // recommendation key -> dismissedAt
  planned: Record<string, number>; // exerciseId -> kg the user approved for the next session
  updatedAt: number;
}

export interface TimerState {
  id: 'timer';
  durationSec: number;
  startedAt: number; // ms epoch of the current running segment
  remainingAtStart: number; // seconds remaining when the segment started
  running: boolean;
  label: string;
  updatedAt: number;
}

export const BACKUP_APP = 'liftlog';
export const BACKUP_SCHEMA = 2;
