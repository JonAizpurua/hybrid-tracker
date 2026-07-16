import type { HybridBackup, Timestamped } from '../types';

export type MergeSummary = { newRecords: number; updatedRecords: number; unchangedRecords: number; conflicts: number };

export const mergeRecords = <T extends Timestamped>(current: T[], incoming: T[]): { records: T[]; summary: MergeSummary } => {
  const records = new Map(current.map((record) => [record.id, record]));
  const summary: MergeSummary = { newRecords: 0, updatedRecords: 0, unchangedRecords: 0, conflicts: 0 };
  incoming.forEach((record) => {
    const existing = records.get(record.id);
    if (!existing) { records.set(record.id, record); summary.newRecords++; return; }
    if (JSON.stringify(existing) === JSON.stringify(record)) { summary.unchangedRecords++; return; }
    summary.conflicts++;
    if (record.updatedAt > existing.updatedAt) { records.set(record.id, record); summary.updatedRecords++; }
    else summary.unchangedRecords++;
  });
  return { records: [...records.values()], summary };
};

export const totalMergeSummaries = (items: MergeSummary[]): MergeSummary => items.reduce((total, item) => ({
  newRecords: total.newRecords + item.newRecords,
  updatedRecords: total.updatedRecords + item.updatedRecords,
  unchangedRecords: total.unchangedRecords + item.unchangedRecords,
  conflicts: total.conflicts + item.conflicts
}), { newRecords: 0, updatedRecords: 0, unchangedRecords: 0, conflicts: 0 });

export const isHybridBackup = (value: unknown): value is HybridBackup => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HybridBackup>;
  return typeof candidate.schemaVersion === 'number' && typeof candidate.exportedAt === 'string' && !!candidate.data && Array.isArray(candidate.data.exercises) && Array.isArray(candidate.data.sessions);
};
