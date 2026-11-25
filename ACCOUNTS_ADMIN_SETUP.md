# Adding "Register a new user" + "Reset a password" to another dashboard

Several Snackible internal dashboards sign people in against **one shared Google Sheet** of
accounts. Three already have a way to add a new account (gated by the master password) and to
reset a password (gated by a marked admin's password), built the same way in all of them so the
sheet stays consistent no matter which dashboard someone used to manage it. The Ops x B2B
dashboard ([Ops_Dashboard](https://github.com/Snackible/Ops_Dashboard), `server/actions.js` +
`server/lib/usersTable.js`) follows the same rules; the table covers the other two:

| | B2B Delivery Tracker ("Ops x B2B") | CRM |
|---|---|---|
| Repo | [Delivery_Tracker_OpsxB2B](https://github.com/Snackible/Delivery_Tracker_OpsxB2B) | [CRM_Database](https://github.com/Snackible/CRM_Database) |
| Data layer | `lib/store.js` (`getUsers`, `addUser`, `getResetRequests`, `resetUserPassword`) | `lib/accounts.js` (`getAccounts`, `registerAccount`, `getResetRequests`, `resetAccountPassword`) |
| Password hashing | `lib/pinVault.js` | `lib/pinVault.js` (identical copy) |
| Register API | `api/register.js` | `app/api/register/route.js` |
| Reset API | `api/reset-password.js` | `app/api/reset-password/route.js` |
| Register UI | `public/index.html` + `public/app.js` (`registerForm`) | `components/RegisterForm.jsx`, `app/register/page.jsx` |
| Reset UI | `public/index.html` + `public/app.js` (`resetForm`) | `components/ResetForm.jsx`, `app/reset-password/page.jsx` |
| Reference version | 1.4.0 (admin-key reset) | 0.9.0 (admin-key reset) |

Read whichever of those two is closest in stack to the new dashboard before writing anything —
copy its naming, error messages and validation rather than inventing a new pattern. This file is
the abstract checklist; the two repos above are the working code.

## The shared sheet

- **Link**: `https://docs.google.com/spreadsheets/d/1RKbmZ-MWJ-JNyNe7WzO7HZfmfWQZL4RXJ_Gs8PiCA6Q/edit`
- **Tab**: `Users`
- **Columns** (header text, order doesn't matter — found by name): `username`, `password`, `role`
  (`ops`, `b2b`, `admin`, or `master-admin`), `account_id`, `display_name`, `Email`, `Contact`,
  **`Reset`** (blank normally; a `*` in an **admin's** row makes that admin a reset admin - see 5).
- **Service account**: `snackible-aditi@turing-guard-506009-g7.iam.gserviceaccount.com` — share
  the sheet with this address as **Editor** (registering and resetting both write rows/cells; just
  Viewer is enough for sign-in alone).
- Env var names differ between the two existing dashboards for historical reasons — pick either
  convention, the important thing is the **ID must point at the sheet above**:
  - Delivery Tracker: `SHEET_ID_USERS`, `USERS_TAB` (defaults to `Sheet1` there — this sheet's own
    tab is named `Users`, so set `USERS_TAB=Users` explicitly).
  - CRM: `ACCOUNTS_SHEET_ID`, `ACCOUNTS_GID` (the tab's numeric gid from the sheet's URL, not its
    name).
- `PIN_PEPPER` — an optional but recommended secret mixed into every password hash. **It must be
  set to the exact same value in every dashboard that reads this sheet.** Get the current value
  from whoever manages secrets for the other dashboards; never commit it, and don't put it in this
  file. If you set up a brand new dashboard before a pepper exists anywhere, agree on one value and
  roll it out to all of them together — a hash made with a pepper can't be checked by a dashboard
  that doesn't have it.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` — the service account's own credentials,
  from the JSON key file. Never commit these either.

## What to build

1. **Copy `lib/pinVault.js` in verbatim.** It's self-contained (only `node:crypto`, no deps on
   anything else in its repo) by design — see the file's own header comment, "Adding it to another
   dashboard". Don't write a second hashing scheme.

2. **Read the sheet the same way the others do**: a function that returns every row as an object
   (by header name, not by column position — headers can be reordered), normalizes `role` (a
   `master-admin` row signs in as `admin` everywhere, but keep the raw role around to find the
   master password), and marks a row with no username/password as sign-in-only-as-a-contact
   (never allowed to log in).

3. **Master password check** (registration only): `masterMatches(guess)` — `null` if no row has
   role `master-admin` with a password (registration off), otherwise whether `guess` matches that
   row's password (`verifyPin` from pinVault, not a plain string compare).

4. **Register a new account** (if this dashboard doesn't have it yet): POST endpoint taking
   `{ master, username, password, role, display_name, email?, contact? }`. Validate master
   password, username format, password length (>= 6), role, display name; reject a taken username;
   hash the password; append a row with values placed by the sheet's **own** column order (read
   headers fresh, don't assume a fixed layout). Rate-limit repeated attempts per IP.

5. **Reset a password** — authorised by a *reset admin*, not by the master password:
   - Add `Reset` to the set of columns this dashboard's reader recognizes (aliases: `reset`,
     `reset password`, `password reset`, `needs reset`).
   - A **reset admin** is a row whose role is `admin` or `master-admin`, that has a password, and
     whose **own** `Reset` cell is non-blank (`*` by convention; `***` or any other mark counts the
     same). Their password is the reset key. A mark on any non-admin row does nothing.
   - `resetEnabled()`: whether any reset admin exists. Drives whether the sign-in screen shows the
     link; it must be a yes/no only - never return names from an unauthenticated GET.
   - `resetAdminMatches(guess)`: `null` if no reset admin exists, otherwise whether `guess` matches
     any reset admin's password (`verifyPin`). Read the sheet **fresh** (not a cache) for this, so
     clearing an admin's mark takes their power away immediately. Rate-limit wrong guesses per IP.
   - Listing accounts: `POST { action: "list", admin }` returns every account that can sign in
     (has a username and a password; skip contact-only rows) as `{ username, display_name }` - but
     only after `resetAdminMatches(admin)` is true. This keeps the list of names private.
   - Resetting: `POST { admin, username, password }` checks the reset admin's password again,
     validates the new password (6-100 characters), hashes it the same way as registration, and
     writes **only** the Password cell. Nothing in the `Reset` column changes. Any account that
     can sign in can be reset, marked or not; a contact-only row is rejected.

6. **UI**: a "Reset a password" link on the sign-in screen, shown whenever `resetEnabled()` is
   true. Two steps: first just the admin password ("Continue"); only when that checks out, a
   picker of every account (label = display name, value = username) and the new password. When
   no admin is marked, the link is hidden (and if the page is opened directly it says: "Put a * in
   an admin's Reset cell in the users sheet, then use that admin's password here - or contact the
   AI team."). Same success/error handling as the existing register form in this dashboard.

7. **Tests**: a fixture with one marked admin, one unmarked master-admin and one marked non-admin.
   Assert only the marked admin is a reset admin; the unmarked master's and the marked non-admin's
   passwords are both refused; the list is withheld until the right password and then includes
   unmarked accounts but not contact-only rows; resetting an unmarked account works, the old
   password stops working, the new one signs in, and the Reset column is untouched; clearing the
   admin's mark switches reset off straight away.

## Don'ts

- Don't edit the live sheet's header row yourself. The `Reset` column needs to exist there once —
  ask whoever owns the sheet to add it (or do it yourself if you already have edit access), the
  same header text as above so every dashboard's alias list matches.
- Don't invent a different password-hashing scheme or a different `PIN_PEPPER` value for the new
  dashboard — it has to interoperate with every other reader of this sheet.
- Don't let the master password (or any password) authorise a reset unless that row is an admin
  marked in its own `Reset` cell, and don't return account names before that check passes - those
  two checks are what keep the feature from being misused.
- Don't run the new dashboard against the real sheet while still testing — use demo/fixture data
  first, the same way the two existing dashboards' test suites do.
