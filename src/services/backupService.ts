import { appRepository } from '../data/repository';
import { isHybridBackup } from '../domain/backup';
import type { HybridBackup } from '../types';
import { z } from 'zod';

const recordSchema = z.object({ id: z.string().min(1), createdAt: z.string().min(1), updatedAt: z.string().min(1) }).passthrough();
const backupSchema = z.object({
  schemaVersion: z.number().int().positive(), exportedAt: z.string().min(1), appVersion: z.string(),
  data: z.object({
    exercises: z.array(recordSchema), routines: z.array(recordSchema), routineExercises: z.array(recordSchema),
    scheduledWorkouts: z.array(recordSchema), sessions: z.array(recordSchema), sessionExercises: z.array(recordSchema),
    sets: z.array(recordSchema), runs: z.array(recordSchema), weights: z.array(recordSchema),
    recommendations: z.array(recordSchema), personalRecords: z.array(recordSchema), settings: z.array(recordSchema),
    backupMetadata: z.array(recordSchema), restTimers: z.array(recordSchema)
  })
});

const validateRelationships = (backup: HybridBackup) => {
  const ids = <T extends { id: string }>(items: T[]) => new Set(items.map((item) => item.id));
  const exerciseIds = ids(backup.data.exercises); const routineIds = ids(backup.data.routines);
  const scheduledIds = ids(backup.data.scheduledWorkouts); const sessionIds = ids(backup.data.sessions); const snapshotIds = ids(backup.data.sessionExercises);
  const invalidRoutineItem = backup.data.routineExercises.some((item) => !routineIds.has(item.routineId) || !exerciseIds.has(item.exerciseId));
  const invalidSchedule = backup.data.scheduledWorkouts.some((item) => !routineIds.has(item.routineId));
  const invalidSession = backup.data.sessions.some((item) => !scheduledIds.has(item.scheduledWorkoutId) || !routineIds.has(item.routineId));
  const invalidSnapshot = backup.data.sessionExercises.some((item) => !sessionIds.has(item.sessionId) || !exerciseIds.has(item.plannedExerciseId) || !exerciseIds.has(item.performedExerciseId));
  const invalidSet = backup.data.sets.some((item) => !sessionIds.has(item.sessionId) || !snapshotIds.has(item.sessionExerciseId) || !exerciseIds.has(item.exerciseId));
  if (invalidRoutineItem || invalidSchedule || invalidSession || invalidSnapshot || invalidSet) throw new Error('The backup contains broken record relationships and cannot be restored safely.');
};

export const validateBackupValue = (value: unknown): HybridBackup => {
  const result = backupSchema.safeParse(value);
  if (!result.success || !isHybridBackup(value)) throw new Error('This is not a valid Hybrid Tracker backup.');
  const backup = value as HybridBackup;
  if (backup.schemaVersion > 3) throw new Error('This backup was created by a newer version of Hybrid Tracker.');
  validateRelationships(backup);
  return backup;
};

export const backupFilename = (date = new Date()) => `hybrid-tracker-backup-${date.toISOString().slice(0, 10)}.json`;

export const backupToFile = (backup: HybridBackup): File => new File(
  [JSON.stringify(backup, null, 2)], backupFilename(), { type: 'application/json' }
);

export const downloadBackup = async () => {
  const file = backupToFile(await appRepository.exportBackup());
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
};

export const shareBackup = async (): Promise<'shared' | 'downloaded'> => {
  const file = backupToFile(await appRepository.exportBackup());
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: 'Hybrid Tracker backup', files: [file] });
    return 'shared';
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  return 'downloaded';
};

export const parseBackupFile = async (file: File): Promise<HybridBackup> => {
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); }
  catch { throw new Error('This file is not valid JSON.'); }
  return validateBackupValue(parsed);
};
