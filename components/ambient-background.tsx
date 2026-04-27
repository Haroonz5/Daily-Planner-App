import { StyleSheet, View } from "react-native";

type AmbientColors = {
  tint: string;
  success: string;
  warning: string;
  danger: string;
  surface: string;
};

type AmbientBackgroundProps = {
  colors: AmbientColors;
  variant?: "calm" | "energy" | "focus";
};

export function AmbientBackground({
  colors,
  variant = "calm",
}: AmbientBackgroundProps) {
  const intensity = variant === "energy" ? 0.2 : variant === "focus" ? 0.16 : 0.13;

  return (
    <View pointerEvents="none" style={styles.layer}>
      <View
        style={[
          styles.topWash,
          { backgroundColor: colors.surface, opacity: intensity },
        ]}
      />
      <View
        style={[
          styles.blob,
          styles.blobOne,
          { backgroundColor: colors.tint, opacity: intensity },
        ]}
      />
      <View
        style={[
          styles.blob,
          styles.blobTwo,
          { backgroundColor: colors.warning, opacity: intensity * 0.75 },
        ]}
      />
      <View
        style={[
          styles.blob,
          styles.blobThree,
          {
            backgroundColor: variant === "energy" ? colors.success : colors.danger,
            opacity: intensity * 0.52,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  topWash: {
    position: "absolute",
    left: -40,
    right: -40,
    top: -120,
    height: 260,
    borderBottomLeftRadius: 120,
    borderBottomRightRadius: 120,
  },
  blob: {
    position: "absolute",
    borderRadius: 999,
  },
  blobOne: {
    width: 210,
    height: 210,
    top: 78,
    right: -92,
  },
  blobTwo: {
    width: 170,
    height: 170,
    top: 320,
    left: -88,
  },
  blobThree: {
    width: 145,
    height: 145,
    top: 620,
    right: -54,
  },
});
