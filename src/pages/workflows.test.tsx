import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { format, startOfWeek, addDays } from 'date-fns';
import { db } from '../data/database';
import { appRepository } from '../data/repository';
import { WorkoutsPage } from './WorkoutsPage';
import { GymSessionPage } from './GymSessionPage';

describe('critical workout workflows', () => {
  beforeEach(async () => {
    await db.open();
    await db.transaction('rw', db.tables, async () => { for (const table of db.tables) await table.clear(); });
    await appRepository.initialize();
  });

  it('requires confirmation before rescheduling onto an occupied date', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><WorkoutsPage /></MemoryRouter>);
    const actionButtons = await screen.findAllByLabelText('Actions for Push');
    await user.click(actionButtons[0]);
    const tuesday = format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 1), 'yyyy-MM-dd');
    await user.clear(screen.getByLabelText('New date'));
    await user.type(screen.getByLabelText('New date'), tuesday);
    await user.click(screen.getByRole('button', { name: 'Reschedule workout' }));
    expect(await screen.findByText('Another workout is already scheduled for this day. Schedule both workouts?')).toBeVisible();
  });

  it('asks for confirmation when finishing a workout with missing sets', async () => {
    const scheduled = (await db.scheduledWorkouts.where('kind').equals('gym').toArray())[0];
    const sessionId = await appRepository.startGymWorkout(scheduled.id);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={[`/session/${sessionId}`]}><Routes><Route path="/session/:sessionId" element={<GymSessionPage />} /><Route path="/" element={<div>Home</div>} /></Routes></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Finish workout' }));
    await user.click(screen.getByRole('button', { name: 'Complete session' }));
    expect(await screen.findByText(/This workout has .* missing prescribed set/)).toBeVisible();
  });
});
