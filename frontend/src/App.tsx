import React, { useEffect } from 'react';
import { useApp } from './store';
import { TopBar, HabitList, ArchivedModal } from './components/HabitList';
import {
  StatCards, MonthTrendPanel, MonthlyCompletionPanel, StreaksPanel, WellnessPanel,
} from './components/StatsPanels';
import { HabitEditor } from './components/HabitEditor';
import { HabitDetail } from './components/HabitDetail';
import { AuthGate } from './components/Auth';
import { CommandPalette } from './components/CommandPalette';
import { TodayFocus } from './components/TodayFocus';
import { InsightsPanel } from './components/InsightsPanel';
import { Celebration } from './components/Celebration';
import { GroupsModal } from './components/Groups';
import { JournalModal } from './components/Journal';

export default function App() {
  const { init, ready, editorHabit, authRequired, detailOpen, archivedOpen, paletteOpen } = useApp();
  const modalOpen = editorHabit !== null || detailOpen || archivedOpen || paletteOpen;
  const editorKey = editorHabit === 'new' ? 'new' : editorHabit ? editorHabit.id : 'closed';

  useEffect(() => {
    init();
  }, []);

  if (!ready) {
    return (
      <div className="h-full grid place-items-center">
        <span className="text-[12px] text-ink-soft animate-pulse">…</span>
      </div>
    );
  }

  if (authRequired) return <AuthGate />;

  return (
    <div className="min-h-full w-full max-w-[1800px] mx-auto">
      <div className={`app-content px-3 sm:px-4 py-2 flex flex-col gap-3 ${modalOpen ? 'app-blur' : ''}`}>
        <TopBar />
        <TodayFocus />
        <div className="grid gap-3 grid-cols-2 xl:grid-cols-6">
          <StatCards />
          <div className="col-span-2 xl:col-span-2"><WellnessPanel /></div>
        </div>
        <HabitList />
        <MonthTrendPanel />
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          <MonthlyCompletionPanel />
          <StreaksPanel />
        </div>
        <InsightsPanel />
      </div>

      <HabitEditor key={editorKey} />
      <HabitDetail />
      <ArchivedModal />
      <CommandPalette />
      <Celebration />
      <GroupsModal />
      <JournalModal />
    </div>
  );
}
