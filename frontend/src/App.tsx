import React, { useEffect } from 'react';
import { useApp } from './store';
import type { AppView } from './store';
import { TabBar } from './components/TabBar';
import { TopBar, HabitList, ArchivedModal, CategoryBar } from './components/HabitList';
import {
  StatCards, MonthTrendPanel, MonthlyCompletionPanel, StreaksPanel, WellnessPanel, CategoryPanel,
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
import { PauseModal } from './components/Pause';
import { Welcome } from './components/Welcome';

export default function App() {
  const { init, ready, editorHabit, authRequired, detailOpen, archivedOpen, paletteOpen, pauseOpen, view } = useApp();
  const modalOpen = editorHabit !== null || detailOpen || archivedOpen || paletteOpen || pauseOpen;
  const editorKey = editorHabit === 'new' ? 'new' : editorHabit ? editorHabit.id : 'closed';

  useEffect(() => {
    init();
  }, []);

  // home-screen shortcuts (manifest "shortcuts"): /?action=new | pause
  useEffect(() => {
    if (!ready || authRequired) return;
    const action = new URLSearchParams(window.location.search).get('action');
    if (!action) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (action === 'new') useApp.getState().openEditor('new');
    if (action === 'pause') useApp.getState().setPauseOpen(true);
  }, [ready, authRequired]);

  if (!ready) {
    return (
      <div className="h-full grid place-items-center">
        <span className="text-[12px] text-ink-soft animate-pulse">…</span>
      </div>
    );
  }

  if (authRequired) return <AuthGate />;

  // On phones the bottom tab bar picks one part of the page; wider screens show all of it.
  const show = (v: AppView) => (view === v ? '' : 'max-sm:hidden');
  const group = 'flex flex-col gap-3';

  return (
    <div className="min-h-full w-full max-w-[1800px] mx-auto">
      <div className={`app-content px-3 sm:px-4 py-2 flex flex-col gap-3 max-sm:pb-24 ${modalOpen ? 'app-blur' : ''}`}>
        <TopBar />
        <div className={view === 'stats' ? 'max-sm:hidden' : ''}><CategoryBar /></div>
        <div className={`${group} ${show('today')}`}>
          <TodayFocus />
          <div className="grid gap-3 grid-cols-2 xl:grid-cols-6">
            <StatCards />
            <div className="col-span-2 xl:col-span-2"><WellnessPanel /></div>
          </div>
        </div>
        <div className={`${group} ${show('habits')}`}>
          <HabitList />
        </div>
        <div className={`${group} ${show('stats')}`}>
          <MonthTrendPanel />
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
            <MonthlyCompletionPanel />
            <StreaksPanel />
          </div>
          <CategoryPanel />
          <InsightsPanel />
        </div>
      </div>
      <TabBar />

      <HabitEditor key={editorKey} />
      <HabitDetail />
      <ArchivedModal />
      <CommandPalette />
      <Celebration />
      <GroupsModal />
      <JournalModal />
      <PauseModal />
      <Welcome />
    </div>
  );
}
