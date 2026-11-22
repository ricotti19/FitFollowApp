# FitFollow: UI / User-Flow Test Cases

These are frontend and user-flow test cases for FitFollow, based on our Deliverable I requirements (FR-1 to FR-32, NFR-1, NFR-6). They're written as manual tests from the user's point of view. Button and tab names match our client (tabs: **Today, Workouts, Body, Friends, Dashboard**) and the stories bar at the top of the app. Screens we haven't built yet (login, settings, presets, report, delete account) use placeholder names, so update them once those pages are done.

## How to read each test

- **Covers:** the requirement IDs this test checks
- **Preconditions:** what has to be true before starting
- **Steps:** what the tester does, in order
- **Expected result:** what should happen for the test to pass
- **Status:** Not run / Pass / Fail (update when we run it)

## Shared test data

| Item | Value |
| --- | --- |
| Test account A | `tester_a` / `tester_a@test.com` |
| Test account B | `tester_b` / `tester_b@test.com` |
| Test account C (not a friend of A) | `tester_c` / `tester_c@test.com` |
| Seed data | Run `express-server/scripts/seed.js` before testing. Use `makeMod.js` to make a moderator account for TC-UI-18. |
| Devices | iPhone (iOS 16+) and Android phone (Android 10+), plus a desktop browser for the web client |
| "Normal mobile connection" | 4G, or browser dev tools throttled to "Fast 4G" |
| Timing | Screen recording or stopwatch, measured from tap to updated screen |

---

## Accounts and profile

### TC-UI-01: Register a new account

**Covers:** FR-1
**Preconditions:** User is logged out. The email `newuser01@test.com` has never been used.

**Steps:**
1. Open the app and tap **Sign up**.
2. Enter email `newuser01@test.com`, username `newuser01`, and a valid password.
3. Tap **Create account**.
4. Log out, tap **Sign up** again, and try the same email with a different username.
5. Try signing up with an invalid email (`newuser01@`) and with an empty password.

**Expected result:**
- Step 3: the account is created and the user lands on the **Today** tab.
- Step 4: the app shows an error that the email is already in use. No second account is made.
- Step 5: each bad field shows an error and the form doesn't submit.

**Status:** Not run

---

### TC-UI-02: Log in, log out, and reset password

**Covers:** FR-2, FR-3
**Preconditions:** Account A exists. The tester can open Account A's email inbox.

**Steps:**
1. Enter Account A's email and correct password. Tap **Log in**.
2. Tap **Log out**.
3. Try to log in with the wrong password.
4. Tap **Forgot password**, enter Account A's email, and tap **Send**.
5. Open the reset email, follow the link, and set a new password.
6. Log in with the old password, then the new one.

**Expected result:**
- Step 1: the user lands on the **Today** tab.
- Step 2: the user goes back to the login screen. Pressing back doesn't reopen the app logged in.
- Step 3: an error shows and the user stays on the login screen.
- Step 4: the app confirms a reset email was sent.
- Step 6: the old password fails and the new one works.

**Status:** Not run

---

### TC-UI-03: Edit profile and set account to public or private

**Covers:** FR-4
**Preconditions:** Logged in as Account A (private by default). Account C logged in on a second device.

**Steps:**
1. Open **Edit profile**.
2. Change the display name, change the username to `tester_a2`, and upload a new photo. Tap **Save**.
3. Turn on **Public account** and save.
4. As C, go to **Friends > Find friends** and search `tester_a2`.
5. Switch A back to private and repeat step 4.

**Expected result:**
- Step 2: the new name, username, and photo show right away.
- Step 4: A shows in results with "Public account" under the username, and C can see A's public posts.
- Step 5: C sees only A's name and username, with no posts.

**Status:** Not run

---

## Workouts

### TC-UI-04: Log a set and view history

**Covers:** FR-5, FR-6, NFR-1
**Preconditions:** Logged in as A on a normal mobile connection. Screen recording on.

**Steps:**
1. Open the **Workouts** tab.
2. Under **Log a set**, type `Bench press`, weight `135`, reps `8`, sets `3`. Tap **Save**.
3. Look at the **History** card.
4. Try tapping **Save** with the exercise name or weight left blank.
5. Log another set on a later day (or change the device date) and reopen **History**.

**Expected result:**
- Step 2: the set shows in **History** as `3×8 @ 135 lb` within **2 seconds** (NFR-1).
- Step 4: nothing is saved.
- Step 5: history is sorted by date, newest on top.

**Status:** Not run

---

### TC-UI-05: Personal record (PR) badge

**Covers:** FR-7
**Preconditions:** A has one Bench press set logged at 135 lb.

**Steps:**
1. On **Workouts**, log Bench press at `130` lb.
2. Log Bench press at `135` lb.
3. Log `bench PRESS` (different capitals) at `145` lb.
4. Log a brand new exercise, `Deadlift`, at `225` lb.

**Expected result:**
- Steps 1 and 2: no **PR** badge, since neither beats the old best.
- Step 3: the set gets a **PR** badge. Capitals don't matter for matching the exercise.
- Step 4: no badge. The first set of an exercise just becomes the starting record.

**Status:** Not run

---

### TC-UI-06: Create, use, and edit workout presets

**Covers:** FR-30, FR-31, FR-32
**Preconditions:** Logged in as A with no presets.

**Steps:**
1. On **Workouts**, open **Presets** and tap **New preset**.
2. Name it `Push Day` and add Bench press (3×8 @ 135), Overhead press (3×10 @ 75), and Dips (3×12). Save.
3. Tap **Push Day > Start workout**.
4. Log one set and finish the workout.
5. Edit the preset: rename it `Push Day A` and change Bench press to 140 lb. Save.
6. Look at the workout from step 4 in **History**.
7. Delete the preset.

**Expected result:**
- Step 2: the preset shows in the list with all three exercises.
- Step 3: a new workout opens already filled with the planned sets, reps, and weights.
- Step 5: the new name and weight show in the preset list.
- Step 6: the old workout still says 135 lb. Editing a preset doesn't change history (NFR-13).
- Step 7: the app asks to confirm, then the preset is gone.

**Status:** Not run

---

### TC-UI-07: AI workout recommendation (accept and reject)

**Covers:** FR-29
**Preconditions:** Logged in as A with age, ability, and goal filled in. The Flask server (`server/app.py`) is running.

**Steps:**
1. Tap **Get a recommended workout**.
2. Read the consent message and agree.
3. Look at the suggestion and tap **Reject**.
4. Ask for another one and tap **Accept**.
5. Stop the Flask server and try step 1 again.

**Expected result:**
- Step 1: the app asks for consent before generating anything.
- Step 3: the suggestion goes away and nothing is added.
- Step 4: the workout is added and can be started like any other.
- Step 5: the app shows a friendly error instead of freezing or crashing. The rest of the app still works.

**Status:** Not run

---

## Nutrition

### TC-UI-08: Log food from the list and track the calorie goal

**Covers:** FR-8, FR-9, FR-11, NFR-1
**Preconditions:** Logged in as A on a normal mobile connection. Nothing logged today.

**Steps:**
1. Open the **Today** tab and find the **Calories** card.
2. Change **Goal** to `2000`.
3. In **Log food**, open the dropdown and check that each item lists its calories.
4. Pick `Banana (105 kcal)` and tap **Add**.
5. Look at the **Calories** card again.
6. Tap **×** next to the banana.

**Expected result:**
- Step 2: the card shows `/ 2000 kcal`.
- Step 4: Banana shows in the list with `1p 27c 0f` and `105 kcal`, within **2 seconds** (NFR-1).
- Step 5: it shows `105 / 2000 kcal`, `1895 kcal left`, the progress bar moves, and Protein/Carbs/Fat show 1g, 27g, 0g.
- Step 6: the banana is removed and totals go back to 0.

**Status:** Not run

---

### TC-UI-09: Create a custom food

**Covers:** FR-10
**Preconditions:** Logged in as A, on the **Today** tab.

**Steps:**
1. In **Log food**, open **Add your own food**.
2. Enter Name `Protein Shake`, kcal `320`, Protein `30`, Carbs `25`, Fat `10`. Tap **Add**.
3. Try adding one with no name.
4. Try adding one with kcal `-50`.

**Expected result:**
- Step 2: the shake shows in today's list and adds 320 kcal and the right macros to the totals.
- Step 3: nothing is added.
- Step 4: nothing is added and the app shows an error.

**Status:** Not run

---

## Body tracking

### TC-UI-10: Record weight and measurements, view trend

**Covers:** FR-12, FR-13
**Preconditions:** Logged in as A with no body entries.

**Steps:**
1. Open the **Body** tab.
2. Enter only Weight `150` and tap **Save entry**.
3. Look at the **Progress** card.
4. Add a second entry: Weight `149` plus Chest, Waist, Hips, Arm, and Thigh.
5. Tap **Save entry** with every field empty.

**Expected result:**
- Step 2: the entry saves even with no measurements.
- Step 3: it shows `150 lb` and says "Log two weigh-ins to see your trend."
- Step 4: a trend line chart appears, and the entry lists all five measurements.
- Step 5: nothing is saved.

**Status:** Not run

---

## Steps

### TC-UI-11: Enter steps manually and view the 7-day chart

**Covers:** FR-14, FR-16
**Preconditions:** Logged in as A. Health sync off.

**Steps:**
1. On the **Today** tab, find the **Steps** card.
2. Type `6500` in **Today's steps** and tap **Save steps**.
3. Enter steps for a few earlier days (change the device date, or use seed data).
4. Look at the bar chart under the progress bar.

**Expected result:**
- Step 2: it shows `6,500 / 10,000` and the progress bar fills about 65%.
- Step 4: the chart shows 7 bars for the last 7 days, with today's bar darker than the rest.

**Status:** Not run

---

### TC-UI-12: Sync steps from Apple Health / Health Connect

**Covers:** FR-15
**Preconditions:** Phone app build on an iPhone with Apple Health and an Android with Health Connect, both with steps today. Sync never turned on.

**Steps:**
1. On the web client, open **Connect a watch** under the Steps card.
2. On the phone app, tap **Connect health app**.
3. Tap **Deny** on the permission prompt.
4. Try again and tap **Allow**.
5. Walk around, then reopen the app.
6. Turn off the permission in phone settings and reopen the app.

**Expected result:**
- Step 1: the web client explains that watch sync needs the phone app and that manual entry works for now.
- Step 2: the app explains why it wants step access before asking.
- Step 3: nothing syncs and manual entry still works.
- Steps 4 and 5: steps from the health app show up and update on their own.
- Step 6: syncing stops and manual entry still works, no crash.

**Status:** Not run

---

## Social

### TC-UI-13: Search for users and handle friend requests

**Covers:** FR-17, FR-18
**Preconditions:** A, B, and C exist and no one is friends. A and B logged in on separate devices.

**Steps:**
1. As A, open **Friends** and type `tester_b` in **Find friends**. Then try `@tester_b` and part of B's display name.
2. Search `zzzz`.
3. Tap **Add friend** next to B.
4. As B, accept the request.
5. As A, send a request to C. As C, decline it.

**Expected result:**
- Step 1: B shows up each time with only name and @username, no posts.
- Step 2: "No one matches that. Check the spelling or try their @username."
- Step 3: the button changes to **Requested**.
- Step 4: B shows in A's friend chips, and A's search result now says **Friends**.
- Step 5: A and C are not friends.

**Status:** Not run

---

### TC-UI-14: Remove a friend and block a user

**Covers:** FR-19
**Preconditions:** A and B are friends. A and C are not.

**Steps:**
1. As A, open B's profile and tap **Remove friend**. Confirm.
2. As A, open C's profile and tap **Block**. Confirm.
3. As C, search for A and try to add or message them.

**Expected result:**
- Step 1: B's chip disappears from A's **Friends** tab, and A disappears from B's.
- Step 3: C can't find A, send a request, or send a message.

**Status:** Not run

---

### TC-UI-15: Real-time chat with a friend

**Covers:** FR-20
**Preconditions:** A and B are friends and both online on separate devices.

**Steps:**
1. As A, open **Friends** and tap B's chip.
2. Type `Leg day tomorrow?` and press **Enter**.
3. As B, reply `Yes 6am` with the **Send** button.
4. As A, tap **Send** with an empty message box.

**Expected result:**
- Step 1: the card title changes to "Chat with tester_b".
- Steps 2 and 3: each message appears on the other device without refreshing, within about 3 seconds (NFR-2). Your messages are on the right, theirs on the left.
- Step 4: nothing is sent.
- Only friends show as chips, so you can't chat with a non-friend.

**Status:** Not run

---

### TC-UI-16: Progress post with audience setting

**Covers:** FR-21, FR-22
**Preconditions:** A and B are friends, A and C are not. All three logged in.

**Steps:**
1. As A, go to **Friends > Share progress**. Type `Squat up 10 lb`, attach a photo, choose **Keep private**, and tap **Post**.
2. Post a second one with **Share with friends**.
3. Post a third one set to **Public**.
4. Check A's posts as B, then as C.

**Expected result:**
- Step 1: the post shows with "🔒 Only you" and the photo.
- Step 2: the post shows with "Shared".
- A sees all three. B sees only the friends and public posts. C sees only the public one.
- The privacy check happens on the server (`isVisibleTo`), so C can't get the private post even by calling the API directly.

**Status:** Not run

---

### TC-UI-17: Stories (create, view, react, reply, expire)

**Covers:** FR-23, FR-24, FR-25, FR-26
**Preconditions:** A and B are friends. A public account (like `Priya` from the seed data) has a story.

**Steps:**
1. As A, tap **Add** in the stories bar.
2. Type `Leg day done`, pick a color, choose **Friends only**, and tap **Post story**.
3. As B, look at the stories bar, then tap A's circle.
4. Close the story and look at A's ring again.
5. Reopen A's story, tap 🔥, type `Nice!` in the reply box, and tap **Send**.
6. Tap the public account's circle.
7. Wait 24 hours after A posted (or change the device clock).

**Expected result:**
- Step 2: the story opens right away. "Stories disappear after 24 hours." shows on the compose screen.
- Step 3: A's story plays with the progress bars at the top and moves forward on its own.
- Step 4: A's ring turns gray (viewed).
- Step 5: the 🔥 button stays highlighted, and A gets "Replied to your story: Nice!" in their chat with B.
- Step 6: the public account shows "Public" under the name.
- Step 7: A's story is gone for everyone.

**Status:** Not run

---

## Privacy and safety

### TC-UI-18: Report a post, story, message, or user

**Covers:** FR-27
**Preconditions:** A and B are friends. B has a post, a story, and a chat message with A. A moderator account exists (`makeMod.js`).

**Steps:**
1. As A, tap **Report** on B's post, pick a reason, and submit.
2. Do the same for B's story, a message from B, and B's profile.
3. Log in as the moderator and open the report queue.

**Expected result:**
- Steps 1 and 2: each report shows a confirmation.
- Step 3: all four reports show up with the reason.

**Status:** Not run

---

### TC-UI-19: Delete account and all data

**Covers:** FR-28
**Preconditions:** Account A has workouts, food, body entries, posts, a story, and friends.

**Steps:**
1. As A, tap **Delete account**.
2. Read the warning and confirm.
3. Try logging in as A.
4. As B, search for A and look at A's old posts and story.

**Expected result:**
- Step 2: the app clearly warns this can't be undone before deleting.
- Step 3: login fails.
- Step 4: A doesn't show in search, and A's posts and story are gone.

**Status:** Not run

---

## Usability

### TC-UI-20: First-time user logs a set and a food in under 3 minutes

**Covers:** NFR-6
**Preconditions:** 5 testers who have never seen FitFollow, each with a new logged-in account. No instructions. Timer ready.

**Steps:**
1. Tell the tester: "Log one bench press set and add one banana to today's food."
2. Start the timer.
3. Stop it when both show up (banana on **Today**, set in **Workouts > History**).
4. Write down anywhere they got stuck.

**Expected result:**
- Every tester finishes both without help in **under 3 minutes**.
- Any confusing spot gets logged as a usability issue.

**Status:** Not run

---

## Traceability matrix

| Requirement | Test case(s) |
| --- | --- |
| FR-1 | TC-UI-01 |
| FR-2, FR-3 | TC-UI-02 |
| FR-4 | TC-UI-03 |
| FR-5, FR-6 | TC-UI-04 |
| FR-7 | TC-UI-05 |
| FR-8, FR-9, FR-11 | TC-UI-08 |
| FR-10 | TC-UI-09 |
| FR-12, FR-13 | TC-UI-10 |
| FR-14, FR-16 | TC-UI-11 |
| FR-15 | TC-UI-12 |
| FR-17, FR-18 | TC-UI-13 |
| FR-19 | TC-UI-14 |
| FR-20 | TC-UI-15 |
| FR-21, FR-22 | TC-UI-16 |
| FR-23, FR-24, FR-25, FR-26 | TC-UI-17 |
| FR-27 | TC-UI-18 |
| FR-28 | TC-UI-19 |
| FR-29 | TC-UI-07 |
| FR-30, FR-31, FR-32 | TC-UI-06 |
| NFR-1 | TC-UI-04, TC-UI-08 |
| NFR-6 | TC-UI-20 |
