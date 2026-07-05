import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { router, Stack, type Href } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useSyncExternalStore } from 'react';
import 'react-native-reanimated';

import { migrateDatabase } from '@/src/database/database';
import {
  configureHabitReminderActions,
  handleHabitReminderResponse,
} from '@/src/notifications/habit-reminders';
import { syncSystemNotifications } from '@/src/notifications/system-notifications';
import {
  getRuntimeUserSettings,
  loadUserSettings,
  subscribeUserSettings,
} from '@/src/settings/user-settings';

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

async function initializeDatabase(db: SQLiteDatabase) {
  await migrateDatabase(db);
  await loadUserSettings(db);
  await configureHabitReminderActions().catch(() => undefined);
  await syncSystemNotifications(db).catch(() => ({
    permissionGranted: false,
    scheduledCount: 0,
  }));
}

function useNotificationNavigation(db: SQLiteDatabase) {
  useEffect(() => {
    if (process.env.EXPO_OS === 'web') return;

    const openNotification = (notification: Notifications.Notification) => {
      const url = notification.request.content.data?.url;
      if (
        url === '/' ||
        url === '/weekly-review' ||
        url === '/dungeon' ||
        url === '/rank-trial' ||
        url === '/class-skills'
      ) {
        router.push(url as Href);
      }
    };

    const handleResponse = async (response: Notifications.NotificationResponse) => {
      try {
        const result = await handleHabitReminderResponse(db, response);
        if (result === 'completed') {
          router.push('/');
        } else if (result === null) {
          openNotification(response.notification);
        }
      } catch {
        openNotification(response.notification);
      } finally {
        await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      }
    };

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response?.notification) return;
      return handleResponse(response);
    }).catch(() => undefined);

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleResponse(response);
    });

    return () => subscription.remove();
  }, [db]);
}

function NotificationCoordinator() {
  const db = useSQLiteContext();
  useNotificationNavigation(db);
  return null;
}

export default function RootLayout() {
  const settings = useSyncExternalStore(
    subscribeUserSettings,
    getRuntimeUserSettings,
    getRuntimeUserSettings,
  );
  const reduceMotion = settings.reduceMotionEnabled;

  return (
    <SQLiteProvider databaseName="habit-rpg.db" onInit={initializeDatabase}>
      <NotificationCoordinator />
      <ThemeProvider value={habitRpgTheme}>
        <Stack screenOptions={{ contentStyle: { backgroundColor: '#050711' } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen
            name="create-habit"
            options={{
              animation: reduceMotion ? 'none' : 'slide_from_bottom',
              headerShown: false,
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="create-boss-quest"
            options={{
              animation: reduceMotion ? 'none' : 'slide_from_bottom',
              headerShown: false,
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              animation: reduceMotion ? 'none' : 'slide_from_bottom',
              headerShown: false,
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="edit-profile"
            options={{
              animation: reduceMotion ? 'none' : 'slide_from_bottom',
              headerShown: false,
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="weekly-review"
            options={{ animation: reduceMotion ? 'none' : 'slide_from_right', headerShown: false }}
          />
          <Stack.Screen
            name="activity-history"
            options={{ animation: reduceMotion ? 'none' : 'slide_from_right', headerShown: false }}
          />
          <Stack.Screen
            name="dungeon-run"
            options={{ animation: reduceMotion ? 'none' : 'fade', gestureEnabled: false, headerShown: false }}
          />
          <Stack.Screen
            name="awakening"
            options={{ animation: reduceMotion ? 'none' : 'fade', gestureEnabled: false, headerShown: false }}
          />
          <Stack.Screen
            name="class-skills"
            options={{ animation: reduceMotion ? 'none' : 'slide_from_right', headerShown: false }}
          />
          <Stack.Screen
            name="rank-trial"
            options={{ animation: reduceMotion ? 'none' : 'slide_from_right', headerShown: false }}
          />
          <Stack.Screen
            name="stat-recalibration"
            options={{ animation: reduceMotion ? 'none' : 'slide_from_right', headerShown: false }}
          />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Habit RPG' }} />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </SQLiteProvider>
  );
}
