export type ID = string;
export type ISODate = string;
export type ISODateTime = string;
export type WorkoutKind = 'gym' | 'easy-run' | 'interval-run';
export type WorkoutStatus = 'pending' | 'in-progress' | 'completed' | 'skipped';
export type Side = 'L' | 'R';
export type LoadType = 'total' | 'per-dumbbell' | 'bodyweight' | 'bodyweight-plus' | 'bodyweight-minus';

export interface Timestamped { id: ID; createdAt: ISODateTime; updatedAt: ISODateTime }

export interface Exercise extends Timestamped {
  name: string;
  muscleGroup: string;
  secondaryMuscleGroups: string[];
  equipment: string;
  unilateral: boolean;
  loadType: LoadType;
  volumeMultiplier: number;
  defaultSets: number;
  minReps: number;
  maxReps: number;
  defaultRestSeconds: number;
  increment: number;
  instructions?: string;
  archived: boolean;
}

export interface RoutineExercise extends Timestamped {
  routineId: ID;
  exerciseId: ID;
  order: number;
  sets: number;
  minReps: number;
  maxReps: number;
  restSeconds: number;
}

export interface Routine extends Timestamped { name: string; kind: WorkoutKind; active: boolean }

export interface ScheduledWorkout extends Timestamped {
  routineId: ID;
  name: string;
  kind: WorkoutKind;
  scheduledDate: ISODate;
  originalDate: ISODate;
  status: WorkoutStatus;
  sessionId?: ID;
}

export interface SessionExercise extends Timestamped {
  sessionId: ID;
  plannedExerciseId: ID;
  performedExerciseId: ID;
  name: string;
  order: number;
  sets: number;
  minReps: number;
  maxReps: number;
  restSeconds: number;
  unilateral: boolean;
  loadType: LoadType;
  volumeMultiplier: number;
  increment: number;
  startingSide: Side;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  exerciseNote?: string;
}

export interface WorkoutSession extends Timestamped {
  scheduledWorkoutId: ID;
  routineId: ID;
  name: string;
  kind: 'gym';
  scheduledDate: ISODate;
  startedAt: ISODateTime;
  completedAt?: ISODateTime;
  status: 'in-progress' | 'completed';
  currentExerciseId?: ID;
  preFatigue?: number;
  effort?: number;
  postFatigue?: number;
  note?: string;
}

export interface ExerciseSet extends Timestamped {
  sessionId: ID;
  sessionExerciseId: ID;
  exerciseId: ID;
  setNumber: number;
  side?: Side;
  prescribed: boolean;
  weight?: number;
  reps?: number;
  bodyWeight?: number;
  pullUpMode?: 'bodyweight' | 'weighted' | 'assisted';
  completed: boolean;
}

export interface IntervalRecord { id: ID; number: number; durationSeconds: number; distanceKm?: number; averageHeartRate?: number; maxHeartRate?: number }

export interface RunRecord extends Timestamped {
  scheduledWorkoutId?: ID;
  type: 'easy-run' | 'interval-run';
  date: ISODate;
  distanceKm: number;
  durationSeconds: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  elevationGainM?: number;
  notes?: string;
  intervalBlock?: 1 | 2 | 3;
  intervals?: IntervalRecord[];
}

export interface WeightRecord extends Timestamped { date: ISODate; weightKg: number }

export interface ProgressionRecommendation extends Timestamped {
  exerciseId: ID;
  sessionId: ID;
  action: 'increase' | 'maintain' | 'decrease';
  currentLoad: number;
  recommendedLoad: number;
  reason: string;
  state: 'new' | 'accepted' | 'ignored' | 'dismissed' | 'overridden';
}

export interface PersonalRecord extends Timestamped {
  exerciseId: ID;
  exerciseName: string;
  side?: Side;
  estimated1RM: number;
  actualWeight: number;
  reps: number;
  sessionDate: ISODate;
  sessionId: ID;
  setId: ID;
  perDumbbell: boolean;
}

export interface AppSettings extends Timestamped {
  key: 'settings';
  goalWeightKg: number;
  onboardingComplete: boolean;
  notificationState: NotificationPermission | 'unsupported';
  intervalBlock: 1 | 2 | 3;
  intervalBlockCompleted: number;
  intervalRepetitions: number;
  intervalHardSeconds: number;
  intervalRecoverySeconds: number;
  intervalWarmupMinutes: number;
  intervalCooldownMinutes: number;
  intervalDeloadNext?: boolean;
}

export interface BackupMetadata extends Timestamped {
  googleDriveFileId?: string;
  googleLastBackupAt?: ISODateTime;
  googleConnected: boolean;
}

export interface ActiveRestTimer extends Timestamped {
  sessionId: ID;
  sessionExerciseId: ID;
  targetAt?: ISODateTime;
  remainingWhenPaused?: number;
  state: 'running' | 'paused' | 'finished';
}

export interface HybridBackup {
  schemaVersion: number;
  exportedAt: ISODateTime;
  appVersion: string;
  data: {
    exercises: Exercise[];
    routines: Routine[];
    routineExercises: RoutineExercise[];
    scheduledWorkouts: ScheduledWorkout[];
    sessions: WorkoutSession[];
    sessionExercises: SessionExercise[];
    sets: ExerciseSet[];
    runs: RunRecord[];
    weights: WeightRecord[];
    recommendations: ProgressionRecommendation[];
    personalRecords: PersonalRecord[];
    settings: AppSettings[];
    backupMetadata: BackupMetadata[];
    restTimers: ActiveRestTimer[];
  };
}
