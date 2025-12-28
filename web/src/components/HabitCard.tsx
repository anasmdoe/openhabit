/**
 * HabitCard Component
 * 
 * Displays a single habit with its completion status.
 * This is like a "widget" in other frameworks.
 * 
 * React components are functions that return JSX (HTML-like syntax).
 * Props are like function parameters - data passed from parent.
 */

import { Check, Minus, Plus, Trash2, Edit2 } from 'lucide-react';
import type { Habit, Completion } from '../types';

interface HabitCardProps {
  habit: Habit;
  completion?: Completion;
  onToggle: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function HabitCard({
  habit,
  completion,
  onToggle,
  onIncrement,
  onDecrement,
  onEdit,
  onDelete,
}: HabitCardProps) {
  const value = completion?.value ?? 0;
  const isCompleted = habit.type === 'boolean' 
    ? value >= 1 
    : value >= habit.targetValue;

  return (
    <div
      className={`
        flex items-center gap-4 p-4 rounded-xl border-2 transition-all
        ${isCompleted 
          ? 'bg-green-50 border-green-200' 
          : 'bg-white border-gray-100 hover:border-gray-200'
        }
      `}
    >
      {/* Color indicator */}
      <div
        className="w-2 h-12 rounded-full flex-shrink-0"
        style={{ backgroundColor: habit.color }}
      />

      {/* Habit info */}
      <div className="flex-1 min-w-0">
        <h3 className={`font-medium truncate ${isCompleted ? 'text-green-700' : 'text-gray-900'}`}>
          {habit.name}
        </h3>
        {habit.description && (
          <p className="text-sm text-gray-500 truncate">{habit.description}</p>
        )}
        {habit.type === 'numeric' && (
          <p className="text-xs text-gray-400 mt-1">
            Target: {habit.targetValue} per day
          </p>
        )}
      </div>

      {/* Completion controls */}
      {habit.type === 'boolean' ? (
        // Boolean: Simple checkbox
        <button
          onClick={onToggle}
          className={`
            w-10 h-10 rounded-full flex items-center justify-center
            transition-all flex-shrink-0
            ${isCompleted
              ? 'bg-green-500 text-white'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
            }
          `}
        >
          <Check className="w-5 h-5" />
        </button>
      ) : (
        // Numeric: Counter with +/- buttons
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onDecrement}
            disabled={value <= 0}
            className={`
              w-8 h-8 rounded-full flex items-center justify-center
              bg-gray-100 text-gray-600 hover:bg-gray-200
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className={`
            w-12 text-center font-semibold text-lg
            ${isCompleted ? 'text-green-600' : 'text-gray-700'}
          `}>
            {value}
          </span>
          <button
            onClick={onIncrement}
            className={`
              w-8 h-8 rounded-full flex items-center justify-center
              bg-gray-100 text-gray-600 hover:bg-gray-200
            `}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-1 flex-shrink-0">
        <button
          onClick={onEdit}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          title="Edit habit"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
          title="Delete habit"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
