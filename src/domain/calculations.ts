import type { ExerciseSet, LoadType, PersonalRecord, RunRecord, ScheduledWorkout, Side } from '../types';

export const estimated1RM = (load: number, reps: number): number => reps > 0 && load >= 0 ? load * (1 + reps / 30) : 0;

export const pullUpLoad = (bodyWeight: number | undefined, external: number, mode: 'bodyweight' | 'weighted' | 'assisted'): number | null => {
  if (bodyWeight == null || bodyWeight <= 0) return null;
  if (mode === 'weighted') return bodyWeight + Math.max(0, external);
  if (mode === 'assisted') return Math.max(0, bodyWeight - Math.max(0, external));
  return bodyWeight;
};

export const effectiveLoad = (set: Pick<ExerciseSet, 'weight' | 'bodyWeight' | 'pullUpMode'>, loadType: LoadType): number | null => {
  const weight = set.weight ?? 0;
  if (loadType === 'bodyweight' || loadType === 'bodyweight-plus' || loadType === 'bodyweight-minus') {
    return pullUpLoad(set.bodyWeight, weight, set.pullUpMode ?? 'bodyweight');
  }
  return set.weight ?? null;
};

export const setVolume = (weight: number, reps: number, options: { loadType: LoadType; volumeMultiplier: number; unilateral?: boolean }): number => {
  if (weight < 0 || reps <= 0) return 0;
  const multiplier = options.unilateral ? 1 : options.loadType === 'per-dumbbell' ? options.volumeMultiplier : options.volumeMultiplier;
  return weight * reps * multiplier;
};

export const roundToIncrement = (value: number, increment: number, direction: 'nearest' | 'up' | 'down' = 'nearest'): number => {
  if (increment <= 0) return value;
  const units = value / increment;
  const rounded = direction === 'up' ? Math.ceil(units - 1e-9) : direction === 'down' ? Math.floor(units + 1e-9) : Math.round(units);
  return Number((rounded * increment).toFixed(4));
};

export type PerformanceState = 'better' | 'worse' | 'neutral' | 'first-record' | 'pr';
export const classifyPerformance = (current: number, previous?: number, allTimeBest?: number): PerformanceState => {
  if (allTimeBest != null && current > allTimeBest + 1e-9) return 'pr';
  if (previous == null || previous <= 0) return 'first-record';
  const change = (current - previous) / previous;
  if (change > 0.005) return 'better';
  if (change < -0.005) return 'worse';
  return 'neutral';
};

export interface ProgressionInput {
  currentLoad: number;
  increment: number;
  minReps: number;
  maxReps: number;
  prescribedSets: Array<{ reps: number; side?: Side }>;
  previousUnderperformed: boolean;
  unilateral?: boolean;
}

export interface ProgressionResult { action: 'increase' | 'maintain' | 'decrease'; load: number; reason: string }

const sideQualifies = (sets: Array<{ reps: number }>, maxReps: number) => sets.length > 0 && sets.every((set) => set.reps >= maxReps);
const underperformed = (sets: Array<{ reps: number }>, minReps: number) => sets.filter((set) => set.reps < minReps).length >= 2 || sets.some((set) => set.reps < minReps - 2);

export const progressionRecommendation = (input: ProgressionInput): ProgressionResult => {
  const { currentLoad, increment, minReps, maxReps, prescribedSets, previousUnderperformed, unilateral } = input;
  const sides = unilateral ? (['L', 'R'] as const).map((side) => prescribedSets.filter((set) => set.side === side)) : [prescribedSets];
  const isUnder = sides.some((sets) => underperformed(sets, minReps));
  if (isUnder && previousUnderperformed) {
    const load = roundToIncrement(currentLoad * 0.95, increment, 'down');
    return { action: 'decrease', load, reason: 'Two consecutive sessions fell below the target range.' };
  }
  if (isUnder) return { action: 'maintain', load: currentLoad, reason: 'Below target this session; repeat the load before reducing.' };
  if (sides.every((sets) => sideQualifies(sets, maxReps))) {
    const next = roundToIncrement(currentLoad * 1.025, increment, 'up');
    const increase = currentLoad > 0 ? (next - currentLoad) / currentLoad : 0;
    if (increase > 0.05) return { action: 'maintain', load: currentLoad, reason: 'The smallest available increment exceeds 5%; consolidate the top of the range.' };
    return { action: 'increase', load: next, reason: `All prescribed sets reached ${maxReps} reps.` };
  }
  return { action: 'maintain', load: currentLoad, reason: 'Build repetitions within the target range.' };
};

export const primaryWorkingWeight = (sets: Array<Pick<ExerciseSet, 'weight' | 'completed' | 'prescribed' | 'createdAt'>>): number | null => {
  const completed = sets.filter((set) => set.completed && set.weight != null);
  const candidates = completed.some((set) => set.prescribed) ? completed.filter((set) => set.prescribed) : completed;
  const counts = new Map<number, number>();
  candidates.forEach((set) => counts.set(set.weight!, (counts.get(set.weight!) ?? 0) + 1));
  let best: number | null = null;
  let bestCount = 0;
  for (const set of candidates) {
    const count = counts.get(set.weight!) ?? 0;
    if (count > bestCount) { best = set.weight!; bestCount = count; }
  }
  return best;
};

export const paceSecondsPerKm = (durationSeconds: number, distanceKm: number): number | null => durationSeconds > 0 && distanceKm > 0 ? durationSeconds / distanceKm : null;

export const formatPace = (secondsPerKm: number | null): string => {
  if (secondsPerKm == null || !Number.isFinite(secondsPerKm)) return '—';
  const rounded = Math.round(secondsPerKm);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')} /km`;
};

export const findSimilarHeartRateRun = (current: RunRecord, previous: RunRecord[]): RunRecord | undefined => previous
  .filter((run) => run.type === 'easy-run' && run.date < current.date && run.averageHeartRate != null && current.averageHeartRate != null && Math.abs(run.averageHeartRate - current.averageHeartRate) <= 3)
  .sort((a, b) => b.date.localeCompare(a.date))[0];

export const rolloverPastWorkouts = (workouts: ScheduledWorkout[], today: string): ScheduledWorkout[] => workouts.map((workout) => {
  if (workout.status !== 'pending' || workout.scheduledDate >= today) return workout;
  return { ...workout, status: 'skipped', updatedAt: new Date().toISOString() };
});

export const recalculatePRs = (sets: ExerciseSet[], context: Map<string, { name: string; loadType: LoadType; date: string }>): PersonalRecord[] => {
  const completed = sets.filter((set) => set.completed && set.reps && set.reps > 0);
  const byKey = new Map<string, ExerciseSet[]>();
  completed.forEach((set) => {
    const key = `${set.exerciseId}:${set.side ?? '-'}`;
    byKey.set(key, [...(byKey.get(key) ?? []), set]);
  });
  const now = new Date().toISOString();
  return [...byKey.values()].flatMap((group) => {
    const ranked = group.map((set) => {
      const info = context.get(set.sessionExerciseId);
      const load = info ? effectiveLoad(set, info.loadType) : set.weight ?? null;
      return { set, info, value: load == null ? 0 : estimated1RM(load, set.reps ?? 0) };
    }).filter((item) => item.info && item.value > 0).sort((a, b) => a.set.createdAt.localeCompare(b.set.createdAt));
    let best = 0;
    return ranked.filter((item) => { if (item.value <= best) return false; best = item.value; return true; }).map(({ set, info, value }) => ({
      id: `pr-${set.id}`,
      exerciseId: set.exerciseId,
      exerciseName: info!.name,
      side: set.side,
      estimated1RM: value,
      actualWeight: set.weight ?? 0,
      reps: set.reps ?? 0,
      sessionDate: info!.date,
      sessionId: set.sessionId,
      setId: set.id,
      perDumbbell: info!.loadType === 'per-dumbbell',
      createdAt: set.createdAt,
      updatedAt: now
    }));
  });
};
