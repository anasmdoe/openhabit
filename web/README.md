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

## Project Structure

```
src/
├── components/          # React UI components
│   ├── HabitCard.tsx   # Single habit display
│   ├── HabitForm.tsx   # Create/edit modal
│   └── HabitList.tsx   # Main list view
├── db/                  # Database layer (IndexedDB)
│   └── index.ts        # Dexie wrapper
├── store/              # State management
│   └── habitStore.ts   # Zustand store
├── types/              # TypeScript types
│   └── index.ts        # Data models
├── utils/              # Helper functions
│   └── index.ts        # Date, stats utilities
├── App.tsx             # Root component
├── main.tsx            # Entry point
└── index.css           # Tailwind CSS
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
- ✅ Streak tracking
- ✅ Local storage (IndexedDB)
- ✅ Responsive design
- 🚧 Calendar view (coming)
- 🚧 Statistics/graphs (coming)
- 🚧 Import from Loop Habit Tracker (coming)
- 🚧 Export/backup (coming)
- 🚧 PWA offline support (coming)

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

### Phase 1: MVP (Current)
- [x] Basic habit CRUD
- [x] Daily tracking
- [x] Local storage
- [ ] Calendar view
- [ ] Statistics

### Phase 2: Features
- [ ] Import/Export
- [ ] PWA support
- [ ] Reminders (browser notifications)
- [ ] Tags/categories

### Phase 3: Multi-platform
- [ ] Desktop app (Electron/Tauri)
- [ ] Optional cloud sync
- [ ] Mobile apps

## License

MIT License - Use freely, contribute back!

## Acknowledgments

- Inspired by [Loop Habit Tracker](https://github.com/iSoron/uhabits)
- UI inspired by [Obsidian](https://obsidian.md)
