import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

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
    <ThemeProvider value={habitRpgTheme}>
      <Stack screenOptions={{ contentStyle: { backgroundColor: '#050711' } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Habit RPG' }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
