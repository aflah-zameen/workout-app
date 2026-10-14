import type { ExerciseDef, LoadMode, Muscle, Settings, TemplateExercise, WorkoutTemplate } from '../types';

type Spec = {
  id: string; name: string; primary: Muscle; secondary?: Muscle[]; equipment: string;
  compound?: boolean; mode?: LoadMode; perHand?: boolean; inc: number; rest: number; alts?: string[];
};

const SPECS: Spec[] = [
  // Pull
  { id: 'pullup', name: 'Pull-up', primary: 'lats', secondary: ['biceps', 'upper_back'], equipment: 'Bar', compound: true, mode: 'bodyweight', inc: 2.5, rest: 150, alts: ['assisted_pullup', 'lat_pulldown', 'pullup_alt'] },
  { id: 'pullup_alt', name: 'Pull-up (neutral / chin grip)', primary: 'lats', secondary: ['biceps', 'upper_back'], equipment: 'Bar', compound: true, mode: 'bodyweight', inc: 2.5, rest: 150, alts: ['assisted_pullup', 'lat_pulldown', 'pullup'] },
  { id: 'assisted_pullup', name: 'Assisted pull-up', primary: 'lats', secondary: ['biceps', 'upper_back'], equipment: 'Assist machine', compound: true, mode: 'assisted', inc: 2.5, rest: 150, alts: ['lat_pulldown', 'pullup'] },
  { id: 'lat_pulldown', name: 'Lat pulldown (neutral / medium grip)', primary: 'lats', secondary: ['biceps'], equipment: 'Cable', compound: true, inc: 2.5, rest: 120, alts: ['single_arm_pulldown', 'assisted_pullup', 'pullup'] },
  { id: 'cs_row', name: 'Chest-supported row', primary: 'upper_back', secondary: ['lats', 'rear_delts', 'biceps'], equipment: 'Machine / dumbbells', compound: true, inc: 2.5, rest: 120, alts: ['seated_cable_row', 'db_row'] },
  { id: 'seated_cable_row', name: 'Seated cable row', primary: 'upper_back', secondary: ['lats', 'biceps', 'rear_delts'], equipment: 'Cable', compound: true, inc: 2.5, rest: 120, alts: ['cs_row', 'db_row'] },
  { id: 'db_row', name: 'One-arm dumbbell row', primary: 'lats', secondary: ['upper_back', 'biceps'], equipment: 'Dumbbell', compound: true, perHand: true, inc: 2, rest: 120, alts: ['cs_row', 'seated_cable_row'] },
  { id: 'reverse_pec_deck', name: 'Reverse pec-deck', primary: 'rear_delts', secondary: ['upper_back'], equipment: 'Machine', inc: 2.5, rest: 75, alts: ['rear_delt_fly'] },
  { id: 'rear_delt_fly', name: 'Rear-delt fly', primary: 'rear_delts', secondary: ['upper_back'], equipment: 'Dumbbell', perHand: true, inc: 1, rest: 75, alts: ['reverse_pec_deck'] },
  { id: 'incline_db_curl', name: 'Incline dumbbell curl', primary: 'biceps', equipment: 'Dumbbell', perHand: true, inc: 1, rest: 75, alts: ['cable_curl', 'preacher_curl'] },
  { id: 'hammer_curl', name: 'Hammer curl', primary: 'biceps', secondary: ['forearms'], equipment: 'Dumbbell', perHand: true, inc: 1, rest: 75, alts: ['cable_curl'] },
  { id: 'single_arm_pulldown', name: 'Single-arm cable pulldown', primary: 'lats', secondary: ['biceps'], equipment: 'Cable', inc: 1.25, rest: 90, alts: ['straight_arm_pulldown', 'lat_pulldown'] },
  { id: 'straight_arm_pulldown', name: 'Straight-arm pulldown', primary: 'lats', equipment: 'Cable', inc: 2.5, rest: 90, alts: ['single_arm_pulldown'] },
  { id: 'shrug', name: 'Shrug (dumbbell / machine)', primary: 'traps', secondary: ['forearms'], equipment: 'Dumbbell / machine', inc: 2.5, rest: 90, alts: ['cs_row'] },
  { id: 'preacher_curl', name: 'Preacher curl', primary: 'biceps', equipment: 'EZ-bar / machine', inc: 2.5, rest: 75, alts: ['cable_curl', 'incline_db_curl'] },
  { id: 'cable_curl', name: 'Cable curl', primary: 'biceps', equipment: 'Cable', inc: 2.5, rest: 75, alts: ['ez_curl', 'preacher_curl'] },
  { id: 'ez_curl', name: 'EZ-bar curl', primary: 'biceps', secondary: ['forearms'], equipment: 'EZ-bar', inc: 2.5, rest: 75, alts: ['cable_curl', 'incline_db_curl'] },
  { id: 'reverse_curl', name: 'Reverse curl', primary: 'forearms', secondary: ['biceps'], equipment: 'EZ-bar / cable', inc: 2.5, rest: 75, alts: ['hammer_curl'] },
  // Push
  { id: 'incline_db_press', name: 'Incline dumbbell press', primary: 'chest', secondary: ['front_delts', 'triceps'], equipment: 'Dumbbell', compound: true, perHand: true, inc: 2, rest: 150, alts: ['incline_machine_press', 'flat_db_press'] },
  { id: 'bench_press', name: 'Flat bench press (barbell)', primary: 'chest', secondary: ['front_delts', 'triceps'], equipment: 'Barbell', compound: true, inc: 2.5, rest: 150, alts: ['flat_db_press', 'flat_machine_press', 'pushup'] },
  { id: 'flat_db_press', name: 'Flat dumbbell press', primary: 'chest', secondary: ['front_delts', 'triceps'], equipment: 'Dumbbell', compound: true, perHand: true, inc: 2, rest: 150, alts: ['bench_press', 'flat_machine_press', 'pushup'] },
  { id: 'cable_fly', name: 'Cable fly', primary: 'chest', equipment: 'Cable', inc: 2.5, rest: 90, alts: ['pec_deck'] },
  { id: 'pec_deck', name: 'Pec-deck fly', primary: 'chest', equipment: 'Machine', inc: 2.5, rest: 90, alts: ['cable_fly'] },
  { id: 'lateral_raise', name: 'Dumbbell lateral raise', primary: 'side_delts', equipment: 'Dumbbell', perHand: true, inc: 1, rest: 75, alts: ['cable_lateral_raise'] },
  { id: 'cable_lateral_raise', name: 'Cable lateral raise', primary: 'side_delts', equipment: 'Cable', inc: 1.25, rest: 75, alts: ['lateral_raise'] },
  { id: 'oh_tri_ext', name: 'Overhead cable triceps extension', primary: 'triceps', equipment: 'Cable', inc: 2.5, rest: 90, alts: ['db_oh_tri_ext', 'tri_pressdown'] },
  { id: 'db_oh_tri_ext', name: 'Overhead dumbbell triceps extension', primary: 'triceps', equipment: 'Dumbbell', inc: 2, rest: 90, alts: ['oh_tri_ext', 'tri_pressdown'] },
  { id: 'tri_pressdown', name: 'Triceps pressdown', primary: 'triceps', equipment: 'Cable', inc: 2.5, rest: 75, alts: ['oh_tri_ext'] },
  { id: 'incline_machine_press', name: 'Incline machine press', primary: 'chest', secondary: ['front_delts', 'triceps'], equipment: 'Machine', compound: true, inc: 2.5, rest: 120, alts: ['incline_db_press'] },
  { id: 'flat_machine_press', name: 'Flat machine press', primary: 'chest', secondary: ['front_delts', 'triceps'], equipment: 'Machine', compound: true, inc: 2.5, rest: 120, alts: ['pushup', 'flat_db_press'] },
  { id: 'pushup', name: 'Push-up', primary: 'chest', secondary: ['front_delts', 'triceps'], equipment: 'Bodyweight', compound: true, mode: 'bodyweight', inc: 2.5, rest: 90, alts: ['flat_machine_press', 'flat_db_press'] },
  // Legs & abs
  { id: 'squat', name: 'Back squat', primary: 'quads', secondary: ['glutes'], equipment: 'Barbell', compound: true, inc: 2.5, rest: 180, alts: ['leg_press', 'goblet_squat'] },
  { id: 'leg_press', name: 'Leg press', primary: 'quads', secondary: ['glutes'], equipment: 'Machine', compound: true, inc: 5, rest: 150, alts: ['squat', 'goblet_squat'] },
  { id: 'goblet_squat', name: 'Goblet squat', primary: 'quads', secondary: ['glutes'], equipment: 'Dumbbell', compound: true, inc: 2, rest: 120, alts: ['leg_press', 'squat'] },
  { id: 'rdl', name: 'Romanian deadlift', primary: 'hamstrings', secondary: ['glutes', 'forearms'], equipment: 'Barbell', compound: true, inc: 2.5, rest: 150, alts: ['db_rdl'] },
  { id: 'db_rdl', name: 'Dumbbell Romanian deadlift', primary: 'hamstrings', secondary: ['glutes', 'forearms'], equipment: 'Dumbbell', compound: true, perHand: true, inc: 2, rest: 150, alts: ['rdl'] },
  { id: 'leg_curl', name: 'Leg curl (seated / lying)', primary: 'hamstrings', equipment: 'Machine', inc: 2.5, rest: 90, alts: ['db_rdl'] },
  { id: 'leg_ext', name: 'Leg extension', primary: 'quads', equipment: 'Machine', inc: 2.5, rest: 90, alts: ['leg_press'] },
  { id: 'calf_raise', name: 'Calf raise', primary: 'calves', equipment: 'Machine / smith', inc: 2.5, rest: 75, alts: ['seated_calf_raise'] },
  { id: 'seated_calf_raise', name: 'Seated calf raise', primary: 'calves', equipment: 'Machine', inc: 2.5, rest: 75, alts: ['calf_raise'] },
  { id: 'cable_crunch', name: 'Cable / weighted crunch', primary: 'abs', equipment: 'Cable', inc: 2.5, rest: 75, alts: ['reverse_crunch', 'hanging_knee_raise'] },
  { id: 'hanging_knee_raise', name: 'Hanging knee raise', primary: 'abs', equipment: 'Bar', mode: 'bodyweight', inc: 1, rest: 75, alts: ['reverse_crunch'] },
  { id: 'reverse_crunch', name: 'Reverse crunch', primary: 'abs', equipment: 'Bodyweight', mode: 'bodyweight', inc: 1, rest: 60, alts: ['hanging_knee_raise', 'cable_crunch'] },
];

export function buildExercises(at: number): ExerciseDef[] {
  return SPECS.map((s) => ({
    id: s.id,
    name: s.name,
    primary: s.primary,
    secondary: s.secondary ?? [],
    equipment: s.equipment,
    compound: !!s.compound,
    loadMode: s.mode ?? 'external',
    perHand: !!s.perHand,
    incrementKg: s.inc,
    restSec: s.rest,
    alternatives: s.alts ?? [],
    custom: false,
    archived: false,
    createdAt: at,
    updatedAt: at,
  }));
}

const te = (exerciseId: string, sets: number, repMin: number, repMax: number): TemplateExercise => ({
  uid: `${exerciseId}-${sets}-${repMin}-${repMax}`, exerciseId, sets, repMin, repMax,
});

export const TEMPLATE_IDS = ['tpl_pull_a', 'tpl_push_a', 'tpl_legs', 'tpl_pull_b', 'tpl_push_b'] as const;

export function buildTemplates(at: number): WorkoutTemplate[] {
  const t = (id: string, name: string, focus: string, order: number, exercises: TemplateExercise[]): WorkoutTemplate => ({
    id, name, focus, order, exercises, createdAt: at, updatedAt: at,
  });
  return [
    t('tpl_pull_a', 'Pull A', 'Back width, biceps, rear delts', 0, [
      te('pullup', 3, 6, 10), te('lat_pulldown', 3, 8, 12), te('cs_row', 3, 8, 12),
      te('reverse_pec_deck', 3, 12, 20), te('incline_db_curl', 3, 8, 12), te('hammer_curl', 2, 10, 15),
    ]),
    t('tpl_push_a', 'Push A', 'Chest, side delts, triceps', 1, [
      te('incline_db_press', 3, 6, 10), te('bench_press', 3, 6, 10), te('cable_fly', 2, 10, 15),
      te('lateral_raise', 3, 12, 20), te('oh_tri_ext', 3, 10, 15), te('tri_pressdown', 2, 10, 15),
    ]),
    t('tpl_legs', 'Legs and abs', 'Quads, hamstrings, calves, abs', 2, [
      te('squat', 3, 6, 10), te('rdl', 3, 6, 10), te('leg_curl', 3, 10, 15), te('leg_ext', 2, 10, 15),
      te('calf_raise', 3, 10, 15), te('cable_crunch', 3, 10, 15), te('hanging_knee_raise', 2, 10, 15),
    ]),
    t('tpl_pull_b', 'Pull B', 'Back thickness, upper traps, biceps', 3, [
      te('pullup_alt', 3, 6, 10), te('seated_cable_row', 3, 8, 12), te('single_arm_pulldown', 2, 10, 15),
      te('shrug', 3, 10, 15), te('preacher_curl', 3, 8, 12), te('reverse_curl', 2, 10, 15),
    ]),
    t('tpl_push_b', 'Push B', 'Chest, shoulders, arms, abs', 4, [
      te('incline_machine_press', 3, 8, 12), te('flat_machine_press', 2, 8, 15), te('cable_lateral_raise', 3, 12, 20),
      te('rear_delt_fly', 2, 12, 20), te('cable_curl', 2, 10, 15), te('tri_pressdown', 3, 10, 15),
      te('reverse_crunch', 3, 10, 15),
    ]),
  ];
}

/** Mon Pull A, Tue Push A, Wed rest, Thu Legs, Fri Pull B, Sat Push B, Sun rest */
export const DEFAULT_SCHEDULE: (string | null)[] = [
  'tpl_pull_a', 'tpl_push_a', null, 'tpl_legs', 'tpl_pull_b', 'tpl_push_b', null,
];

export function buildSettings(at: number): Settings {
  return {
    id: 'settings',
    unit: 'kg',
    theme: 'dark',
    schedule: [...DEFAULT_SCHEDULE],
    restCompoundSec: 150,
    restIsolationSec: 90,
    autoStartTimer: true,
    timerSound: true,
    progressionEnabled: true,
    sessionsAtTop: 1,
    minAvgRir: 1,
    deloadEveryWeeks: 6,
    rules: {},
    dismissed: {},
    planned: {},
    updatedAt: at,
  };
}

export const WARMUP_GUIDE = [
  'Spend 3–5 minutes on light cardio or easy movement to raise your temperature.',
  'For your first heavy compound lift, ramp up: about 50% × 8, 70% × 5, 85% × 2–3 of your working weight.',
  'For later exercises targeting the same muscles, one light set of 8–10 reps is usually enough.',
  'Isolation exercises need little or no warm-up beyond one lighter set.',
  'Warm-up sets are logged separately and never count toward working volume or progression.',
];

export const ALTERNATIVE_NOTE =
  'Swap exercises if equipment is busy or something feels uncomfortable. Do not train through pain; if pain persists, rest and consider seeing a qualified professional.';
