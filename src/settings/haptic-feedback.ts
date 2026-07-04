import * as Haptics from 'expo-haptics';

import { getRuntimeUserSettings } from '@/src/settings/user-settings';

type ImpactType = 'light' | 'medium';
type NotificationType = 'success' | 'warning' | 'error';

function canPlayHaptics() {
  return process.env.EXPO_OS !== 'web' && getRuntimeUserSettings().hapticsEnabled;
}

export async function playSelectionHaptic() {
  if (!canPlayHaptics()) return;
  if (process.env.EXPO_OS === 'android') {
    await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick);
    return;
  }
  await Haptics.selectionAsync();
}

export async function playImpactHaptic(type: ImpactType) {
  if (!canPlayHaptics()) return;
  if (process.env.EXPO_OS === 'android') {
    await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click);
    return;
  }
  const style = type === 'light'
    ? Haptics.ImpactFeedbackStyle.Light
    : Haptics.ImpactFeedbackStyle.Medium;
  await Haptics.impactAsync(style);
}

export async function playNotificationHaptic(type: NotificationType) {
  if (!canPlayHaptics()) return;
  if (process.env.EXPO_OS === 'android') {
    const androidType = type === 'error'
      ? Haptics.AndroidHaptics.Reject
      : Haptics.AndroidHaptics.Confirm;
    await Haptics.performAndroidHapticsAsync(androidType);
    return;
  }
  const iosType = {
    success: Haptics.NotificationFeedbackType.Success,
    warning: Haptics.NotificationFeedbackType.Warning,
    error: Haptics.NotificationFeedbackType.Error,
  }[type];
  await Haptics.notificationAsync(iosType);
}
