# FitFollowApp
FitFollowApp - Implementation - SE 3354 Group Project

FitFollow is a comprehensive fitness tracking and social accountability mobile application designed to help users monitor workouts, daily steps, nutrition, and body measurements all in one centralized hub. Going beyond traditional standalone trackers, FitFollow bridges self-improvement with community by letting users search for friends, chat in real-time, share 24-hour stories, and publish progress posts with strict multi-tiered audience privacy controls.


FITFOLLOW/
├── client/                  # Vite React UI (4 tabs matching your screenshot: Today, Workouts, Body, Friends)
│   └── src/
│       ├── lib/             # api.js, format.js, image.js (Claude already created these!)
│       ├── pages/           # TodayTab.jsx, WorkoutsTab.jsx, BodyTab.jsx, FriendsTab.jsx
│       ├── App.jsx
│       └── index.css        # Claude already created this!
├── express-server/          # Node + Express + MongoDB (Routes for FR-1 to FR-32 + UML Privacy Filter)
│   └── src/
│       ├── middleware/      # auth.js (JWT + isVisibleTo privacy enforcement)
│       └── app.js
└── server/                  # Python 3.12 + Flask + MediaPipe (Your adapted NrityaWeb CV pipeline)
    ├── dataset/             # not_workout/ (0) & workout_verified/ (1)
    ├── models/              # workout_classifier.pth
    ├── prepare_data.py
    ├── train.py
    └── app.py
```[cite: 30]
