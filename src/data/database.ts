import Dexie, { type EntityTable } from 'dexie';
import type { ActiveRestTimer, AppSettings, BackupMetadata, Exercise, ExerciseSet, PersonalRecord, ProgressionRecommendation, Routine, RoutineExercise, RunRecord, ScheduledWorkout, SessionExercise, WeightRecord, WorkoutSession } from '../types';

export class HybridTrackerDatabase extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>;
  routines!: EntityTable<Routine, 'id'>;
  routineExercises!: EntityTable<RoutineExercise, 'id'>;
  scheduledWorkouts!: EntityTable<ScheduledWorkout, 'id'>;
  sessions!: EntityTable<WorkoutSession, 'id'>;
  sessionExercises!: EntityTable<SessionExercise, 'id'>;
  sets!: EntityTable<ExerciseSet, 'id'>;
  runs!: EntityTable<RunRecord, 'id'>;
  weights!: EntityTable<WeightRecord, 'id'>;
  recommendations!: EntityTable<ProgressionRecommendation, 'id'>;
  personalRecords!: EntityTable<PersonalRecord, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
  backupMetadata!: EntityTable<BackupMetadata, 'id'>;
  restTimers!: EntityTable<ActiveRestTimer, 'id'>;

  constructor() {
    super('HybridTracker');
    this.version(1).stores({
      exercises: 'id, name, muscleGroup, archived, updatedAt',
      routines: 'id, name, kind, active, updatedAt',
      routineExercises: 'id, routineId, exerciseId, [routineId+order], updatedAt',
      scheduledWorkouts: 'id, scheduledDate, routineId, status, sessionId, updatedAt',
      sessions: 'id, scheduledWorkoutId, scheduledDate, status, startedAt, completedAt, updatedAt',
      sessionExercises: 'id, sessionId, plannedExerciseId, performedExerciseId, [sessionId+order], status, updatedAt',
      sets: 'id, sessionId, sessionExerciseId, exerciseId, [sessionExerciseId+setNumber], completed, updatedAt',
      runs: 'id, scheduledWorkoutId, date, type, updatedAt',
      weights: 'id, date, updatedAt',
      recommendations: 'id, exerciseId, sessionId, state, updatedAt',
      personalRecords: 'id, exerciseId, side, sessionDate, setId, updatedAt',
      settings: 'id, key, updatedAt',
      backupMetadata: 'id, updatedAt',
      restTimers: 'id, sessionId, state, updatedAt'
    });
    this.version(2).stores({
      exercises: 'id, name, muscleGroup, archived, updatedAt',
      routines: 'id, name, kind, active, updatedAt',
      routineExercises: 'id, routineId, exerciseId, [routineId+order], updatedAt',
      scheduledWorkouts: 'id, scheduledDate, routineId, kind, status, sessionId, updatedAt',
      sessions: 'id, scheduledWorkoutId, scheduledDate, status, startedAt, completedAt, updatedAt',
      sessionExercises: 'id, sessionId, plannedExerciseId, performedExerciseId, [sessionId+order], status, updatedAt',
      sets: 'id, sessionId, sessionExerciseId, exerciseId, [sessionExerciseId+setNumber], completed, updatedAt',
      runs: 'id, scheduledWorkoutId, date, type, updatedAt',
      weights: 'id, &date, updatedAt',
      recommendations: 'id, exerciseId, sessionId, state, updatedAt',
      personalRecords: 'id, exerciseId, side, sessionDate, setId, updatedAt',
      settings: 'id, key, updatedAt',
      backupMetadata: 'id, updatedAt',
      restTimers: 'id, sessionId, state, updatedAt'
    }).upgrade(async (tx) => {
      await tx.table('scheduledWorkouts').toCollection().modify((item) => { item.kind ??= 'gym'; });
    });
    this.version(3).stores({
      exercises: 'id, name, muscleGroup, archived, updatedAt',
      routines: 'id, name, kind, active, updatedAt',
      routineExercises: 'id, routineId, exerciseId, [routineId+order], [routineId+exerciseId], updatedAt',
      scheduledWorkouts: 'id, scheduledDate, routineId, kind, status, sessionId, updatedAt',
      sessions: 'id, scheduledWorkoutId, scheduledDate, status, startedAt, completedAt, updatedAt',
      sessionExercises: 'id, sessionId, plannedExerciseId, performedExerciseId, [sessionId+order], status, updatedAt',
      sets: 'id, sessionId, sessionExerciseId, exerciseId, [sessionExerciseId+setNumber], completed, updatedAt',
      runs: 'id, scheduledWorkoutId, date, type, updatedAt',
      weights: 'id, &date, updatedAt',
      recommendations: 'id, exerciseId, sessionId, state, updatedAt',
      personalRecords: 'id, exerciseId, side, sessionDate, setId, updatedAt',
      settings: 'id, key, updatedAt',
      backupMetadata: 'id, updatedAt',
      restTimers: 'id, sessionId, state, updatedAt'
    });
  }
}

export const db = new HybridTrackerDatabase();
