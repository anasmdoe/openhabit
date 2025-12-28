/**
 * Main App Component
 * 
 * This is the root of the React application.
 * 
 * Navigation:
 * - Home: Shows list of habits with horizontal day grid
 * - Detail: Shows statistics for a selected habit
 */

import { useEffect, useState, useCallback } from 'react';
import { subDays } from 'date-fns';
import { HomePage, HabitDetailView } from './components';
import { useHabitStore } from './store/habitStore';
import { formatDate } from './utils';
import type { Habit, Completion } from './types';

function App() {
  // Navigation state
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);

  // Get store state and actions
  const { 
    isLoading, 
    error, 
    loadData, 
    habits,
    getCompletionForHabit,
    toggleHabit,
    setNumericValue,
  } = useHabitStore();

  // Load data when app starts
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Build completions map for detail view
  const getCompletionsMap = useCallback((habitId: string): Map<string, Completion> => {
    const map = new Map<string, Completion>();
    // Load more days for detail view (1 year)
    for (let i = 0; i < 365; i++) {
      const dateStr = formatDate(subDays(new Date(), i));
      const completion = getCompletionForHabit(habitId, dateStr);
      if (completion) {
        map.set(dateStr, completion);
      }
    }
    return map;
  }, [getCompletionForHabit]);

  // Update selected habit when habits change (e.g., after editing)
  useEffect(() => {
    if (selectedHabit) {
      const updated = habits.find(h => h.id === selectedHabit.id);
      if (updated) {
        setSelectedHabit(updated);
      } else {
        // Habit was deleted
        setSelectedHabit(null);
      }
    }
  }, [habits, selectedHabit]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent 
                          rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your habits...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-600">
          <p className="text-lg font-medium">Something went wrong</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={() => loadData()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - only show on home page */}
      {!selectedHabit && (
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🌀</span>
              <div>
                <h1 className="text-lg font-bold text-gray-900">OpenHabit</h1>
                <p className="text-xs text-gray-500">Your data, your habits, your way</p>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Main content */}
      <main>
        {selectedHabit ? (
          <HabitDetailView
            habit={selectedHabit}
            completions={getCompletionsMap(selectedHabit.id)}
            onBack={() => setSelectedHabit(null)}
            onToggle={(date) => toggleHabit(selectedHabit.id, date)}
            onSetValue={(date, value) => setNumericValue(selectedHabit.id, value, date)}
          />
        ) : (
          <HomePage onHabitClick={setSelectedHabit} />
        )}
      </main>
    </div>
  );
}

export default App;
