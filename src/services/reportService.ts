import { endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '../data/database';
import { effectiveLoad, estimated1RM, formatPace, paceSecondsPerKm, setVolume } from '../domain/calculations';

type MonthlySummary = {
  month: string; completed: number; skipped: number; gymVolume: number; runCount: number; runKm: number;
  averagePace: string; averageHeartRate: number | null; weightStart: number | null; weightEnd: number | null;
  byType: Record<string, number>; byMuscle: Record<string, number>; prs: string[]; strengthChanges: string[];
};

export const aggregateMonth = async (date: Date): Promise<MonthlySummary> => {
  const from = format(startOfMonth(date), 'yyyy-MM-dd');
  const to = format(endOfMonth(date), 'yyyy-MM-dd');
  const [scheduled, sessions, sessionExercises, sets, exercises, runs, weights, prs] = await Promise.all([
    db.scheduledWorkouts.where('scheduledDate').between(from, to, true, true).toArray(),
    db.sessions.where('scheduledDate').between(from, to, true, true).toArray(),
    db.sessionExercises.toArray(), db.sets.toArray(), db.exercises.toArray(),
    db.runs.where('date').between(from, to, true, true).toArray(),
    db.weights.where('date').between(from, to, true, true).sortBy('date'),
    db.personalRecords.where('sessionDate').between(from, to, true, true).toArray()
  ]);
  const completed = scheduled.filter((item) => item.status === 'completed');
  const byType = completed.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.name]: (acc[item.name] ?? 0) + 1 }), {});
  const snapshotMap = new Map(sessionExercises.map((item) => [item.id, item]));
  const exerciseMap = new Map(exercises.map((item) => [item.id, item]));
  const sessionIds = new Set(sessions.filter((session) => session.status === 'completed').map((session) => session.id));
  const sessionDates = new Map(sessions.map((session) => [session.id, session.scheduledDate]));
  const strength = new Map<string, Array<{ date: string; value: number }>>();
  let gymVolume = 0;
  const byMuscle: Record<string, number> = {};
  sets.filter((set) => sessionIds.has(set.sessionId) && set.completed && set.reps).forEach((set) => {
    const snapshot = snapshotMap.get(set.sessionExerciseId);
    const exercise = exerciseMap.get(set.exerciseId);
    if (!snapshot || !exercise) return;
    const load = effectiveLoad(set, snapshot.loadType);
    if (load == null) return;
    const volume = setVolume(load, set.reps!, { loadType: snapshot.loadType, volumeMultiplier: snapshot.volumeMultiplier, unilateral: snapshot.unilateral });
    gymVolume += volume;
    byMuscle[exercise.muscleGroup] = (byMuscle[exercise.muscleGroup] ?? 0) + volume;
    const value = estimated1RM(load, set.reps!);
    strength.set(exercise.name, [...(strength.get(exercise.name) ?? []), { date: sessionDates.get(set.sessionId) ?? '', value }]);
  });
  const duration = runs.reduce((sum, run) => sum + run.durationSeconds, 0);
  const runKm = runs.reduce((sum, run) => sum + run.distanceKm, 0);
  const hrs = runs.filter((run) => run.averageHeartRate != null).map((run) => run.averageHeartRate!);
  return {
    month: format(date, 'MMMM yyyy'), completed: completed.length, skipped: scheduled.filter((item) => item.status === 'skipped').length,
    gymVolume, runCount: runs.length, runKm, averagePace: formatPace(paceSecondsPerKm(duration, runKm)),
    averageHeartRate: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
    weightStart: weights[0]?.weightKg ?? null, weightEnd: weights.at(-1)?.weightKg ?? null,
    byType, byMuscle, prs: prs.map((pr) => `${pr.exerciseName}${pr.side ? ` (${pr.side})` : ''}: ${pr.estimated1RM.toFixed(1)} kg`),
    strengthChanges: [...strength].map(([name, points]) => {
      const sorted = points.sort((a, b) => a.date.localeCompare(b.date));
      const first = sorted[0].value; const last = sorted.at(-1)!.value;
      return `${name}: ${last.toFixed(1)} kg (${last - first >= 0 ? '+' : ''}${(last - first).toFixed(1)} kg)`;
    }).slice(0, 10)
  };
};

const factualSummary = (current: MonthlySummary, previous: MonthlySummary) => {
  if (!current.completed && !current.runCount) return 'No completed training sessions were recorded this month.';
  const sessionDelta = current.completed - previous.completed;
  return `${current.completed} sessions were completed (${sessionDelta >= 0 ? '+' : ''}${sessionDelta} versus the previous month). ${current.runCount} runs covered ${current.runKm.toFixed(1)} km. ${current.prs.length} new estimated 1RM record${current.prs.length === 1 ? '' : 's'} were recorded.`;
};

export const generateMonthlyReport = async (date = new Date(), action: 'download' | 'preview' | 'share' = 'download') => {
  const previewWindow = action === 'preview' ? window.open('', '_blank') : null;
  const [current, previous] = await Promise.all([aggregateMonth(date), aggregateMonth(subMonths(date, 1))]);
  const doc = new jsPDF();
  doc.setFillColor(23, 25, 29); doc.rect(0, 0, 210, 36, 'F');
  doc.setTextColor(77, 145, 255); doc.setFontSize(22); doc.text('Hybrid Tracker', 14, 17);
  doc.setTextColor(235, 238, 245); doc.setFontSize(13); doc.text(current.month, 14, 28);
  doc.setTextColor(35, 38, 44); doc.setFontSize(11);
  autoTable(doc, { startY: 44, head: [['Training summary', 'This month', 'Previous month']], body: [
    ['Completed sessions', current.completed, previous.completed], ['Skipped sessions', current.skipped, previous.skipped],
    ['Total gym volume', `${Math.round(current.gymVolume).toLocaleString()} kg`, `${Math.round(previous.gymVolume).toLocaleString()} kg`],
    ['Running', `${current.runCount} / ${current.runKm.toFixed(1)} km`, `${previous.runCount} / ${previous.runKm.toFixed(1)} km`],
    ['Average pace', current.averagePace, previous.averagePace], ['Average heart rate', current.averageHeartRate ? `${current.averageHeartRate} bpm` : 'No data', previous.averageHeartRate ? `${previous.averageHeartRate} bpm` : 'No data'],
    ['Weight evolution', current.weightStart == null ? 'No data' : `${current.weightStart.toFixed(1)} → ${current.weightEnd?.toFixed(1)} kg`, previous.weightStart == null ? 'No data' : `${previous.weightStart.toFixed(1)} → ${previous.weightEnd?.toFixed(1)} kg`]
  ], theme: 'grid', headStyles: { fillColor: [46, 102, 204] } });
  autoTable(doc, { head: [['Completion by workout type', 'Sessions']], body: Object.entries(current.byType).length ? Object.entries(current.byType) : [['No completed sessions', '—']], theme: 'striped', headStyles: { fillColor: [46, 102, 204] } });
  autoTable(doc, { head: [['Volume by muscle group', 'Volume']], body: Object.entries(current.byMuscle).length ? Object.entries(current.byMuscle).map(([name, value]) => [name, `${Math.round(value).toLocaleString()} kg`]) : [['No gym volume', '—']], theme: 'striped', headStyles: { fillColor: [46, 102, 204] } });
  autoTable(doc, { head: [['New estimated 1RM records']], body: current.prs.length ? current.prs.map((item) => [item]) : [['No new PRs this month']], theme: 'striped', headStyles: { fillColor: [112, 72, 194] } });
  autoTable(doc, { head: [['Estimated 1RM changes for main exercises']], body: current.strengthChanges.length ? current.strengthChanges.map((item) => [item]) : [['Insufficient strength data for a monthly change']], theme: 'striped', headStyles: { fillColor: [46, 102, 204] } });
  const y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 230;
  doc.setFontSize(12); doc.setTextColor(35, 38, 44); doc.text('Monthly factual summary', 14, y + 12);
  doc.setFontSize(10); doc.text(doc.splitTextToSize(factualSummary(current, previous), 180), 14, y + 20);
  doc.addPage();
  doc.setTextColor(35, 38, 44); doc.setFontSize(16); doc.text('Month-to-month charts', 14, 18);
  const chart = (label: string, currentValue: number, previousValue: number, top: number, suffix: string) => {
    const maximum = Math.max(currentValue, previousValue, 1);
    doc.setFontSize(11); doc.text(label, 14, top);
    doc.setFontSize(9); doc.setTextColor(95, 102, 113); doc.text('Previous month', 14, top + 10); doc.text('This month', 14, top + 24);
    doc.setFillColor(186, 193, 204); doc.roundedRect(48, top + 5, 130 * previousValue / maximum, 7, 2, 2, 'F');
    doc.setFillColor(77, 145, 255); doc.roundedRect(48, top + 19, 130 * currentValue / maximum, 7, 2, 2, 'F');
    doc.setTextColor(35, 38, 44); doc.text(`${previousValue.toFixed(suffix === '' ? 0 : 1)}${suffix}`, 181, top + 11, { align: 'right' }); doc.text(`${currentValue.toFixed(suffix === '' ? 0 : 1)}${suffix}`, 181, top + 25, { align: 'right' });
  };
  chart('Completed sessions', current.completed, previous.completed, 34, '');
  chart('Running distance', current.runKm, previous.runKm, 83, ' km');
  chart('Gym volume', current.gymVolume, previous.gymVolume, 132, ' kg');
  const filename = `hybrid-tracker-report-${format(date, 'yyyy-MM')}.pdf`;
  const blob = doc.output('blob');
  if (action === 'share' && navigator.share && navigator.canShare?.({ files: [new File([blob], filename, { type: 'application/pdf' })] })) {
    await navigator.share({ title: `Hybrid Tracker — ${current.month}`, files: [new File([blob], filename, { type: 'application/pdf' })] });
  } else if (action === 'preview') {
    const url = URL.createObjectURL(blob);
    if (previewWindow) previewWindow.location.href = url;
    else doc.save(filename);
  }
  else doc.save(filename);
};

export const monthFromISO = (value: string) => parseISO(`${value}-01`);
