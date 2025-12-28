/**
 * HabitList Component
 * 
 * Displays the list of all habits with their completion states.
 * Uses the Zustand store to access and modify data.
 */

import { useState } from 'react';
import { Plus, Calendar, Flame } from 'lucide-react';
import { HabitCard } from './HabitCard';
import { HabitForm } from './HabitForm';
import { useHabitStore } from '../store/habitStore';
import { getToday, calculateStreak, getLastNDays } from '../utils';
import type { Habit, Completion } from '../types';

export function HabitList() {
  // Get state and actions from the store
  // This is similar to dependency injection
  const { 
    habits, 
    toggleHabit, 
    setNumericValue,
    addHabit,
    updateHabit,
    deleteHabit,
    getCompletionForHabit,
  } = useHabitStore();

  // Local state for the form modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | undefined>();

  // Calculate stats
  const today = getToday();
  const completedToday = habits.filter(h => {
    const completion = getCompletionForHabit(h.id, today);
    return completion && (h.type === 'boolean' ? completion.value >= 1 : completion.value >= h.targetValue);
  }).length;

  // Handle save from form
  const handleSave = (habitData: Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'position'>) => {
    if (editingHabit) {
      updateHabit(editingHabit.id, habitData);
    } else {
      addHabit(habitData);
    }
    setEditingHabit(undefined);
  };

  // Handle delete with confirmation
  const handleDelete = (habit: Habit) => {
    if (confirm(`Delete "${habit.name}"? This action cannot be undone.`)) {
      deleteHabit(habit.id);
    }
  };

  // Calculate streak for a habit
  const getStreak = (habitId: string): number => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return 0;
    
    const dates = getLastNDays(30);
    const habitCompletions: Completion[] = [];
    
    for (const date of dates) {
      const completion = getCompletionForHabit(habitId, date);
      if (completion) {
        habitCompletions.push(completion);
      }
    }
    
    return calculateStreak(habit, habitCompletions);
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header with stats */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 mb-6 text-white">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold mb-1">Today's Progress</h1>
            <p className="text-indigo-100">
              {completedToday} of {habits.length} habits completed
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 text-indigo-100">
              <Calendar className="w-5 h-5" />
              <span>{new Date().toLocaleDateString('en-US', { 
                weekday: 'long',
                month: 'short', 
                day: 'numeric' 
              })}</span>
            </div>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="mt-4">
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white rounded-full transition-all duration-500"
              style={{ 
                width: habits.length ? `${(completedToday / habits.length) * 100}%` : '0%' 
              }}
            />
          </div>
        </div>
      </div>

      {/* Habit list */}
      <div className="space-y-3">
        {habits.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Flame className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No habits yet</h3>
            <p className="text-gray-500 mb-4">Create your first habit to get started</p>
            <button
              onClick={() => setIsFormOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 
                         text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" />
              Add Habit
            </button>
          </div>
        ) : (
          <>
            {habits.map(habit => {
              const completion = getCompletionForHabit(habit.id, today);
              const streak = getStreak(habit.id);
              
              return (
                <div key={habit.id} className="relative">
                  {/* Streak badge */}
                  {streak > 0 && (
                    <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1 
                                    bg-orange-100 text-orange-700 text-xs font-medium 
                                    px-2 py-0.5 rounded-full">
                      <Flame className="w-3 h-3" />
                      {streak}
                    </div>
                  )}
                  <HabitCard
                    habit={habit}
                    completion={completion}
                    onToggle={() => toggleHabit(habit.id)}
                    onIncrement={() => {
                      const current = completion?.value ?? 0;
                      setNumericValue(habit.id, current + 1);
                    }}
                    onDecrement={() => {
                      const current = completion?.value ?? 0;
                      setNumericValue(habit.id, Math.max(0, current - 1));
                    }}
                    onEdit={() => {
                      setEditingHabit(habit);
                      setIsFormOpen(true);
                    }}
                    onDelete={() => handleDelete(habit)}
                  />
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Floating add button */}
      {habits.length > 0 && (
        <button
          onClick={() => {
            setEditingHabit(undefined);
            setIsFormOpen(true);
          }}
          className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white 
                     rounded-full shadow-lg hover:bg-indigo-700 hover:shadow-xl
                     flex items-center justify-center transition-all"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Form modal */}
      <HabitForm
        habit={editingHabit}
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingHabit(undefined);
        }}
        onSave={handleSave}
      />
    </div>
  );
}
