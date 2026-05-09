import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

// I added this wrapper so identity-related local values go through iOS Keychain /
// Android Keystore instead of plain AsyncStorage, while still letting us migrate
// old values users already saved before this security pass.
export const getSecureItem = async (key: string) => {
  const secureValue = await SecureStore.getItemAsync(key);
  if (secureValue !== null) return secureValue;

  const legacyValue = await AsyncStorage.getItem(key);
  if (legacyValue !== null) {
    await SecureStore.setItemAsync(key, legacyValue);
    await AsyncStorage.removeItem(key);
  }

  return legacyValue;
};

export const setSecureItem = async (key: string, value: string) => {
  await SecureStore.setItemAsync(key, value);
  await AsyncStorage.removeItem(key);
};

export const removeSecureItem = async (key: string) => {
  await SecureStore.deleteItemAsync(key);
  await AsyncStorage.removeItem(key);
};
