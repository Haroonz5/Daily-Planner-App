import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const EMPTY_KEY_FALLBACK = "dailyDiscipline.emptyKey";

const toSecureStoreKey = (key: string) => {
  const safeKey = key.trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return safeKey || EMPTY_KEY_FALLBACK;
};

// I added this wrapper so identity-related local values go through iOS Keychain /
// Android Keystore instead of plain AsyncStorage, while still letting us migrate
// old values users already saved before this security pass.
export const getSecureItem = async (key: string) => {
  const secureKey = toSecureStoreKey(key);
  // Expo Secure Store uses native Keychain/Keystore APIs. The web preview has no
  // equivalent API, so retain the existing AsyncStorage fallback in browsers.
  if (Platform.OS === "web") return AsyncStorage.getItem(key);
  const secureValue = await SecureStore.getItemAsync(secureKey);
  if (secureValue !== null) return secureValue;

  const legacyValue =
    (await AsyncStorage.getItem(key)) ??
    (key === secureKey ? null : await AsyncStorage.getItem(secureKey));

  if (legacyValue !== null) {
    await SecureStore.setItemAsync(secureKey, legacyValue);
    await AsyncStorage.removeItem(key);
    if (key !== secureKey) await AsyncStorage.removeItem(secureKey);
  }

  return legacyValue;
};

export const setSecureItem = async (key: string, value: string) => {
  const secureKey = toSecureStoreKey(key);
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(secureKey, value);
  await AsyncStorage.removeItem(key);
  if (key !== secureKey) await AsyncStorage.removeItem(secureKey);
};

export const removeSecureItem = async (key: string) => {
  const secureKey = toSecureStoreKey(key);
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(secureKey);
  await AsyncStorage.removeItem(key);
  if (key !== secureKey) await AsyncStorage.removeItem(secureKey);
};
