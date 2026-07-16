import { describe, expect, it } from 'vitest';
import { mergeRecords } from './backup';
import { rolloverPastWorkouts } from './calculations';
import { completedWorkoutCount, orderUnilateralSets, previousEquivalentSet, reorderSessionExercises, sideOrder } from './session';
import type { ExerciseSet, ScheduledWorkout, SessionExercise } from '../types';

const stamp = '2026-01-01T00:00:00.000Z';

describe('data integrity helpers', () => {
  it('rolls unresolved past workouts to skipped without changing current or completed workouts', () => {
    const base: ScheduledWorkout = { id: 'a', routineId: 'r', name: 'Push', kind: 'gym', scheduledDate: '2026-07-01', originalDate: '2026-07-01', status: 'pending', createdAt: stamp, updatedAt: stamp };
    const result = rolloverPastWorkouts([base, { ...base, id: 'b', scheduledDate: '2026-07-16' }, { ...base, id: 'c', status: 'completed' }], '2026-07-16');
    expect(result.map((item) => item.status)).toEqual(['skipped', 'pending', 'completed']);
  });

  it('deduplicates backup records and takes the newest update on conflict', () => {
    const current = [{ id: 'a', value: 1, createdAt: stamp, updatedAt: '2026-01-02' }];
    const same = mergeRecords(current, current);
    expect(same.records).toHaveLength(1); expect(same.summary.unchangedRecords).toBe(1);
    const newer = mergeRecords(current, [{ ...current[0], value: 2, updatedAt: '2026-01-03' }]);
    expect(newer.records[0].value).toBe(2); expect(newer.summary.updatedRecords).toBe(1); expect(newer.summary.conflicts).toBe(1);
  });

  it('flips every unilateral pair when the starting side changes', () => {
    expect(sideOrder('L')).toEqual(['L', 'R']); expect(sideOrder('R')).toEqual(['R', 'L']);
    const set = (id: string, setNumber: number, side: 'L' | 'R'): ExerciseSet => ({ id, sessionId: 's', sessionExerciseId: 'se', exerciseId: 'e', setNumber, side, prescribed: true, completed: false, createdAt: stamp, updatedAt: stamp });
    const ordered = orderUnilateralSets([set('1l', 1, 'L'), set('1r', 1, 'R'), set('2l', 2, 'L'), set('2r', 2, 'R')], 'R');
    expect(ordered.map((item) => `${item.setNumber}${item.side}`)).toEqual(['1R', '1L', '2R', '2L']);
  });

  it('matches previous sets by number and side while leaving the repetitions field empty in a new record', () => {
    const current: ExerciseSet = { id: 'new', sessionId: 'new-session', sessionExerciseId: 'se', exerciseId: 'e', setNumber: 1, side: 'L', prescribed: true, weight: 24, completed: false, createdAt: '2026-02-01', updatedAt: '2026-02-01' };
    const previous: ExerciseSet = { ...current, id: 'old', sessionId: 'old-session', reps: 10, completed: true, createdAt: '2026-01-01' };
    expect(previousEquivalentSet(current, [previous])?.reps).toBe(10);
    expect(current.weight).toBe(24); expect(current.reps).toBeUndefined();
  });

  it('reorders or skips a session exercise without mutating the input snapshot list', () => {
    const item = (id: string, order: number): SessionExercise => ({ id, sessionId: 's', plannedExerciseId: id, performedExerciseId: id, name: id, order, sets: 3, minReps: 8, maxReps: 12, restSeconds: 90, unilateral: false, loadType: 'total', volumeMultiplier: 1, increment: 2.5, startingSide: 'L', status: 'pending', createdAt: stamp, updatedAt: stamp });
    const items = [item('a', 0), item('b', 1), item('c', 2)];
    expect(reorderSessionExercises(items, 'a', 'after-next').map((entry) => entry.id)).toEqual(['b', 'a', 'c']);
    expect(reorderSessionExercises(items, 'b', 'end').map((entry) => entry.id)).toEqual(['a', 'c', 'b']);
    expect(reorderSessionExercises(items, 'b', 'skip')[1].status).toBe('skipped');
    expect(items[1].status).toBe('pending');
  });

  it('counts completed workouts only', () => {
    expect(completedWorkoutCount([{ status: 'completed' }, { status: 'skipped' }, { status: 'in-progress' }, { status: 'pending' }])).toBe(1);
  });
});
