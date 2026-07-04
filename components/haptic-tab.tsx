import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';

import { playImpactHaptic } from '@/src/settings/haptic-feedback';

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        void playImpactHaptic('light');
        props.onPressIn?.(ev);
      }}
    />
  );
}
