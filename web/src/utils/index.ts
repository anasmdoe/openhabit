/**
 * Utility functions for OpenHabit
 * 
 * These are helper functions for common operations.
 * Similar to utility modules in Python.
 */

import { format, subDays, startOfDay, differenceInDays, parseISO } from 'date-fns';
import type { Habit, Completion, HabitStats } from '../types';

/**
 * Format a date as YYYY-MM-DD (ISO date string)
 * This is our standard date format for storage
 */
export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function getToday(): string {
  return formatDate(new Date());
}

/**
 * Get an array of dates for the last N days
 * Useful for showing recent history
 */
export function getLastNDays(n: number): string[] {
  const dates: string[] = [];
  const today = startOfDay(new Date());
  
  for (let i = 0; i < n; i++) {
    dates.push(formatDate(subDays(today, i)));
  }
  
  return dates; // Most recent first
}

/**
 * Check if a habit is completed for a given date
 */
export function isHabitCompleted(
  habit: Habit, 
  completion: Completion | undefined
): boolean {
  if (!completion) return false;
  
  if (habit.type === 'boolean') {
    return completion.value >= 1;
  } else {
    return completion.value >= habit.targetValue;
  }
}

/**
 * Calculate streak for a habit based on completions
 * 
 * A streak counts consecutive days where the habit was completed.
 * Missing a day resets the streak to 0.
 */
export function calculateStreak(
  habit: Habit,
  completions: Completion[]
): number {
  if (completions.length === 0) return 0;

  // Sort by date descending (most recent first)
  const sorted = [...completions].sort((a, b) => 
    b.date.localeCompare(a.date)
  );

  const today = getToday();
  let streak = 0;
  let checkDate = today;

  // Check if today or yesterday is completed (streak can continue)
  const todayCompletion = sorted.find(c => c.date === today);
  if (!todayCompletion || !isHabitCompleted(habit, todayCompletion)) {
    // Check if yesterday was completed (grace period)
    const yesterday = formatDate(subDays(new Date(), 1));
    const yesterdayCompletion = sorted.find(c => c.date === yesterday);
    if (!yesterdayCompletion || !isHabitCompleted(habit, yesterdayCompletion)) {
      return 0; // No streak if both today and yesterday are incomplete
    }
    checkDate = yesterday;
  }

  // Count consecutive completed days
  for (const completion of sorted) {
    if (completion.date === checkDate && isHabitCompleted(habit, completion)) {
      streak++;
      checkDate = formatDate(subDays(parseISO(checkDate), 1));
    } else if (completion.date < checkDate) {
      // Gap in dates means streak is broken
      break;
    }
  }

  return streak;
}

/**
 * Calculate completion rate for a habit over a period
 */
export function calculateCompletionRate(
  habit: Habit,
  completions: Completion[],
  days: number = 30
): number {
  const dateRange = getLastNDays(days);
  let completed = 0;

  for (const date of dateRange) {
    const completion = completions.find(c => c.date === date);
    if (isHabitCompleted(habit, completion)) {
      completed++;
    }
  }

  return Math.round((completed / days) * 100);
}

/**
 * Calculate full statistics for a habit
 */
export function calculateHabitStats(
  habit: Habit,
  completions: Completion[]
): HabitStats {
  const currentStreak = calculateStreak(habit, completions);
  
  // For longest streak, we'd need to check all historical data
  // Simplified: just use current for now
  const longestStreak = currentStreak;
  
  const totalCompletions = completions.filter(c => 
    isHabitCompleted(habit, c)
  ).length;
  
  const completionRate = calculateCompletionRate(habit, completions);

  return {
    habitId: habit.id,
    currentStreak,
    longestStreak,
    totalCompletions,
    completionRate,
  };
}

/**
 * Get a greeting based on time of day
 */
export function getGreeting(): string {
  const hour = new Date().getHours();
  
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Format a date for display
 */
export function formatDisplayDate(dateStr: string): string {
  const date = parseISO(dateStr);
  const today = startOfDay(new Date());
  const diff = differenceInDays(today, startOfDay(date));

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return format(date, 'EEEE'); // Day name
  return format(date, 'MMM d'); // "Jan 5"
}
