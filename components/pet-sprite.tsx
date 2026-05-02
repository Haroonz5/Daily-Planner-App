import { memo, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  ImageStyle,
  StyleProp,
  StyleSheet,
} from "react-native";

import type { PetKey } from "@/constants/rewards";

type PetSpriteProps = {
  petKey: PetKey;
  size?: number;
  muted?: boolean;
  animated?: boolean;
  mood?: "idle" | "happy" | "tired";
  style?: StyleProp<ImageStyle>;
};

const PET_IMAGES: Record<PetKey, number> = {
  rabbit: require("../assets/pets/rabbit.png"),
  cat: require("../assets/pets/cat.png"),
  fox: require("../assets/pets/fox.png"),
  wolf: require("../assets/pets/wolf.png"),
  tiger: require("../assets/pets/tiger.png"),
  eagle: require("../assets/pets/eagle.png"),
  dragon: require("../assets/pets/dragon.png"),
};

function PetSpriteBase({
  petKey,
  size = 72,
  muted = false,
  animated = false,
  mood = "idle",
  style,
}: PetSpriteProps) {
  const motion = useRef(new Animated.Value(0)).current;
  const distance = mood === "happy" ? -8 : mood === "tired" ? -3 : -5;
  const duration = mood === "happy" ? 900 : mood === "tired" ? 1700 : 1350;

  useEffect(() => {
    if (!animated || muted) {
      motion.stopAnimation();
      motion.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [animated, duration, motion, muted]);

  const animatedStyle = animated
    ? {
        transform: [
          {
            translateY: motion.interpolate({
              inputRange: [0, 1],
              outputRange: [0, distance],
            }),
          },
          {
            scale: motion.interpolate({
              inputRange: [0, 1],
              outputRange: [1, mood === "happy" ? 1.045 : 1.02],
            }),
          },
        ],
      }
    : null;

  const imageStyle = [
    styles.image,
    style,
    animatedStyle,
    {
      width: size,
      height: size,
      opacity: muted ? 0.4 : 1,
    },
  ];

  if (animated) {
    return (
      <Animated.Image
        source={PET_IMAGES[petKey] ?? PET_IMAGES.rabbit}
        resizeMode="contain"
        style={imageStyle}
      />
    );
  }

  return (
    <Image
      source={PET_IMAGES[petKey] ?? PET_IMAGES.rabbit}
      resizeMode="contain"
      style={imageStyle}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    alignSelf: "center",
  },
});

export const PetSprite = memo(PetSpriteBase);
