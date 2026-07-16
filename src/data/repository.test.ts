import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, format } from 'date-fns';
import { db } from './database';
import { appRepository, uuid } from './repository';
import { scheduleForWeek } from './seed';
import type { HybridBackup } from '../types';

describe('workout repository integrations', () => {
  beforeEach(async () => {
    await db.open();
    await db.transaction('rw', db.tables, async () => { for (const table of db.tables) await table.clear(); });
    await appRepository.initialize();
  });

  it('prefills previous weight, keeps reps empty, and starts an absolute rest timer on save', async () => {
    const firstScheduled = scheduleForWeek(new Date()).find((item) => item.routineId === 'routine-push')!;
    await db.scheduledWorkouts.put({ ...firstScheduled, id: uuid(), scheduledDate: '2026-07-01', originalDate: '2026-07-01' });
    const firstId = (await db.scheduledWorkouts.where('scheduledDate').equals('2026-07-01').first())!.id;
    const firstSession = await appRepository.startGymWorkout(firstId);
    const firstSet = (await db.sets.where('sessionId').equals(firstSession).toArray())[0];
    await appRepository.saveSet(firstSet.id, { weight: 24, reps: 10 }, 120);
    const timer = await db.restTimers.get('active-rest');
    expect(timer?.state).toBe('running');
    expect(new Date(timer!.targetAt!).getTime()).toBeGreaterThan(Date.now() + 115_000);

    const secondDate = '2026-07-08';
    const second = { ...firstScheduled, id: uuid(), scheduledDate: secondDate, originalDate: secondDate, sessionId: undefined, status: 'pending' as const };
    await db.scheduledWorkouts.put(second);
    const secondSession = await appRepository.startGymWorkout(second.id);
    const next = (await db.sets.where('sessionId').equals(secondSession).toArray()).find((set) => set.exerciseId === firstSet.exerciseId && set.setNumber === 1)!;
    expect(next.weight).toBe(24);
    expect(next.reps).toBeUndefined();
  });

  it('keeps historical session prescriptions unchanged after routine edits', async () => {
    const scheduled = scheduleForWeek(new Date()).find((item) => item.routineId === 'routine-push')!;
    await db.scheduledWorkouts.put({ ...scheduled, id: uuid() });
    const created = await db.scheduledWorkouts.where('routineId').equals('routine-push').filter((item) => item.id !== scheduled.id).first();
    const sessionId = await appRepository.startGymWorkout(created!.id);
    const snapshot = (await db.sessionExercises.where('sessionId').equals(sessionId).sortBy('order'))[0];
    const prescription = await db.routineExercises.where({ routineId: 'routine-push', exerciseId: snapshot.plannedExerciseId }).first();
    await appRepository.updateRoutineExercise(prescription!.id, { sets: 6, minReps: 3 });
    const unchanged = await db.sessionExercises.get(snapshot.id);
    expect(unchanged?.sets).toBe(snapshot.sets);
    expect(unchanged?.minReps).toBe(snapshot.minReps);
  });

  it('restores backups in merge and replace modes without duplicating stable IDs', async () => {
    const exported = await appRepository.exportBackup();
    await appRepository.importBackup(exported, 'merge');
    expect(await db.exercises.count()).toBe(exported.data.exercises.length);
    const timestamp = new Date().toISOString();
    const changed: HybridBackup = { ...exported, data: { ...exported.data, weights: [{ id: 'weight-one', date: format(addDays(new Date(), -1), 'yyyy-MM-dd'), weightKg: 72, createdAt: timestamp, updatedAt: timestamp }] } };
    await appRepository.importBackup(changed, 'replace');
    expect(await db.weights.count()).toBe(1);
    expect(await db.weights.get('weight-one')).toBeTruthy();
  });
});
