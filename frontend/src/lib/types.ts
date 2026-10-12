export type HabitType = 'boolean' | 'numeric';
export type TargetType = 'at_least' | 'at_most';

export interface Habit {
  id: string;
  name: string;
  question: string;
  type: HabitType;
  unit: string;
  target: number;
  targetType: TargetType;
  color: string;
  icon: string;
  scheduleType: 'weekdays' | 'per_week';
  frequency: number; // times per week when scheduleType = per_week
  webhookUrl: string;
  reminderTime: string; // 'HH:MM' local, '' = off
  activeDays: number[]; // 0=Sun .. 6=Sat
  position: number;
  archived: boolean;
  createdAt: string;
}

export interface Entry {
  habitId: string;
  date: string; // YYYY-MM-DD
  value: number;
  notes?: string;
}

export interface WellnessDay {
  date: string;
  mood: number | null;
  sleepHours: number | null;
}

export interface DayStat {
  date: string;
  dow: number;
  scheduled: number;
  completed: number;
  pct: number | null;
  isFuture: boolean;
}

export interface HabitMonthStat {
  id: string;
  name: string;
  color: string;
  icon?: string;
  type: HabitType;
  unit: string;
  target: number;
  activeDays: number[];
  goal: number;
  actual: number;
  left: number;
  sum: number;
  pct: number;
}

export interface Overview {
  year: number;
  month: number; // 1-12
  start: string;
  end: string;
  daysInMonth: number;
  goal: number;
  completed: number;
  left: number;
  overallPct: number;
  days: DayStat[];
  weeks: { week: number; pct: number }[];
  habits: HabitMonthStat[];
  topHabits: { id: string; name: string; color: string; pct: number }[];
  wellness: WellnessDay[];
}

export interface Streak {
  start: string;
  end: string;
  length: number;
}

export interface Insights {
  span: number;
  moodImpact: {
    habitId: string; name: string; color: string; icon: string;
    avgMoodDone: number; avgMoodMissed: number; diff: number;
    nDone: number; nMissed: number;
  }[];
  sleepCompletion: { id: string; label: string; days: number; pct: number | null }[];
}

export interface HabitDetail {
  habit: Habit & { createdDate: string };
  streakUnit: 'days' | 'weeks';
  currentStreak: number;
  bestStreaks: Streak[];
  weekdayFrequency: { dow: number; pct: number }[];
  history: { month: string; completions: number; sum: number }[];
  scoreSeries: { date: string; score: number }[];
  entries: { date: string; value: number }[];
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const DAY_LETTERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];


// ---- collaboration -------------------------------------------------------
export interface Group {
  id: string;
  name: string;
  icon: string;
  inviteCode: string;
  ownerId: string;
  role: 'owner' | 'member';
  memberCount: number;
}

export interface GroupInvite {
  id: string;
  groupId: string;
  groupName: string;
  groupIcon: string;
  inviterName: string;
  createdAt: string;
}

export interface GroupMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export type StripState = 'done' | 'skip' | 'miss' | 'off';

export interface GroupDashboard {
  groupId: string;
  month: string;
  members: {
    userId: string;
    name: string;
    email: string;
    isMe: boolean;
    sharedCount: number;
    todayPct: number | null;
    monthPct: number | null;
    habits: {
      id: string; name: string; color: string; icon: string; unit: string;
      scheduleType: 'weekdays' | 'per_week'; frequency: number;
      streak: number; monthPct: number; strip: StripState[];
      reactions: { emoji: string; n: number }[];
    }[];
  }[];
  leaderboard: { userId: string; name: string; monthPct: number }[];
  milestones: {
    userId: string | null; name: string; habitId: string; habitName: string;
    color: string; icon: string; milestone: number; unit: 'days' | 'weeks'; date: string;
    group?: boolean;
  }[];
  sharedHabits: SharedHabit[];
}

export type SharedDayState = 'complete' | 'excused' | 'broken' | 'pending' | 'off';

export interface SharedHabit {
  id: string;
  name: string;
  question: string;
  icon: string;
  color: string;
  createdBy: string | null;
  streak: number;
  todayState: SharedDayState;
  strip: SharedDayState[];
  members: { userId: string; name: string; today: 'done' | 'skip' | null }[];
  myToday: 'done' | 'skip' | null;
}

export interface Reaction {
  emoji: string;
  createdAt: string;
  fromName: string;
  habitName: string;
  groupName: string;
}
