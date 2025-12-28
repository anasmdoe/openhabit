/**
 * CalendarHeatmap Component
 * 
 * Displays a month grid showing habit completions.
 * Similar to GitHub's contribution graph.
 * 
 * Each day cell is colored based on completion:
 * - Gray: No data / not completed
 * - Light color: Partially completed (numeric habits)
 * - Full color: Completed
 */

import { 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  isFuture,
} from 'date-fns';
import type { Habit, Completion } from '../types';

interface CalendarHeatmapProps {
  habit: Habit;
  currentMonth: Date;
  completions: Map<string, Completion>;  // Key: "YYYY-MM-DD"
  onDayClick: (date: string) => void;
}

export function CalendarHeatmap({ 
  habit, 
  currentMonth, 
  completions,
  onDayClick,
}: CalendarHeatmapProps) {
  // Calculate the grid range
  // We need to include days from prev/next month to fill the week rows
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  // Get all days to display
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Day names header
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /**
   * Calculate the intensity of a completion (0-1)
   * For boolean: 0 or 1
   * For numeric: value / target (capped at 1)
   */
  const getIntensity = (date: string): number => {
    const completion = completions.get(date);
    if (!completion) return 0;

    if (habit.type === 'boolean') {
      return completion.value >= 1 ? 1 : 0;
    } else {
      return Math.min(completion.value / habit.targetValue, 1);
    }
  };

  /**
   * Get background color based on intensity
   * Uses the habit's color with varying opacity
   */
  const getBackgroundColor = (intensity: number, isCurrentMonth: boolean): string => {
    if (!isCurrentMonth) {
      return intensity > 0 ? `${habit.color}20` : 'transparent';
    }
    if (intensity === 0) return '#f3f4f6'; // gray-100
    if (intensity < 0.5) return `${habit.color}40`; // 25% opacity
    if (intensity < 1) return `${habit.color}80`; // 50% opacity
    return habit.color; // full color
  };

  return (
    <div className="select-none">
      {/* Day names header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map(name => (
          <div 
            key={name} 
            className="text-center text-xs font-medium text-gray-500 py-1"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const intensity = getIntensity(dateStr);
          const bgColor = getBackgroundColor(intensity, isCurrentMonth);
          const completion = completions.get(dateStr);
          const isTodayDate = isToday(day);
          const isFutureDate = isFuture(day);

          return (
            <button
              key={dateStr}
              onClick={() => !isFutureDate && onDayClick(dateStr)}
              disabled={isFutureDate}
              className={`
                aspect-square rounded-lg flex flex-col items-center justify-center
                text-sm transition-all relative
                ${isCurrentMonth ? 'font-medium' : 'text-gray-300'}
                ${isTodayDate ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}
                ${isFutureDate ? 'cursor-not-allowed opacity-50' : 'hover:scale-110 cursor-pointer'}
                ${intensity === 1 && isCurrentMonth ? 'text-white' : ''}
              `}
              style={{ backgroundColor: bgColor }}
              title={completion 
                ? `${format(day, 'MMM d')}: ${completion.value}${habit.type === 'numeric' ? `/${habit.targetValue}` : ''}`
                : format(day, 'MMM d')
              }
            >
              <span className={isCurrentMonth ? '' : 'opacity-40'}>
                {format(day, 'd')}
              </span>
              
              {/* Show value for numeric habits */}
              {habit.type === 'numeric' && completion && completion.value > 0 && isCurrentMonth && (
                <span className={`text-[10px] ${intensity === 1 ? 'text-white/80' : 'text-gray-500'}`}>
                  {completion.value}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-2 mt-4 text-xs text-gray-500">
        <span>Less</span>
        <div className="flex gap-1">
          {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
            <div
              key={i}
              className="w-4 h-4 rounded"
              style={{ 
                backgroundColor: intensity === 0 
                  ? '#f3f4f6' 
                  : `${habit.color}${Math.round(intensity * 255).toString(16).padStart(2, '0')}`
              }}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
