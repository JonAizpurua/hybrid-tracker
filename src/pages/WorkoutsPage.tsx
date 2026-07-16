import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns';
import { Archive, CalendarDays, ChevronLeft, ChevronRight, Dumbbell, MoreHorizontal, Pencil, Play, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../data/database';
import { appRepository } from '../data/repository';
import type { ScheduledWorkout } from '../types';
import { StatusPill } from '../components/StatusPill';
import { Modal } from '../components/Modal';
import { useUIStore } from '../state/uiStore';

type Tab = 'week' | 'calendar' | 'templates' | 'exercises';

export function WorkoutsPage() {
  const [tab, setTab] = useState<Tab>('week');
  const [weekDate, setWeekDate] = useState(new Date());
  const [monthDate, setMonthDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [actionWorkout, setActionWorkout] = useState<ScheduledWorkout | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [collision, setCollision] = useState(false);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const navigate = useNavigate();
  const pushToast = useUIStore((state) => state.pushToast);
  const workouts = useLiveQuery(() => db.scheduledWorkouts.toArray(), []) ?? [];
  const routines = useLiveQuery(() => db.routines.toArray(), []) ?? [];
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? [];
  const routineExercises = useLiveQuery(() => db.routineExercises.toArray(), []) ?? [];

  const weekStart = startOfWeek(weekDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekDate, { weekStartsOn: 1 }) });
  const calendarStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const selectedWorkouts = selectedDate ? workouts.filter((item) => item.scheduledDate === selectedDate) : [];
  const filteredExercises = exercises.filter((item) => (showArchived || !item.archived) && item.name.toLowerCase().includes(query.toLowerCase()));

  const openWorkout = async (workout: ScheduledWorkout) => {
    if (workout.kind === 'gym') navigate(`/session/${workout.sessionId ?? await appRepository.startGymWorkout(workout.id)}`);
    else navigate(`/run/${workout.id}`);
  };
  const attemptReschedule = async (confirmCollision = false) => {
    if (!actionWorkout || !rescheduleDate) return;
    const occupied = workouts.some((item) => item.id !== actionWorkout.id && item.scheduledDate === rescheduleDate);
    if (occupied && !confirmCollision) { setCollision(true); return; }
    await appRepository.reschedule(actionWorkout.id, rescheduleDate);
    setActionWorkout(null); setCollision(false); setRescheduleDate(''); pushToast('Workout rescheduled.', 'success');
  };

  return <div>
    <header className="page-header"><div><span className="eyebrow">PLAN AND REVIEW</span><h1>Workouts</h1></div></header>
    <div className="segmented-tabs four" role="tablist">{(['week', 'calendar', 'templates', 'exercises'] as Tab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'week' ? 'Week' : item === 'calendar' ? 'Calendar' : item === 'templates' ? 'Routines' : 'Exercises'}</button>)}</div>

    {tab === 'week' && <section className="workout-view">
      <div className="date-navigator"><button className="icon-button" aria-label="Previous week" onClick={() => setWeekDate(subWeeks(weekDate, 1))}><ChevronLeft /></button><div><strong>{format(weekStart, 'd MMM')} – {format(addDays(weekStart, 6), 'd MMM')}</strong><span>{format(weekStart, 'yyyy')}</span></div><button className="icon-button" aria-label="Next week" onClick={() => setWeekDate(addWeeks(weekDate, 1))}><ChevronRight /></button></div>
      <div className="week-list">{weekDays.map((day) => { const key = format(day, 'yyyy-MM-dd'); const items = workouts.filter((item) => item.scheduledDate === key); const isToday = key === format(new Date(), 'yyyy-MM-dd'); return <div className={`week-day ${isToday ? 'today' : ''}`} key={key}><div className="day-label"><span>{format(day, 'EEE')}</span><strong>{format(day, 'd')}</strong></div><div className="day-workouts">{items.length ? items.map((workout) => <article className={`schedule-card status-${workout.status}`} key={workout.id} onClick={() => void openWorkout(workout)}><div><span>{workout.kind === 'gym' ? 'Gym' : 'Run'}</span><strong>{workout.name}</strong><StatusPill status={workout.status} /></div><button className="icon-button small" aria-label={`Actions for ${workout.name}`} onClick={(event) => { event.stopPropagation(); setActionWorkout(workout); setRescheduleDate(workout.scheduledDate); }}><MoreHorizontal size={20} /></button></article>) : <span className="rest-day">No scheduled workout</span>}</div></div>; })}</div>
      <button className="today-link" onClick={() => setWeekDate(new Date())}>Return to this week</button>
    </section>}

    {tab === 'calendar' && <section className="workout-view">
      <div className="date-navigator"><button className="icon-button" aria-label="Previous month" onClick={() => setMonthDate(subMonths(monthDate, 1))}><ChevronLeft /></button><strong>{format(monthDate, 'MMMM yyyy')}</strong><button className="icon-button" aria-label="Next month" onClick={() => setMonthDate(addMonths(monthDate, 1))}><ChevronRight /></button></div>
      <div className="calendar"><div className="calendar-weekdays">{['M','T','W','T','F','S','S'].map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div><div className="calendar-grid">{calendarDays.map((day) => { const key = format(day, 'yyyy-MM-dd'); const items = workouts.filter((item) => item.scheduledDate === key); return <button key={key} className={`${!isSameMonth(day, monthDate) ? 'outside' : ''} ${selectedDate === key ? 'selected' : ''} ${key === format(new Date(), 'yyyy-MM-dd') ? 'today' : ''}`} onClick={() => setSelectedDate(key)}><span>{format(day, 'd')}</span><div className="calendar-dots">{items.map((item) => <i key={item.id} className={item.status} />)}</div></button>; })}</div></div>
      {selectedDate && <div className="date-detail"><h2>{format(parseISO(selectedDate), 'EEEE, d MMMM')}</h2>{selectedWorkouts.length ? selectedWorkouts.map((workout) => <button key={workout.id} className="date-workout" onClick={() => void openWorkout(workout)}><span className={`status-bar ${workout.status}`} /><span><strong>{workout.name}</strong><small>{workout.kind === 'gym' ? 'Gym session' : 'Running session'}</small></span><StatusPill status={workout.status} /><ChevronRight size={18} /></button>) : <p>No workouts scheduled for this date.</p>}</div>}
    </section>}

    {tab === 'templates' && <section className="workout-view cards-list"><div className="section-intro"><h2>Workout routines</h2><p>Edits affect future sessions only. Your history keeps its original snapshot.</p></div>{routines.map((routine) => <article className="routine-card" key={routine.id}><div className={`routine-icon ${routine.kind}`}><Dumbbell size={20} /></div><div><strong>{routine.name}</strong><span>{routine.kind === 'gym' ? `${routineExercises.filter((item) => item.routineId === routine.id).length} exercises` : routine.kind === 'easy-run' ? '8–10 km · HR 148–156' : '6 × 2 min · Block 1'}</span></div><button className="icon-button" aria-label={`Edit ${routine.name}`} onClick={() => navigate('/settings')}><Pencil size={18} /></button></article>)}</section>}

    {tab === 'exercises' && <section className="workout-view"><label className="search-field"><Search size={18} /><input aria-label="Search exercises" placeholder="Search exercise library" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="exercise-list">{filteredExercises.map((item) => <article key={item.id}><div><strong>{item.name}</strong><span>{item.muscleGroup} · {item.equipment}{item.archived ? ' · Archived' : ''}</span></div><small>{item.defaultSets} × {item.minReps}–{item.maxReps}</small></article>)}</div>{exercises.some((item) => item.archived) && <button className="text-button archived-link" onClick={() => setShowArchived(!showArchived)}><Archive size={16} />{showArchived ? 'Hide archived exercises' : `Archived exercises (${exercises.filter((item) => item.archived).length})`}</button>}</section>}

    {actionWorkout && <Modal title={actionWorkout.name} onClose={() => { setActionWorkout(null); setCollision(false); }}><div className="action-list"><button onClick={() => void openWorkout(actionWorkout)}><Play size={19} />{actionWorkout.sessionId ? 'Open workout' : 'Start workout'}</button><button onClick={async () => { await appRepository.skipScheduled(actionWorkout.id); setActionWorkout(null); pushToast('Workout marked as skipped.'); }}><CalendarDays size={19} />Skip workout</button></div><div className="form-divider" /><label className="field-label">New date<input type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} /></label><button className="button primary full" onClick={() => void attemptReschedule()}>Reschedule workout</button>{collision && <div className="inline-confirm"><strong>Another workout is already scheduled for this day. Schedule both workouts?</strong><div className="button-row"><button className="button secondary" onClick={() => setCollision(false)}>Cancel</button><button className="button primary" onClick={() => void attemptReschedule(true)}>Schedule both</button></div></div>}</Modal>}
  </div>;
}
