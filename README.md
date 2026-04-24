Daily Planner App
A mobile productivity app built with React Native and Firebase that helps users plan their next day the night before.

Features
Authentication — Sign up and log in with email and password
Add Tasks — Input tasks with a specific time for the next day
Today View — See all of today's tasks organized by time
Future Plans — View upcoming tasks scheduled beyond today
Mark Complete — Tap the circle to mark tasks as done with strikethrough
Delete Tasks — Remove tasks with the X button
Progress Bar — Visual tracker showing completed vs total tasks
Push Notifications — Get notified at the scheduled time of each task
Carry Over — Incomplete tasks from yesterday automatically move to today
Current Task Highlight — Highlights whichever task is active right now


Tech Stack
React Native (Expo)
Firebase Authentication
Cloud Firestore
Expo Notifications
TypeScript


Getting Started
Clone the repo
Run npm install
Run npx expo start
Scan the QR code with Expo Go on your phone


Project Structure
app/
(tabs)/
index.tsx - Today View (main screen)
explore.tsx - Add Task screen
_layout.tsx - Root layout with auth guard
login.tsx - Login screen
signup.tsx - Signup screen
constants/
firebaseConfig.ts - Firebase setup
hooks/ - Custom hooks

Status
Currently in active development. Phase 2 in progress. UI polish, stats screen, and AI features coming soon.
