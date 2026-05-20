import { InputAccessoryView, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { dismissKeyboard } from "@/utils/keyboard";

type KeyboardDoneAccessoryColors = {
  border: string;
  card: string;
  text: string;
  tint: string;
};

type KeyboardDoneAccessoryProps = {
  colors: KeyboardDoneAccessoryColors;
  nativeID: string;
};

export function KeyboardDoneAccessory({ colors, nativeID }: KeyboardDoneAccessoryProps) {
  if (Platform.OS !== "ios") return null;

  return (
    <InputAccessoryView nativeID={nativeID}>
      <View
        style={[
          styles.bar,
          { backgroundColor: colors.card, borderTopColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={dismissKeyboard}
          style={[styles.button, { backgroundColor: colors.tint }]}
          accessibilityRole="button"
          accessibilityLabel="Dismiss keyboard"
        >
          <Text style={styles.buttonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "flex-end",
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  button: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
