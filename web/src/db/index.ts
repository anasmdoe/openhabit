/**
 * Database Layer using Dexie (IndexedDB wrapper)
 * 
 * This is similar to SQLite in Python. IndexedDB is a browser database
 * that persists data locally - even after closing the browser.
 * 
 * Dexie makes IndexedDB much easier to use with a nice API.
 * Think of it like SQLAlchemy for the browser.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Habit, Completion } from '../types';

/**
 * Define our database schema
 * 
 * The '++' means auto-increment (though we use UUIDs)
 * The '&' means unique index
 * Regular fields are indexed for queries
 */
class OpenHabitDatabase extends Dexie {
  // Define tables with their types
  habits!: EntityTable<Habit, 'id'>;
  completions!: EntityTable<Completion, 'id'>;

  constructor() {
    super('openhabit');
    
    // Define schema version 1
    // This is like a database migration in Django/Flask
    this.version(1).stores({
      // Primary key is 'id', indexed fields after comma
      habits: 'id, name, position, archived, createdAt',
      // Compound index [habitId+date] for fast date range queries
      completions: 'id, habitId, date, [habitId+date]',
    });
  }
}

// Create single database instance (singleton pattern)
export const db = new OpenHabitDatabase();

/**
 * Database operations - like a repository pattern
 * These functions wrap the database calls for cleaner code
 */

// ============ Habit Operations ============

export async function getAllHabits(): Promise<Habit[]> {
  return db.habits
    .where('archived')
    .equals(0)  // false is stored as 0
    .sortBy('position');
}

export async function getHabitById(id: string): Promise<Habit | undefined> {
  return db.habits.get(id);
}

export async function createHabit(habit: Habit): Promise<string> {
  return db.habits.add(habit);
}

export async function updateHabit(id: string, updates: Partial<Habit>): Promise<void> {
  await db.habits.update(id, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteHabit(id: string): Promise<void> {
  // Use transaction to delete habit and all its completions
  await db.transaction('rw', db.habits, db.completions, async () => {
    await db.completions.where('habitId').equals(id).delete();
    await db.habits.delete(id);
  });
}

// ============ Completion Operations ============

export async function getCompletionsForDate(date: string): Promise<Completion[]> {
  return db.completions.where('date').equals(date).toArray();
}

export async function getCompletionsForHabit(
  habitId: string, 
  fromDate: string, 
  toDate: string
): Promise<Completion[]> {
  return db.completions
    .where('habitId')
    .equals(habitId)
    .and(c => c.date >= fromDate && c.date <= toDate)
    .toArray();
}

export async function getCompletionForHabitOnDate(
  habitId: string, 
  date: string
): Promise<Completion | undefined> {
  return db.completions
    .where('[habitId+date]')
    .equals([habitId, date])
    .first();
}

export async function setCompletion(completion: Completion): Promise<void> {
  // Upsert: update if exists, insert if not
  const existing = await getCompletionForHabitOnDate(completion.habitId, completion.date);
  
  if (existing) {
    await db.completions.update(existing.id, {
      value: completion.value,
      timestamp: completion.timestamp,
    });
  } else {
    await db.completions.add(completion);
  }
}

export async function deleteCompletion(habitId: string, date: string): Promise<void> {
  await db.completions
    .where('[habitId+date]')
    .equals([habitId, date])
    .delete();
}

// ============ Export/Import for Backup ============

export interface ExportData {
  version: number;
  exportedAt: string;
  habits: Habit[];
  completions: Completion[];
}

export async function exportAllData(): Promise<ExportData> {
  const [habits, completions] = await Promise.all([
    db.habits.toArray(),
    db.completions.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    habits,
    completions,
  };
}

export async function importData(data: ExportData): Promise<void> {
  await db.transaction('rw', db.habits, db.completions, async () => {
    // Clear existing data
    await db.habits.clear();
    await db.completions.clear();
    
    // Import new data
    await db.habits.bulkAdd(data.habits);
    await db.completions.bulkAdd(data.completions);
  });
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.habits, db.completions, async () => {
    await db.habits.clear();
    await db.completions.clear();
  });
}
