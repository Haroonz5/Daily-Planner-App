import DateTimePicker from "@react-native-community/datetimepicker";
import * as Notifications from 'expo-notifications';
import { addDoc, collection } from "firebase/firestore";
import { useState } from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { auth, db } from "../../constants/firebaseConfig";

export default function AddTask() {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  };

  const scheduleNotification = async (title: string, time: Date) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(time.getHours());
    tomorrow.setMinutes(time.getMinutes());
    tomorrow.setSeconds(0);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Task Reminder",
        body: title,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: tomorrow,
      },
    });
  };

  const handleAddTask = async () => {
    if (!title.trim()) {
      setError("Please enter a task title");
      return;
    }
    try {
      const uid = auth.currentUser?.uid;
      await addDoc(collection(db, "users", uid!, "tasks"), {
        title,
        time: time.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        date: getTomorrowDate(),
        completed: false,
        createdAt: new Date(),
      });
      setTitle("");
      await scheduleNotification(title, time);
      setSuccess(true);
      setError("");
      setTimeout(() => setSuccess(false), 2000);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
        <TouchableOpacity
          style={styles.timeButton}
          onPress={() => setShowPicker(true)}
        >
          <Text style={styles.timeText}>
            ⏰{" "}
            {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
        {success ? <Text style={styles.success}>Task added! 🌸</Text> : null}
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
  error: { color: "#e07a9b", marginBottom: 12, textAlign: "center", marginHorizontal: 24 },
  success: { color: "#9b8aa8", marginBottom: 12, textAlign: "center", fontSize: 14 },
});