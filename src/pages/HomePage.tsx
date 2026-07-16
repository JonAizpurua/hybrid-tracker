import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { ArrowRight, CalendarCheck, CloudOff, Play, Plus, Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../data/database';
import { appRepository, uuid } from '../data/repository';
import { StatusPill } from '../components/StatusPill';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { useUIStore } from '../state/uiStore';

export function HomePage() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const navigate = useNavigate();
  const pushToast = useUIStore((state) => state.pushToast);
  const [weightOpen, setWeightOpen] = useState(false);
  const [weight, setWeight] = useState('');
  const workouts = useLiveQuery(() => db.scheduledWorkouts.where('scheduledDate').equals(today).toArray(), [today]) ?? [];
  const latest = useLiveQuery(async () => {
    const [sessions, runs] = await Promise.all([db.sessions.where('status').equals('completed').toArray(), db.runs.toArray()]);
    return [
      ...sessions.map((item) => ({ id: item.id, scheduledId: item.scheduledWorkoutId, name: item.name, date: item.scheduledDate, sortAt: item.completedAt ?? item.updatedAt, type: 'gym' as const })),
      ...runs.map((item) => ({ id: item.id, scheduledId: item.scheduledWorkoutId, name: item.type === 'easy-run' ? 'Easy Run' : 'Interval Run', date: item.date, sortAt: item.updatedAt, type: 'run' as const }))
    ].sort((a, b) => b.sortAt.localeCompare(a.sortAt))[0];
  }, []);
  const connected = navigator.onLine;

  const openWorkout = async (id: string, kind: string, sessionId?: string) => {
    if (kind === 'gym') navigate(`/session/${sessionId ?? await appRepository.startGymWorkout(id)}`);
    else navigate(`/run/${id}`);
  };
  const saveWeight = async () => {
    const value = Number(weight);
    if (!Number.isFinite(value) || value < 30 || value > 300) { pushToast('Enter a body weight between 30 and 300 kg.', 'error'); return; }
    const timestamp = new Date().toISOString();
    const existing = await db.weights.where('date').equals(today).first();
    if (existing) await db.weights.update(existing.id, { weightKg: value, updatedAt: timestamp });
    else await db.weights.add({ id: uuid(), date: today, weightKg: value, createdAt: timestamp, updatedAt: timestamp });
    setWeightOpen(false); setWeight(''); pushToast('Body weight saved.', 'success');
  };

  return <div className="home-page">
    <header className="mobile-title-row"><div><span className="eyebrow">YOUR TRAINING</span><h1>Hybrid Tracker</h1></div><div className={`connection-dot ${connected ? 'online' : 'offline'}`} title={connected ? 'Online' : 'Offline'}>{connected ? null : <CloudOff size={15} />}</div></header>
    <section className="hero-section">
      <div className="section-heading"><div><span className="eyebrow">{format(new Date(), 'EEEE').toUpperCase()}</span><h2>Today</h2></div><span className="today-date">{format(new Date(), 'd MMM')}</span></div>
      {workouts.length ? <div className="today-stack">{workouts.map((workout, index) => <article className="today-workout" key={workout.id}>
        <div className="workout-card-top"><div className={`workout-symbol ${workout.kind}`}><span>{workout.kind === 'gym' ? workout.name.slice(0, 1) : 'R'}</span></div><div><p>{workout.kind === 'gym' ? 'GYM SESSION' : workout.kind === 'easy-run' ? 'EASY RUN' : 'INTERVAL RUN'}</p><h3>{workout.name}</h3></div><StatusPill status={workout.status} /></div>
        <p className="workout-description">{workout.kind === 'easy-run' ? '8–10 km · target HR 148–156 bpm' : workout.kind === 'interval-run' ? '6 × 2 min hard / 2 min easy' : 'Working sets · progression tracked'}</p>
        {workout.status === 'skipped' ? <button className="button secondary full" onClick={() => navigate('/workouts')}>View in schedule</button> : workout.status === 'completed' ? <button className="button secondary full" onClick={() => void openWorkout(workout.id, workout.kind, workout.sessionId)}>View completed {workout.kind === 'gym' ? 'workout' : 'run'} <ArrowRight size={18} /></button> : <button className="button primary full large" onClick={() => void openWorkout(workout.id, workout.kind, workout.sessionId)}><Play fill="currentColor" size={18} />{workout.status === 'in-progress' ? 'Continue workout' : 'Start workout'}</button>}
        {index < workouts.length - 1 && <div className="stack-divider" />}
      </article>)}</div> : <EmptyState icon={CalendarCheck} title="No workout scheduled today" description="Rest, recover, or start any workout from your weekly schedule." action={<button className="button secondary" onClick={() => navigate('/workouts')}>Browse workouts</button>} />}
    </section>
    <section className="quick-section"><button className="quick-card" onClick={() => setWeightOpen(true)}><span className="quick-icon"><Scale size={21} /></span><span><strong>Log weight</strong><small>Quick entry in kilograms</small></span><Plus size={19} /></button></section>
    <section className="latest-section"><div className="section-heading inline"><h2>Latest session</h2>{latest && <button className="text-button" onClick={() => navigate('/statistics')}>View statistics</button>}</div>
      {latest ? <button className="latest-card" onClick={() => latest.type === 'gym' ? navigate(`/session/${latest.id}`) : latest.scheduledId && navigate(`/run/${latest.scheduledId}`)}><div><strong>{latest.name}</strong><span>{format(parseISO(latest.date), 'EEEE, d MMM')}</span></div><div className="latest-meta"><span>Completed</span><small>{formatDistanceToNowStrict(parseISO(latest.sortAt), { addSuffix: true })}</small></div><ArrowRight size={19} /></button> : <div className="compact-empty"><p>Your first completed workout will appear here.</p></div>}
    </section>
    <footer className="local-note"><span className="local-dot" />Data saves automatically on this device</footer>
    {weightOpen && <Modal title="Log body weight" onClose={() => setWeightOpen(false)}><label className="field-label">Weight<div className="unit-input"><input autoFocus type="number" inputMode="decimal" min="30" max="300" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="72.4" /><span>kg</span></div></label><p className="field-help">Saved for {format(new Date(), 'd MMMM yyyy')}</p><button className="button primary full" onClick={() => void saveWeight()}>Save weight</button></Modal>}
  </div>;
}
