# FitFollowApp
FitFollowApp - Implementation - SE 3354 Group Project

FitFollow is a comprehensive fitness tracking and social accountability mobile application designed to help users monitor workouts, daily steps, nutrition, and body measurements all in one centralized hub. Going beyond traditional standalone trackers, FitFollow bridges self-improvement with community by letting users search for friends, chat in real-time, share 24-hour stories, and publish progress posts with strict multi-tiered audience privacy controls.

## 📋 Project Structure

```text
FitFollowApp/
├── client/                  # Vite React UI (Tabs: Today, Workouts, Body, Friends, Dashboard)
│   ├── public/
│   │   └── banners/         # fitness.png, fitness2.png, fitness3.png, fitness4.png
│   ├── src/
│   │   ├── lib/             # api.js, format.js, image.js
│   │   ├── pages/           # BodyTab.jsx, Dashboard.css, Dashboard.js(x), FriendsTab.jsx, TodayTab.jsx, WorkoutsTab.jsx
│   │   ├── App.jsx          # Main application state & navigation
│   │   ├── index.css        # Global theme tokens & responsive styles
│   │   └── main.jsx         # React entry point
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   └── vite.config.js
├── express-server/          # Node + Express + MongoDB (Routes for FR-1 to FR-32 + Privacy Filter)
│   ├── scripts/
│   │   ├── makeMod.js
│   │   └── seed.js
│   ├── src/
│   │   ├── middleware/      # auth.js (JWT + isVisibleTo privacy enforcement)
│   │   └── server.js        # Express server entry & API routes
│   ├── test/
│   │   └── integration/
│   │       └── api.test.js
│   ├── .env
│   ├── package-lock.json
│   └── package.json
└── server/                  # Python 3.12 + Flask + MediaPipe (CV moderation pipeline)
    ├── .venv/
    ├── models/              # pose_landmarker_lite.task, workout_classifier.pth
    ├── app.py               # Flask inference API
    ├── clip_scorer.py
    ├── features.py
    ├── model.py
    ├── pose.py
    ├── prepare_data.py      # Dataset preprocessing & feature extraction
    ├── scoring.py
    ├── synthetic.py
    ├── tasks.py
    └── train.py             # Classifier model training script

```

<img width="3414" height="1738" alt="image" src="https://github.com/user-attachments/assets/12c78c53-5312-41c8-99ef-94c44a966fce" />
