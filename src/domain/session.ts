import type { ExerciseSet, SessionExercise, Side } from '../types';

export const sideOrder = (startingSide: Side): Side[] => startingSide === 'L' ? ['L', 'R'] : ['R', 'L'];

export const orderUnilateralSets = (sets: ExerciseSet[], startingSide: Side): ExerciseSet[] => {
  const sides = sideOrder(startingSide);
  return [...sets].sort((a, b) => a.setNumber - b.setNumber || sides.indexOf(a.side!) - sides.indexOf(b.side!));
};

export const previousEquivalentSet = (current: ExerciseSet, history: ExerciseSet[]): ExerciseSet | undefined => history
  .filter((set) => set.completed && set.sessionId !== current.sessionId && set.exerciseId === current.exerciseId && set.setNumber === current.setNumber && set.side === current.side)
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

export const reorderSessionExercises = (items: SessionExercise[], id: string, action: 'after-next' | 'end' | 'skip'): SessionExercise[] => {
  const current = items.find((item) => item.id === id);
  if (!current) return items;
  if (action === 'skip') return items.map((item) => item.id === id ? { ...item, status: 'skipped' as const } : item);
  const remaining = items.filter((item) => item.id !== id);
  const index = action === 'end' ? remaining.length : Math.min(current.order + 1, remaining.length);
  remaining.splice(index, 0, current);
  return remaining.map((item, order) => ({ ...item, order }));
};

export const completedWorkoutCount = (statuses: Array<{ status: string }>) => statuses.filter((item) => item.status === 'completed').length;
