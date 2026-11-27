# FitFollowApp
(SE 3354 Group Project)

## Members:

Shriya Shenoj (ricotti19)

Melissa Mejia (dal596226)

Ethan Diep (ethan288610)

Sakethram Vedula (sxv230145)

Soham Kulkarni (skk210008)

## Idea:

FitFollow is a fitness tracking and social accountability app that brings workouts, daily steps, nutrition, and body measurements into one centralized hub.
Unlike Instagram, which optimizes for passive scrolling and photo aesthetics, FitFollow embeds daily macro tracking, TDEE calorie planning, strength PR detection, and YouTube form coaching directly into a social accountability loop—letting users share text-only workout wins or logged PRs without needing a photo. It pairs personal tracking with a supportive community through friend search, real-time DMs, 24-hour stories, and multi-tiered audience privacy controls.

## 📋 Project Structure:

3-tier Client-Server architecture MERN Stack (MongoDB, Express.js, React.js, Node.js) with a dedicated Computer Vision microservice

Express.js serves as the lightweight backend framework that bridges the React frontend and MongoDB database on top of Node.js runtime environment, minimizing boilerplate code as much as possible for setup/connection

(Client= frontend, Express-Server= backend, Server= model training CV microservice hosting Python files)

```text
FitFollowApp/

├── client/                  # Vite React UI
│   ├── public/
│   │   └── banners/         # jpgs and pngs used for the front pages' UI/UX
│   ├── src/
│   │   ├── components/      # Avatar.jsx
│   │   ├── lib/             # api.js, format.js, image.js, plan.js
│   │   ├── pages/           # AuthDialog.jsx, BodyTab.jsx, Dashboard.css, Dashboard.jsx, FriendsDialogs.jsx, FriendsPanel.jsx, FriendsTab.jsx, InfoDialog.jsx, LandingViews.jsx, PostComposer.jsx, ResetPasswordDialog.jsx, SettingsPage.jsx, TodayTab.jsx, UserProfileView.jsx, WorkoutsTab.jsx, dialogShared.js, HelpPage.jsx
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
│   │   ├── seedFeedImages.js
│   │   ├── seedPeople.js
│   │   └── seedStories.js
│   ├── src/
│   │   ├── demoPeople.js
│   │   ├── exercises.js
│   │   ├── matching.js
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
│   │   ├── pose_landmarker_lite.task
│   │   └── relevance_classifier.pth
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
```

## Testing
Node's native testing framework

## Deployment: 4-Service Distributed Cloud Architecture
  * MongoDB Atlas Cloud Database
  * Render Web Service for Node/Express API
  * Modal to host the serverless Python ML & CV service 
  * Vercel to host Frontend
+ Connected fitfollow-api.onrender.com to uptimerobot for as less latency as possible, considering we are on Render free tier

## UI:
<img width="3420" height="1764" alt="image" src="https://github.com/user-attachments/assets/efb1e031-27bd-4e27-bd7a-4e4a9310a093" />

<img width="3420" height="1758" alt="image" src="https://github.com/user-attachments/assets/1781340e-028c-4716-babf-c6e69bf5b925" />

<img width="3420" height="1760" alt="image" src="https://github.com/user-attachments/assets/fc9be425-5663-4652-9762-bf6ea3a3ffae" />
