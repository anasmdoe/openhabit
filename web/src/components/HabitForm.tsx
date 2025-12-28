/**
 * HabitForm Component
 * 
 * A modal dialog for creating or editing a habit.
 * Uses React's useState hook for form state management.
 * 
 * Hooks (like useState) are special functions that let you
 * "hook into" React features. They're like instance variables
 * in a Python class.
 */

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Habit, HabitType } from '../types';
import { HABIT_COLORS, DEFAULT_HABIT } from '../types';

interface HabitFormProps {
  habit?: Habit;              // If editing, the existing habit
  isOpen: boolean;            // Whether modal is visible
  onClose: () => void;        // Called when modal should close
  onSave: (habit: Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'position'>) => void;
}

export function HabitForm({ habit, isOpen, onClose, onSave }: HabitFormProps) {
  // Form state - each field has its own state variable
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<HabitType>('boolean');
  const [color, setColor] = useState(HABIT_COLORS[8]);
  const [targetValue, setTargetValue] = useState(1);

  // Reset form when opening/closing or when habit changes
  useEffect(() => {
    if (habit) {
      // Editing: populate form with habit data
      setName(habit.name);
      setDescription(habit.description);
      setType(habit.type);
      setColor(habit.color);
      setTargetValue(habit.targetValue);
    } else {
      // Creating: reset to defaults
      setName('');
      setDescription('');
      setType('boolean');
      setColor(HABIT_COLORS[8]);
      setTargetValue(1);
    }
  }, [habit, isOpen]);

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); // Prevent page reload
    
    if (!name.trim()) return; // Require name

    onSave({
      name: name.trim(),
      description: description.trim(),
      type,
      color,
      targetValue: type === 'boolean' ? 1 : targetValue,
      frequency: DEFAULT_HABIT.frequency,
      archived: false,
    });
    onClose();
  };

  // Don't render anything if modal is closed
  if (!isOpen) return null;

  return (
    // Backdrop - dark overlay behind modal
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose} // Close when clicking backdrop
    >
      {/* Modal content - stop propagation so clicking inside doesn't close */}
      <div 
        className="bg-white rounded-2xl w-full max-w-md shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {habit ? 'Edit Habit' : 'New Habit'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Name field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Habit Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Exercise, Read, Meditate"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg 
                         focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              autoFocus
            />
          </div>

          {/* Description field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g., 30 minutes of cardio"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg
                         focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Type selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Habit Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('boolean')}
                className={`
                  flex-1 py-2 px-4 rounded-lg border-2 font-medium
                  ${type === 'boolean'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }
                `}
              >
                Yes / No
              </button>
              <button
                type="button"
                onClick={() => setType('numeric')}
                className={`
                  flex-1 py-2 px-4 rounded-lg border-2 font-medium
                  ${type === 'numeric'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }
                `}
              >
                Count
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {type === 'boolean' 
                ? 'Track whether you did it or not'
                : 'Track how many times you did it'
              }
            </p>
          </div>

          {/* Target value for numeric habits */}
          {type === 'numeric' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Daily Target
              </label>
              <input
                type="number"
                min="1"
                value={targetValue}
                onChange={e => setTargetValue(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg
                           focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                How many times per day to mark as complete
              </p>
            </div>
          )}

          {/* Color picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {HABIT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`
                    w-8 h-8 rounded-full transition-transform
                    ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}
                  `}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Submit button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full py-2.5 px-4 bg-indigo-600 text-white font-medium 
                         rounded-lg hover:bg-indigo-700 disabled:opacity-50 
                         disabled:cursor-not-allowed transition-colors"
            >
              {habit ? 'Save Changes' : 'Create Habit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
