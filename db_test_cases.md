# FitFollow — MongoDB Constraint & Privacy Test Cases



## Some assumptions

- **Account uniqueness:** Email and username should be unique; the sample tests use *exactly equal* duplicates. The team should separately agree whether email/username uniqueness is case-insensitive and whether whitespace is normalized. A unique MongoDB index (with appropriate normalization/collation) is preferable to an API-only pre-check.
- **Numeric validation:** Negative calories, exercise weight, body weight, macronutrients, step counts, and calorie goals should be rejected. Zero exercise weight may be valid for bodyweight movements; the tests do not reject zero weight. Whether zero calorie goals or body weight are valid is a separate specification decision. Repetitions/number of sets are assumed to be positive whole numbers.
- **Privacy:** `private` means *author only*. `friends` means *author plus users with an accepted, currently valid friendship*, excluding blocked users. `public` is not the focus here. Pending requests do not confer friend access. These are implementation rules proposed to make FR-21/FR-22/NFR-4 testable.
- **Placeholder API routes:** `POST /api/users`, `POST /api/workouts`, `POST /api/foods`, `POST /api/body-records`, `POST /api/steps`, `PUT /api/calorie-goal`, `GET /api/posts/:id`, `GET /api/feed`, `GET /api/posts/:id/photo`. Replace with actual routes.


### Pre-prepared test data

| Item | Meaning |
|---|---|
| `owner` | Signed-in user who creates the post |
| `friend` | Signed-in user with accepted, unblocked friendship with `owner` |
| `stranger` | Signed-in user with no friendship to `owner` |
| `pending` | Signed-in user with a pending friend request to/from `owner` |
| `blocked` | Signed-in user previously connected to `owner`, now blocked by `owner` |
| `post_private` | Post authored by `owner`, audience = `private`, optional attached photo |
| `post_friends` | Post authored by `owner`, audience = `friends`, optional attached photo |

## Account constraints (FR-1)

### TC-01 — Reject duplicate email

- **Precondition:** One account exists with `email: "alex@example.test"` and `username: "alex1"`.
- **Input:** Attempt registration with `{ "email": "alex@example.test", "username": "alex2", "password": "ValidTestPassword!23" }`.
- **Expected DB/API result:** Registration is rejected; no second user with that email is stored.
- **Pass/Fail criteria:** **Pass** only if the API rejects the attempt and the user count for `alex@example.test` remains **1**; otherwise **Fail**.

### TC-02 — Reject duplicate username

- **Precondition:** An account exists with `username: "fit_alex"` and `email: "alex@example.test"`.
- **Input:** Attempt registration with `{ "email": "other@example.test", "username": "fit_alex", "password": "ValidTestPassword!23" }`.
- **Expected DB/API result:** no second account with that username is inserted.
- **Pass/Fail criteria:** **Pass** only if the request fails and the user count for username `fit_alex` remains **1**; otherwise **Fail**.

### TC-03 — Accept distinct registration and persist a safe account record

- **Precondition:** The email and username do not exist.
- **Input:** `{ "email": "newuser@example.test", "username": "newuser_27", "password": "ValidTestPassword!23" }`.
- **Expected DB/API result:** Registration succeeds; exactly one account is stored with the expected email/username; the stored password representation is a hash, **not** the plaintext value.
- **Pass/Fail criteria:** **Pass** only if one account is created, its credentials are stored safely, and no duplicate appears; otherwise **Fail**.

## Numeric/data-validation constraints (FR-5, FR-10–FR-12, FR-14)

### TC-04 — Reject negative workout-set weight

- **Precondition:** `owner` is authenticated and can log workouts.
- **Input:** Save a workout set `{ "exercise": "Bench Press", "weight": -45, "reps": 8, "sets": 3 }`.
- **Expected DB/API result:** Validation error; no workout/set document contains the submitted negative weight.
- **Pass/Fail criteria:** **Pass** only if the API rejects it and no invalid workout record is persisted; otherwise **Fail**.

### TC-05 — Reject invalid repetitions or set counts

- **Precondition:** `owner` is authenticated.
- **Input:** Test each independently: `{ "exercise": "Squat", "weight": 100, "reps": -2, "sets": 3 }` **and** `{ "exercise": "Squat", "weight": 100, "reps": 8, "sets": 0 }`.
- **Expected DB/API result:** Both inputs fail validation; no invalid exercise entry is saved.
- **Pass/Fail criteria:** **Pass** only if **both** variants are rejected with no DB insert/update; otherwise **Fail**.

### TC-06 — Reject negative body weight

- **Precondition:** `owner` is authenticated.
- **Input:** Save body measurement `{ "date": "2026-11-23", "weight": -70, "waist": 32 }`.
- **Expected DB/API result:** Validation error; the negative-weight body record is not created.
- **Pass/Fail criteria:** **Pass** only if the request is rejected and the saved body-record count is unchanged; otherwise **Fail**.

### TC-07 — Reject negative calories in a custom food

- **Precondition:** `owner` is authenticated.
- **Input:** Create custom food `{ "name": "Test Food", "calories": -120, "protein": 10, "carbs": 15, "fat": 2 }`.
- **Expected DB/API result:** Validation error; the custom food is not stored and cannot be added to the food list.
- **Pass/Fail criteria:** **Pass** only if the API rejects the document and MongoDB contains no `Test Food` from this attempt; otherwise **Fail**.

### TC-08 — Reject negative macronutrients in a custom food

- **Precondition:** `owner` is authenticated.
- **Input:** Test custom-food creation three times, each with only one negative field: `protein: -1`, `carbs: -1`, or `fat: -1` (other macros and calories nonnegative).
- **Expected DB/API result:** Every attempt fails validation; no invalid custom food is stored.
- **Pass/Fail criteria:** **Pass** only if **all three** variants are rejected; otherwise **Fail**.

### TC-09 — Reject negative daily calorie goal

- **Precondition:** `owner` has a saved valid goal of `2000` calories.
- **Input:** Update daily calorie goal to `-500`.
- **Expected DB/API result:** Validation error; the current saved goal remains `2000`.
- **Pass/Fail criteria:** **Pass** only if the update fails and the prior goal is unchanged in MongoDB; otherwise **Fail**.

### TC-10 — Reject negative manual step count

- **Precondition:** `owner` is authenticated, with an existing or empty daily step record.
- **Input:** Submit `{ "date": "2026-11-23", "stepCount": -100 }`.
- **Expected DB/API result:** Validation error; no negative step count is inserted and any existing entry is not overwritten.
- **Pass/Fail criteria:** **Pass** only if the invalid count is rejected and the DB record remains valid/unchanged; otherwise **Fail**.

## Post audience and authorization constraints (FR-18–FR-22, NFR-4)


### TC-11 — Author can retrieve own private post

- **Precondition:** `owner` authored `post_private` with `audience: "private"`.
- **Input:** Authenticated `owner` requests `GET /api/posts/:id` for `post_private`.
- **Expected DB/API result:** Successful response containing the author's own post; stored audience remains `private`.
- **Pass/Fail criteria:** **Pass** only if the author can retrieve the post without altering its audience; otherwise **Fail**.

### TC-12 — Accepted friend cannot read a private post

- **Precondition:** `friend` has an accepted friendship with `owner`; `post_private` exists.
- **Input:** Authenticated `friend` requests `GET /api/posts/:id` for `post_private`.
- **Expected DB/API result:** Access denied; no post text, image data, or private metadata returned.
- **Pass/Fail criteria:** **Pass** only if the API blocks access despite the friendship and leaks no protected data; otherwise **Fail**.

### TC-13 — Stranger cannot read a private post

- **Precondition:** `stranger` has no friendship with `owner`; `post_private` exists.
- **Input:** Authenticated `stranger` requests `GET /api/posts/:id` for `post_private`.
- **Expected DB/API result:** Access denied with no private post content or photo information.
- **Pass/Fail criteria:** **Pass** only if zero protected fields or media data are returned; otherwise **Fail**.

### TC-14 — Accepted friend can read a friends-only post

- **Precondition:** `friend` has an accepted, unblocked friendship with `owner`; `post_friends` exists.
- **Input:** Authenticated `friend` requests `GET /api/posts/:id` for `post_friends`.
- **Expected DB/API result:** Successful authorized response returning the post, with stored audience still `friends`.
- **Pass/Fail criteria:** **Pass** only if the accepted friend can view the intended post and access rules remain unchanged; otherwise **Fail**.

### TC-15 — Stranger cannot read a friends-only post

- **Precondition:** `stranger` has no friendship with `owner`; `post_friends` exists.
- **Input:** Authenticated `stranger` requests `GET /api/posts/:id` for `post_friends`.
- **Expected DB/API result:** Access denied; no friends-only post body, photo, or metadata leaks.
- **Pass/Fail criteria:** **Pass** only if the stranger receives no protected content; otherwise **Fail**.

### TC-16 — Unauthenticated caller cannot read restricted posts

- **Precondition:** Both `post_private` and `post_friends` exist.
- **Input:** Without a session/token, request each restricted post through `GET /api/posts/:id`.
- **Expected DB/API result:** Both requests rejected; neither post appears in any response.
- **Pass/Fail criteria:** **Pass** only if **both** calls disclose no restricted data; otherwise **Fail**.

### TC-17 — Pending friend request does not grant friends-only access

- **Precondition:** `pending` has a *pending*, not accepted, friend request with `owner`; `post_friends` exists.
- **Input:** `pending` requests `GET /api/posts/:id` for `post_friends`.
- **Expected DB/API result:** Access denied because pending request status does not satisfy the friends audience rule.
- **Pass/Fail criteria:** **Pass** only if the pending requester receives no post text, media, or protected metadata; otherwise **Fail**.

### TC-18 — Blocking removes access to friends-only posts

- **Precondition:** `blocked` was previously an accepted friend with access to `post_friends`; `owner` then blocks this account.
- **Input:** After the block is stored, `blocked` requests `GET /api/posts/:id` for `post_friends`.
- **Expected DB/API result:** Request denied immediately under the current relationship/block state; post is not returned, even if it was accessible previously.
- **Pass/Fail criteria:** **Pass** only if the backend rechecks current permissions and denies all protected content; otherwise **Fail**.

### TC-19 — Feed/list endpoints filter private and friends-only posts

- **Precondition:** `owner` has `post_private` and `post_friends` with unique identifiable text. `friend` is accepted; `stranger` is not.
- **Input:** Query `GET /api/feed` as `stranger` and as `friend`; inspect all pages of results, previews, counts, and embedded URLs.
- **Expected DB/API result:** `stranger` receives **neither** restricted post; `friend` may receive `post_friends` but **never** `post_private`. No hidden post content or private photo links are included in previews or metadata.
- **Pass/Fail criteria:** **Pass** only if both audience-filtering expectations hold across every returned page/field; otherwise **Fail**.

### TC-20 — Direct photo access cannot bypass audience checks

- **Precondition:** `post_private` and `post_friends` each have an identifiable attached test photo; photo URLs or IDs are known to the tester. Use a storage route or signed URL according to actual implementation.
- **Input:** As `stranger`, directly request both photos via `GET /api/posts/:id/photo` (or actual storage access path), without first opening the post. Also attempt access with an expired or absent authorization token where applicable.
- **Expected DB/API result:** No image bytes, still-valid public URL, or reusable unrestricted download link for either post is exposed to the unauthorized caller; backend/storage access policy enforces the audience.
- **Pass/Fail criteria:** **Pass** only if every unauthorized direct-media attempt fails to disclose photo data; otherwise **Fail**.


