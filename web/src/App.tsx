/**
 * Main App Component
 * 
 * This is the root of the React application.
 * It loads data on startup and renders the main UI.
 */

import { useEffect } from 'react';
import { HabitList } from './components';
import { useHabitStore } from './store/habitStore';
import { getGreeting } from './utils';

function App() {
  // Get store state and actions
  const { isLoading, error, loadData } = useHabitStore();

  // Load data when app starts
  // useEffect runs code after the component renders
  // The empty [] means "only run once on mount"
  useEffect(() => {
    loadData();
  }, [loadData]);

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
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                🌀 OpenHabit
              </h1>
              <p className="text-sm text-gray-500">
                {getGreeting()}! Build better habits.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="px-4 py-6 pb-20">
        <HabitList />
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 
                         py-2 text-center text-xs text-gray-400">
        OpenHabit - Your data, your habits, your way
      </footer>
    </div>
  );
}

export default App;
