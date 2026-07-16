import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, subMonths } from 'date-fns';
import { Award, BarChart3, Dumbbell, Footprints } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../data/database';
import { effectiveLoad, estimated1RM, formatPace, paceSecondsPerKm, setVolume } from '../domain/calculations';
import type { Side } from '../types';
import { EmptyState } from '../components/EmptyState';

const EMPTY: never[] = [];

type Section = 'strength' | 'volume' | 'running' | 'frequency' | 'records';
type Range = 1 | 3 | 6;

export function StatisticsPage() {
  const [section, setSection] = useState<Section>('strength');
  const [range, setRange] = useState<Range>(3);
  const [exerciseId, setExerciseId] = useState('');
  const [side, setSide] = useState<Side>('L');
  const [volumeBy, setVolumeBy] = useState<'exercise' | 'workout' | 'week' | 'muscle'>('week');
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? EMPTY;
  const sessions = useLiveQuery(() => db.sessions.toArray(), []) ?? EMPTY;
  const snapshots = useLiveQuery(() => db.sessionExercises.toArray(), []) ?? EMPTY;
  const sets = useLiveQuery(() => db.sets.toArray(), []) ?? EMPTY;
  const runs = useLiveQuery(() => db.runs.toArray(), []) ?? EMPTY;
  const scheduled = useLiveQuery(() => db.scheduledWorkouts.toArray(), []) ?? EMPTY;
  const prs = useLiveQuery(() => db.personalRecords.orderBy('sessionDate').reverse().toArray(), []) ?? EMPTY;
  const from = format(subMonths(new Date(), range), 'yyyy-MM-dd');
  const sessionMap = useMemo(() => new Map(sessions.map((item) => [item.id, item])), [sessions]);
  const snapshotMap = useMemo(() => new Map(snapshots.map((item) => [item.id, item])), [snapshots]);
  const exerciseMap = useMemo(() => new Map(exercises.map((item) => [item.id, item])), [exercises]);
  const strengthExercises = exercises.filter((exercise) => sets.some((set) => set.exerciseId === exercise.id && set.completed));
  const selectedId = exerciseId || strengthExercises[0]?.id || '';
  const selectedExercise = exerciseMap.get(selectedId);

  const strengthData = useMemo(() => sets.filter((set) => {
    const session = sessionMap.get(set.sessionId);
    return set.completed && set.exerciseId === selectedId && session && session.scheduledDate >= from && (!selectedExercise?.unilateral || set.side === side);
  }).map((set) => {
    const snapshot = snapshotMap.get(set.sessionExerciseId); const session = sessionMap.get(set.sessionId);
    const load = snapshot ? effectiveLoad(set, snapshot.loadType) : null;
    return { date: session?.scheduledDate.slice(5), fullDate: session?.scheduledDate, e1rm: load == null ? 0 : Number(estimated1RM(load, set.reps ?? 0).toFixed(1)), weight: set.weight, reps: set.reps, isPR: prs.some((pr) => pr.setId === set.id) };
  }).sort((a, b) => (a.fullDate ?? '').localeCompare(b.fullDate ?? '')), [sets, sessionMap, selectedId, from, selectedExercise?.unilateral, side, snapshotMap, prs]);

  const volumeData = useMemo(() => {
    const values = new Map<string, number>();
    sets.filter((set) => set.completed && set.reps).forEach((set) => {
      const session = sessionMap.get(set.sessionId); const snapshot = snapshotMap.get(set.sessionExerciseId); const exercise = exerciseMap.get(set.exerciseId);
      if (!session || session.scheduledDate < from || !snapshot || !exercise) return;
      const load = effectiveLoad(set, snapshot.loadType); if (load == null) return;
      const value = setVolume(load, set.reps!, { loadType: snapshot.loadType, volumeMultiplier: snapshot.volumeMultiplier, unilateral: snapshot.unilateral });
      const key = volumeBy === 'exercise' ? exercise.name : volumeBy === 'workout' ? session.name : volumeBy === 'muscle' ? exercise.muscleGroup : session.scheduledDate.slice(0, 8) + String(Math.ceil(Number(session.scheduledDate.slice(8)) / 7));
      values.set(key, (values.get(key) ?? 0) + value);
    });
    return [...values].map(([name, volume]) => ({ name, volume: Math.round(volume) })).slice(-12);
  }, [sets, sessionMap, snapshotMap, exerciseMap, from, volumeBy]);

  const runData = runs.filter((run) => run.date >= from).sort((a, b) => a.date.localeCompare(b.date)).map((run) => ({ date: run.date.slice(5), pace: paceSecondsPerKm(run.durationSeconds, run.distanceKm), hr: run.averageHeartRate, distance: run.distanceKm, type: run.type }));
  const totalKm = runData.reduce((sum, run) => sum + run.distance, 0);
  const totalDuration = runs.filter((run) => run.date >= from).reduce((sum, run) => sum + run.durationSeconds, 0);
  const hrs = runData.flatMap((run) => run.hr ? [run.hr] : []);
  const frequency = useMemo(() => {
    const counts = new Map<string, number>();
    scheduled.filter((item) => item.status === 'completed' && item.scheduledDate >= from).forEach((item) => { const key = item.scheduledDate.slice(0, 7); counts.set(key, (counts.get(key) ?? 0) + 1); });
    return [...counts].map(([name, completed]) => ({ name, completed }));
  }, [scheduled, from]);
  const currentStrength = strengthData.at(-1)?.e1rm;
  const strengthChange = currentStrength != null && strengthData[0] ? currentStrength - strengthData[0].e1rm : null;

  return <div>
    <header className="page-header"><div><span className="eyebrow">TRAINING INSIGHTS</span><h1>Statistics</h1></div></header>
    <div className="range-control">{([1, 3, 6] as Range[]).map((item) => <button key={item} className={range === item ? 'active' : ''} onClick={() => setRange(item)}>{item} month{item > 1 ? 's' : ''}</button>)}</div>
    <div className="stats-nav">{([{ id: 'strength', label: 'Strength', icon: Dumbbell }, { id: 'volume', label: 'Volume', icon: BarChart3 }, { id: 'running', label: 'Running', icon: Footprints }, { id: 'frequency', label: 'Frequency', icon: BarChart3 }, { id: 'records', label: 'PRs', icon: Award }] as const).map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}><Icon size={18} /><span>{label}</span></button>)}</div>

    {section === 'strength' && <section className="stats-section">{strengthExercises.length ? <><div className="stats-filters"><label>Exercise<select value={selectedId} onChange={(event) => setExerciseId(event.target.value)}>{strengthExercises.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{selectedExercise?.unilateral && <label>Side<select value={side} onChange={(event) => setSide(event.target.value as Side)}><option value="L">Left</option><option value="R">Right</option></select></label>}</div><div className="metric-cards"><div><span>Current estimated 1RM</span><strong>{currentStrength?.toFixed(1) ?? '—'} <small>kg{selectedExercise?.loadType === 'per-dumbbell' ? ' / dumbbell' : ''}</small></strong></div><div><span>Period change</span><strong className={strengthChange != null && strengthChange >= 0 ? 'positive' : 'negative'}>{strengthChange == null ? '—' : `${strengthChange >= 0 ? '+' : ''}${strengthChange.toFixed(1)} kg`}</strong></div></div><div className="chart-card"><h2>Estimated 1RM over time</h2>{strengthData.length ? <ResponsiveContainer height={270} width="100%"><LineChart data={strengthData} margin={{ top: 18, right: 12, left: -15, bottom: 4 }}><CartesianGrid stroke="#333841" vertical={false} /><XAxis dataKey="date" tick={{ fill: '#89909b', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fill: '#89909b', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#22252b', border: '1px solid #3a3f49', borderRadius: 10 }} formatter={(value, name, item) => name === 'e1rm' ? [`${value} kg (${item.payload.weight} kg × ${item.payload.reps})`, 'Estimated 1RM'] : [value, name]} /><Line type="monotone" dataKey="e1rm" stroke="#4d91ff" strokeWidth={3} dot={{ fill: '#4d91ff', r: 3 }} />{strengthData.filter((item) => item.isPR).map((item, index) => <ReferenceDot key={index} x={item.date} y={item.e1rm} r={6} fill="#9c6bff" stroke="#d5c0ff" />)}</LineChart></ResponsiveContainer> : <div className="chart-empty">No completed sets in this range.</div>}</div></> : <EmptyState icon={Dumbbell} title="No strength data yet" description="Complete a working set to begin tracking estimated 1RM." />}</section>}

    {section === 'volume' && <section className="stats-section"><div className="stats-filters inline-options"><span>View by</span>{(['exercise', 'workout', 'week', 'muscle'] as const).map((item) => <button className={volumeBy === item ? 'active' : ''} onClick={() => setVolumeBy(item)} key={item}>{item === 'muscle' ? 'Muscle group' : item[0].toUpperCase() + item.slice(1)}</button>)}</div><div className="chart-card"><h2>Completed training volume</h2>{volumeData.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={volumeData} margin={{ top: 18, right: 8, left: -10, bottom: 30 }}><CartesianGrid stroke="#333841" vertical={false} /><XAxis dataKey="name" tick={{ fill: '#89909b', fontSize: 10 }} axisLine={false} tickLine={false} angle={-25} textAnchor="end" /><YAxis tick={{ fill: '#89909b', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#22252b', border: '1px solid #3a3f49', borderRadius: 10 }} formatter={(value) => [`${Number(value).toLocaleString()} kg`, 'Volume']} /><Bar dataKey="volume" fill="#4d91ff" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="chart-empty">No completed gym volume in this range.</div>}</div></section>}

    {section === 'running' && <section className="stats-section">{runData.length ? <><div className="metric-cards three"><div><span>Total distance</span><strong>{totalKm.toFixed(1)} <small>km</small></strong></div><div><span>Runs</span><strong>{runData.length}</strong></div><div><span>Average pace</span><strong>{formatPace(paceSecondsPerKm(totalDuration, totalKm)).replace(' /km', '')}</strong></div><div><span>Average HR</span><strong>{hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : '—'} <small>bpm</small></strong></div></div><div className="chart-card"><h2>Pace trend</h2><ResponsiveContainer width="100%" height={260}><LineChart data={runData}><CartesianGrid stroke="#333841" vertical={false} /><XAxis dataKey="date" tick={{ fill: '#89909b', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => formatPace(Number(value)).replace(' /km', '')} reversed tick={{ fill: '#89909b', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => [formatPace(Number(value)), 'Pace']} contentStyle={{ background: '#22252b', border: '1px solid #3a3f49', borderRadius: 10 }} /><Line type="monotone" dataKey="pace" stroke="#55cf8a" strokeWidth={3} /></LineChart></ResponsiveContainer></div><div className="chart-card"><h2>Heart-rate trend</h2><ResponsiveContainer width="100%" height={230}><LineChart data={runData}><CartesianGrid stroke="#333841" vertical={false} /><XAxis dataKey="date" tick={{ fill: '#89909b', fontSize: 11 }} axisLine={false} /><YAxis tick={{ fill: '#89909b', fontSize: 11 }} axisLine={false} /><Tooltip contentStyle={{ background: '#22252b', border: '1px solid #3a3f49', borderRadius: 10 }} /><Line type="monotone" dataKey="hr" stroke="#ff9c4d" strokeWidth={3} /></LineChart></ResponsiveContainer></div></> : <EmptyState icon={Footprints} title="No run data in this range" description="Complete an easy or interval run to see pace, distance and heart-rate trends." />}</section>}

    {section === 'frequency' && <section className="stats-section"><div className="chart-card"><h2>Completed sessions by month</h2>{frequency.length ? <ResponsiveContainer width="100%" height={280}><BarChart data={frequency}><CartesianGrid stroke="#333841" vertical={false} /><XAxis dataKey="name" tick={{ fill: '#89909b', fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fill: '#89909b', fontSize: 11 }} /><Tooltip contentStyle={{ background: '#22252b', border: '1px solid #3a3f49' }} /><Bar dataKey="completed" fill="#55cf8a" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="chart-empty">No completed workouts in this range. Pending, in-progress and skipped sessions are excluded.</div>}</div><div className="frequency-types">{Object.entries(scheduled.filter((item) => item.status === 'completed' && item.scheduledDate >= from).reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.name]: (acc[item.name] ?? 0) + 1 }), {})).map(([name, count]) => <div key={name}><span>{name}</span><strong>{count}</strong></div>)}</div></section>}

    {section === 'records' && <section className="stats-section">{prs.length ? <div className="pr-list">{prs.map((pr) => <article key={pr.id}><div className="pr-icon"><Award size={19} /></div><div><strong>{pr.exerciseName}{pr.side ? ` · ${pr.side}` : ''}</strong><span>{pr.sessionDate} · {pr.actualWeight} kg × {pr.reps}{pr.perDumbbell ? ' per dumbbell' : ''}</span></div><strong>{pr.estimated1RM.toFixed(1)}<small> kg e1RM</small></strong></article>)}</div> : <EmptyState icon={Award} title="No personal records yet" description="Estimated 1RM records appear here as your completed sets improve." />}</section>}
  </div>;
}
