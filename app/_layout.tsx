import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { migrateDatabase } from '@/src/database/database';

const habitRpgTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#6DDEFF',
    background: '#050711',
    card: '#090C18',
    border: '#20253B',
    text: '#F1EFFF',
  },
};

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="habit-rpg.db" onInit={migrateDatabase}>
      <ThemeProvider value={habitRpgTheme}>
        <Stack screenOptions={{ contentStyle: { backgroundColor: '#050711' } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="create-habit"
            options={{ animation: 'slide_from_bottom', headerShown: false, presentation: 'modal' }}
          />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Habit RPG' }} />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </SQLiteProvider>
  );
}
