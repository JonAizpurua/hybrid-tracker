import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pause, Play, TimerReset, X } from 'lucide-react';
import { db } from '../data/database';
import { notifyRestFinished } from '../services/notifications';

const remainingSeconds = (targetAt?: string) => targetAt ? Math.max(0, Math.ceil((new Date(targetAt).getTime() - Date.now()) / 1000)) : 0;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function RestTimer() {
  const timer = useLiveQuery(() => db.restTimers.get('active-rest'), []);
  const [remaining, setRemaining] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!timer) return;
    const update = () => {
      const value = timer.state === 'paused' ? timer.remainingWhenPaused ?? 0 : remainingSeconds(timer.targetAt);
      setRemaining(value);
      if (value === 0 && timer.state === 'running') {
        void db.restTimers.update(timer.id, { state: 'finished', updatedAt: new Date().toISOString() });
        notifyRestFinished();
      }
    };
    update();
    const interval = window.setInterval(update, 500);
    return () => window.clearInterval(interval);
  }, [timer]);

  if (!timer) return null;
  const adjust = async (seconds: number) => {
    if (timer.state === 'paused') await db.restTimers.update(timer.id, { remainingWhenPaused: Math.max(0, (timer.remainingWhenPaused ?? 0) + seconds), updatedAt: new Date().toISOString() });
    else await db.restTimers.update(timer.id, { targetAt: new Date(Date.now() + Math.max(0, remaining + seconds) * 1000).toISOString(), state: 'running', updatedAt: new Date().toISOString() });
  };
  const togglePause = async () => {
    if (timer.state === 'paused') await db.restTimers.update(timer.id, { state: 'running', targetAt: new Date(Date.now() + (timer.remainingWhenPaused ?? 0) * 1000).toISOString(), remainingWhenPaused: undefined, updatedAt: new Date().toISOString() });
    else await db.restTimers.update(timer.id, { state: 'paused', remainingWhenPaused: remaining, targetAt: undefined, updatedAt: new Date().toISOString() });
  };
  if (!expanded) return <button className={`timer-chip ${timer.state}`} onClick={() => setExpanded(true)}><TimerReset size={18} /><span>{timer.state === 'finished' ? 'Rest finished' : clock(remaining)}</span></button>;
  return <aside className={`rest-timer ${timer.state}`} aria-label="Rest timer">
    <div className="rest-top"><span>Rest timer</span><button className="icon-button" aria-label="Minimise timer" onClick={() => setExpanded(false)}><X size={20} /></button></div>
    <strong>{timer.state === 'finished' ? 'Ready' : clock(remaining)}</strong>
    <div className="timer-controls">
      <button onClick={() => adjust(-30)}>−30 sec</button>
      <button className="timer-pause" onClick={togglePause}>{timer.state === 'paused' ? <Play size={18} /> : <Pause size={18} />}<span>{timer.state === 'paused' ? 'Resume' : 'Pause'}</span></button>
      <button onClick={() => adjust(30)}>+30 sec</button>
      <button onClick={() => db.restTimers.delete(timer.id)}>Skip</button>
    </div>
  </aside>;
}
