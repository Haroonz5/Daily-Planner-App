import { Tabs } from "expo-router";
import React, { type ComponentProps } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { useAppTheme } from "@/constants/appTheme";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";

type DockIconName = ComponentProps<typeof IconSymbol>["name"];

export default function TabLayout() {
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];
  const renderDockIcon = (
    name: DockIconName,
    focused: boolean,
    color: string
  ) => (
    <View
      style={[
        styles.dockItem,
        focused && styles.dockItemFocused,
        focused && {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: colors.tint,
        },
      ]}
    >
      {focused ? (
        <View
          style={[
            styles.dockActiveGlow,
            { backgroundColor: colors.tint },
          ]}
        />
      ) : null}
      <View
        style={[
          styles.dockIconShell,
          !focused && { backgroundColor: colors.surface },
          focused && { backgroundColor: colors.tint },
        ]}
      >
        <IconSymbol
          size={focused ? 18 : 20}
          name={name}
          color={focused ? colors.background : color}
        />
      </View>
    </View>
  );

  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        lazy: false,
        freezeOnBlur: true,
        animation: "fade",
        transitionSpec: {
          animation: "timing",
          config: {
            duration: 140,
          },
        },
        sceneStyle: {
          backgroundColor: colors.background,
        },
        tabBarHideOnKeyboard: true,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: colors.tabIconSelected,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarShowLabel: false,
        tabBarItemStyle: {
          borderRadius: 999,
          marginHorizontal: 0,
          marginVertical: 0,
          padding: 0,
          alignItems: "center",
          justifyContent: "center",
        },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 36,
          height: Platform.OS === "ios" ? 84 : 76,
          marginHorizontal: 18,
          marginBottom: Platform.OS === "ios" ? 14 : 12,
          paddingTop: 8,
          paddingHorizontal: 10,
          paddingBottom: Platform.OS === "ios" ? 16 : 8,
          position: "absolute",
          shadowColor: colors.tint,
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.14,
          shadowRadius: 28,
          elevation: 14,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarAccessibilityLabel: "Today tab",
          tabBarIcon: ({ color, focused }) => (
            renderDockIcon("house.fill", focused, color)
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Add Task",
          tabBarAccessibilityLabel: "Add task tab",
          tabBarIcon: ({ color, focused }) => (
            renderDockIcon("plus.circle.fill", focused, color)
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarAccessibilityLabel: "Stats tab",
          tabBarIcon: ({ color, focused }) => (
            renderDockIcon("chart.bar.fill", focused, color)
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarAccessibilityLabel: "Settings tab",
          tabBarIcon: ({ color, focused }) => (
            renderDockIcon("gearshape.fill", focused, color)
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dockItem: {
    minWidth: 48,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
    overflow: "hidden",
  },
  dockItemFocused: {
    minWidth: 58,
    paddingHorizontal: 7,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  dockIconShell: {
    width: 35,
    height: 35,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dockActiveGlow: {
    position: "absolute",
    left: 9,
    right: 9,
    bottom: -18,
    height: 26,
    borderRadius: 999,
    opacity: 0.22,
  },
});
