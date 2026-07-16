import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ChevronDown, ChevronUp, CircleCheck, Footprints, Plus, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../data/database';
import { uuid } from '../data/repository';
import { findSimilarHeartRateRun, formatPace, paceSecondsPerKm } from '../domain/calculations';
import type { IntervalRecord } from '../types';
import { useUIStore } from '../state/uiStore';
import { Modal } from '../components/Modal';

const EMPTY: never[] = [];

export function RunPage() {
  const { scheduledId = '' } = useParams();
  const navigate = useNavigate();
  const pushToast = useUIStore((state) => state.pushToast);
  const scheduled = useLiveQuery(() => db.scheduledWorkouts.get(scheduledId), [scheduledId]);
  const existing = useLiveQuery(() => db.runs.where('scheduledWorkoutId').equals(scheduledId).first(), [scheduledId]);
  const previousRuns = useLiveQuery(() => db.runs.toArray(), []) ?? EMPTY;
  const settings = useLiveQuery(() => db.settings.get('app-settings'), []);
  const [distance, setDistance] = useState('');
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [averageHr, setAverageHr] = useState('');
  const [maxHr, setMaxHr] = useState('');
  const [elevation, setElevation] = useState('');
  const [notes, setNotes] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [intervals, setIntervals] = useState<IntervalRecord[]>([]);
  const [progressPrompt, setProgressPrompt] = useState(false);
  const initialized = useState({ current: false })[0];
  if (existing && !initialized.current) {
    initialized.current = true; setDistance(String(existing.distanceKm)); setHours(String(Math.floor(existing.durationSeconds / 3600)));
    setMinutes(String(Math.floor(existing.durationSeconds % 3600 / 60))); setSeconds(String(existing.durationSeconds % 60));
    setAverageHr(existing.averageHeartRate?.toString() ?? ''); setMaxHr(existing.maxHeartRate?.toString() ?? ''); setElevation(existing.elevationGainM?.toString() ?? ''); setNotes(existing.notes ?? ''); setIntervals(existing.intervals ?? []);
  }
  const duration = Number(hours || 0) * 3600 + Number(minutes || 0) * 60 + Number(seconds || 0);
  const pace = paceSecondsPerKm(duration, Number(distance));
  const isInterval = scheduled?.kind === 'interval-run';
  const block = settings?.intervalBlock ?? 1;
  const repetitions = settings?.intervalRepetitions ?? (block === 1 ? 6 : block === 2 ? 5 : 4);
  const hardSeconds = settings?.intervalHardSeconds ?? (block === 1 ? 120 : block === 2 ? 180 : 240);
  const recoverySeconds = settings?.intervalRecoverySeconds ?? (block === 3 ? 150 : 120);
  const minuteCopy = (value: number) => value % 60 === 0 ? `${value / 60} min` : `${Math.floor(value / 60)} min ${value % 60} sec`;
  const blockCopy = `${repetitions} × ${minuteCopy(hardSeconds)} hard / ${minuteCopy(recoverySeconds)} easy`;
  const similar = useMemo(() => {
    if (!scheduled || !Number(averageHr) || !pace) return undefined;
    return findSimilarHeartRateRun({ id: 'draft', createdAt: '', updatedAt: '', type: 'easy-run', date: scheduled.scheduledDate, distanceKm: Number(distance), durationSeconds: duration, averageHeartRate: Number(averageHr) }, previousRuns);
  }, [scheduled, averageHr, distance, duration, pace, previousRuns]);

  if (scheduled === undefined) return <div className="splash compact"><p>Loading run…</p></div>;
  if (!scheduled) return <div className="fatal-state"><h1>Run not found</h1><button className="button primary" onClick={() => navigate('/workouts')}>Back to workouts</button></div>;
  const addInterval = () => setIntervals((items) => [...items, { id: uuid(), number: items.length + 1, durationSeconds: 120 }]);
  const updateInterval = (id: string, changes: Partial<IntervalRecord>) => setIntervals((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item));
  const save = async () => {
    const distanceKm = Number(distance); const avg = Number(averageHr); const max = Number(maxHr); const elevationM = Number(elevation);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 200) { pushToast('Enter a valid running distance.', 'error'); return; }
    if (!Number.isFinite(duration) || duration < 60 || duration > 24 * 3600) { pushToast('Enter a complete, realistic duration.', 'error'); return; }
    if (averageHr && (avg < 40 || avg > 230)) { pushToast('Average heart rate must be between 40 and 230 bpm.', 'error'); return; }
    if (maxHr && (max < avg || max > 240)) { pushToast('Maximum heart rate must be at least the average and no more than 240 bpm.', 'error'); return; }
    const timestamp = new Date().toISOString();
    const record = { id: existing?.id ?? uuid(), scheduledWorkoutId: scheduled.id, type: scheduled.kind as 'easy-run' | 'interval-run', date: scheduled.scheduledDate, distanceKm, durationSeconds: duration, averageHeartRate: averageHr ? avg : undefined, maxHeartRate: maxHr ? max : undefined, elevationGainM: elevation ? elevationM : undefined, notes: notes || undefined, intervalBlock: isInterval ? block as 1 | 2 | 3 : undefined, intervals: isInterval ? intervals : undefined, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
    await db.transaction('rw', [db.runs, db.scheduledWorkouts, db.settings], async () => {
      await db.runs.put(record);
      await db.scheduledWorkouts.update(scheduled.id, { status: 'completed', updatedAt: timestamp });
      if (isInterval && !existing && settings) await db.settings.update(settings.id, { intervalBlockCompleted: settings.intervalDeloadNext ? settings.intervalBlockCompleted : settings.intervalBlockCompleted + 1, intervalDeloadNext: false, updatedAt: timestamp });
    });
    if (isInterval && !existing && !settings?.intervalDeloadNext && (settings?.intervalBlockCompleted ?? 0) + 1 >= 2) setProgressPrompt(true);
    else { pushToast(existing ? 'Run updated.' : 'Run completed.', 'success'); navigate('/'); }
  };
  const handleProgress = async (choice: 'progress' | 'keep' | 'remind') => {
    if (settings && choice !== 'remind') {
      const next = choice === 'progress' ? Math.min(3, block + 1) as 1 | 2 | 3 : block;
      const plan = next === 1 ? { intervalRepetitions: 6, intervalHardSeconds: 120, intervalRecoverySeconds: 120 } : next === 2 ? { intervalRepetitions: 5, intervalHardSeconds: 180, intervalRecoverySeconds: 120 } : { intervalRepetitions: 4, intervalHardSeconds: 240, intervalRecoverySeconds: 150 };
      await db.settings.update(settings.id, { intervalBlock: next, intervalBlockCompleted: 0, ...plan, updatedAt: new Date().toISOString() });
    }
    pushToast('Run completed.', 'success'); navigate('/');
  };
  const handleBlockThree = async (choice: 'keep' | 'deload' | 'manual') => {
    if (!settings) return;
    if (choice === 'manual') { setProgressPrompt(false); navigate('/settings'); return; }
    await db.settings.update(settings.id, { intervalBlockCompleted: 0, intervalDeloadNext: choice === 'deload', updatedAt: new Date().toISOString() });
    pushToast(choice === 'deload' ? 'Easy deload selected for the next interval slot.' : 'Block 3 retained.', 'success'); navigate('/');
  };

  return <div className="run-page">
    <header className="session-header"><button className="icon-button" aria-label="Back" onClick={() => navigate(-1)}><ArrowLeft /></button><div><span>{existing ? 'EDIT COMPLETED RUN' : 'RUN SESSION'}</span><h1>{scheduled.name}</h1></div></header>
    <section className="run-plan"><div className="run-plan-icon"><Footprints size={25} /></div><div><span>TODAY’S PLAN</span><h2>{isInterval ? settings?.intervalDeloadNext ? 'Easy deload run' : `Intervals — ${blockCopy}` : 'Easy Run — 8–10 km'}</h2><p>{isInterval ? settings?.intervalDeloadNext ? 'Keep the effort easy · interval details are optional' : `${settings?.intervalWarmupMinutes ?? 15} min warm-up · ${settings?.intervalCooldownMinutes ?? 10} min cool-down` : 'Target HR 148–156 bpm · begin conservatively'}</p></div></section>
    <form className="run-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <section className="form-card"><h2>Activity summary</h2><div className="field-grid two"><label className="field-label">Distance<div className="unit-input"><input type="number" inputMode="decimal" step="0.01" min="0" value={distance} onChange={(event) => setDistance(event.target.value)} placeholder="8.00" /><span>km</span></div></label><div className="pace-display"><span>Average pace</span><strong>{formatPace(pace)}</strong></div></div><label className="field-label">Duration<div className="duration-input"><div><input aria-label="Hours" type="number" inputMode="numeric" min="0" value={hours} onChange={(event) => setHours(event.target.value)} /><span>hr</span></div><div><input aria-label="Minutes" type="number" inputMode="numeric" min="0" max="59" value={minutes} onChange={(event) => setMinutes(event.target.value)} placeholder="00" /><span>min</span></div><div><input aria-label="Seconds" type="number" inputMode="numeric" min="0" max="59" value={seconds} onChange={(event) => setSeconds(event.target.value)} placeholder="00" /><span>sec</span></div></div></label></section>
      <section className="form-card"><h2>Performance</h2><div className="field-grid two"><label className="field-label">Average heart rate<div className="unit-input"><input type="number" inputMode="numeric" value={averageHr} onChange={(event) => setAverageHr(event.target.value)} placeholder="152" /><span>bpm</span></div></label><label className="field-label">Maximum heart rate<div className="unit-input"><input type="number" inputMode="numeric" value={maxHr} onChange={(event) => setMaxHr(event.target.value)} placeholder="178" /><span>bpm</span></div></label></div><label className="field-label">Elevation gain<div className="unit-input"><input type="number" inputMode="decimal" min="0" value={elevation} onChange={(event) => setElevation(event.target.value)} placeholder="45" /><span>m</span></div></label>{similar && pace && <div className="comparison-callout"><strong>{Math.abs(Math.round(pace - similar.durationSeconds / similar.distanceKm))} sec/km {pace < similar.durationSeconds / similar.distanceKm ? 'faster' : 'slower'}</strong><span>than your previous run at a similar heart rate ({averageHr} vs {similar.averageHeartRate} bpm) on {similar.date}.</span></div>}</section>
      {isInterval && <section className="form-card"><button type="button" className="section-toggle" onClick={() => setDetailsOpen(!detailsOpen)}><span><strong>Interval details</strong><small>Optional · overall activity remains official</small></span>{detailsOpen ? <ChevronUp /> : <ChevronDown />}</button>{detailsOpen && <div className="interval-list">{intervals.map((interval) => <div className="interval-row" key={interval.id}><strong>{interval.number}</strong><label><span>Time (sec)</span><input type="number" inputMode="numeric" value={interval.durationSeconds} onChange={(event) => updateInterval(interval.id, { durationSeconds: Number(event.target.value) })} /></label><label><span>Distance (km)</span><input type="number" inputMode="decimal" step="0.01" value={interval.distanceKm ?? ''} onChange={(event) => updateInterval(interval.id, { distanceKm: Number(event.target.value) })} /></label><span className="interval-pace">{formatPace(paceSecondsPerKm(interval.durationSeconds, interval.distanceKm ?? 0))}</span><button type="button" className="icon-button small" aria-label={`Delete interval ${interval.number}`} onClick={() => setIntervals((items) => items.filter((item) => item.id !== interval.id))}><Trash2 size={17} /></button></div>)}<button type="button" className="button secondary full" onClick={addInterval}><Plus size={17} />Add interval</button></div>}</section>}
      <section className="form-card"><label className="field-label">Run notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes about the activity" /></label></section>
      <button className="button primary full large" type="submit"><CircleCheck size={19} />{existing ? 'Save changes' : 'Complete run'}</button>
    </form>
    {progressPrompt && <Modal title="Interval progression" onClose={() => setProgressPrompt(false)}>{block < 3 ? <><p>You have completed two sessions with this interval format. Would you like to progress the workout?</p><div className="choice-list"><button onClick={() => void handleProgress('progress')}>Progress</button><button onClick={() => void handleProgress('keep')}>Keep current format</button><button onClick={() => void handleProgress('remind')}>Remind me next time</button></div></> : <><p>You have completed two sessions in Block 3. Choose what comes next.</p><div className="choice-list"><button onClick={() => void handleBlockThree('keep')}>Keep Block 3</button><button onClick={() => void handleBlockThree('deload')}>Return to an easy deload run for that session</button><button onClick={() => void handleBlockThree('manual')}>Manually edit the interval plan</button></div></>}</Modal>}
  </div>;
}
