import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarButtonProps } from 'expo-router/build/react-navigation/bottom-tabs/types';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

export function HapticTab({
  pressColor,
  style,
  onPressIn,
  hoverEffect: _hoverEffect,
  ...props
}: BottomTabBarButtonProps): ReactNode {
  const compatiblePressColor = typeof pressColor === 'string' ? pressColor : undefined;

  return (
    <PlatformPressable
      {...props}
      pressColor={compatiblePressColor}
      android_ripple={{ borderless: false, color: 'transparent' }}
      style={[style, styles.tabButton]}
      onPressIn={(ev) => {
        onPressIn?.(ev);

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
