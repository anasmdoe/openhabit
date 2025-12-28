/**
 * CalendarView Component
 * 
 * Main calendar view that shows:
 * - Month navigation (prev/next)
 * - Habit selector dropdown
 * - Calendar heatmap for the selected habit
 * - Quick stats for the month
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar, TrendingUp } from 'lucide-react';
import { CalendarHeatmap } from './CalendarHeatmap';
import { useHabitStore } from '../store/habitStore';
import type { Completion } from '../types';

export function CalendarView() {
  // Current month being viewed
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Selected habit to display
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);

  // Get data from store
  const { 
    habits, 
    getCompletionForHabit, 
    toggleHabit,
    setNumericValue,
    loadCompletionsForMonth,
  } = useHabitStore();

  // Select first habit by default when habits load
  useEffect(() => {
    if (habits.length > 0 && !selectedHabitId) {
      setSelectedHabitId(habits[0].id);
    }
  }, [habits, selectedHabitId]);

  // Load completions when month changes
  useEffect(() => {
    loadCompletionsForMonth(currentMonth);
  }, [currentMonth, loadCompletionsForMonth]);

  // Get selected habit
  const selectedHabit = useMemo(() => 
    habits.find(h => h.id === selectedHabitId),
    [habits, selectedHabitId]
  );

  // Build completions map for the selected habit
  const completionsMap = useMemo(() => {
    const map = new Map<string, Completion>();
    if (!selectedHabitId) return map;

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const completion = getCompletionForHabit(selectedHabitId, dateStr);
      if (completion) {
        map.set(dateStr, completion);
      }
    }

    return map;
  }, [selectedHabitId, currentMonth, getCompletionForHabit]);

  // Calculate month stats
  const monthStats = useMemo(() => {
    if (!selectedHabit) return { completed: 0, total: 0, rate: 0 };

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const today = new Date();
    const effectiveEnd = monthEnd > today ? today : monthEnd;
    
    const days = eachDayOfInterval({ start: monthStart, end: effectiveEnd });
    let completed = 0;

    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const completion = completionsMap.get(dateStr);
      
      if (completion) {
        if (selectedHabit.type === 'boolean' && completion.value >= 1) {
          completed++;
        } else if (selectedHabit.type === 'numeric' && completion.value >= selectedHabit.targetValue) {
          completed++;
        }
      }
    }

    const total = days.length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { completed, total, rate };
  }, [selectedHabit, currentMonth, completionsMap]);

  // Handle day click - toggle or increment
  const handleDayClick = (dateStr: string) => {
    if (!selectedHabit) return;

    if (selectedHabit.type === 'boolean') {
      toggleHabit(selectedHabit.id, dateStr);
    } else {
      // For numeric, increment by 1 (or reset if at target)
      const completion = completionsMap.get(dateStr);
      const currentValue = completion?.value ?? 0;
      const newValue = currentValue >= selectedHabit.targetValue ? 0 : currentValue + 1;
      setNumericValue(selectedHabit.id, newValue, dateStr);
    }
  };

  // Navigation handlers
  const goToPrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const goToNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const goToToday = () => setCurrentMonth(new Date());

  if (habits.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">Create some habits first to see the calendar view</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header with month navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={goToPrevMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>

        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <button
            onClick={goToToday}
            className="text-sm text-indigo-600 hover:text-indigo-700"
          >
            Today
          </button>
        </div>

        <button
          onClick={goToNextMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Habit selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Habit
        </label>
        <div className="flex gap-2 flex-wrap">
          {habits.map(habit => (
            <button
              key={habit.id}
              onClick={() => setSelectedHabitId(habit.id)}
              className={`
                px-4 py-2 rounded-full text-sm font-medium transition-all
                flex items-center gap-2
                ${selectedHabitId === habit.id
                  ? 'text-white shadow-md scale-105'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
              style={selectedHabitId === habit.id ? { backgroundColor: habit.color } : {}}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: selectedHabitId === habit.id ? 'white' : habit.color }}
              />
              {habit.name}
            </button>
          ))}
        </div>
      </div>

      {/* Month stats card */}
      {selectedHabit && (
        <div 
          className="rounded-xl p-4 mb-6 text-white"
          style={{ backgroundColor: selectedHabit.color }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">{selectedHabit.name}</h3>
              <p className="text-white/80 text-sm">
                {monthStats.completed} of {monthStats.total} days completed
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1">
                <TrendingUp className="w-5 h-5" />
                <span className="text-2xl font-bold">{monthStats.rate}%</span>
              </div>
              <p className="text-white/80 text-sm">completion rate</p>
            </div>
          </div>
        </div>
      )}

      {/* Calendar heatmap */}
      {selectedHabit && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <CalendarHeatmap
            habit={selectedHabit}
            currentMonth={currentMonth}
            completions={completionsMap}
            onDayClick={handleDayClick}
          />

          {/* Instructions */}
          <p className="text-center text-xs text-gray-400 mt-4">
            Click on a day to {selectedHabit.type === 'boolean' ? 'toggle completion' : 'increment value'}
          </p>
        </div>
      )}
    </div>
  );
}
