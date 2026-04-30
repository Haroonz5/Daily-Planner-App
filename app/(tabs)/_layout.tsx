import { Tabs } from "expo-router";
import React, { type ComponentProps } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

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
    label: string,
    focused: boolean,
    color: string
  ) => (
    <View
      style={[
        styles.dockItem,
        focused && styles.dockItemFocused,
        focused && {
          backgroundColor: colors.surface,
          borderColor: colors.tint,
        },
      ]}
    >
      <View
        style={[
          styles.dockIconShell,
          focused && { backgroundColor: colors.tint },
        ]}
      >
        <IconSymbol
          size={focused ? 18 : 20}
          name={name}
          color={focused ? colors.background : color}
        />
      </View>
      {focused ? (
        <Text
          numberOfLines={1}
          style={[styles.dockLabel, { color: colors.text }]}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: colors.tabIconSelected,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarShowLabel: false,
        tabBarItemStyle: {
          borderRadius: 999,
          marginHorizontal: 2,
          marginVertical: 6,
          paddingTop: 0,
        },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 34,
          height: Platform.OS === "ios" ? 86 : 78,
          marginHorizontal: 14,
          marginBottom: Platform.OS === "ios" ? 12 : 10,
          paddingTop: 9,
          paddingHorizontal: 8,
          paddingBottom: Platform.OS === "ios" ? 18 : 10,
          position: "absolute",
          shadowColor: colors.tint,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 0.18,
          shadowRadius: 24,
          elevation: 12,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: ({ color, focused }) => (
            renderDockIcon("house.fill", "Today", focused, color)
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Add Task",
          tabBarIcon: ({ color, focused }) => (
            renderDockIcon("plus.circle.fill", "Add", focused, color)
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ color, focused }) => (
            renderDockIcon("chart.bar.fill", "Stats", focused, color)
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => (
            renderDockIcon("gearshape.fill", "Settings", focused, color)
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dockItem: {
    minWidth: 52,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  dockItemFocused: {
    minWidth: 96,
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingHorizontal: 8,
  },
  dockIconShell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  dockLabel: {
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 7,
  },
});
