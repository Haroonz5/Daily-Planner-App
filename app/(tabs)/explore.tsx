import DateTimePicker from "@react-native-community/datetimepicker";
import * as Notifications from "expo-notifications";
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
  View,
} from "react-native";
import { auth, db } from "../../constants/firebaseConfig";

type Priority = "Low" | "Medium" | "High";

const priorityColors: Record<Priority, string> = {
  Low: "#8dcf9f",
  Medium: "#f2b97f",
  High: "#e58ca8",
};

export default function AddTask() {
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

  const scheduleNotification = async (taskTitle: string, taskTime: Date) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(taskTime.getHours());
    tomorrow.setMinutes(taskTime.getMinutes());
    tomorrow.setSeconds(0);
    tomorrow.setMilliseconds(0);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Task Reminder",
        body: taskTitle,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: tomorrow,
      },
    });
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

      await addDoc(collection(db, "users", uid, "tasks"), {
        title: title.trim(),
        notes: notes.trim(),
        priority,
        time: time.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        date: getTomorrowDate(),
        completed: false,
        createdAt: new Date(),
      });

      await scheduleNotification(title.trim(), time);
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
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.emoji}>📝</Text>
          <Text style={styles.title}>Plan Tomorrow</Text>
          <Text style={styles.subtitle}>What do you want to get done?</Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="What do you need to do?"
          placeholderTextColor="#c4b5c8"
          value={title}
          onChangeText={setTitle}
        />

        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="Optional notes or extra detail"
          placeholderTextColor="#c4b5c8"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <View style={styles.prioritySection}>
          <Text style={styles.sectionLabel}>Priority</Text>
          <View style={styles.priorityRow}>
            {(["Low", "Medium", "High"] as Priority[]).map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.priorityChip,
                  priority === item && styles.priorityChipActive,
                ]}
                onPress={() => setPriority(item)}
              >
                <View
                  style={[
                    styles.priorityDot,
                    { backgroundColor: priorityColors[item] },
                  ]}
                />
                <Text style={styles.priorityChipText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={styles.timeButton}
          onPress={() => setShowPicker(true)}
        >
          <Text style={styles.timeText}>
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

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>Task added for tomorrow 🌸</Text> : null}

        <TouchableOpacity style={styles.button} onPress={handleAddTask}>
          <Text style={styles.buttonText}>Add Task</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdf6ff" },
  header: { alignItems: "center", paddingTop: 60, paddingBottom: 32 },
  emoji: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 32, fontWeight: "700", color: "#4a3f55" },
  subtitle: { fontSize: 14, color: "#9b8aa8", marginTop: 6 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e8d8f0",
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 24,
    marginBottom: 16,
    fontSize: 15,
    color: "#4a3f55",
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
    color: "#9b8aa8",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  priorityRow: {
    flexDirection: "row",
    gap: 10,
  },
  priorityChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e8d8f0",
    borderRadius: 14,
    paddingVertical: 14,
  },
  priorityChipActive: {
    backgroundColor: "#f7eefb",
    borderColor: "#c4a8d4",
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 7,
  },
  priorityChipText: {
    fontSize: 14,
    color: "#4a3f55",
    fontWeight: "600",
  },
  timeButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e8d8f0",
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 24,
    marginBottom: 16,
  },
  timeText: { fontSize: 15, color: "#4a3f55" },
  button: {
    backgroundColor: "#c4a8d4",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginHorizontal: 24,
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: {
    color: "#e07a9b",
    marginBottom: 12,
    textAlign: "center",
    marginHorizontal: 24,
  },
  success: {
    color: "#9b8aa8",
    marginBottom: 12,
    textAlign: "center",
    fontSize: 14,
  },
});
