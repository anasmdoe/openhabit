/**
 * SettingsPage Component
 * 
 * Settings page with:
 * - Archived habits (restore/delete)
 * - Export data (JSON backup)
 * - Import data (restore backup, import from Loop)
 */

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Archive,
  Download,
  Upload,
  Trash2,
  RotateCcw,
  FileJson,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useHabitStore } from '../store/habitStore';
import type { Habit } from '../types';

interface SettingsPageProps {
  onBack: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');

  const {
    archivedHabits,
    loadArchivedHabits,
    restoreHabit,
    deleteHabit,
    exportData,
    importData,
  } = useHabitStore();

  // Load archived habits when page mounts
  useEffect(() => {
    loadArchivedHabits();
  }, [loadArchivedHabits]);

  // Handle export
  const handleExport = async () => {
    try {
      const jsonData = await exportData();
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `openhabit-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data');
    }
  };

  // Handle import file selection
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset status
    setImportStatus('idle');
    setImportMessage('');

    try {
      const text = await file.text();
      
      // Confirm before importing
      if (!confirm('This will replace all existing data. Are you sure?')) {
        return;
      }

      await importData(text);
      setImportStatus('success');
      setImportMessage('Data imported successfully!');
    } catch (error) {
      console.error('Import failed:', error);
      setImportStatus('error');
      setImportMessage((error as Error).message || 'Failed to import data');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle restore habit
  const handleRestore = async (habit: Habit) => {
    if (confirm(`Restore "${habit.name}"?`)) {
      await restoreHabit(habit.id);
    }
  };

  // Handle delete archived habit
  const handleDelete = async (habit: Habit) => {
    if (confirm(`Permanently delete "${habit.name}"? This cannot be undone.`)) {
      await deleteHabit(habit.id);
      // Reload archived habits
      loadArchivedHabits();
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-8">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Settings</h1>
        </div>
      </header>

      {/* Data Management Section */}
      <section className="px-4 mt-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">
          Data Management
        </h2>
        
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Export */}
          <button
            onClick={handleExport}
            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 
                     transition-colors border-b border-gray-100"
          >
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Download className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-medium text-gray-900">Export Data</h3>
              <p className="text-sm text-gray-500">Download all habits and history as JSON</p>
            </div>
            <FileJson className="w-5 h-5 text-gray-400" />
          </button>

          {/* Import */}
          <button
            onClick={handleImportClick}
            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Upload className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-medium text-gray-900">Import Data</h3>
              <p className="text-sm text-gray-500">Restore from JSON backup</p>
            </div>
            <FileJson className="w-5 h-5 text-gray-400" />
          </button>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Import Status */}
        {importStatus !== 'idle' && (
          <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${
            importStatus === 'success' 
              ? 'bg-green-50 text-green-700' 
              : 'bg-red-50 text-red-700'
          }`}>
            {importStatus === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span className="text-sm">{importMessage}</span>
          </div>
        )}
      </section>

      {/* Archived Habits Section */}
      <section className="px-4 mt-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3 flex items-center gap-2">
          <Archive className="w-4 h-4" />
          Archived Habits
        </h2>
        
        {archivedHabits.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Archive className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500">No archived habits</p>
            <p className="text-sm text-gray-400 mt-1">
              Archived habits will appear here
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {archivedHabits.map((habit, index) => (
              <div
                key={habit.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  index < archivedHabits.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                {/* Color indicator */}
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: habit.color }}
                />
                
                {/* Habit info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">{habit.name}</h3>
                  <p className="text-xs text-gray-400">
                    {habit.type === 'boolean' ? 'Yes/No' : `Target: ${habit.targetValue}`}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRestore(habit)}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="Restore habit"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(habit)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete permanently"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* About Section */}
      <section className="px-4 mt-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">
          About
        </h2>
        
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">🌀</span>
            <div>
              <h3 className="font-bold text-gray-900">OpenHabit</h3>
              <p className="text-sm text-gray-500">Version 1.0.0</p>
            </div>
          </div>
          
          <p className="text-sm text-gray-600 mb-3">
            A minimal, open-source habit tracker. Your data, your habits, your way.
          </p>
          
          <div className="flex gap-2 text-xs">
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded">MIT License</span>
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded">Local-first</span>
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded">No tracking</span>
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="px-4 mt-8 mb-8">
        <h2 className="text-sm font-semibold text-red-500 uppercase mb-3">
          Danger Zone
        </h2>
        
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
          <button
            onClick={async () => {
              if (confirm('Delete ALL data? This cannot be undone!')) {
                if (confirm('Are you absolutely sure? This will delete all habits and history.')) {
                  // Clear all data
                  const dbModule = await import('../db');
                  await dbModule.db.habits.clear();
                  await dbModule.db.completions.clear();
                  window.location.reload();
                }
              }
            }}
            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-red-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-medium text-red-600">Delete All Data</h3>
              <p className="text-sm text-gray-500">Permanently delete all habits and history</p>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
