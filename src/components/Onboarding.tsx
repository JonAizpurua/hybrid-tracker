import { useState } from 'react';
import { CloudUpload, Dumbbell, WifiOff } from 'lucide-react';
import { db } from '../data/database';

const screens = [
  { icon: Dumbbell, eyebrow: 'TRAIN WITH CLARITY', title: 'Strength and running, together', body: 'Track gym sets, weekly runs, progress and personal records without slowing down your session.' },
  { icon: WifiOff, eyebrow: 'LOCAL-FIRST', title: 'Fast, private and offline', body: 'Everything saves automatically on this device. Once loaded, Hybrid Tracker works without a connection.' },
  { icon: CloudUpload, eyebrow: 'YOUR DATA', title: 'Back up on your terms', body: 'Create portable local backups or connect Google Drive when you are ready. No account is required for tracking.' }
];

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const screen = screens[index];
  const finish = async () => { await db.settings.update('app-settings', { onboardingComplete: true, updatedAt: new Date().toISOString() }); onComplete(); };
  return <div className="onboarding">
    <button className="text-button onboarding-skip" onClick={finish}>Skip</button>
    <div className="onboarding-visual"><div className="visual-ring ring-one" /><div className="visual-ring ring-two" /><div className="onboarding-icon"><screen.icon size={42} /></div></div>
    <div className="onboarding-copy"><span className="eyebrow">{screen.eyebrow}</span><h1>{screen.title}</h1><p>{screen.body}</p></div>
    <div className="onboarding-footer"><div className="dots">{screens.map((_, dot) => <span key={dot} className={dot === index ? 'active' : ''} />)}</div><button className="button primary full" onClick={() => index === screens.length - 1 ? void finish() : setIndex(index + 1)}>{index === screens.length - 1 ? 'Start tracking' : 'Continue'}</button></div>
  </div>;
}
