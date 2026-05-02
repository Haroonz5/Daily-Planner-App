import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

import { auth, db } from "@/constants/firebaseConfig";

export type UserProfile = {
  activePetKey?: string | null;
  petNickname?: string | null;
  displayName?: string | null;
  focusDurationMinutes?: number | null;
  tutorialCompleted?: boolean | null;
};

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile>({});

  useEffect(() => {
    let unsubscribeProfile = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeProfile();

      if (!user) {
        setProfile({});
        return;
      }

      const profileRef = doc(db, "users", user.uid);
      unsubscribeProfile = onSnapshot(profileRef, (snapshot) => {
        if (!snapshot.exists()) {
          setProfile({});
          return;
        }

        setProfile((snapshot.data() as UserProfile) ?? {});
      });
    });

    return () => {
      unsubscribeProfile();
      unsubscribeAuth();
    };
  }, []);

  const saveProfile = async (updates: Partial<UserProfile>) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    await setDoc(doc(db, "users", uid), updates, { merge: true });
  };

  return { profile, saveProfile };
}
