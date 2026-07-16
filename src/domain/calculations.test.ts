import { describe, expect, it } from 'vitest';
import { classifyPerformance, estimated1RM, findSimilarHeartRateRun, paceSecondsPerKm, progressionRecommendation, pullUpLoad, recalculatePRs, roundToIncrement, setVolume } from './calculations';
import type { ExerciseSet, RunRecord } from '../types';

describe('training calculations', () => {
  it('uses the Epley estimated 1RM formula and handles zero reps', () => {
    expect(estimated1RM(100, 10)).toBeCloseTo(133.333);
    expect(estimated1RM(100, 0)).toBe(0);
  });

  it('applies dumbbell and unilateral volume rules', () => {
    expect(setVolume(24, 10, { loadType: 'per-dumbbell', volumeMultiplier: 2 })).toBe(480);
    expect(setVolume(20, 10, { loadType: 'total', volumeMultiplier: 1, unilateral: true })).toBe(200);
  });

  it('calculates bodyweight, weighted and assisted pull-up loads', () => {
    expect(pullUpLoad(72, 0, 'bodyweight')).toBe(72);
    expect(pullUpLoad(72, 10, 'weighted')).toBe(82);
    expect(pullUpLoad(72, 20, 'assisted')).toBe(52);
    expect(pullUpLoad(undefined, 10, 'weighted')).toBeNull();
  });

  it('rounds a 2.5 percent increase up to the valid increment', () => {
    const result = progressionRecommendation({ currentLoad: 80, increment: 2.5, minReps: 6, maxReps: 10, prescribedSets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }], previousUnderperformed: false });
    expect(result.action).toBe('increase');
    expect(result.load).toBe(82.5);
    expect(roundToIncrement(81.9, 2.5, 'up')).toBe(82.5);
  });

  it('maintains when the smallest increment exceeds five percent', () => {
    const result = progressionRecommendation({ currentLoad: 10, increment: 1, minReps: 10, maxReps: 15, prescribedSets: [{ reps: 15 }, { reps: 15 }], previousUnderperformed: false });
    expect(result.action).toBe('maintain');
    expect(result.reason).toContain('exceeds 5%');
  });

  it('reduces five percent after two underperforming sessions', () => {
    const result = progressionRecommendation({ currentLoad: 100, increment: 2.5, minReps: 8, maxReps: 12, prescribedSets: [{ reps: 5 }, { reps: 7 }, { reps: 7 }], previousUnderperformed: true });
    expect(result.action).toBe('decrease');
    expect(result.load).toBe(95);
  });

  it('uses the weaker side for unilateral progression', () => {
    const result = progressionRecommendation({ currentLoad: 20, increment: 1, minReps: 8, maxReps: 12, prescribedSets: [{ reps: 12, side: 'L' }, { reps: 12, side: 'L' }, { reps: 12, side: 'R' }, { reps: 11, side: 'R' }], previousUnderperformed: false, unilateral: true });
    expect(result.action).toBe('maintain');
  });

  it('classifies changes using a strict 0.5 percent threshold and lets PR override', () => {
    expect(classifyPerformance(100.6, 100)).toBe('better');
    expect(classifyPerformance(99.4, 100)).toBe('worse');
    expect(classifyPerformance(100.5, 100)).toBe('neutral');
    expect(classifyPerformance(101, 100, 100.5)).toBe('pr');
  });

  it('calculates pace and matches the most recent easy run within plus or minus 3 bpm', () => {
    expect(paceSecondsPerKm(3000, 10)).toBe(300);
    const base = { createdAt: '', updatedAt: '', distanceKm: 8, durationSeconds: 2400, type: 'easy-run' as const };
    const current: RunRecord = { ...base, id: 'current', date: '2026-06-20', averageHeartRate: 153 };
    const runs: RunRecord[] = [
      { ...base, id: 'old', date: '2026-06-01', averageHeartRate: 150 },
      { ...base, id: 'latest', date: '2026-06-15', averageHeartRate: 155 },
      { ...base, id: 'interval', date: '2026-06-19', averageHeartRate: 153, type: 'interval-run' }
    ];
    expect(findSimilarHeartRateRun(current, runs)?.id).toBe('latest');
  });

  it('recalculates PR history after a set is edited or deleted', () => {
    const makeSet = (id: string, weight: number, createdAt: string): ExerciseSet => ({ id, sessionId: id, sessionExerciseId: 'snap', exerciseId: 'ex', setNumber: 1, prescribed: true, weight, reps: 10, completed: true, createdAt, updatedAt: createdAt });
    const context = new Map([['snap', { name: 'Press', loadType: 'total' as const, date: '2026-01-01' }]]);
    const first = makeSet('a', 50, '2026-01-01'); const second = makeSet('b', 60, '2026-02-01');
    expect(recalculatePRs([first, second], context).map((pr) => pr.setId)).toEqual(['a', 'b']);
    expect(recalculatePRs([{ ...first, weight: 65 }, second], context).map((pr) => pr.setId)).toEqual(['a']);
    expect(recalculatePRs([first], context)).toHaveLength(1);
  });
});
