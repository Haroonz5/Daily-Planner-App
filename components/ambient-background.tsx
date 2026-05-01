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
  variant?: "calm" | "energy" | "focus" | "signal";
};

export function AmbientBackground({
  colors,
  variant = "calm",
}: AmbientBackgroundProps) {
  if (variant === "signal") {
    return (
      <View pointerEvents="none" style={styles.layer}>
        <View
          style={[
            styles.signalWash,
            { backgroundColor: colors.surface, opacity: 0.28 },
          ]}
        />
        <View
          style={[
            styles.signalBand,
            styles.signalBandOne,
            { backgroundColor: colors.tint, opacity: 0.16 },
          ]}
        />
        <View
          style={[
            styles.signalBand,
            styles.signalBandTwo,
            { backgroundColor: colors.warning, opacity: 0.12 },
          ]}
        />
        <View
          style={[
            styles.signalBand,
            styles.signalBandThree,
            { backgroundColor: colors.success, opacity: 0.1 },
          ]}
        />
        {Array.from({ length: 8 }).map((_, index) => (
          <View
            key={`signal-line-${index}`}
            style={[
              styles.signalLine,
              {
                top: 92 + index * 96,
                backgroundColor: index % 2 === 0 ? colors.tint : colors.surface,
                opacity: index % 2 === 0 ? 0.075 : 0.14,
              },
            ]}
          />
        ))}
      </View>
    );
  }

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
  signalWash: {
    position: "absolute",
    top: -110,
    left: 0,
    right: 0,
    height: 360,
  },
  signalBand: {
    position: "absolute",
    height: 96,
    left: -80,
    right: -80,
    transform: [{ rotate: "-12deg" }],
  },
  signalBandOne: {
    top: 72,
  },
  signalBandTwo: {
    top: 252,
  },
  signalBandThree: {
    top: 512,
  },
  signalLine: {
    position: "absolute",
    left: 24,
    right: 24,
    height: 1,
    transform: [{ rotate: "-12deg" }],
  },
});
