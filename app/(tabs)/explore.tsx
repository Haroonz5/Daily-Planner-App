import DateTimePicker from "@react-native-community/datetimepicker";
import { addDoc, collection } from "firebase/firestore";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import {
  syncMorningSummaryNotification,
  syncTaskNotifications
} from "../../utils/notifications";

import { auth, db } from "../../constants/firebaseConfig";

type Priority = "Low" | "Medium" | "High";

const priorityColors: Record<Priority, string> = {
  Low: "#8dcf9f",
  Medium: "#f2b97f",
  High: "#e58ca8",
};

export default function AddTask() {
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [time, setTime] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  };

  const resetForm = () => {
    setTitle("");
    setNotes("");
    setPriority("Medium");
    setTime(new Date());
  };

  const handleAddTask = async () => {
    if (!title.trim()) {
      setError("Please enter a task title");
      return;
    }

    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setError("You need to be logged in to add a task.");
        return;
      }

      const formattedTime = time.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const tomorrowDate = getTomorrowDate();

      const docRef = await addDoc(collection(db, "users", uid, "tasks"), {
        title: title.trim(),
        notes: notes.trim(),
        priority,
        time: formattedTime,
        date: tomorrowDate,
        completed: false,
        status: "pending",
        createdAt: new Date(),
        completedAt: null,
        skippedAt: null,
        lastActionAt: new Date(),
        rescheduledCount: 0,
        originalTime: formattedTime,
      });

      await syncTaskNotifications({
        id: docRef.id,
        title: title.trim(),
        time: formattedTime,
        date: tomorrowDate,
        priority,
        completed: false,
        status: "pending",
      });

      await syncMorningSummaryNotification(uid);

      resetForm();
      setSuccess(true);
      setError("");
      setTimeout(() => setSuccess(false), 2000);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong while adding the task.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.emoji}>📝</Text>
          <Text style={[styles.title, { color: colors.text }]}>Plan Tomorrow</Text>
          <Text style={[styles.subtitle, { color: colors.subtle }]}>
            What do you want to get done?
          </Text>
        </View>

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder="What do you need to do?"
          placeholderTextColor={colors.subtle}
          value={title}
          onChangeText={setTitle}
        />

        <TextInput
          style={[
            styles.input,
            styles.notesInput,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder="Optional notes or extra detail"
          placeholderTextColor={colors.subtle}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <View style={styles.prioritySection}>
          <Text style={[styles.sectionLabel, { color: colors.subtle }]}>Priority</Text>
          <View style={styles.priorityRow}>
            {(["Low", "Medium", "High"] as Priority[]).map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.priorityChip,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                  priority === item && {
                    backgroundColor: colors.surface,
                    borderColor: colors.tint,
                  },
                ]}
                onPress={() => setPriority(item)}
              >
                <View
                  style={[
                    styles.priorityDot,
                    { backgroundColor: priorityColors[item] },
                  ]}
                />
                <Text style={[styles.priorityChipText, { color: colors.text }]}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.timeButton,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
          onPress={() => setShowPicker(true)}
        >
          <Text style={[styles.timeText, { color: colors.text }]}>
            ⏰{" "}
            {time.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </TouchableOpacity>

        {showPicker && (
          <DateTimePicker
            value={time}
            mode="time"
            is24Hour={false}
            onChange={(event, selected) => {
              setShowPicker(Platform.OS === "ios");
              if (selected) setTime(selected);
            }}
          />
        )}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        {success ? (
          <Text style={[styles.success, { color: colors.subtle }]}>
            Task added and tomorrow’s notifications updated 🌸
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.tint }]}
          onPress={handleAddTask}
        >
          <Text style={styles.buttonText}>Add Task</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: "center", paddingTop: 60, paddingBottom: 32 },
  emoji: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 32, fontWeight: "700" },
  subtitle: { fontSize: 14, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 24,
    marginBottom: 16,
    fontSize: 15,
  },
  notesInput: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  prioritySection: {
    marginHorizontal: 24,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  priorityRow: {
    flexDirection: "row",
  },
  priorityChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 4,
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 7,
  },
  priorityChipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  timeButton: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 24,
    marginBottom: 16,
  },
  timeText: { fontSize: 15 },
  button: {
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginHorizontal: 24,
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: {
    marginBottom: 12,
    textAlign: "center",
    marginHorizontal: 24,
  },
  success: {
    marginBottom: 12,
    textAlign: "center",
    fontSize: 14,
    marginHorizontal: 24,
  },
});
