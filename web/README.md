# 🌀 OpenHabit

A minimal, open-source habit tracker. Inspired by Loop Habit Tracker, built with modern web technologies.

**Your data, your habits, your way.**

## Philosophy

- **Minimal** - Clean, distraction-free interface
- **Flexible** - Boolean or numeric habits, customizable
- **Open** - Open source, MIT licensed
- **Vendor Independent** - No cloud lock-in
- **Data Sovereign** - All data stored locally in your browser

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173 in your browser
```

## UI Design (Loop Habit Tracker Style)

### Home Page
- **Header** with app branding and date
- **Quick stats bar** showing today's completion rate
- **Habit list** with horizontal scrolling day grid
  - Color indicator for each habit
  - Checkmarks (✓) for boolean habits
  - Numeric values for count habits
  - Last 14 days visible with horizontal scroll
- **Top Streaks** section showing best performing habits
- **Weekly Summary** showing habits completed each day

### Habit Detail Page (click on any habit)
- **Colored header** with habit name and settings
- **Overview stats**: Score %, Current Streak, Best Streak, Total
- **Score Chart**: Line graph showing weekly scores (12 weeks)
- **History Chart**: Bar graph showing monthly completions (12 months)
- **Calendar**: Monthly heatmap with clickable days
- **Best Streaks**: Current and longest streak info

## Project Structure

```
src/
├── components/
│   ├── HomePage.tsx         # Main view with habit list
│   ├── HabitRow.tsx         # Horizontal day grid row
│   ├── HabitDetailView.tsx  # Statistics & charts view
│   ├── HabitForm.tsx        # Create/edit modal
│   ├── SettingsPage.tsx     # Settings, archive, export/import
│   ├── HabitCard.tsx        # Legacy card component
│   ├── CalendarView.tsx     # Standalone calendar view
│   └── CalendarHeatmap.tsx  # Month heatmap component
├── db/
│   └── index.ts             # IndexedDB via Dexie
├── store/
│   └── habitStore.ts        # Zustand state management
├── types/
│   └── index.ts             # TypeScript interfaces
├── utils/
│   └── index.ts             # Date & calculation helpers
├── App.tsx                  # Root with navigation
└── main.tsx                 # Entry point
```

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework |
| **TypeScript** | Type safety |
| **Vite** | Build tool & dev server |
| **Tailwind CSS** | Styling |
| **Zustand** | State management |
| **Dexie** | IndexedDB wrapper |
| **Recharts** | Charts & graphs |
| **date-fns** | Date utilities |
| **Lucide React** | Icons |

## Key Concepts for Beginners

### React Components

Components are like Python functions that return HTML. They can have:
- **Props**: Input parameters (read-only)
- **State**: Internal variables (can change)
- **Hooks**: Special functions like `useState`, `useEffect`

```tsx
function Greeting({ name }) {  // 'name' is a prop
  const [count, setCount] = useState(0);  // 'count' is state
  
  return <h1>Hello {name}, clicked {count} times</h1>;
}
```

### Zustand Store

Like a global Python dictionary that:
- Can be accessed from any component
- Automatically re-renders components when data changes
- Persists operations to the database

```tsx
// Access the store in any component
const { habits, addHabit } = useHabitStore();
```

### IndexedDB (via Dexie)

Browser-based database (like SQLite). Data persists even after closing the browser.

```tsx
// Add a habit
await db.habits.add(newHabit);

// Query habits
const habits = await db.habits.where('archived').equals(0).toArray();
```

## Features

- ✅ Create boolean (yes/no) habits
- ✅ Create numeric (count) habits
- ✅ Toggle/track daily completions
- ✅ Streak tracking with 🔥 badges
- ✅ Local storage (IndexedDB)
- ✅ Responsive design
- ✅ Calendar heatmap view
- ✅ Statistics with line & bar charts
- ✅ Edit/Delete habits
- ✅ Archive/Restore habits
- ✅ Export data (JSON backup)
- ✅ Import data (restore from backup)
- 🚧 Import from Loop Habit Tracker (coming)
- 🚧 PWA offline support (coming)
- 🚧 Dark mode (coming)

## Development

### Available Scripts

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

### Adding a New Feature

1. **Types first**: Define data structures in `src/types/index.ts`
2. **Database**: Add operations in `src/db/index.ts`
3. **Store**: Add state/actions in `src/store/habitStore.ts`
4. **Components**: Build UI in `src/components/`

### Code Style

- Use TypeScript for all new code
- Use Tailwind CSS for styling
- Keep components small and focused
- Add comments explaining "why", not "what"

## Data Model

```typescript
interface Habit {
  id: string;           // UUID
  name: string;         // "Exercise"
  description: string;  // "30 min cardio"
  type: 'boolean' | 'numeric';
  color: string;        // Hex color
  targetValue: number;  // For numeric habits
  // ...
}

interface Completion {
  id: string;
  habitId: string;      // Foreign key
  date: string;         // "2025-01-15"
  value: number;        // 1 for boolean, count for numeric
}
```

## Roadmap

### Phase 1: MVP ✅
- [x] Basic habit CRUD
- [x] Daily tracking
- [x] Local storage
- [x] Calendar view
- [x] Statistics charts

### Phase 2: Features (Current)
- [x] Edit/Delete from detail view
- [x] Archive/Restore habits
- [x] Export/Import (JSON)
- [ ] Import from Loop Habit Tracker
- [ ] PWA support (offline, installable)
- [ ] Dark mode
- [ ] Reminders (browser notifications)
- [ ] Tags/categories

### Phase 3: Multi-platform
- [ ] Docker deployment
- [ ] Desktop app (Electron/Tauri)
- [ ] Optional cloud sync
- [ ] Mobile apps (React Native)

## License

MIT License - Use freely, contribute back!

## Acknowledgments

- Inspired by [Loop Habit Tracker](https://github.com/iSoron/uhabits)
- UI inspired by [Obsidian](https://obsidian.md)
