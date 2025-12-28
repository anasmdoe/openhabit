/**
 * HabitRow Component
 * 
 * Displays a habit row with horizontal scrolling day checkmarks.
 * Similar to Loop Habit Tracker's main list view.
 */

import { Check } from 'lucide-react';
import type { Habit, Completion } from '../types';
import { formatDate } from '../utils';
import { subDays, format } from 'date-fns';

interface HabitRowProps {
  habit: Habit;
  completions: Map<string, Completion>; // Key: "YYYY-MM-DD"
  daysToShow: number;
  onToggle: (date: string) => void;
  onIncrement: (date: string) => void;
  onDecrement: (date: string) => void;
  onClick: () => void; // Navigate to detail view
}

export function HabitRow({
  habit,
  completions,
  daysToShow,
  onToggle,
  onIncrement,
  onDecrement,
  onClick,
}: HabitRowProps) {
  // Generate array of dates (most recent first, then scroll right for older)
  const today = new Date();
  const dates: Date[] = [];
  for (let i = 0; i < daysToShow; i++) {
    dates.push(subDays(today, i));
  }

  const getCompletion = (date: Date): Completion | undefined => {
    return completions.get(formatDate(date));
  };

  const isCompleted = (date: Date): boolean => {
    const completion = getCompletion(date);
    if (!completion) return false;
    if (habit.type === 'boolean') {
      return completion.value >= 1;
    }
    return completion.value >= habit.targetValue;
  };

  const isPartial = (date: Date): boolean => {
    const completion = getCompletion(date);
    if (!completion || habit.type === 'boolean') return false;
    return completion.value > 0 && completion.value < habit.targetValue;
  };

  const getValue = (date: Date): number => {
    const completion = getCompletion(date);
    return completion?.value ?? 0;
  };

  return (
    <div className="flex items-center border-b border-gray-100 hover:bg-gray-50 transition-colors">
      {/* Habit name - clickable for detail view */}
      <button
        onClick={onClick}
        className="flex items-center gap-3 py-3 px-4 min-w-[180px] text-left hover:bg-gray-100 transition-colors"
      >
        {/* Color indicator */}
        <div
          className="w-1 h-10 rounded-full flex-shrink-0"
          style={{ backgroundColor: habit.color }}
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate text-sm">
            {habit.name}
          </h3>
          {habit.type === 'numeric' && (
            <p className="text-xs text-gray-400">
              Target: {habit.targetValue}
            </p>
          )}
        </div>
      </button>

      {/* Horizontal scrolling day cells */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex">
          {dates.map((date, index) => {
            const dateStr = formatDate(date);
            const completed = isCompleted(date);
            const partial = isPartial(date);
            const value = getValue(date);

            return (
              <div
                key={dateStr}
                className="flex flex-col items-center min-w-[48px] py-2"
              >
                {/* Day header - only show for first row conceptually, but we show abbreviated */}
                {index < 7 && (
                  <span className="text-[10px] text-gray-400 mb-1">
                    {format(date, 'EEE').toUpperCase().slice(0, 2)}
                  </span>
                )}

                {/* Completion cell */}
                {habit.type === 'boolean' ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(dateStr);
                    }}
                    className={`
                      w-8 h-8 rounded-md flex items-center justify-center
                      transition-all text-sm font-medium
                      ${completed
                        ? 'text-white'
                        : 'bg-gray-100 text-gray-300 hover:bg-gray-200'
                      }
                    `}
                    style={completed ? { backgroundColor: habit.color } : {}}
                  >
                    {completed ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <span className="text-gray-300">·</span>
                    )}
                  </button>
                ) : (
                  // Numeric habit cell
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (value >= habit.targetValue) {
                        // Reset if at or above target
                        onDecrement(dateStr);
                      } else {
                        onIncrement(dateStr);
                      }
                    }}
                    className={`
                      w-8 h-8 rounded-md flex items-center justify-center
                      transition-all text-xs font-semibold
                      ${completed
                        ? 'text-white'
                        : partial
                          ? 'text-white/90'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }
                    `}
                    style={
                      completed
                        ? { backgroundColor: habit.color }
                        : partial
                          ? { backgroundColor: `${habit.color}80` }
                          : {}
                    }
                  >
                    {value > 0 ? value : '·'}
                  </button>
                )}

                {/* Date number */}
                <span className="text-[10px] text-gray-400 mt-1">
                  {format(date, 'd')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
