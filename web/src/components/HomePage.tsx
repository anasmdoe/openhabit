/**
 * HomePage Component
 * 
 * Main view showing all habits with horizontal day grid.
 * Similar to Loop Habit Tracker's main screen.
 * 
 * Features:
 * - Habit rows with scrolling day checkmarks
 * - Top streaks section
 * - Quick stats
 */

import { useState, useMemo } from 'react';
import { Plus, Flame, Trophy, Target, TrendingUp } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { HabitRow } from './HabitRow';
import { HabitForm } from './HabitForm';
import { useHabitStore } from '../store/habitStore';
import { formatDate, getToday } from '../utils';
import type { Habit, Completion } from '../types';

interface HomePageProps {
  onHabitClick: (habit: Habit) => void;
}

export function HomePage({ onHabitClick }: HomePageProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | undefined>();

  const {
    habits,
    addHabit,
    updateHabit,
    toggleHabit,
    setNumericValue,
    getCompletionForHabit,
  } = useHabitStore();

  const today = getToday();
  const daysToShow = 14; // Show 2 weeks of data

  // Build completions map for each habit
  const getCompletionsForHabit = (habitId: string): Map<string, Completion> => {
    const map = new Map<string, Completion>();
    for (let i = 0; i < 60; i++) { // Load 60 days for streak calculation
      const dateStr = formatDate(subDays(new Date(), i));
      const completion = getCompletionForHabit(habitId, dateStr);
      if (completion) {
        map.set(dateStr, completion);
      }
    }
    return map;
  };

  // Calculate stats for dashboard
  const stats = useMemo(() => {
    let completedToday = 0;
    let totalHabits = habits.length;

    habits.forEach((habit) => {
      const completion = getCompletionForHabit(habit.id, today);
      const isComplete = completion && (
        habit.type === 'boolean'
          ? completion.value >= 1
          : completion.value >= habit.targetValue
      );
      if (isComplete) completedToday++;
    });

    // Calculate top streaks
    const streaks: { habit: Habit; streak: number }[] = [];
    
    habits.forEach((habit) => {
      let streak = 0;
      let foundStart = false;
      
      for (let i = 0; i < 365; i++) {
        const dateStr = formatDate(subDays(new Date(), i));
        const completion = getCompletionForHabit(habit.id, dateStr);
        const isComplete = completion && (
          habit.type === 'boolean'
            ? completion.value >= 1
            : completion.value >= habit.targetValue
        );

        if (isComplete) {
          foundStart = true;
          streak++;
        } else if (foundStart) {
          break;
        } else if (i > 1) {
          break;
        }
      }
      
      streaks.push({ habit, streak });
    });

    const topStreaks = streaks
      .filter(s => s.streak > 0)
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 3);

    return {
      completedToday,
      totalHabits,
      completionRate: totalHabits > 0 ? Math.round((completedToday / totalHabits) * 100) : 0,
      topStreaks,
    };
  }, [habits, getCompletionForHabit, today]);

  // Handle form save
  const handleSave = (habitData: Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'position'>) => {
    if (editingHabit) {
      updateHabit(editingHabit.id, habitData);
    } else {
      addHabit(habitData);
    }
    setEditingHabit(undefined);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header with date */}
      <div className="px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Habits</h1>
          <p className="text-sm text-gray-500">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingHabit(undefined);
            setIsFormOpen(true);
          }}
          className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center 
                     justify-center shadow-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Quick Stats Bar */}
      <div className="px-4 mb-4">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.completedToday}</div>
                <div className="text-xs text-white/70">of {stats.totalHabits}</div>
              </div>
              <div>
                <div className="text-sm font-medium">Today's Progress</div>
                <div className="w-32 h-2 bg-white/20 rounded-full mt-1">
                  <div 
                    className="h-full bg-white rounded-full transition-all duration-500"
                    style={{ width: `${stats.completionRate}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">{stats.completionRate}%</div>
              <div className="text-xs text-white/70">completion</div>
            </div>
          </div>
        </div>
      </div>

      {/* Day Headers (sticky) */}
      {habits.length > 0 && (
        <div className="sticky top-0 bg-gray-50 z-10 border-b border-gray-200">
          <div className="flex items-center">
            <div className="min-w-[180px] px-4 py-2">
              <span className="text-xs font-semibold text-gray-500 uppercase">Habit</span>
            </div>
            <div className="flex-1 overflow-x-auto">
              <div className="flex">
                {Array.from({ length: daysToShow }).map((_, i) => {
                  const date = subDays(new Date(), i);
                  const isToday = i === 0;
                  return (
                    <div 
                      key={i} 
                      className={`min-w-[48px] text-center py-2 ${isToday ? 'bg-indigo-50' : ''}`}
                    >
                      <div className={`text-[10px] font-medium ${isToday ? 'text-indigo-600' : 'text-gray-400'}`}>
                        {format(date, 'EEE').toUpperCase().slice(0, 2)}
                      </div>
                      <div className={`text-xs font-semibold ${isToday ? 'text-indigo-600' : 'text-gray-600'}`}>
                        {format(date, 'd')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Habit List */}
      <div className="bg-white">
        {habits.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Target className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No habits yet</h3>
            <p className="text-gray-500 mb-6">Create your first habit to start tracking</p>
            <button
              onClick={() => setIsFormOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 
                         text-white rounded-xl hover:bg-indigo-700 font-medium"
            >
              <Plus className="w-5 h-5" />
              Add Your First Habit
            </button>
          </div>
        ) : (
          habits.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              completions={getCompletionsForHabit(habit.id)}
              daysToShow={daysToShow}
              onToggle={(date) => toggleHabit(habit.id, date)}
              onIncrement={(date) => {
                const completion = getCompletionForHabit(habit.id, date);
                const current = completion?.value ?? 0;
                setNumericValue(habit.id, current + 1, date);
              }}
              onDecrement={(date) => {
                const completion = getCompletionForHabit(habit.id, date);
                const current = completion?.value ?? 0;
                setNumericValue(habit.id, Math.max(0, current - 1), date);
              }}
              onClick={() => onHabitClick(habit)}
            />
          ))
        )}
      </div>

      {/* Top Streaks Section */}
      {stats.topStreaks.length > 0 && (
        <div className="px-4 mt-6">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-yellow-500" />
              <h2 className="text-sm font-semibold text-gray-700">TOP STREAKS</h2>
            </div>
            
            <div className="space-y-3">
              {stats.topStreaks.map(({ habit, streak }, index) => (
                <button
                  key={habit.id}
                  onClick={() => onHabitClick(habit)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: habit.color }}
                  >
                    {index + 1}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-gray-900 text-sm">{habit.name}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Flame className="w-4 h-4 text-orange-500" />
                    <span className="font-bold text-gray-900">{streak}</span>
                    <span className="text-xs text-gray-500">days</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Weekly Summary */}
      {habits.length > 0 && (
        <div className="px-4 mt-4 mb-8">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <h2 className="text-sm font-semibold text-gray-700">THIS WEEK</h2>
            </div>
            
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => {
                const date = subDays(new Date(), 6 - i);
                const dateStr = formatDate(date);
                let completed = 0;
                
                habits.forEach((habit) => {
                  const completion = getCompletionForHabit(habit.id, dateStr);
                  const isComplete = completion && (
                    habit.type === 'boolean'
                      ? completion.value >= 1
                      : completion.value >= habit.targetValue
                  );
                  if (isComplete) completed++;
                });

                const rate = habits.length > 0 ? (completed / habits.length) : 0;
                const isToday = i === 6;

                return (
                  <div key={i} className="text-center">
                    <div className="text-[10px] text-gray-400 mb-1">
                      {format(date, 'EEE').slice(0, 1)}
                    </div>
                    <div 
                      className={`
                        aspect-square rounded-lg flex items-center justify-center
                        text-xs font-semibold
                        ${isToday ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}
                        ${rate === 1 ? 'bg-green-500 text-white' : 
                          rate > 0 ? 'bg-green-100 text-green-700' : 
                          'bg-gray-100 text-gray-400'}
                      `}
                    >
                      {completed}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-center text-xs text-gray-400 mt-2">
              Habits completed each day
            </p>
          </div>
        </div>
      )}

      {/* Form Modal */}
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
