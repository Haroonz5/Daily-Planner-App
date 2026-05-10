import { getSecureItem, removeSecureItem, setSecureItem } from "@/utils/secure-storage";

const getSkipKey = (uid: string) => `emailVerificationSkipped.${uid}`;

export const getEmailVerificationSkipped = async (uid: string) =>
  (await getSecureItem(getSkipKey(uid))) === "true";

export const setEmailVerificationSkipped = async (uid: string) => {
  // I made this a local dev/test bypass so unverified tester accounts can enter
  // the app without weakening Firebase itself or storing anything sensitive.
  await setSecureItem(getSkipKey(uid), "true");
};

export const clearEmailVerificationSkipped = async (uid: string) => {
  await removeSecureItem(getSkipKey(uid));
};
