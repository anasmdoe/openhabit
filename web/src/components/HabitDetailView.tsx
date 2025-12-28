/**
 * HabitDetailView Component
 * 
 * Shows detailed statistics for a habit when clicked.
 * Inspired by Loop Habit Tracker's detail view with:
 * - Overview stats (score, streaks)
 * - Score line chart
 * - History bar chart
 * - Calendar heatmap
 * - Best streaks
 */

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ArrowLeft,
  Flame,
  Target,
  TrendingUp,
  Calendar,
  Award,
} from 'lucide-react';
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isToday,
  isFuture,
  subMonths,
  differenceInDays,
} from 'date-fns';
import type { Habit, Completion } from '../types';
import { formatDate } from '../utils';

interface HabitDetailViewProps {
  habit: Habit;
  completions: Map<string, Completion>; // All completions for this habit
  onBack: () => void;
  onToggle: (date: string) => void;
  onSetValue: (date: string, value: number) => void;
}

export function HabitDetailView({
  habit,
  completions,
  onBack,
  onToggle,
  onSetValue,
}: HabitDetailViewProps) {
  const today = new Date();

  // Calculate overview stats
  const stats = useMemo(() => {
    const last30Days: string[] = [];
    const last7Days: string[] = [];
    
    for (let i = 0; i < 30; i++) {
      const dateStr = formatDate(subDays(today, i));
      last30Days.push(dateStr);
      if (i < 7) last7Days.push(dateStr);
    }

    let completedLast30 = 0;
    let completedLast7 = 0;
    let totalCompletions = 0;
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // Calculate completions
    for (const dateStr of last30Days) {
      const completion = completions.get(dateStr);
      const isComplete = completion && (
        habit.type === 'boolean' 
          ? completion.value >= 1 
          : completion.value >= habit.targetValue
      );
      
      if (isComplete) {
        completedLast30++;
        if (last7Days.includes(dateStr)) completedLast7++;
      }
    }

    // Count total completions
    completions.forEach((completion) => {
      const isComplete = habit.type === 'boolean'
        ? completion.value >= 1
        : completion.value >= habit.targetValue;
      if (isComplete) totalCompletions++;
    });

    // Calculate current streak (consecutive days from today/yesterday)
    let foundStart = false;
    
    for (let i = 0; i < 365; i++) {
      const dateStr = formatDate(subDays(today, i));
      const completion = completions.get(dateStr);
      const isComplete = completion && (
        habit.type === 'boolean'
          ? completion.value >= 1
          : completion.value >= habit.targetValue
      );

      if (isComplete) {
        foundStart = true;
        currentStreak++;
      } else if (foundStart) {
        break;
      } else if (i > 1) {
        // Allow grace for today not being complete yet
        break;
      }
    }

    // Calculate longest streak
    const sortedDates = Array.from(completions.keys()).sort();
    tempStreak = 0;
    
    for (let i = 0; i < sortedDates.length; i++) {
      const completion = completions.get(sortedDates[i]);
      const isComplete = completion && (
        habit.type === 'boolean'
          ? completion.value >= 1
          : completion.value >= habit.targetValue
      );

      if (isComplete) {
        tempStreak++;
        if (i > 0) {
          const prevDate = new Date(sortedDates[i - 1]);
          const currDate = new Date(sortedDates[i]);
          const diff = differenceInDays(currDate, prevDate);
          if (diff > 1) tempStreak = 1;
        }
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    const score = last30Days.length > 0 
      ? Math.round((completedLast30 / 30) * 100) 
      : 0;

    return {
      score,
      completedLast7,
      completedLast30,
      totalCompletions,
      currentStreak,
      longestStreak,
    };
  }, [habit, completions, today]);

  // Generate score chart data (last 12 weeks)
  const scoreChartData = useMemo(() => {
    const data: { week: string; score: number }[] = [];
    
    for (let w = 11; w >= 0; w--) {
      const weekEnd = subDays(today, w * 7);
      const weekStart = subDays(weekEnd, 6);
      let completed = 0;
      
      for (let d = 0; d < 7; d++) {
        const dateStr = formatDate(subDays(weekEnd, d));
        const completion = completions.get(dateStr);
        const isComplete = completion && (
          habit.type === 'boolean'
            ? completion.value >= 1
            : completion.value >= habit.targetValue
        );
        if (isComplete) completed++;
      }
      
      data.push({
        week: format(weekStart, 'MMM d'),
        score: Math.round((completed / 7) * 100),
      });
    }
    
    return data;
  }, [habit, completions, today]);

  // Generate history bar chart data (last 12 months)
  const historyChartData = useMemo(() => {
    const data: { month: string; count: number; total: number }[] = [];
    
    for (let m = 11; m >= 0; m--) {
      const monthDate = subMonths(today, m);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
      
      let completed = 0;
      const total = daysInMonth.length;
      
      for (const day of daysInMonth) {
        if (isFuture(day)) continue;
        const dateStr = formatDate(day);
        const completion = completions.get(dateStr);
        const isComplete = completion && (
          habit.type === 'boolean'
            ? completion.value >= 1
            : completion.value >= habit.targetValue
        );
        if (isComplete) completed++;
      }
      
      data.push({
        month: format(monthDate, 'MMM'),
        count: completed,
        total,
      });
    }
    
    return data;
  }, [habit, completions, today]);

  // Generate calendar data for current month
  const calendarData = useMemo(() => {
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [today]);

  const handleDayClick = (dateStr: string) => {
    if (habit.type === 'boolean') {
      onToggle(dateStr);
    } else {
      const completion = completions.get(dateStr);
      const currentValue = completion?.value ?? 0;
      const newValue = currentValue >= habit.targetValue ? 0 : currentValue + 1;
      onSetValue(dateStr, newValue);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-8">
      {/* Header */}
      <div 
        className="text-white p-4 rounded-b-3xl"
        style={{ backgroundColor: habit.color }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-white/80 hover:text-white mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        
        <h1 className="text-2xl font-bold mb-1">{habit.name}</h1>
        {habit.description && (
          <p className="text-white/80 text-sm mb-2">{habit.description}</p>
        )}
        <div className="flex items-center gap-4 text-sm text-white/70">
          <span className="flex items-center gap-1">
            <Target className="w-4 h-4" />
            {habit.type === 'boolean' ? 'Daily' : `${habit.targetValue}/day`}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {habit.frequency.timesPerPeriod}x per {habit.frequency.periodDays === 7 ? 'week' : `${habit.frequency.periodDays} days`}
          </span>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="px-4 -mt-6">
        <div className="bg-white rounded-2xl shadow-lg p-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">OVERVIEW</h2>
          
          <div className="grid grid-cols-4 gap-4 text-center">
            {/* Score */}
            <div>
              <div 
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-1"
                style={{ backgroundColor: `${habit.color}20` }}
              >
                <span 
                  className="text-lg font-bold"
                  style={{ color: habit.color }}
                >
                  {stats.score}%
                </span>
              </div>
              <p className="text-xs text-gray-500">Score</p>
            </div>
            
            {/* Current Streak */}
            <div>
              <div className="flex items-center justify-center gap-1 mb-1">
                <Flame className="w-5 h-5 text-orange-500" />
                <span className="text-xl font-bold text-gray-900">{stats.currentStreak}</span>
              </div>
              <p className="text-xs text-gray-500">Streak</p>
            </div>
            
            {/* Best Streak */}
            <div>
              <div className="flex items-center justify-center gap-1 mb-1">
                <Award className="w-5 h-5 text-yellow-500" />
                <span className="text-xl font-bold text-gray-900">{stats.longestStreak}</span>
              </div>
              <p className="text-xs text-gray-500">Best</p>
            </div>
            
            {/* Total */}
            <div>
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <span className="text-xl font-bold text-gray-900">{stats.totalCompletions}</span>
              </div>
              <p className="text-xs text-gray-500">Total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Score Chart */}
      <div className="px-4 mt-6">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500">SCORE</h2>
            <span className="text-xs text-gray-400">Last 12 weeks</span>
          </div>
          
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scoreChartData}>
                <XAxis 
                  dataKey="week" 
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip 
                  formatter={(value) => [`${value}%`, 'Score']}
                  contentStyle={{ 
                    borderRadius: '8px', 
                    border: 'none', 
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)' 
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke={habit.color}
                  strokeWidth={2}
                  dot={{ fill: habit.color, strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* History Bar Chart */}
      <div className="px-4 mt-4">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500">HISTORY</h2>
            <span className="text-xs text-gray-400">Last 12 months</span>
          </div>
          
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={historyChartData}>
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={25}
                />
                <Tooltip 
                  formatter={(value, _name, props) => [
                    `${value}/${(props.payload as any).total} days`, 
                    'Completed'
                  ]}
                  contentStyle={{ 
                    borderRadius: '8px', 
                    border: 'none', 
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)' 
                  }}
                />
                <Bar 
                  dataKey="count" 
                  fill={habit.color}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="px-4 mt-4">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500">CALENDAR</h2>
            <span className="text-xs text-gray-400">{format(today, 'MMMM yyyy')}</span>
          </div>
          
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-center text-xs font-medium text-gray-400">
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarData.map((day) => {
              const dateStr = formatDate(day);
              const isCurrentMonth = isSameMonth(day, today);
              const completion = completions.get(dateStr);
              const value = completion?.value ?? 0;
              const isComplete = completion && (
                habit.type === 'boolean'
                  ? completion.value >= 1
                  : completion.value >= habit.targetValue
              );
              const isPartial = habit.type === 'numeric' && value > 0 && value < habit.targetValue;
              const isTodayDate = isToday(day);
              const isFutureDate = isFuture(day);

              return (
                <button
                  key={dateStr}
                  onClick={() => !isFutureDate && handleDayClick(dateStr)}
                  disabled={isFutureDate}
                  className={`
                    aspect-square rounded-lg flex items-center justify-center text-xs
                    transition-all
                    ${!isCurrentMonth ? 'opacity-30' : ''}
                    ${isTodayDate ? 'ring-2 ring-offset-1 ring-indigo-500' : ''}
                    ${isFutureDate ? 'cursor-not-allowed' : 'hover:scale-110 cursor-pointer'}
                    ${isComplete ? 'text-white' : isPartial ? 'text-white' : 'text-gray-600'}
                  `}
                  style={{
                    backgroundColor: isComplete 
                      ? habit.color 
                      : isPartial 
                        ? `${habit.color}60`
                        : '#f3f4f6',
                  }}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Best Streaks */}
      <div className="px-4 mt-4">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">BEST STREAKS</h2>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${habit.color}20` }}
                >
                  <Flame className="w-4 h-4" style={{ color: habit.color }} />
                </div>
                <span className="text-sm text-gray-700">Current streak</span>
              </div>
              <span className="font-bold text-gray-900">{stats.currentStreak} days</span>
            </div>
            
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#fef3c7' }}
                >
                  <Award className="w-4 h-4 text-yellow-600" />
                </div>
                <span className="text-sm text-gray-700">Longest streak</span>
              </div>
              <span className="font-bold text-gray-900">{stats.longestStreak} days</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
