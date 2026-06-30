import type {
  HabitAttribute,
  NewHabit,
} from '@/src/database/habit-repository';

export type LifeArea = HabitAttribute;

export type StarterHabit = {
  key: string;
  area: LifeArea;
  title: string;
  description: string;
  habit: NewHabit;
};

const everyDay = [0, 1, 2, 3, 4, 5, 6];
const noReminder = {
  reminderEnabled: false,
  reminderTime: '09:00',
  reminderTone: 'gentle',
} as const;

export const lifeAreaOptions: {
  value: LifeArea;
  label: string;
  icon: 'dumbbell' | 'brain' | 'shield-check' | 'heart-pulse' | 'palette';
  color: string;
}[] = [
  { value: 'strength', label: 'Strength', icon: 'dumbbell', color: '#FF7B8A' },
  { value: 'intelligence', label: 'Mind', icon: 'brain', color: '#67D7FF' },
  { value: 'discipline', label: 'Discipline', icon: 'shield-check', color: '#B493FF' },
  { value: 'vitality', label: 'Vitality', icon: 'heart-pulse', color: '#63E0A2' },
  { value: 'creativity', label: 'Creativity', icon: 'palette', color: '#FFD166' },
];

export const starterHabits: StarterHabit[] = [
  {
    key: 'move-body',
    area: 'strength',
    title: 'Move your body',
    description: 'Complete 20 minutes of movement',
    habit: {
      ...noReminder,
      title: 'Move your body',
      description: 'Complete 20 minutes of movement',
      difficulty: 'medium',
      attribute: 'strength',
      goalType: 'single',
      targetCount: 1,
      scheduleDays: everyDay,
      isRequired: true,
    },
  },
  {
    key: 'focused-learning',
    area: 'intelligence',
    title: 'Focused learning',
    description: 'Study or read for 20 minutes',
    habit: {
      ...noReminder,
      title: 'Focused learning',
      description: 'Study or read for 20 minutes',
      difficulty: 'medium',
      attribute: 'intelligence',
      goalType: 'single',
      targetCount: 1,
      scheduleDays: everyDay,
      isRequired: true,
    },
  },
  {
    key: 'plan-the-day',
    area: 'discipline',
    title: 'Plan the day',
    description: 'Choose the three actions that matter most',
    habit: {
      ...noReminder,
      title: 'Plan the day',
      description: 'Choose the three actions that matter most',
      difficulty: 'easy',
      attribute: 'discipline',
      goalType: 'single',
      targetCount: 1,
      scheduleDays: everyDay,
      isRequired: true,
    },
  },
  {
    key: 'water-checks',
    area: 'vitality',
    title: 'Hydration checks',
    description: 'Log six glasses of water',
    habit: {
      ...noReminder,
      title: 'Hydration checks',
      description: 'Log six glasses of water',
      difficulty: 'easy',
      attribute: 'vitality',
      goalType: 'counter',
      targetCount: 6,
      scheduleDays: everyDay,
      isRequired: true,
    },
  },
  {
    key: 'make-something',
    area: 'creativity',
    title: 'Make something',
    description: 'Create without judging the result for 15 minutes',
    habit: {
      ...noReminder,
      title: 'Make something',
      description: 'Create without judging the result for 15 minutes',
      difficulty: 'medium',
      attribute: 'creativity',
      goalType: 'single',
      targetCount: 1,
      scheduleDays: everyDay,
      isRequired: true,
    },
  },
];

export const tutorialHabit: NewHabit = {
  ...noReminder,
  title: 'Tutorial: one real action',
  description: 'Complete a useful five-minute action',
  difficulty: 'easy',
  attribute: 'discipline',
  goalType: 'single',
  targetCount: 1,
  scheduleDays: everyDay,
  isRequired: false,
};
