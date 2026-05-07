import AsyncStorage from "@react-native-async-storage/async-storage";

const getSkipKey = (uid: string) => `emailVerificationSkipped:${uid}`;

export const getEmailVerificationSkipped = async (uid: string) =>
  (await AsyncStorage.getItem(getSkipKey(uid))) === "true";

export const setEmailVerificationSkipped = async (uid: string) => {
  // I made this a local dev/test bypass so unverified tester accounts can enter
  // the app without weakening Firebase itself or storing anything sensitive.
  await AsyncStorage.setItem(getSkipKey(uid), "true");
};

export const clearEmailVerificationSkipped = async (uid: string) => {
  await AsyncStorage.removeItem(getSkipKey(uid));
};
