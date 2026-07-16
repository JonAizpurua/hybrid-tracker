import { addWeeks, format, startOfWeek } from 'date-fns';
import { db } from './database';
import { scheduleForWeek, seedExercises, seedRoutineExercises, seedRoutines, seedSettings } from './seed';
import { mergeRecords, totalMergeSummaries, type MergeSummary } from '../domain/backup';
import { primaryWorkingWeight, progressionRecommendation, recalculatePRs } from '../domain/calculations';
import type { ActiveRestTimer, Exercise, ExerciseSet, HybridBackup, RoutineExercise, SessionExercise, Side, WorkoutSession } from '../types';

const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();
const tables = ['exercises', 'routines', 'routineExercises', 'scheduledWorkouts', 'sessions', 'sessionExercises', 'sets', 'runs', 'weights', 'recommendations', 'personalRecords', 'settings', 'backupMetadata', 'restTimers'] as const;

export const appRepository = {
  async initialize() {
    if (await db.routines.count() === 0) {
      await db.transaction('rw', [db.exercises, db.routines, db.routineExercises, db.settings, db.backupMetadata], async () => {
        await db.exercises.bulkPut(seedExercises);
        await db.routines.bulkPut(seedRoutines);
        await db.routineExercises.bulkPut(seedRoutineExercises);
        await db.settings.put(seedSettings);
        await db.backupMetadata.put({ id: 'backup-metadata', googleConnected: false, createdAt: now(), updatedAt: now() });
      });
    }
    await this.ensureSchedule();
    await this.rolloverSkipped();
  },

  async ensureSchedule() {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weeks = Array.from({ length: 21 }, (_, index) => scheduleForWeek(addWeeks(monday, index - 8))).flat();
    const existing = new Set((await db.scheduledWorkouts.bulkGet(weeks.map((item) => item.id))).filter(Boolean).map((item) => item!.id));
    await db.scheduledWorkouts.bulkAdd(weeks.filter((item) => !existing.has(item.id)));
  },

  async rolloverSkipped() {
    const currentWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const candidates = await db.scheduledWorkouts.where('scheduledDate').below(currentWeekStart).filter((item) => item.status === 'pending').toArray();
    await db.scheduledWorkouts.bulkPut(candidates.map((item) => ({ ...item, status: 'skipped' as const, updatedAt: now() })));
  },

  async startGymWorkout(scheduledId: string): Promise<string> {
    const scheduled = await db.scheduledWorkouts.get(scheduledId);
    if (!scheduled || scheduled.kind !== 'gym') throw new Error('Gym workout not found.');
    if (scheduled.sessionId) return scheduled.sessionId;
    return db.transaction('rw', [db.scheduledWorkouts, db.sessions, db.sessionExercises, db.sets, db.routineExercises, db.exercises, db.recommendations], async () => {
      const fresh = await db.scheduledWorkouts.get(scheduledId);
      if (fresh?.sessionId) return fresh.sessionId;
      const prescriptions = await db.routineExercises.where('routineId').equals(scheduled.routineId).sortBy('order');
      const exercises = new Map((await db.exercises.bulkGet(prescriptions.map((item) => item.exerciseId))).filter(Boolean).map((item) => [item!.id, item!]));
      const sessionId = uuid();
      const startedAt = now();
      const sessionExercises: SessionExercise[] = prescriptions.map((item, order) => {
        const exercise = exercises.get(item.exerciseId)!;
        return {
          id: uuid(), sessionId, plannedExerciseId: exercise.id, performedExerciseId: exercise.id, name: exercise.name,
          order, sets: item.sets, minReps: item.minReps, maxReps: item.maxReps, restSeconds: item.restSeconds,
          unilateral: exercise.unilateral, loadType: exercise.loadType, volumeMultiplier: exercise.volumeMultiplier,
          increment: exercise.increment, startingSide: 'L', status: order === 0 ? 'active' : 'pending', createdAt: startedAt, updatedAt: startedAt
        };
      });
      const previousSets = await db.sets.where('exerciseId').anyOf(prescriptions.map((item) => item.exerciseId)).filter((set) => set.completed).toArray();
      const acceptedRecommendations = await db.recommendations.where('exerciseId').anyOf(prescriptions.map((item) => item.exerciseId)).filter((item) => item.state === 'accepted').toArray();
      const setRows: ExerciseSet[] = sessionExercises.flatMap((snapshot) => {
        const sides: Array<Side | undefined> = snapshot.unilateral ? ['L', 'R'] : [undefined];
        return Array.from({ length: snapshot.sets }, (_, setIndex) => sides.map((side) => {
          const previous = previousSets.filter((set) => set.exerciseId === snapshot.performedExerciseId && set.setNumber === setIndex + 1 && set.side === side).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          const fallback = previousSets.filter((set) => set.exerciseId === snapshot.performedExerciseId && set.side === side).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          const accepted = acceptedRecommendations.filter((item) => item.exerciseId === snapshot.performedExerciseId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
          return {
            id: uuid(), sessionId, sessionExerciseId: snapshot.id, exerciseId: snapshot.performedExerciseId,
            setNumber: setIndex + 1, side, prescribed: true, weight: accepted?.recommendedLoad ?? previous?.weight ?? fallback?.weight,
            bodyWeight: previous?.bodyWeight ?? fallback?.bodyWeight, pullUpMode: previous?.pullUpMode ?? fallback?.pullUpMode,
            completed: false, createdAt: startedAt, updatedAt: startedAt
          };
        })).flat();
      });
      const session: WorkoutSession = {
        id: sessionId, scheduledWorkoutId: scheduled.id, routineId: scheduled.routineId, name: scheduled.name, kind: 'gym',
        scheduledDate: scheduled.scheduledDate, startedAt, status: 'in-progress', currentExerciseId: sessionExercises[0]?.id,
        createdAt: startedAt, updatedAt: startedAt
      };
      await db.sessions.add(session);
      await db.sessionExercises.bulkAdd(sessionExercises);
      await db.sets.bulkAdd(setRows);
      await Promise.all(acceptedRecommendations.map((item) => db.recommendations.update(item.id, { state: 'ignored', updatedAt: startedAt })));
      await db.scheduledWorkouts.update(scheduled.id, { sessionId, status: 'in-progress', updatedAt: startedAt });
      return sessionId;
    });
  },

  async saveSet(setId: string, changes: Partial<ExerciseSet>, restSeconds: number) {
    const set = await db.sets.get(setId);
    if (!set) throw new Error('Set not found.');
    const updatedAt = now();
    await db.transaction('rw', [db.sets, db.restTimers, db.scheduledWorkouts, db.sessions], async () => {
      await db.sets.update(setId, { ...changes, completed: true, updatedAt });
      const session = await db.sessions.get(set.sessionId);
      if (session) await db.scheduledWorkouts.update(session.scheduledWorkoutId, { status: 'in-progress', updatedAt });
      const timer: ActiveRestTimer = {
        id: 'active-rest', sessionId: set.sessionId, sessionExerciseId: set.sessionExerciseId,
        targetAt: new Date(Date.now() + restSeconds * 1000).toISOString(), state: 'running', createdAt: updatedAt, updatedAt
      };
      await db.restTimers.put(timer);
    });
    await this.refreshPRs();
    const session = await db.sessions.get(set.sessionId);
    if (session?.status === 'completed') await this.refreshRecommendations(set.sessionId);
  },

  async addSet(sessionExerciseId: string) {
    const snapshot = await db.sessionExercises.get(sessionExerciseId);
    if (!snapshot) return;
    const existing = await db.sets.where('sessionExerciseId').equals(sessionExerciseId).toArray();
    const maxNumber = Math.max(0, ...existing.map((set) => set.setNumber));
    const latest = existing.filter((set) => set.completed).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const timestamp = now();
    const sides: Array<Side | undefined> = snapshot.unilateral ? [snapshot.startingSide, snapshot.startingSide === 'L' ? 'R' : 'L'] : [undefined];
    await db.sets.bulkAdd(sides.map((side) => ({
      id: uuid(), sessionId: snapshot.sessionId, sessionExerciseId, exerciseId: snapshot.performedExerciseId,
      setNumber: maxNumber + 1, side, prescribed: false, weight: latest?.weight, bodyWeight: latest?.bodyWeight,
      pullUpMode: latest?.pullUpMode, completed: false, createdAt: timestamp, updatedAt: timestamp
    })));
  },

  async flipStartingSide(sessionExerciseId: string, side: Side) {
    await db.sessionExercises.update(sessionExerciseId, { startingSide: side, updatedAt: now() });
  },

  async moveExercise(sessionExerciseId: string, action: 'after-next' | 'end' | 'skip') {
    const current = await db.sessionExercises.get(sessionExerciseId);
    if (!current) return;
    const list = await db.sessionExercises.where('sessionId').equals(current.sessionId).sortBy('order');
    if (action === 'skip') {
      await db.sessionExercises.update(current.id, { status: 'skipped', updatedAt: now() });
      return;
    }
    const remaining = list.filter((item) => item.id !== current.id);
    const index = action === 'end' ? remaining.length : Math.min(current.order + 1, remaining.length);
    remaining.splice(index, 0, current);
    await db.sessionExercises.bulkPut(remaining.map((item, order) => ({ ...item, order, updatedAt: now() })));
  },

  async substituteExercise(sessionExerciseId: string, exerciseId: string, permanent: boolean) {
    const [snapshot, exercise] = await Promise.all([db.sessionExercises.get(sessionExerciseId), db.exercises.get(exerciseId)]);
    if (!snapshot || !exercise) return;
    await db.transaction('rw', [db.sessionExercises, db.sets, db.routineExercises], async () => {
      await db.sessionExercises.update(snapshot.id, {
        performedExerciseId: exercise.id, name: exercise.name, unilateral: exercise.unilateral, loadType: exercise.loadType,
        volumeMultiplier: exercise.volumeMultiplier, increment: exercise.increment, updatedAt: now()
      });
      const sets = await db.sets.where('sessionExerciseId').equals(snapshot.id).toArray();
      await db.sets.bulkPut(sets.map((set) => ({ ...set, exerciseId: exercise.id, updatedAt: now() })));
      if (permanent) {
        const session = await db.sessions.get(snapshot.sessionId);
        if (session) {
          const routineItem = await db.routineExercises.where({ routineId: session.routineId, exerciseId: snapshot.plannedExerciseId }).first();
          if (routineItem) await db.routineExercises.update(routineItem.id, { exerciseId: exercise.id, updatedAt: now() });
        }
      }
    });
  },

  async finishSession(sessionId: string, ratings: { preFatigue: number; effort: number; postFatigue: number; note?: string }) {
    const session = await db.sessions.get(sessionId);
    if (!session) return;
    const timestamp = now();
    await db.transaction('rw', [db.sessions, db.scheduledWorkouts, db.restTimers], async () => {
      await db.sessions.update(sessionId, { ...ratings, status: 'completed', completedAt: timestamp, updatedAt: timestamp });
      await db.scheduledWorkouts.update(session.scheduledWorkoutId, { status: 'completed', updatedAt: timestamp });
      await db.restTimers.clear();
    });
    await this.refreshPRs();
    await this.refreshRecommendations(sessionId);
  },

  async refreshPRs() {
    const [sets, snapshots, sessions] = await Promise.all([db.sets.toArray(), db.sessionExercises.toArray(), db.sessions.toArray()]);
    const sessionDates = new Map(sessions.map((session) => [session.id, session.scheduledDate]));
    const context = new Map(snapshots.map((item) => [item.id, { name: item.name, loadType: item.loadType, date: sessionDates.get(item.sessionId) ?? '' }]));
    await db.personalRecords.clear();
    await db.personalRecords.bulkPut(recalculatePRs(sets, context));
  },

  async refreshRecommendations(sessionId: string) {
    const [session, snapshots, sessionSets, allSets] = await Promise.all([
      db.sessions.get(sessionId),
      db.sessionExercises.where('sessionId').equals(sessionId).toArray(),
      db.sets.where('sessionId').equals(sessionId).toArray(),
      db.sets.filter((set) => set.completed && set.sessionId !== sessionId).toArray()
    ]);
    if (!session) return;
    const timestamp = now();
    const recommendations = snapshots.flatMap((snapshot) => {
      const completed = sessionSets.filter((set) => set.sessionExerciseId === snapshot.id && set.completed && set.prescribed && set.reps != null);
      const currentLoad = primaryWorkingWeight(completed);
      if (currentLoad == null || completed.length === 0) return [];
      const latestPrevious = allSets.filter((set) => set.exerciseId === snapshot.performedExerciseId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const previous = latestPrevious ? allSets.filter((set) => set.sessionId === latestPrevious.sessionId && set.exerciseId === snapshot.performedExerciseId && set.prescribed) : [];
      const previousUnderperformed = previous.filter((set) => (set.reps ?? 0) < snapshot.minReps).length >= 2 || previous.some((set) => (set.reps ?? 0) < snapshot.minReps - 2);
      const result = progressionRecommendation({
        currentLoad, increment: snapshot.increment, minReps: snapshot.minReps, maxReps: snapshot.maxReps,
        prescribedSets: completed.map((set) => ({ reps: set.reps!, side: set.side })), previousUnderperformed,
        unilateral: snapshot.unilateral
      });
      return [{
        id: `recommendation-${sessionId}-${snapshot.id}`, exerciseId: snapshot.performedExerciseId, sessionId,
        action: result.action, currentLoad, recommendedLoad: result.load, reason: result.reason, state: 'new' as const,
        createdAt: timestamp, updatedAt: timestamp
      }];
    });
    await db.transaction('rw', db.recommendations, async () => {
      await db.recommendations.where('sessionId').equals(sessionId).delete();
      await db.recommendations.bulkPut(recommendations);
    });
  },

  async reschedule(id: string, scheduledDate: string) {
    await db.scheduledWorkouts.update(id, { scheduledDate, updatedAt: now() });
  },

  async skipScheduled(id: string) { await db.scheduledWorkouts.update(id, { status: 'skipped', updatedAt: now() }); },

  async exportBackup(): Promise<HybridBackup> {
    const values = await Promise.all(tables.map((name) => db.table(name).toArray()));
    return {
      schemaVersion: 3, exportedAt: now(), appVersion: '1.0.0',
      data: Object.fromEntries(tables.map((name, index) => [name, values[index]])) as unknown as HybridBackup['data']
    };
  },

  async importBackup(backup: HybridBackup, mode: 'merge' | 'replace'): Promise<MergeSummary> {
    const summaries: MergeSummary[] = [];
    await db.transaction('rw', db.tables, async () => {
      for (const name of tables) {
        const table = db.table(name);
        const incoming = backup.data[name] as TimestampedRecord[];
        if (mode === 'replace') { await table.clear(); await table.bulkPut(incoming); summaries.push({ newRecords: incoming.length, updatedRecords: 0, unchangedRecords: 0, conflicts: 0 }); }
        else {
          const result = mergeRecords(await table.toArray() as TimestampedRecord[], incoming);
          await table.clear();
          await table.bulkPut(result.records);
          summaries.push(result.summary);
        }
      }
    });
    return totalMergeSummaries(summaries);
  },

  async resetAll() {
    await db.transaction('rw', db.tables, async () => { for (const table of db.tables) await table.clear(); });
    await this.initialize();
  },

  async updateRoutineExercise(id: string, changes: Partial<RoutineExercise>) { await db.routineExercises.update(id, { ...changes, updatedAt: now() }); },
  async updateExercise(id: string, changes: Partial<Exercise>) { await db.exercises.update(id, { ...changes, updatedAt: now() }); }
};

type TimestampedRecord = { id: string; createdAt: string; updatedAt: string };
