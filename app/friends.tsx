import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { AmbientBackground } from "@/components/ambient-background";
import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { auth, db } from "@/constants/firebaseConfig";
import { formatDateKey } from "@/utils/task-helpers";

type FriendProfile = {
  uid: string;
  email: string;
  displayName?: string | null;
  linkedAt?: any;
};

type FriendRequest = {
  id: string;
  requesterUid: string;
  requesterEmail: string;
  requesterName?: string | null;
  recipientUid: string;
  recipientEmail: string;
  recipientName?: string | null;
  status: "pending" | "accepted" | "declined";
  createdAt?: any;
};

type FriendProgress = {
  today: string;
  total: number;
  completed: number;
  open: number;
  skipped: number;
  highOpen: number;
  updatedAt?: any;
};

type Nudge = {
  id: string;
  fromUid: string;
  fromEmail: string;
  fromName?: string | null;
  toUid: string;
  message: string;
  seen?: boolean;
  createdAt?: any;
};

type ChallengeType = "combinedFive" | "cleanDay" | "highPriorityRescue";

type FriendChallenge = {
  id: string;
  title: string;
  type: ChallengeType;
  createdByUid: string;
  participantUids: string[];
  participantNames: Record<string, string>;
  date: string;
  status?: "active" | "completed";
  createdAt?: any;
};

type Task = {
  id: string;
  date: string;
  completed: boolean;
  priority?: "Low" | "Medium" | "High";
  status?: "pending" | "completed" | "skipped";
};

const challengeTemplates: Record<
  ChallengeType,
  { title: string; body: string; targetLabel: string }
> = {
  combinedFive: {
    title: "5-Win Team Push",
    body: "Together, complete 5 tasks today.",
    targetLabel: "combined completions",
  },
  cleanDay: {
    title: "No-Skip Pact",
    body: "Both people finish the day without skipping.",
    targetLabel: "clean plans",
  },
  highPriorityRescue: {
    title: "High Priority Rescue",
    body: "Both people clear or move every high-priority task.",
    targetLabel: "high-priority pressure",
  },
};

const getDisplayName = (profile: Partial<FriendProfile>) =>
  profile.displayName?.trim() || profile.email;

const toDateLabel = (value: any) => {
  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : value
        ? new Date(value)
        : null;

  if (!date) return "recently";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function FriendsScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];
  const [myProfile, setMyProfile] = useState<FriendProfile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [friendProgress, setFriendProgress] = useState<Record<string, FriendProgress>>({});
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [challenges, setChallenges] = useState<FriendChallenge[]>([]);
  const [friendEmail, setFriendEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const uid = auth.currentUser?.uid;
  const email = auth.currentUser?.email?.toLowerCase() ?? "";
  const today = formatDateKey(new Date());

  useEffect(() => {
    if (!uid || !email) return;

    const profileRef = doc(db, "publicProfiles", uid);
    const fallback = {
      uid,
      email,
      displayName: null,
    };
    const unsubscribe = onSnapshot(
      profileRef,
      (snapshot) => {
        setMyProfile(
          (snapshot.data() as FriendProfile | undefined) ?? fallback
        );
      },
      () => {
        setMyProfile(fallback);
        setStatusMessage(
          "Friends need the latest Firestore rules deployed before they can sync."
        );
      }
    );

    void setDoc(
      profileRef,
      {
        uid,
        email,
        updatedAt: new Date(),
      },
      { merge: true }
    ).catch(() => {
      setStatusMessage(
        "Friends need the latest Firestore rules deployed before they can sync."
      );
    });

    return unsubscribe;
  }, [email, uid]);

  useEffect(() => {
    if (!uid) return;

    return onSnapshot(
      collection(db, "users", uid, "tasks"),
      (snapshot) => {
        setTasks(
          snapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          })) as Task[]
        );
      },
      () => {
        setStatusMessage("Could not load your tasks for friend progress.");
      }
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    return onSnapshot(
      collection(db, "users", uid, "friends"),
      (snapshot) => {
        setFriends(
          snapshot.docs.map((document) => ({
            uid: document.id,
            ...document.data(),
          })) as FriendProfile[]
        );
      },
      () => {
        setStatusMessage("Friend list needs the latest Firestore rules.");
      }
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const incomingQuery = query(
      collection(db, "friendRequests"),
      where("recipientUid", "==", uid)
    );
    const outgoingQuery = query(
      collection(db, "friendRequests"),
      where("requesterUid", "==", uid)
    );

    const unsubscribeIncoming = onSnapshot(
      incomingQuery,
      (snapshot) => {
        setIncomingRequests(
          snapshot.docs
            .map((document) => ({
              id: document.id,
              ...document.data(),
            })) as FriendRequest[]
        );
      },
      () => {
        setStatusMessage("Friend requests need the latest Firestore rules.");
      }
    );
    const unsubscribeOutgoing = onSnapshot(
      outgoingQuery,
      (snapshot) => {
        setOutgoingRequests(
          snapshot.docs
            .map((document) => ({
              id: document.id,
              ...document.data(),
            })) as FriendRequest[]
        );
      },
      () => {
        setStatusMessage("Friend requests need the latest Firestore rules.");
      }
    );

    return () => {
      unsubscribeIncoming();
      unsubscribeOutgoing();
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const nudgesQuery = query(
      collection(db, "accountabilityNudges"),
      where("toUid", "==", uid)
    );

    return onSnapshot(
      nudgesQuery,
      (snapshot) => {
        setNudges(
          snapshot.docs
            .map((document) => ({
              id: document.id,
              ...document.data(),
            })) as Nudge[]
        );
      },
      () => {
        setStatusMessage("Check-ins need the latest Firestore rules.");
      }
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const challengesQuery = query(
      collection(db, "friendChallenges"),
      where("participantUids", "array-contains", uid)
    );

    return onSnapshot(
      challengesQuery,
      (snapshot) => {
        setChallenges(
          snapshot.docs
            .map((document) => ({
              id: document.id,
              ...document.data(),
            })) as FriendChallenge[]
        );
      },
      () => {
        setStatusMessage("Friend challenges need the latest Firestore rules.");
      }
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const todayTasks = tasks.filter((task) => task.date === today);
    const completed = todayTasks.filter((task) => task.completed).length;
    const skipped = todayTasks.filter(
      (task) => (task.status ?? "pending") === "skipped"
    ).length;
    const open = todayTasks.filter(
      (task) => !task.completed && (task.status ?? "pending") !== "skipped"
    ).length;
    const highOpen = todayTasks.filter(
      (task) =>
        (task.priority ?? "Medium") === "High" &&
        !task.completed &&
        (task.status ?? "pending") !== "skipped"
    ).length;

    void setDoc(
      doc(db, "publicProgress", uid),
      {
        today,
        total: todayTasks.length,
        completed,
        open,
        skipped,
        highOpen,
        updatedAt: new Date(),
      },
      { merge: true }
    ).catch(() => {});
  }, [tasks, today, uid]);

  useEffect(() => {
    const unsubscribes = friends.map((friend) =>
      onSnapshot(
        doc(db, "publicProgress", friend.uid),
        (snapshot) => {
          const progress = snapshot.data() as FriendProgress | undefined;
          if (!progress) return;

          setFriendProgress((current) => ({
            ...current,
            [friend.uid]: progress,
          }));
        },
        () => {
          setStatusMessage("Friend progress needs the latest Firestore rules.");
        }
      )
    );

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [friends]);

  const pendingIncoming = useMemo(
    () => incomingRequests.filter((request) => request.status === "pending"),
    [incomingRequests]
  );
  const pendingOutgoing = useMemo(
    () => outgoingRequests.filter((request) => request.status === "pending"),
    [outgoingRequests]
  );
  const myProgress = useMemo<FriendProgress>(() => {
    const todayTasks = tasks.filter((task) => task.date === today);
    const completed = todayTasks.filter((task) => task.completed).length;
    const skipped = todayTasks.filter(
      (task) => (task.status ?? "pending") === "skipped"
    ).length;
    const open = todayTasks.filter(
      (task) => !task.completed && (task.status ?? "pending") !== "skipped"
    ).length;
    const highOpen = todayTasks.filter(
      (task) =>
        (task.priority ?? "Medium") === "High" &&
        !task.completed &&
        (task.status ?? "pending") !== "skipped"
    ).length;

    return {
      today,
      total: todayTasks.length,
      completed,
      open,
      skipped,
      highOpen,
    };
  }, [tasks, today]);
  const unseenNudges = useMemo(
    () =>
      nudges
        .filter((nudge) => !nudge.seen)
        .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))),
    [nudges]
  );
  const activeChallenges = useMemo(
    () =>
      challenges
        .filter((challenge) => challenge.date === today)
        .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))),
    [challenges, today]
  );

  const getChallengeProgress = (challenge: FriendChallenge) => {
    const friendUid = challenge.participantUids.find((participantUid) => participantUid !== uid);
    const otherProgress = friendUid ? friendProgress[friendUid] : null;
    const participants = [myProgress, otherProgress].filter(Boolean) as FriendProgress[];

    if (challenge.type === "combinedFive") {
      const completed = participants.reduce(
        (sum, progress) => sum + progress.completed,
        0
      );
      return {
        value: Math.min(100, Math.round((completed / 5) * 100)),
        label: `${completed}/5 tasks complete`,
        complete: completed >= 5,
      };
    }

    if (challenge.type === "cleanDay") {
      const cleanCount = participants.filter(
        (progress) => progress.total > 0 && progress.skipped === 0
      ).length;
      return {
        value: participants.length ? Math.round((cleanCount / participants.length) * 100) : 0,
        label: `${cleanCount}/${participants.length || 2} clean plans`,
        complete: participants.length >= 2 && cleanCount === participants.length,
      };
    }

    const rescuedCount = participants.filter(
      (progress) => progress.total > 0 && progress.highOpen === 0
    ).length;
    return {
      value: participants.length ? Math.round((rescuedCount / participants.length) * 100) : 0,
      label: `${rescuedCount}/${participants.length || 2} high-priority queues clear`,
      complete: participants.length >= 2 && rescuedCount === participants.length,
    };
  };

  const sendFriendRequest = async () => {
    if (!uid || !email || !myProfile) return;

    const normalizedEmail = friendEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setStatusMessage("Enter your friend's account email first.");
      return;
    }

    if (normalizedEmail === email) {
      setStatusMessage("That is your own email. Accountability requires another human.");
      return;
    }

    setIsSending(true);

    try {
      const profileQuery = query(
        collection(db, "publicProfiles"),
        where("email", "==", normalizedEmail)
      );
      const snapshot = await getDocs(profileQuery);
      const target = snapshot.docs[0]?.data() as FriendProfile | undefined;

      if (!target?.uid) {
        setStatusMessage("No user found with that email yet.");
        return;
      }

      if (friends.some((friend) => friend.uid === target.uid)) {
        setStatusMessage("You are already accountability friends.");
        return;
      }

      const requestRef = doc(db, "friendRequests", `${uid}_${target.uid}`);
      const existingRequest = await getDoc(requestRef);

      if (existingRequest.exists()) {
        const requestStatus = existingRequest.data().status as
          | FriendRequest["status"]
          | undefined;
        setStatusMessage(
          requestStatus === "pending"
            ? "That friend request is already waiting for a response."
            : "A request already exists with that account. Ask them to respond first."
        );
        return;
      }

      await setDoc(
        requestRef,
        {
          requesterUid: uid,
          requesterEmail: email,
          requesterName: myProfile.displayName ?? null,
          recipientUid: target.uid,
          recipientEmail: target.email,
          recipientName: target.displayName ?? null,
          status: "pending",
          createdAt: new Date(),
        }
      );

      setFriendEmail("");
      setStatusMessage("Friend request sent.");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setStatusMessage(
        "Could not send that request yet. Make sure the account exists and try again."
      );
    } finally {
      setIsSending(false);
    }
  };

  const acceptRequest = async (request: FriendRequest) => {
    if (!uid || !email || !myProfile) return;

    try {
      await updateDoc(doc(db, "friendRequests", request.id), {
        status: "accepted",
        respondedAt: new Date(),
      });

      await setDoc(doc(db, "users", uid, "friends", request.requesterUid), {
        uid: request.requesterUid,
        email: request.requesterEmail,
        displayName: request.requesterName ?? null,
        linkedAt: new Date(),
      });
      await setDoc(doc(db, "users", request.requesterUid, "friends", uid), {
        uid,
        email,
        displayName: myProfile.displayName ?? null,
        linkedAt: new Date(),
      });

      setStatusMessage(`${getDisplayName({ email: request.requesterEmail, displayName: request.requesterName })} added.`);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setStatusMessage("Could not accept yet. Deploy the latest Firestore rules and try again.");
    }
  };

  const declineRequest = async (request: FriendRequest) => {
    try {
      await updateDoc(doc(db, "friendRequests", request.id), {
        status: "declined",
        respondedAt: new Date(),
      });
      setStatusMessage("Request declined.");
    } catch {
      setStatusMessage("Could not decline yet. Deploy the latest Firestore rules and try again.");
    }
  };

  const sendNudge = async (friend: FriendProfile) => {
    if (!uid || !email || !myProfile) return;

    try {
      await addDoc(collection(db, "accountabilityNudges"), {
        fromUid: uid,
        fromEmail: email,
        fromName: myProfile.displayName ?? null,
        toUid: friend.uid,
        message: "Quick accountability check: are you still on your plan today?",
        seen: false,
        createdAt: new Date(),
      });

      setStatusMessage(`Check-in sent to ${getDisplayName(friend)}.`);
      await Haptics.selectionAsync();
    } catch {
      setStatusMessage("Could not send that check-in yet. Deploy the latest Firestore rules first.");
    }
  };

  const startChallenge = async (
    friend: FriendProfile,
    type: ChallengeType = "combinedFive"
  ) => {
    if (!uid || !email || !myProfile) return;

    const template = challengeTemplates[type];
    const challengeId = `${today}_${[uid, friend.uid].sort().join("_")}_${type}`;

    try {
      await setDoc(
        doc(db, "friendChallenges", challengeId),
        {
          title: template.title,
          type,
          createdByUid: uid,
          participantUids: [uid, friend.uid],
          participantNames: {
            [uid]: myProfile.displayName ?? email,
            [friend.uid]: getDisplayName(friend),
          },
          date: today,
          status: "active",
          createdAt: new Date(),
        },
        { merge: true }
      );

      setStatusMessage(`${template.title} started with ${getDisplayName(friend)}.`);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setStatusMessage("Could not start that challenge yet. Deploy the latest Firestore rules first.");
    }
  };

  const markNudgeSeen = async (nudge: Nudge) => {
    await updateDoc(doc(db, "accountabilityNudges", nudge.id), {
      seen: true,
      seenAt: new Date(),
    }).catch(() => {
      setStatusMessage("Could not mark that check-in seen yet.");
    });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <AmbientBackground colors={colors} variant="signal" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backText, { color: colors.tint }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.kicker, { color: colors.tint }]}>Accountability</Text>
        <Text style={[styles.title, { color: colors.text }]}>Friends</Text>
        <Text style={[styles.subtitle, { color: colors.subtle }]}>
          Add trusted people, share daily progress, and send check-ins when
          someone starts drifting.
        </Text>
      </View>

      <View style={[styles.heroCard, { backgroundColor: colors.tint, shadowColor: colors.tint }]}>
        <Text style={styles.heroKicker}>Accountability Loop</Text>
        <Text style={styles.heroTitle}>{friends.length} friend{friends.length === 1 ? "" : "s"} watching the plan</Text>
        <Text style={styles.heroBody}>
          This keeps pressure social but lightweight: progress cards, friend
          requests, and quick nudges.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Friend Challenges</Text>
        <Text style={[styles.cardText, { color: colors.subtle }]}>
          Turn accountability into a daily team push. Start a challenge from any friend card.
        </Text>

        {activeChallenges.length === 0 ? (
          <View style={[styles.challengeEmpty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.challengeEmptyTitle, { color: colors.text }]}>
              No active challenge today
            </Text>
            <Text style={[styles.challengeEmptyText, { color: colors.subtle }]}>
              Pick a friend below and start a 5-win push, no-skip pact, or high-priority rescue.
            </Text>
          </View>
        ) : (
          activeChallenges.slice(0, 4).map((challenge) => {
            const template = challengeTemplates[challenge.type];
            const progress = getChallengeProgress(challenge);

            return (
              <View
                key={challenge.id}
                style={[
                  styles.challengeCard,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <View style={styles.challengeHeader}>
                  <View style={styles.challengeCopy}>
                    <Text style={[styles.challengeTitle, { color: colors.text }]}>
                      {challenge.title}
                    </Text>
                    <Text style={[styles.challengeMeta, { color: colors.subtle }]}>
                      {template.body}
                    </Text>
                  </View>
                  <Text style={[styles.challengePercent, { color: colors.tint }]}>
                    {progress.value}%
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${progress.value}%`,
                        backgroundColor: progress.complete ? colors.success : colors.tint,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.challengeMeta, { color: colors.subtle }]}>
                  {progress.label} • {template.targetLabel}
                </Text>
              </View>
            );
          })
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Add Friend</Text>
        <Text style={[styles.cardText, { color: colors.subtle }]}>
          Use the email they signed up with.
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder="friend@email.com"
          placeholderTextColor={colors.subtle}
          value={friendEmail}
          onChangeText={setFriendEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.tint }]}
          onPress={sendFriendRequest}
          disabled={isSending}
        >
          <Text style={styles.primaryButtonText}>
            {isSending ? "Sending..." : "Send Friend Request"}
          </Text>
        </TouchableOpacity>
        {!!statusMessage && (
          <Text style={[styles.statusText, { color: colors.subtle }]}>
            {statusMessage}
          </Text>
        )}
      </View>

      {unseenNudges.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.warning, shadowColor: colors.warning }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Check-ins</Text>
          {unseenNudges.slice(0, 4).map((nudge) => (
            <TouchableOpacity
              key={nudge.id}
              style={[styles.requestRow, { borderBottomColor: colors.border }]}
              onPress={() => markNudgeSeen(nudge)}
            >
              <View style={styles.requestCopy}>
                <Text style={[styles.requestName, { color: colors.text }]}>
                  {nudge.fromName || nudge.fromEmail}
                </Text>
                <Text style={[styles.requestMeta, { color: colors.subtle }]}>
                  {nudge.message}
                </Text>
              </View>
              <Text style={[styles.requestActionText, { color: colors.tint }]}>Seen</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {pendingIncoming.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.tint }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Friend Requests</Text>
          {pendingIncoming.map((request) => (
            <View key={request.id} style={[styles.requestRow, { borderBottomColor: colors.border }]}>
              <View style={styles.requestCopy}>
                <Text style={[styles.requestName, { color: colors.text }]}>
                  {request.requesterName || request.requesterEmail}
                </Text>
                <Text style={[styles.requestMeta, { color: colors.subtle }]}>
                  Wants to be accountability friends.
                </Text>
              </View>
              <TouchableOpacity onPress={() => declineRequest(request)}>
                <Text style={[styles.requestActionText, { color: colors.subtle }]}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => acceptRequest(request)}>
                <Text style={[styles.requestActionText, { color: colors.tint }]}>Accept</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Friend Progress</Text>
        {friends.length === 0 ? (
          <Text style={[styles.cardText, { color: colors.subtle }]}>
            No friends yet. Send a request to start an accountability loop.
          </Text>
        ) : (
          friends.map((friend) => {
            const progress = friendProgress[friend.uid];
            const percent = progress?.total
              ? Math.round((progress.completed / progress.total) * 100)
              : 0;

            return (
              <View
                key={friend.uid}
                style={[
                  styles.friendCard,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <View style={styles.friendHeader}>
                  <View>
                    <Text style={[styles.friendName, { color: colors.text }]}>
                      {getDisplayName(friend)}
                    </Text>
                    <Text style={[styles.friendMeta, { color: colors.subtle }]}>
                      {progress
                        ? `${progress.completed}/${progress.total} done today • ${progress.open} open`
                        : "No progress shared yet today"}
                    </Text>
                  </View>
                  <View style={[styles.progressPill, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.progressPillText, { color: colors.text }]}>
                      {percent}%
                    </Text>
                  </View>
                </View>

                <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${percent}%`,
                        backgroundColor:
                          progress && progress.highOpen > 0
                            ? colors.warning
                            : colors.tint,
                      },
                    ]}
                  />
                </View>

                <View style={styles.friendFooter}>
                  <Text style={[styles.friendMeta, { color: colors.subtle }]}>
                    Updated {toDateLabel(progress?.updatedAt)}
                  </Text>
                  <View style={styles.friendActionRow}>
                    <TouchableOpacity
                      style={[styles.nudgeButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => startChallenge(friend)}
                    >
                      <Text style={[styles.nudgeText, { color: colors.tint }]}>
                        Challenge
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.nudgeButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => sendNudge(friend)}
                    >
                      <Text style={[styles.nudgeText, { color: colors.tint }]}>
                        Check In
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.challengeQuickRow}>
                  {(["combinedFive", "cleanDay", "highPriorityRescue"] as ChallengeType[]).map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.challengeQuickChip,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                      onPress={() => startChallenge(friend, type)}
                    >
                      <Text style={[styles.challengeQuickText, { color: colors.subtle }]}>
                        {challengeTemplates[type].title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </View>

      {pendingOutgoing.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.tint }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Pending Sent</Text>
          {pendingOutgoing.map((request) => (
            <Text
              key={request.id}
              style={[styles.cardText, { color: colors.subtle }]}
            >
              Waiting on {request.recipientName || request.recipientEmail}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 44,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 18,
  },
  backText: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 14,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
  },
  heroCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 30,
    padding: 22,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 22,
    elevation: 8,
  },
  heroKicker: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 33,
    marginBottom: 8,
  },
  heroBody: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },
  cardText: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  challengeEmpty: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  challengeEmptyTitle: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 4,
  },
  challengeEmptyText: {
    fontSize: 12,
    lineHeight: 18,
  },
  challengeCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 10,
  },
  challengeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  challengeCopy: {
    flex: 1,
    paddingRight: 12,
  },
  challengeTitle: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 4,
  },
  challengeMeta: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 8,
  },
  challengePercent: {
    fontSize: 18,
    fontWeight: "900",
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    fontSize: 15,
    marginTop: 4,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 12,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  statusText: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  requestCopy: {
    flex: 1,
    paddingRight: 10,
  },
  requestName: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 3,
  },
  requestMeta: {
    fontSize: 12,
    lineHeight: 17,
  },
  requestActionText: {
    fontSize: 13,
    fontWeight: "900",
    marginLeft: 12,
  },
  friendCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 10,
  },
  friendHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  friendName: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4,
  },
  friendMeta: {
    fontSize: 12,
    lineHeight: 17,
  },
  progressPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  progressPillText: {
    fontSize: 12,
    fontWeight: "900",
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 999,
  },
  friendFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  friendActionRow: {
    flexDirection: "row",
  },
  nudgeButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginLeft: 8,
  },
  nudgeText: {
    fontSize: 12,
    fontWeight: "900",
  },
  challengeQuickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    marginHorizontal: -4,
  },
  challengeQuickChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    margin: 4,
  },
  challengeQuickText: {
    fontSize: 11,
    fontWeight: "900",
  },
});
