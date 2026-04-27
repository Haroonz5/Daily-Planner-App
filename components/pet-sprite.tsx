import { memo } from "react";
import { Image, ImageStyle, StyleProp, StyleSheet } from "react-native";

import type { PetKey } from "@/constants/rewards";

type PetSpriteProps = {
  petKey: PetKey;
  size?: number;
  muted?: boolean;
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
  style,
}: PetSpriteProps) {
  return (
    <Image
      source={PET_IMAGES[petKey] ?? PET_IMAGES.rabbit}
      resizeMode="contain"
      style={[
        styles.image,
        style,
        {
          width: size,
          height: size,
          opacity: muted ? 0.4 : 1,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    alignSelf: "center",
  },
});

export const PetSprite = memo(PetSpriteBase);
