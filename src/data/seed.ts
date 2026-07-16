import { addDays, format, startOfWeek } from 'date-fns';
import type { AppSettings, Exercise, Routine, RoutineExercise, ScheduledWorkout } from '../types';

const stamp = '2026-01-01T00:00:00.000Z';
const exercise = (
  id: string, name: string, muscleGroup: string, equipment: string, sets: number, minReps: number, maxReps: number,
  rest: number, increment: number, options: Partial<Pick<Exercise, 'unilateral' | 'loadType' | 'volumeMultiplier' | 'secondaryMuscleGroups' | 'instructions'>> = {}
): Exercise => ({
  id, name, muscleGroup, equipment, defaultSets: sets, minReps, maxReps, defaultRestSeconds: rest, increment,
  unilateral: false, loadType: 'total', volumeMultiplier: 1, secondaryMuscleGroups: [], archived: false,
  createdAt: stamp, updatedAt: stamp, ...options
});

export const seedExercises: Exercise[] = [
  exercise('ex-shoulder-press', 'Seated Dumbbell Shoulder Press', 'Shoulders', 'Dumbbells', 3, 6, 10, 150, 2, { loadType: 'per-dumbbell', volumeMultiplier: 2, secondaryMuscleGroups: ['Triceps'] }),
  exercise('ex-incline-press', 'Incline Dumbbell Press', 'Chest', 'Dumbbells', 3, 6, 10, 120, 2, { loadType: 'per-dumbbell', volumeMultiplier: 2, secondaryMuscleGroups: ['Shoulders', 'Triceps'] }),
  exercise('ex-cable-lateral', 'Single-Arm Cable Lateral Raise', 'Shoulders', 'Cable', 4, 10, 15, 60, 2.5, { unilateral: true }),
  exercise('ex-reverse-pec', 'Reverse Pec Deck', 'Rear delts', 'Machine', 3, 12, 18, 75, 5),
  exercise('ex-overhead-triceps', 'Overhead Cable Triceps Extension', 'Triceps', 'Cable', 3, 8, 12, 90, 2.5),
  exercise('ex-rope-pushdown', 'Rope Triceps Pushdown', 'Triceps', 'Cable', 2, 12, 15, 60, 2.5),
  exercise('ex-pull-up', 'Pull-Up', 'Back', 'Pull-up bar', 3, 6, 10, 120, 2.5, { loadType: 'bodyweight', secondaryMuscleGroups: ['Biceps'], instructions: 'Choose bodyweight, weighted or assisted mode.' }),
  exercise('ex-chest-row', 'Chest-Supported Row', 'Back', 'Machine', 3, 6, 10, 120, 5, { secondaryMuscleGroups: ['Biceps'] }),
  exercise('ex-single-cable-row', 'Single-Arm Cable Row', 'Back', 'Cable', 3, 8, 12, 90, 2.5, { unilateral: true, secondaryMuscleGroups: ['Biceps'] }),
  exercise('ex-face-pull', 'Face Pull', 'Rear delts', 'Cable', 3, 12, 18, 75, 2.5, { secondaryMuscleGroups: ['Back'] }),
  exercise('ex-incline-curl', 'Incline Dumbbell Curl', 'Biceps', 'Dumbbells', 3, 8, 12, 90, 1, { loadType: 'per-dumbbell', volumeMultiplier: 2 }),
  exercise('ex-hammer-curl', 'Dumbbell Hammer Curl', 'Biceps', 'Dumbbells', 2, 10, 15, 75, 1, { loadType: 'per-dumbbell', volumeMultiplier: 2 }),
  exercise('ex-rdl', 'Romanian Deadlift', 'Hamstrings', 'Barbell', 3, 6, 8, 150, 2.5, { secondaryMuscleGroups: ['Glutes', 'Back'] }),
  exercise('ex-split-squat', 'Split Squat', 'Quads', 'Dumbbells', 3, 7, 10, 120, 2, { unilateral: true, loadType: 'per-dumbbell', volumeMultiplier: 1, secondaryMuscleGroups: ['Glutes'] }),
  exercise('ex-leg-press', 'Leg Press', 'Quads', 'Machine', 2, 8, 12, 120, 5, { secondaryMuscleGroups: ['Glutes'] }),
  exercise('ex-leg-curl', 'Seated Leg Curl', 'Hamstrings', 'Machine', 3, 8, 12, 90, 5),
  exercise('ex-calf-raise', 'Seated Calf Raise', 'Calves', 'Machine', 2, 12, 20, 75, 5),
  exercise('ex-hip-abduction', 'Hip Abduction Machine', 'Glutes', 'Machine', 2, 12, 15, 60, 5),
  exercise('ex-machine-chest', 'Machine Chest Press', 'Chest', 'Machine', 3, 8, 12, 120, 5, { secondaryMuscleGroups: ['Triceps', 'Shoulders'] }),
  exercise('ex-lat-pulldown', 'Neutral-Grip Lat Pulldown', 'Back', 'Cable', 3, 8, 12, 120, 2.5, { secondaryMuscleGroups: ['Biceps'] }),
  exercise('ex-seated-row', 'Seated Cable Row', 'Back', 'Cable', 3, 8, 12, 120, 2.5, { secondaryMuscleGroups: ['Biceps'] }),
  exercise('ex-lateral-raise', 'Lateral Raise', 'Shoulders', 'Dumbbells', 3, 12, 20, 60, 1, { loadType: 'per-dumbbell', volumeMultiplier: 2 }),
  exercise('ex-cable-curl', 'Cable Curl', 'Biceps', 'Cable', 3, 10, 15, 75, 2.5),
  exercise('ex-cable-triceps', 'Cable Triceps Extension', 'Triceps', 'Cable', 3, 10, 15, 75, 2.5)
];

export const seedRoutines: Routine[] = [
  { id: 'routine-push', name: 'Push', kind: 'gym', active: true, createdAt: stamp, updatedAt: stamp },
  { id: 'routine-interval', name: 'Interval Run', kind: 'interval-run', active: true, createdAt: stamp, updatedAt: stamp },
  { id: 'routine-pull', name: 'Pull', kind: 'gym', active: true, createdAt: stamp, updatedAt: stamp },
  { id: 'routine-legs', name: 'Legs', kind: 'gym', active: true, createdAt: stamp, updatedAt: stamp },
  { id: 'routine-upper', name: 'Upper', kind: 'gym', active: true, createdAt: stamp, updatedAt: stamp },
  { id: 'routine-easy', name: 'Easy Run', kind: 'easy-run', active: true, createdAt: stamp, updatedAt: stamp }
];

const routineMap: Record<string, string[]> = {
  'routine-push': ['ex-shoulder-press', 'ex-incline-press', 'ex-cable-lateral', 'ex-reverse-pec', 'ex-overhead-triceps', 'ex-rope-pushdown'],
  'routine-pull': ['ex-pull-up', 'ex-chest-row', 'ex-single-cable-row', 'ex-face-pull', 'ex-incline-curl', 'ex-hammer-curl'],
  'routine-legs': ['ex-rdl', 'ex-split-squat', 'ex-leg-press', 'ex-leg-curl', 'ex-calf-raise', 'ex-hip-abduction'],
  'routine-upper': ['ex-machine-chest', 'ex-lat-pulldown', 'ex-seated-row', 'ex-lateral-raise', 'ex-cable-curl', 'ex-cable-triceps']
};

export const seedRoutineExercises: RoutineExercise[] = Object.entries(routineMap).flatMap(([routineId, exerciseIds]) => exerciseIds.map((exerciseId, order) => {
  const item = seedExercises.find((candidate) => candidate.id === exerciseId)!;
  return { id: `${routineId}-${exerciseId}`, routineId, exerciseId, order, sets: item.defaultSets, minReps: item.minReps, maxReps: item.maxReps, restSeconds: item.defaultRestSeconds, createdAt: stamp, updatedAt: stamp };
}));

export const seedSettings: AppSettings = {
  id: 'app-settings', key: 'settings', goalWeightKg: 68, onboardingComplete: false,
  notificationState: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  intervalBlock: 1, intervalBlockCompleted: 0, intervalRepetitions: 6, intervalHardSeconds: 120,
  intervalRecoverySeconds: 120, intervalWarmupMinutes: 15, intervalCooldownMinutes: 10,
  createdAt: stamp, updatedAt: stamp
};

const schedule = [
  { offset: 0, routineId: 'routine-push', name: 'Push', kind: 'gym' as const },
  { offset: 1, routineId: 'routine-interval', name: 'Interval Run', kind: 'interval-run' as const },
  { offset: 2, routineId: 'routine-pull', name: 'Pull', kind: 'gym' as const },
  { offset: 3, routineId: 'routine-legs', name: 'Legs', kind: 'gym' as const },
  { offset: 5, routineId: 'routine-upper', name: 'Upper', kind: 'gym' as const },
  { offset: 6, routineId: 'routine-easy', name: 'Easy Run', kind: 'easy-run' as const }
];

export const scheduleForWeek = (date: Date): ScheduledWorkout[] => {
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  return schedule.map((entry) => {
    const scheduledDate = format(addDays(monday, entry.offset), 'yyyy-MM-dd');
    return {
      id: `scheduled-${scheduledDate}-${entry.routineId}`, routineId: entry.routineId, name: entry.name, kind: entry.kind,
      scheduledDate, originalDate: scheduledDate, status: 'pending', createdAt: stamp, updatedAt: stamp
    };
  });
};
