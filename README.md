# FitFollowApp
FitFollowApp - Implementation - SE 3354 Group Project

FitFollow is a comprehensive fitness tracking and social accountability mobile application designed to help users monitor workouts, daily steps, nutrition, and body measurements all in one centralized hub. Going beyond traditional standalone trackers, FitFollow bridges self-improvement with community by letting users search for friends, chat in real-time, share 24-hour stories, and publish progress posts with strict multi-tiered audience privacy controls.

## 📋 Project Structure

```text
FITFOLLOW/
├── client/                  # Vite React UI (4 tabs: Today, Workouts, Body, Friends)
│   └── src/
│       ├── lib/             # api.js, format.js, image.js
│       ├── pages/           # TodayTab.jsx, WorkoutsTab.jsx, BodyTab.jsx, FriendsTab.jsx
│       ├── App.jsx          # Main application state & navigation
│       └── index.css        # Global theme tokens & responsive styles
├── express-server/          # Node + Express + MongoDB (Routes for FR-1 to FR-32 + Privacy Filter)
│   └── src/
│       ├── middleware/      # auth.js (JWT + isVisibleTo privacy enforcement)
│       └── app.js           # Express server entry & API routes
└── server/                  # Python 3.12 + Flask + MediaPipe (CV moderation pipeline)
    ├── dataset/             # not_workout/ (0) & workout_verified/ (1)
    ├── models/              # workout_classifier.pth
    ├── prepare_data.py      # Dataset preprocessing & feature extraction
    ├── train.py             # Classifier model training script
    └── app.py               # Flask inference API
```[cite: 30]
