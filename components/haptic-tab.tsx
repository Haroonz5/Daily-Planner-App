import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import { StyleSheet } from 'react-native';

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      android_ripple={{ borderless: false, color: 'transparent' }}
      style={[props.style, styles.tabButton]}
      onPressIn={(ev) => {
        props.onPressIn?.(ev);

        if (process.env.EXPO_OS === 'ios') {
          requestAnimationFrame(() => {
            // Keep navigation feeling instant, then add the soft tap feedback.
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          });
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  tabButton: {
    borderRadius: 999,
    overflow: 'hidden',
  },
});
