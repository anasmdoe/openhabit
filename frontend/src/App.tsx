import React, { useEffect, useMemo, useState } from 'react';
import { useApp, isPhone, VIEW_ORDER } from './store';
import type { AppView } from './store';
import { TabBar } from './components/TabBar';
import { useTabSwipe } from './lib/useTabSwipe';
import { useAnyModalOpen } from './lib/modal';
import { TopBar, HabitList, ArchivedModal, CategoryBar } from './components/HabitList';
import {
  StatCards, MonthTrendPanel, MonthlyCompletionPanel, StreaksPanel, WellnessPanel, CategoryPanel,
} from './components/StatsPanels';
import { HabitEditor } from './components/HabitEditor';
import { HabitDetail } from './components/HabitDetail';
import { AuthGate, ResetPassword } from './components/Auth';
import { authApi } from './api';
import { CommandPalette } from './components/CommandPalette';
import { TodayFocus } from './components/TodayFocus';
import { InsightsPanel } from './components/InsightsPanel';
import { Celebration } from './components/Celebration';
import { GroupsModal } from './components/Groups';
import { JournalModal } from './components/Journal';
import { PauseModal } from './components/Pause';
import { Welcome } from './components/Welcome';
import { Tooltips } from './components/Tooltips';
import { Toast } from './components/Toast';
import { StatsView } from './components/StatsView';

// links from emails: /?reset=TOKEN and /?verify=TOKEN
const MAIL_PARAMS = new URLSearchParams(window.location.search);
const RESET_TOKEN = MAIL_PARAMS.get('reset');
const VERIFY_TOKEN = MAIL_PARAMS.get('verify');

export default function App() {
  const [resetToken, setResetToken] = useState(RESET_TOKEN);
  const { init, ready, editorHabit, authRequired, view, viewDir, goView, adapter } = useApp();
  const modalOpen = useAnyModalOpen();
  const editorKey = editorHabit === 'new' ? 'new' : editorHabit ? editorHabit.id : 'closed';

  useEffect(() => {
    init();
  }, []);

  // swipe sideways between the bottom-bar tabs (Groups only exists for signed-in accounts)
  const order = useMemo(() => VIEW_ORDER.filter((v) => v !== 'groups' || adapter?.mode === 'api'), [adapter]);
  useTabSwipe(ready && !authRequired, order, view, goView);

  // home-screen shortcuts (manifest "shortcuts"): /?action=new | pause
  useEffect(() => {
    if (!ready || authRequired) return;
    const action = new URLSearchParams(window.location.search).get('action');
    if (!action) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (action === 'new') useApp.getState().openEditor('new');
    if (action === 'pause') useApp.getState().setPauseOpen(true);
  }, [ready, authRequired]);

  // confirm the address when the verification link is opened
  useEffect(() => {
    if (!ready || !VERIFY_TOKEN || adapter?.mode !== 'api') return;
    window.history.replaceState(null, '', window.location.pathname);
    const { showToast } = useApp.getState();
    authApi.verifyEmail(VERIFY_TOKEN)
      .then(async () => {
        showToast('Email confirmed. Thank you!');
        if (!useApp.getState().authRequired) useApp.setState({ user: await authApi.me() });
      })
      .catch((e) => showToast(e instanceof Error ? e.message : 'Could not confirm the email'));
  }, [ready, adapter]);

  if (!ready) {
    return (
      <div className="h-full grid place-items-center">
        <span className="text-[12px] text-ink-soft animate-pulse">…</span>
      </div>
    );
  }

  if (resetToken && adapter?.mode === 'api') {
    return <><ResetPassword token={resetToken} onDone={() => { window.history.replaceState(null, '', window.location.pathname); setResetToken(null); }} /><Toast /></>;
  }
  if (authRequired) return <><AuthGate /><Toast /></>;

  // On phones the bottom tab bar picks one part of the page; wider screens show all of it.
  const show = (v: AppView) => (view === v ? (viewDir > 0 ? 'tab-in-r' : 'tab-in-l') : 'max-sm:hidden');
  const group = 'flex flex-col gap-3';

  return (
    <div className="min-h-full w-full max-w-[1800px] mx-auto">
      <main className={`app-content px-3 sm:px-4 py-2 flex flex-col gap-3 max-sm:pb-24 ${modalOpen ? 'app-blur' : ''}`}>
        <h1 className="sr-only">OpenHabit</h1>
        <TopBar />
        <div className={view === 'stats' || view === 'groups' ? 'max-sm:hidden' : ''}><CategoryBar /></div>
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
          <StatsView />
        </div>
        <div className={`${group} ${view === 'groups' ? show('groups') : 'hidden'}`}>
          <GroupsModal inline />
        </div>
      </main>
      <TabBar dimmed={modalOpen} />

      <HabitEditor key={editorKey} />
      <HabitDetail />
      <ArchivedModal />
      <CommandPalette />
      <Celebration />
      <GroupsModal />
      <JournalModal />
      <PauseModal />
      <Welcome />
      <Tooltips />
      <Toast />
    </div>
  );
}
