import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, subMonths } from 'date-fns';
import { ArrowDownRight, ArrowUpRight, Pencil, Plus, Scale, Trash2 } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../data/database';
import { uuid } from '../data/repository';
import type { WeightRecord } from '../types';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { useUIStore } from '../state/uiStore';

export function WeightPage() {
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray(), []) ?? [];
  const settings = useLiveQuery(() => db.settings.get('app-settings'), []);
  const pushToast = useUIStore((state) => state.pushToast);
  const [editing, setEditing] = useState<WeightRecord | 'new' | null>(null);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [value, setValue] = useState('');
  const current = weights.at(-1);
  const first = weights[0];
  const previous = weights.at(-2);
  const goal = settings?.goalWeightKg ?? 68;
  const chart = weights.filter((item) => item.date >= format(subMonths(new Date(), 3), 'yyyy-MM-dd')).map((item) => ({ date: item.date.slice(5), weight: item.weightKg }));
  const open = (item: WeightRecord | 'new') => { setEditing(item); setDate(item === 'new' ? format(new Date(), 'yyyy-MM-dd') : item.date); setValue(item === 'new' ? '' : item.weightKg.toString()); };
  const save = async () => {
    const weightKg = Number(value);
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) { pushToast('Enter a body weight between 30 and 300 kg.', 'error'); return; }
    const editingId = editing && editing !== 'new' ? editing.id : null;
    const duplicate = weights.find((item) => item.date === date && item.id !== editingId);
    if (duplicate) { pushToast('A weight entry already exists for this date.', 'error'); return; }
    const timestamp = new Date().toISOString();
    if (editing === 'new') await db.weights.add({ id: uuid(), date, weightKg, createdAt: timestamp, updatedAt: timestamp });
    else if (editing) await db.weights.update(editing.id, { date, weightKg, updatedAt: timestamp });
    setEditing(null); pushToast('Body weight saved.', 'success');
  };
  const delta = (from?: number, to?: number) => from != null && to != null ? to - from : null;
  const Delta = ({ amount }: { amount: number | null }) => amount == null ? <span>—</span> : <span className={amount > 0 ? 'up' : amount < 0 ? 'down' : ''}>{amount > 0 ? <ArrowUpRight size={16} /> : amount < 0 ? <ArrowDownRight size={16} /> : null}{amount > 0 ? '+' : ''}{amount.toFixed(1)} kg</span>;
  return <div>
    <header className="page-header with-action"><div><span className="eyebrow">BODY WEIGHT</span><h1>Weight</h1></div><button className="button primary compact" onClick={() => open('new')}><Plus size={18} />Log weight</button></header>
    {current ? <>
      <section className="weight-hero"><span>Current weight</span><strong>{current.weightKg.toFixed(1)}<small>kg</small></strong><p>Logged {current.date}</p><div className="weight-metrics"><div><span>From first entry</span><Delta amount={delta(first?.weightKg, current.weightKg)} /></div><div><span>From previous</span><Delta amount={delta(previous?.weightKg, current.weightKg)} /></div></div></section>
      <section className="chart-card"><div className="section-heading inline"><div><h2>Three-month trend</h2><span>{weights.length} entries total</span></div></div>{chart.length > 1 ? <ResponsiveContainer width="100%" height={240}><LineChart data={chart} margin={{ top: 12, right: 12, left: -15, bottom: 4 }}><CartesianGrid stroke="#333841" vertical={false} /><XAxis dataKey="date" tick={{ fill: '#89909b', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fill: '#89909b', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#22252b', border: '1px solid #3a3f49', borderRadius: 10 }} formatter={(amount) => [`${Number(amount).toFixed(1)} kg`, 'Weight']} /><Line type="monotone" dataKey="weight" stroke="#4d91ff" strokeWidth={3} dot={{ fill: '#4d91ff', r: 4, strokeWidth: 2, stroke: '#22252b' }} /></LineChart></ResponsiveContainer> : <div className="chart-empty">Add another entry to see your trend.</div>}</section>
      <section className="goal-card"><div><span>Goal weight</span><strong>{goal.toFixed(0)} kg</strong></div><div className="goal-track"><i style={{ width: `${Math.max(4, Math.min(100, current.weightKg <= goal ? 100 : goal / current.weightKg * 100))}%` }} /></div><p>{Math.abs(current.weightKg - goal).toFixed(1)} kg {current.weightKg > goal ? 'to goal' : current.weightKg < goal ? 'below goal' : '— goal reached'}</p></section>
      <section className="history-section"><h2>Weight history</h2><div className="history-list">{[...weights].reverse().map((item) => <article key={item.id}><div><strong>{item.weightKg.toFixed(1)} kg</strong><span>{item.date}</span></div><div><button className="icon-button small" aria-label={`Edit ${item.date}`} onClick={() => open(item)}><Pencil size={17} /></button><button className="icon-button small danger-text" aria-label={`Delete ${item.date}`} onClick={async () => { if (window.confirm(`Delete the ${item.date} weight entry?`)) { await db.weights.delete(item.id); pushToast('Weight entry deleted.'); } }}><Trash2 size={17} /></button></div></article>)}</div></section>
    </> : <EmptyState icon={Scale} title="No weight records yet" description="Log body weight when it suits you. Weekly entries are enough to see the trend." action={<button className="button primary" onClick={() => open('new')}>Log first weight</button>} />}
    {editing && <Modal title={editing === 'new' ? 'Log body weight' : 'Edit body weight'} onClose={() => setEditing(null)}><label className="field-label">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="field-label">Weight<div className="unit-input"><input autoFocus type="number" inputMode="decimal" min="30" max="300" step="0.1" value={value} onChange={(event) => setValue(event.target.value)} placeholder="72.4" /><span>kg</span></div></label><button className="button primary full" onClick={() => void save()}>Save weight</button></Modal>}
  </div>;
}
