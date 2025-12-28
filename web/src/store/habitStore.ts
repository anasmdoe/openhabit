/**
 * Application State Store using Zustand
 * 
 * Zustand is a simple state management library.
 * Think of it like a global Python dictionary that:
 * - Can be accessed from any component
 * - Automatically re-renders components when data changes
 * - Persists operations to the database
 * 
 * This is simpler than Redux but powerful enough for our needs.
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { startOfMonth, endOfMonth, eachDayOfInterval, format } from 'date-fns';
import type { Habit, Completion } from '../types';
import { DEFAULT_HABIT } from '../types';
import * as db from '../db';
import { getToday, getLastNDays } from '../utils';

/**
 * Define the shape of our store
 * This is like defining a Python class with its attributes and methods
 */
interface HabitStore {
  // State (data)
  habits: Habit[];
  archivedHabits: Habit[];
  completions: Map<string, Completion>; // Key: "habitId:date"
  selectedDate: string;
  isLoading: boolean;
  error: string | null;

  // Actions (methods that modify state)
  loadData: () => Promise<void>;
  loadArchivedHabits: () => Promise<void>;
  loadCompletionsForMonth: (month: Date) => Promise<void>;
  addHabit: (habit: Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'position'>) => Promise<void>;
  updateHabit: (id: string, updates: Partial<Habit>) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  restoreHabit: (id: string) => Promise<void>;
  toggleHabit: (habitId: string, date?: string) => Promise<void>;
  setNumericValue: (habitId: string, value: number, date?: string) => Promise<void>;
  setSelectedDate: (date: string) => void;
  getCompletionForHabit: (habitId: string, date?: string) => Completion | undefined;
  reorderHabits: (fromIndex: number, toIndex: number) => Promise<void>;
  exportData: () => Promise<string>;
  importData: (jsonString: string) => Promise<void>;
}

/**
 * Helper to create completion map key
 */
function completionKey(habitId: string, date: string): string {
  return `${habitId}:${date}`;
}

/**
 * Create the store
 * 
 * The 'set' function is provided by Zustand to update state.
 * The 'get' function retrieves current state.
 */
export const useHabitStore = create<HabitStore>((set, get) => ({
  // Initial state
  habits: [],
  archivedHabits: [],
  completions: new Map(),
  selectedDate: getToday(),
  isLoading: true,
  error: null,

  /**
   * Load all data from database
   * Called once when app starts
   */
  loadData: async () => {
    try {
      set({ isLoading: true, error: null });

      // Load habits
      const habits = await db.getAllHabits();

      // Load completions for last 30 days
      const dates = getLastNDays(30);
      const completionsMap = new Map<string, Completion>();

      for (const date of dates) {
        const dayCompletions = await db.getCompletionsForDate(date);
        for (const completion of dayCompletions) {
          completionsMap.set(
            completionKey(completion.habitId, completion.date),
            completion
          );
        }
      }

      set({ 
        habits, 
        completions: completionsMap, 
        isLoading: false 
      });
    } catch (error) {
      console.error('Failed to load data:', error);
      set({ 
        error: 'Failed to load data', 
        isLoading: false 
      });
    }
  },

  /**
   * Load archived habits
   * Called when viewing settings/archive page
   */
  loadArchivedHabits: async () => {
    try {
      const archivedHabits = await db.getArchivedHabits();
      set({ archivedHabits });
    } catch (error) {
      console.error('Failed to load archived habits:', error);
    }
  },

  /**
   * Load completions for a specific month
   * Called when navigating the calendar
   */
  loadCompletionsForMonth: async (month: Date) => {
    try {
      const { completions } = get();
      const newCompletions = new Map(completions);

      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

      for (const day of days) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayCompletions = await db.getCompletionsForDate(dateStr);
        
        for (const completion of dayCompletions) {
          newCompletions.set(
            completionKey(completion.habitId, completion.date),
            completion
          );
        }
      }

      set({ completions: newCompletions });
    } catch (error) {
      console.error('Failed to load month completions:', error);
    }
  },

  /**
   * Add a new habit
   */
  addHabit: async (habitData) => {
    try {
      const { habits } = get();
      const now = new Date().toISOString();

      const newHabit: Habit = {
        ...DEFAULT_HABIT,
        ...habitData,
        id: uuidv4(),
        position: habits.length, // Add to end
        createdAt: now,
        updatedAt: now,
      };

      await db.createHabit(newHabit);
      set({ habits: [...habits, newHabit] });
    } catch (error) {
      console.error('Failed to add habit:', error);
      set({ error: 'Failed to add habit' });
    }
  },

  /**
   * Update an existing habit
   */
  updateHabit: async (id, updates) => {
    try {
      await db.updateHabit(id, updates);
      
      const { habits } = get();
      
      // If archiving, remove from active habits
      if (updates.archived === true) {
        set({
          habits: habits.filter(h => h.id !== id),
        });
      } else {
        set({
          habits: habits.map(h => 
            h.id === id 
              ? { ...h, ...updates, updatedAt: new Date().toISOString() }
              : h
          ),
        });
      }
    } catch (error) {
      console.error('Failed to update habit:', error);
      set({ error: 'Failed to update habit' });
    }
  },

  /**
   * Delete a habit and all its completions
   */
  deleteHabit: async (id) => {
    try {
      await db.deleteHabit(id);
      
      const { habits, archivedHabits, completions } = get();
      
      // Remove from habits list
      const newHabits = habits.filter(h => h.id !== id);
      const newArchivedHabits = archivedHabits.filter(h => h.id !== id);
      
      // Remove completions for this habit
      const newCompletions = new Map(completions);
      for (const key of completions.keys()) {
        if (key.startsWith(`${id}:`)) {
          newCompletions.delete(key);
        }
      }

      set({ 
        habits: newHabits, 
        archivedHabits: newArchivedHabits,
        completions: newCompletions 
      });
    } catch (error) {
      console.error('Failed to delete habit:', error);
      set({ error: 'Failed to delete habit' });
    }
  },

  /**
   * Restore an archived habit
   */
  restoreHabit: async (id) => {
    try {
      await db.updateHabit(id, { archived: false });
      
      const { archivedHabits, habits } = get();
      const habitToRestore = archivedHabits.find(h => h.id === id);
      
      if (habitToRestore) {
        const restoredHabit = { 
          ...habitToRestore, 
          archived: false, 
          updatedAt: new Date().toISOString() 
        };
        
        set({
          archivedHabits: archivedHabits.filter(h => h.id !== id),
          habits: [...habits, restoredHabit],
        });
      }
    } catch (error) {
      console.error('Failed to restore habit:', error);
      set({ error: 'Failed to restore habit' });
    }
  },

  /**
   * Toggle a boolean habit (check/uncheck)
   */
  toggleHabit: async (habitId, date = getToday()) => {
    try {
      const { habits, completions } = get();
      const habit = habits.find(h => h.id === habitId);
      if (!habit) return;

      const key = completionKey(habitId, date);
      const existing = completions.get(key);
      const newCompletions = new Map(completions);

      if (existing && existing.value >= 1) {
        // Uncheck: delete the completion
        await db.deleteCompletion(habitId, date);
        newCompletions.delete(key);
      } else {
        // Check: create/update completion
        const completion: Completion = {
          id: existing?.id || uuidv4(),
          habitId,
          date,
          value: 1,
          timestamp: new Date().toISOString(),
        };
        await db.setCompletion(completion);
        newCompletions.set(key, completion);
      }

      set({ completions: newCompletions });
    } catch (error) {
      console.error('Failed to toggle habit:', error);
      set({ error: 'Failed to toggle habit' });
    }
  },

  /**
   * Set a numeric value for a habit
   */
  setNumericValue: async (habitId, value, date = getToday()) => {
    try {
      const { completions } = get();
      const key = completionKey(habitId, date);
      const existing = completions.get(key);
      const newCompletions = new Map(completions);

      if (value <= 0) {
        // Remove completion if value is 0
        await db.deleteCompletion(habitId, date);
        newCompletions.delete(key);
      } else {
        const completion: Completion = {
          id: existing?.id || uuidv4(),
          habitId,
          date,
          value,
          timestamp: new Date().toISOString(),
        };
        await db.setCompletion(completion);
        newCompletions.set(key, completion);
      }

      set({ completions: newCompletions });
    } catch (error) {
      console.error('Failed to set value:', error);
      set({ error: 'Failed to set value' });
    }
  },

  /**
   * Change the selected date for viewing
   */
  setSelectedDate: (date) => {
    set({ selectedDate: date });
  },

  /**
   * Get completion for a specific habit and date
   */
  getCompletionForHabit: (habitId, date = get().selectedDate) => {
    const { completions } = get();
    return completions.get(completionKey(habitId, date));
  },

  /**
   * Reorder habits (drag and drop)
   */
  reorderHabits: async (fromIndex, toIndex) => {
    const { habits } = get();
    const newHabits = [...habits];
    const [removed] = newHabits.splice(fromIndex, 1);
    newHabits.splice(toIndex, 0, removed);

    // Update positions
    const updatedHabits = newHabits.map((h, i) => ({
      ...h,
      position: i,
    }));

    set({ habits: updatedHabits });

    // Persist to database
    for (const habit of updatedHabits) {
      await db.updateHabit(habit.id, { position: habit.position });
    }
  },

  /**
   * Export all data as JSON string
   */
  exportData: async () => {
    try {
      // Get all habits (including archived) directly from database
      const allHabits = await db.db.habits.toArray();
      const allCompletions = await db.db.completions.toArray();

      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        app: 'OpenHabit',
        habits: allHabits,
        completions: allCompletions,
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Failed to export data:', error);
      throw new Error('Failed to export data');
    }
  },

  /**
   * Import data from JSON string
   */
  importData: async (jsonString) => {
    try {
      const data = JSON.parse(jsonString);

      // Validate structure
      if (!data.habits || !data.completions) {
        throw new Error('Invalid data format');
      }

      // Clear existing data
      await db.db.habits.clear();
      await db.db.completions.clear();

      // Import habits
      for (const habit of data.habits) {
        await db.db.habits.add(habit);
      }

      // Import completions
      for (const completion of data.completions) {
        await db.db.completions.add(completion);
      }

      // Reload data
      await get().loadData();
    } catch (error) {
      console.error('Failed to import data:', error);
      throw new Error('Failed to import data: ' + (error as Error).message);
    }
  },
}));
