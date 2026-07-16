import { lazy, Suspense, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AppShell } from './components/AppShell';
import { Onboarding } from './components/Onboarding';
import { appRepository } from './data/repository';
import { db } from './data/database';
import { HomePage } from './pages/HomePage';
import { Modal } from './components/Modal';

const WorkoutsPage = lazy(() => import('./pages/WorkoutsPage').then((module) => ({ default: module.WorkoutsPage })));
const GymSessionPage = lazy(() => import('./pages/GymSessionPage').then((module) => ({ default: module.GymSessionPage })));
const RunPage = lazy(() => import('./pages/RunPage').then((module) => ({ default: module.RunPage })));
const StatisticsPage = lazy(() => import('./pages/StatisticsPage').then((module) => ({ default: module.StatisticsPage })));
const WeightPage = lazy(() => import('./pages/WeightPage').then((module) => ({ default: module.WeightPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));

export default function App() {
  const [ready, setReady] = useState(false);
  const [dismissOffline, setDismissOffline] = useState(false);
  const settings = useLiveQuery(() => db.settings.get('app-settings'), [ready]);
  const { offlineReady: [offlineReady, setOfflineReady], needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  useEffect(() => { appRepository.initialize().then(() => setReady(true)); }, []);
  if (!ready || settings === undefined) return <div className="splash"><div className="app-mark">HT</div><p>Preparing your training week…</p></div>;
  if (!settings.onboardingComplete) return <Onboarding onComplete={() => { setReady(false); void appRepository.initialize().then(() => setReady(true)); }} />;
  return <>
    <Suspense fallback={<div className="splash compact"><p>Loading…</p></div>}><Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="workouts" element={<WorkoutsPage />} />
        <Route path="session/:sessionId" element={<GymSessionPage />} />
        <Route path="run/:scheduledId" element={<RunPage />} />
        <Route path="statistics" element={<StatisticsPage />} />
        <Route path="weight" element={<WeightPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes></Suspense>
    {offlineReady && !dismissOffline && <div className="pwa-banner"><span>Hybrid Tracker is ready offline.</span><button onClick={() => { setDismissOffline(true); setOfflineReady(false); }}>Dismiss</button></div>}
    {needRefresh && <Modal title="Update available" onClose={() => setNeedRefresh(false)}><p>A new version of Hybrid Tracker is available.</p><div className="button-row"><button className="button secondary" onClick={() => setNeedRefresh(false)}>Later</button><button className="button primary" onClick={async () => { const active = await db.sessions.where('status').equals('in-progress').count(); if (active && !window.confirm('A workout is in progress. Update and reload now?')) return; await updateServiceWorker(true); }}>Update now</button></div></Modal>}
  </>;
}
