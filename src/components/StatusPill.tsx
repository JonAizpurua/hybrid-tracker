import type { WorkoutStatus } from '../types';

export function StatusPill({ status }: { status: WorkoutStatus }) {
  return <span className={`status-pill ${status}`}>{status === 'in-progress' ? 'In progress' : status[0].toUpperCase() + status.slice(1)}</span>;
}
