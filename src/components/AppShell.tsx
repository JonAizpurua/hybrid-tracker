import { BarChart3, CalendarDays, Dumbbell, Home, Scale, Settings } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { RestTimer } from './RestTimer';
import { useUIStore } from '../state/uiStore';

const links = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/workouts', label: 'Workouts', icon: CalendarDays },
  { to: '/statistics', label: 'Statistics', icon: BarChart3 },
  { to: '/weight', label: 'Weight', icon: Scale },
  { to: '/settings', label: 'Settings', icon: Settings }
];

export function AppShell() {
  const location = useLocation();
  const fullScreen = location.pathname.startsWith('/session/');
  const { toasts, removeToast } = useUIStore();
  return <div className="app-shell">
    {!fullScreen && <header className="desktop-header"><NavLink to="/" className="brand"><span className="brand-mark"><Dumbbell size={19} /></span>Hybrid Tracker</NavLink><nav>{links.map(({ to, label }) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav></header>}
    <main className={fullScreen ? 'page-full' : 'page'}><Outlet /></main>
    <RestTimer />
    {!fullScreen && <nav className="bottom-nav" aria-label="Primary navigation">{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'}><Icon size={22} /><span>{label}</span></NavLink>)}</nav>}
    <div className="toast-region" aria-live="polite">{toasts.map((toast) => <button key={toast.id} className={`toast ${toast.tone}`} onClick={() => removeToast(toast.id)}>{toast.message}</button>)}</div>
  </div>;
}
