/**
 * Core data types for OpenHabit
 * 
 * Think of these like Python dataclasses or TypedDicts.
 * They define the shape of our data.
 */

// Habit types - boolean (did you do it?) or numeric (how many times?)
export type HabitType = 'boolean' | 'numeric';

// Predefined colors for habits
export const HABIT_COLORS: string[] = [
  '#ef4444', // red
  '#f97316', // orange  
  '#f59e0b', // amber
  '#84cc16', // lime
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#ec4899', // pink
];

/**
 * Habit - the main entity
 * 
 * Similar to uhabits but simplified:
 * - Boolean habits: did you exercise today? yes/no
 * - Numeric habits: how many glasses of water? 0, 1, 2, 3...
 */
export interface Habit {
  id: string;                    // Unique identifier (UUID)
  name: string;                  // "Exercise", "Read", "Drink Water"
  description: string;           // Optional notes
  type: HabitType;               // 'boolean' or 'numeric'
  color: string;                 // Hex color code
  targetValue: number;           // For numeric: target per day. For boolean: 1
  frequency: {
    timesPerPeriod: number;      // How many times (e.g., 5)
    periodDays: number;          // Per how many days (e.g., 7 = weekly)
  };
  position: number;              // Sort order in the list
  archived: boolean;             // Hidden but not deleted
  createdAt: string;             // ISO date string
  updatedAt: string;             // ISO date string
}

/**
 * Completion - records when a habit was done
 * 
 * Each record represents one day's entry for a habit.
 * For boolean habits, value is 1 (done) or 0 (not done)
 * For numeric habits, value is the count (e.g., 3 glasses of water)
 */
export interface Completion {
  id: string;                    // Unique identifier
  habitId: string;               // Which habit this belongs to
  date: string;                  // YYYY-MM-DD format
  value: number;                 // 1 for boolean done, or numeric value
  timestamp: string;             // When this was recorded (ISO string)
}

/**
 * Streak info - calculated statistics for a habit
 */
export interface HabitStats {
  habitId: string;
  currentStreak: number;         // Current consecutive days
  longestStreak: number;         // Best streak ever
  totalCompletions: number;      // Total times completed
  completionRate: number;        // 0-100 percentage
}

/**
 * Default values for creating a new habit
 */
export const DEFAULT_HABIT: Omit<Habit, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  description: '',
  type: 'boolean',
  color: HABIT_COLORS[8], // indigo
  targetValue: 1,
  frequency: {
    timesPerPeriod: 7,    // Every day
    periodDays: 7,        // Per week
  },
  position: 0,
  archived: false,
};
