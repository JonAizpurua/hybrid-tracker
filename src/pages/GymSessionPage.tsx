import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Check, CircleCheck, Clock3, MoreHorizontal, Plus, Repeat2, Save, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../data/database';
import { appRepository } from '../data/repository';
import { classifyPerformance, effectiveLoad, estimated1RM } from '../domain/calculations';
import type { ExerciseSet, SessionExercise } from '../types';
import { Modal } from '../components/Modal';
import { useUIStore } from '../state/uiStore';

const performanceLabel = { better: 'Better', worse: 'Below previous', neutral: 'Matched', 'first-record': 'First record', pr: 'New estimated 1RM PR' };

function Rating({ label, value, onChange, low, high }: { label: string; value: number; onChange: (value: number) => void; low: string; high: string }) {
  return <fieldset className="rating-field"><legend>{label}</legend><div className="rating-scale">{Array.from({ length: 10 }, (_, index) => <button type="button" key={index + 1} className={value === index + 1 ? 'active' : ''} onClick={() => onChange(index + 1)}>{index + 1}</button>)}</div><div className="rating-anchors"><span>{low}</span><span>{high}</span></div></fieldset>;
}

function SetRow({ set, snapshot, previous, best, bodyWeight, readOnly }: { set: ExerciseSet; snapshot: SessionExercise; previous?: ExerciseSet; best?: number; bodyWeight?: number; readOnly: boolean }) {
  const [weight, setWeight] = useState(set.weight?.toString() ?? '');
  const [reps, setReps] = useState(set.reps?.toString() ?? '');
  const [mode, setMode] = useState(set.pullUpMode ?? 'bodyweight');
  const [sessionWeight, setSessionWeight] = useState(set.bodyWeight?.toString() ?? bodyWeight?.toString() ?? '');
  const pushToast = useUIStore((state) => state.pushToast);
  useEffect(() => { setWeight(set.weight?.toString() ?? ''); setReps(set.reps?.toString() ?? ''); }, [set.weight, set.reps]);
  const currentLoad = set.completed ? effectiveLoad(set, snapshot.loadType) : null;
  const previousLoad = previous ? effectiveLoad(previous, snapshot.loadType) : null;
  const currentE1rm = currentLoad != null ? estimated1RM(currentLoad, set.reps ?? 0) : 0;
  const previousE1rm = previousLoad != null ? estimated1RM(previousLoad, previous?.reps ?? 0) : undefined;
  const state = set.completed ? classifyPerformance(currentE1rm, previousE1rm, best) : undefined;
  const isPullUp = snapshot.loadType.startsWith('bodyweight');
  const previousCopy = !previous?.completed ? '—' : isPullUp ? previous.pullUpMode === 'weighted' ? `${previous.bodyWeight} + ${previous.weight} kg × ${previous.reps}` : previous.pullUpMode === 'assisted' ? `${previous.bodyWeight} − ${previous.weight} kg × ${previous.reps}` : `${previous.bodyWeight} kg × ${previous.reps}` : `${previous.weight ?? 0} kg × ${previous.reps}`;
  const save = async () => {
    const repsValue = Number(reps);
    const weightValue = isPullUp && mode === 'bodyweight' ? 0 : Number(weight);
    const bodyWeightValue = Number(sessionWeight);
    if (!Number.isInteger(repsValue) || repsValue <= 0 || repsValue > 100) { pushToast('Enter repetitions between 1 and 100.', 'error'); return; }
    if (!Number.isFinite(weightValue) || weightValue < 0) { pushToast('Enter a valid weight.', 'error'); return; }
    if (isPullUp && (!Number.isFinite(bodyWeightValue) || bodyWeightValue <= 0)) { pushToast('Enter body weight to calculate pull-up load.', 'error'); return; }
    await appRepository.saveSet(set.id, { weight: weightValue, reps: repsValue, bodyWeight: isPullUp ? bodyWeightValue : undefined, pullUpMode: isPullUp ? mode : undefined }, snapshot.restSeconds);
    pushToast(`Set ${set.setNumber}${set.side ? ` ${set.side}` : ''} saved. Rest started.`, 'success');
  };
  return <div className={`set-row ${set.completed && state ? `performance-${state}` : ''}`}>
    <div className="set-number"><strong>{set.setNumber}</strong>{set.side && <span>{set.side}</span>}{!set.prescribed && <small>Extra</small>}</div>
    <div className="previous-cell"><span>Previous</span><strong>{previousCopy}</strong></div>
    {isPullUp && <div className="pullup-controls"><select aria-label="Pull-up mode" value={mode} disabled={readOnly} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="bodyweight">Bodyweight</option><option value="weighted">Weighted</option><option value="assisted">Assisted</option></select><label>Body weight<input type="number" inputMode="decimal" value={sessionWeight} disabled={readOnly} onChange={(event) => setSessionWeight(event.target.value)} /><span>kg</span></label></div>}
    <label className="set-input"><span>{isPullUp ? mode === 'assisted' ? 'Assistance' : mode === 'weighted' ? 'Added' : 'Load' : 'Weight'}</span><div><input aria-label={`Set ${set.setNumber} weight`} type="number" inputMode="decimal" step="0.1" min="0" value={weight} disabled={readOnly || (isPullUp && mode === 'bodyweight')} onChange={(event) => setWeight(event.target.value)} placeholder="0" /><span>kg</span></div></label>
    <label className="set-input reps"><span>Reps</span><input aria-label={`Set ${set.setNumber} repetitions`} type="number" inputMode="numeric" min="1" max="100" value={reps} disabled={readOnly} onChange={(event) => setReps(event.target.value)} placeholder="—" /></label>
    {!readOnly && <button className={`complete-set ${set.completed ? 'saved' : ''}`} aria-label={set.completed ? 'Update set' : 'Save set'} onClick={() => void save()}>{set.completed ? <Save size={18} /> : <Check size={20} />}</button>}
    {set.completed && state && <div className={`performance-label ${state}`}>{state === 'pr' && <span>PR</span>}{performanceLabel[state]} · {currentE1rm.toFixed(1)} kg e1RM</div>}
  </div>;
}

export function GymSessionPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const pushToast = useUIStore((state) => state.pushToast);
  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId]);
  const snapshots = useLiveQuery(() => db.sessionExercises.where('sessionId').equals(sessionId).sortBy('order'), [sessionId]) ?? [];
  const sets = useLiveQuery(() => db.sets.where('sessionId').equals(sessionId).toArray(), [sessionId]) ?? [];
  const allSets = useLiveQuery(() => db.sets.where('completed').equals(1).toArray(), []) ?? [];
  const exercises = useLiveQuery(() => db.exercises.filter((item) => !item.archived).sortBy('name'), []) ?? [];
  const recommendations = useLiveQuery(() => db.recommendations.where('sessionId').equals(sessionId).toArray(), [sessionId]) ?? [];
  const latestWeight = useLiveQuery(async () => session ? (await db.weights.where('date').belowOrEqual(session.scheduledDate).reverse().sortBy('date'))[0] : undefined, [session?.scheduledDate]);
  const [moveTarget, setMoveTarget] = useState<SessionExercise | null>(null);
  const [substituteTarget, setSubstituteTarget] = useState<SessionExercise | null>(null);
  const [substituteId, setSubstituteId] = useState('');
  const [finishOpen, setFinishOpen] = useState(false);
  const [preFatigue, setPreFatigue] = useState(5);
  const [effort, setEffort] = useState(7);
  const [postFatigue, setPostFatigue] = useState(6);
  const [note, setNote] = useState('');
  const [confirmIncomplete, setConfirmIncomplete] = useState(false);

  const prescribed = sets.filter((set) => set.prescribed);
  const completed = prescribed.filter((set) => set.completed).length;
  const progress = prescribed.length ? Math.round(completed / prescribed.length * 100) : 0;
  const previousFor = (set: ExerciseSet) => allSets.filter((candidate) => candidate.sessionId !== sessionId && candidate.exerciseId === set.exerciseId && candidate.setNumber === set.setNumber && candidate.side === set.side).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const bestFor = (set: ExerciseSet, snapshot: SessionExercise) => Math.max(0, ...allSets.filter((candidate) => candidate.sessionId !== sessionId && candidate.exerciseId === set.exerciseId && candidate.side === set.side).map((candidate) => { const load = effectiveLoad(candidate, snapshot.loadType); return load == null ? 0 : estimated1RM(load, candidate.reps ?? 0); }));

  if (session === undefined) return <div className="splash compact"><p>Loading workout…</p></div>;
  if (!session) return <div className="fatal-state"><h1>Workout not found</h1><button className="button primary" onClick={() => navigate('/workouts')}>Back to workouts</button></div>;
  const finish = async (confirmed = false) => {
    const missing = prescribed.length - completed;
    if (missing > 0 && !confirmed) { setConfirmIncomplete(true); return; }
    await appRepository.finishSession(session.id, { preFatigue, effort, postFatigue, note });
    pushToast('Workout completed.', 'success'); navigate('/');
  };
  const updateNote = async (snapshot: SessionExercise, exerciseNote: string) => db.sessionExercises.update(snapshot.id, { exerciseNote, updatedAt: new Date().toISOString() });
  const removeSet = async (set: ExerciseSet) => {
    if (set.completed && !window.confirm('Delete this completed set? Statistics and records will be recalculated.')) return;
    await db.sets.delete(set.id); await appRepository.refreshPRs();
    if (session.status === 'completed') await appRepository.refreshRecommendations(session.id);
  };

  return <div className="session-page">
    <header className="session-header"><button className="icon-button" aria-label="Back" onClick={() => navigate(-1)}><ArrowLeft /></button><div><span>{session.status === 'completed' ? 'COMPLETED WORKOUT' : 'WORKOUT IN PROGRESS'}</span><h1>{session.name}</h1></div><span /></header>
    <div className="session-progress"><div><span>{completed} of {prescribed.length} working sets</span><strong>{progress}%</strong></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div>
    <div className="session-date"><Clock3 size={16} />Scheduled {session.scheduledDate}</div>
    <div className="exercise-stack">{snapshots.map((snapshot, exerciseIndex) => {
      const itemSets = sets.filter((set) => set.sessionExerciseId === snapshot.id).sort((a, b) => a.setNumber - b.setNumber || (a.side === snapshot.startingSide ? -1 : 1));
      const done = itemSets.filter((set) => set.completed).length;
      const recommendation = recommendations.find((item) => item.exerciseId === snapshot.performedExerciseId);
      return <article className={`exercise-card ${snapshot.status}`} key={snapshot.id}>
        <div className="exercise-heading"><div className="exercise-index">{snapshot.status === 'skipped' ? '—' : exerciseIndex + 1}</div><div><span>{snapshot.status === 'skipped' ? 'SKIPPED TODAY' : `${done}/${itemSets.length} SETS`}</span><h2>{snapshot.name}</h2><p>{snapshot.sets} × {snapshot.minReps}–{snapshot.maxReps} reps · {Math.floor(snapshot.restSeconds / 60)}:{String(snapshot.restSeconds % 60).padStart(2, '0')} rest</p></div><button className="icon-button" aria-label={`Move or skip ${snapshot.name}`} onClick={() => setMoveTarget(snapshot)}><MoreHorizontal /></button></div>
        {snapshot.status !== 'skipped' && <>
          {snapshot.unilateral && <div className="side-toggle"><span>Starting side</span><div><button className={snapshot.startingSide === 'L' ? 'active' : ''} onClick={() => void appRepository.flipStartingSide(snapshot.id, 'L')}>Left</button><button className={snapshot.startingSide === 'R' ? 'active' : ''} onClick={() => void appRepository.flipStartingSide(snapshot.id, 'R')}>Right</button></div></div>}
          <div className="sets-table">{itemSets.map((set) => <div className="set-row-wrap" key={set.id}><SetRow set={set} snapshot={snapshot} previous={previousFor(set)} best={bestFor(set, snapshot)} bodyWeight={latestWeight?.weightKg} readOnly={false} />{!set.prescribed && <button className="remove-set" aria-label="Remove extra set" onClick={() => void removeSet(set)}><Trash2 size={16} /></button>}</div>)}</div>
          <div className="exercise-actions"><button onClick={() => void appRepository.addSet(snapshot.id)}><Plus size={17} />Add set</button><button onClick={() => { setSubstituteTarget(snapshot); setSubstituteId(''); }}><Repeat2 size={17} />Substitute</button></div>
          <label className="exercise-note"><span>Exercise note</span><textarea placeholder="Optional note for this exercise" defaultValue={snapshot.exerciseNote} onBlur={(event) => void updateNote(snapshot, event.target.value)} /></label>
          {recommendation && <div className={`progression-recommendation ${recommendation.action}`}><span>NEXT SESSION</span><strong>{recommendation.action === 'increase' ? `Increase to ${recommendation.recommendedLoad} kg` : recommendation.action === 'decrease' ? `Reduce to ${recommendation.recommendedLoad} kg` : `Maintain ${recommendation.currentLoad} kg`}</strong><p>{recommendation.reason}</p>{recommendation.state === 'new' ? <div className="recommendation-actions"><button onClick={() => void db.recommendations.update(recommendation.id, { state: 'accepted', updatedAt: new Date().toISOString() })}>Accept</button><button onClick={() => void db.recommendations.update(recommendation.id, { state: 'ignored', updatedAt: new Date().toISOString() })}>Ignore once</button><button onClick={() => void db.recommendations.update(recommendation.id, { state: 'dismissed', updatedAt: new Date().toISOString() })}>Dismiss</button><label><input type="number" inputMode="decimal" step={snapshot.increment} defaultValue={recommendation.recommendedLoad} aria-label={`Override recommendation for ${snapshot.name}`} onBlur={(event) => { const value = Number(event.target.value); if (value > 0) void db.recommendations.update(recommendation.id, { recommendedLoad: value, state: 'overridden', updatedAt: new Date().toISOString() }); }} /><small>Override</small></label></div> : <small className="recommendation-state">{recommendation.state === 'accepted' ? 'Accepted for the next session' : recommendation.state === 'ignored' ? 'Ignored once' : recommendation.state === 'dismissed' ? 'Dismissed until performance changes' : `Manual load: ${recommendation.recommendedLoad} kg`}</small>}</div>}
        </>}
      </article>;
    })}</div>
    {session.status === 'in-progress' ? <button className="finish-bar" onClick={() => setFinishOpen(true)}><CircleCheck size={20} />Finish workout</button> : <div className="completed-banner"><CircleCheck size={20} /><span>This workout is complete. Saved sets remain editable.</span></div>}

    {moveTarget && <Modal title="Move or skip exercise" onClose={() => setMoveTarget(null)}><div className="choice-list"><button onClick={async () => { await appRepository.moveExercise(moveTarget.id, 'after-next'); setMoveTarget(null); }}>Do it after the next exercise</button><button onClick={async () => { await appRepository.moveExercise(moveTarget.id, 'end'); setMoveTarget(null); }}>Move it to the end</button><button className="danger-text" onClick={async () => { await appRepository.moveExercise(moveTarget.id, 'skip'); setMoveTarget(null); }}>Skip it today</button><button onClick={() => setMoveTarget(null)}>Cancel</button></div></Modal>}
    {substituteTarget && <Modal title="Substitute exercise" onClose={() => setSubstituteTarget(null)}><label className="field-label">Choose exercise<select value={substituteId} onChange={(event) => setSubstituteId(event.target.value)}><option value="">Select an exercise</option>{exercises.filter((item) => item.id !== substituteTarget.performedExerciseId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{substituteId && <div className="choice-list"><button onClick={async () => { await appRepository.substituteExercise(substituteTarget.id, substituteId, false); setSubstituteTarget(null); }}>Only for this workout</button><button onClick={async () => { await appRepository.substituteExercise(substituteTarget.id, substituteId, true); setSubstituteTarget(null); }}>Replace it in the routine from now on</button><button onClick={() => setSubstituteTarget(null)}>Cancel</button></div>}</Modal>}
    {finishOpen && <Modal title="Finish workout" onClose={() => setFinishOpen(false)} wide><div className="completion-summary"><div><strong>{snapshots.filter((item) => item.status !== 'skipped').length}</strong><span>Exercises trained</span></div><div><strong>{snapshots.filter((item) => item.status === 'skipped').length}</strong><span>Skipped</span></div><div><strong>{prescribed.length - completed}</strong><span>Missing sets</span></div></div><Rating label="Pre-workout fatigue" value={preFatigue} onChange={setPreFatigue} low="Fully rested" high="Extremely fatigued" /><Rating label="Session effort" value={effort} onChange={setEffort} low="Extremely easy" high="Maximal effort" /><Rating label="Post-workout fatigue" value={postFatigue} onChange={setPostFatigue} low="Still fresh" high="Completely exhausted" /><label className="field-label">Session note<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional general note" /></label><button className="button primary full" onClick={() => void finish()}>Complete session</button>{confirmIncomplete && <div className="inline-confirm"><strong>This workout has {prescribed.length - completed} missing prescribed set{prescribed.length - completed === 1 ? '' : 's'}. Complete it anyway?</strong><div className="button-row"><button className="button secondary" onClick={() => setConfirmIncomplete(false)}>Go back</button><button className="button primary" onClick={() => void finish(true)}>Complete anyway</button></div></div>}</Modal>}
  </div>;
}
