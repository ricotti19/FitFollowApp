# FitFollowApp
FitFollowApp - Implementation - SE 3354 Group Project

FitFollow is a comprehensive fitness tracking and social accountability application designed to help users monitor workouts, daily steps, nutrition, and body measurements all in one centralized hub. Going beyond traditional standalone trackers, FitFollow bridges self-improvement with community by letting users search for friends, chat in real-time, share 24-hour stories, and publish progress posts with strict multi-tiered audience privacy controls.

## 📋 Project Structure

3-tier Client-Server architecture with a dedicated Computer Vision microservice

Client= frontend, Express-Server= backend, Server= model training CV microservice hosting Python-inclusive layer

```text
FitFollowApp/
├── client/                  # Vite React UI
│   ├── public/
│   │   └── banners/         # banner-1.jpg, banner-2.jpg, banner-3.jpg, banner-4.jpg, dumbbell.png, fitness.png, fitness2.png, fitness3.png, fitness4.png
│   ├── src/
│   │   ├── components/      # Avatar.jsx
│   │   ├── lib/             # api.js, format.js, image.js, plan.js
│   │   ├── pages/           # BodyTab.jsx, Dashboard.css, Dashboard.jsx, FriendsTab.jsx, SettingsPage.jsx, TodayTab.jsx, WorkoutsTab.jsx
│   │   ├── App.jsx          # Main application state & navigation
│   │   ├── index.css        # Global theme tokens & responsive styles
│   │   └── main.jsx         # React entry point
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   └── vite.config.js
├── express-server/          # Node + Express + MongoDB
│   ├── scripts/
│   │   ├── makeMod.js
│   │   ├── seed.js
│   │   └── seedPeople.js
│   ├── src/
│   │   ├── demoPeople.js
│   │   ├── moderation.js
│   │   ├── plan.js
│   │   ├── server.js
│   │   └── visibility.js
│   ├── test/
│   │   ├── integration/
│   │   │   ├── api.test.js
│   │   │   └── db_constraints.test.js
│   │   └── unit/
│   │       ├── moderation.test.js
│   │       └── visibility.test.js
│   ├── package-lock.json
│   └── package.json
├── server/                  # Python 3.12 + Flask + MediaPipe
│   ├── .venv/
│   ├── models/
│   ├── app.py
│   ├── clip_scorer.py
│   ├── features.py
│   ├── model.py
│   ├── pose.py
│   ├── prepare_data.py
│   ├── scoring.py
│   ├── synthetic.py
│   ├── tasks.py
│   └── train.py
├── .gitignore
├── README.md
├── db_test_cases.md
└── ui_test_cases.md
```

## Testing
Testing framework : Jest


## UI (latest):
<img width="3420" height="1764" alt="image" src="https://github.com/user-attachments/assets/efb1e031-27bd-4e27-bd7a-4e4a9310a093" />

<img width="3420" height="1758" alt="image" src="https://github.com/user-attachments/assets/1781340e-028c-4716-babf-c6e69bf5b925" />

<img width="3420" height="1760" alt="image" src="https://github.com/user-attachments/assets/fc9be425-5663-4652-9762-bf6ea3a3ffae" />


