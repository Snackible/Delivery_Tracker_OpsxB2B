# Adding "Register a new user" + "Reset a password" to another dashboard

Several Snackible internal dashboards sign people in against **one shared Google Sheet** of
accounts. Two already have a master-admin-gated way to add a new account and to reset a
forgotten password, built the same way in both so the sheet stays consistent no matter which
dashboard someone used to manage it:

| | B2B Delivery Tracker ("Ops x B2B") | CRM |
|---|---|---|
| Repo | [Delivery_Tracker_OpsxB2B](https://github.com/Snackible/Delivery_Tracker_OpsxB2B) | [CRM_Database](https://github.com/Snackible/CRM_Database) |
| Data layer | `lib/store.js` (`getUsers`, `addUser`, `getResetRequests`, `resetUserPassword`) | `lib/accounts.js` (`getAccounts`, `registerAccount`, `getResetRequests`, `resetAccountPassword`) |
| Password hashing | `lib/pinVault.js` | `lib/pinVault.js` (identical copy) |
| Register API | `api/register.js` | `app/api/register/route.js` |
| Reset API | `api/reset-password.js` | `app/api/reset-password/route.js` |
| Register UI | `public/index.html` + `public/app.js` (`registerForm`) | `components/RegisterForm.jsx`, `app/register/page.jsx` |
| Reset UI | `public/index.html` + `public/app.js` (`resetForm`) | `components/ResetForm.jsx`, `app/reset-password/page.jsx` |
| Reference commit | `58e0ffc` (Reset feature) | `66a1962` (Reset feature) |

Read whichever of those two is closest in stack to the new dashboard before writing anything —
copy its naming, error messages and validation rather than inventing a new pattern. This file is
the abstract checklist; the two repos above are the working code.

## The shared sheet

- **Link**: `https://docs.google.com/spreadsheets/d/1RKbmZ-MWJ-JNyNe7WzO7HZfmfWQZL4RXJ_Gs8PiCA6Q/edit`
- **Tab**: `Users`
- **Columns** (header text, order doesn't matter — found by name): `username`, `password`, `role`
  (`ops`, `b2b`, `admin`, or `master-admin`), `account_id`, `display_name`, `Email`, `Contact`,
  **`Reset`** (added for the reset-password feature; blank normally).
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

3. **Master password check**: `masterMatches(guess)` — `null` if no row has role `master-admin`
   with a password (registration/reset both off), otherwise whether `guess` matches that row's
   password (`verifyPin` from pinVault, not a plain string compare).

4. **Register a new account** (if this dashboard doesn't have it yet): POST endpoint taking
   `{ master, username, password, role, display_name, email?, contact? }`. Validate master
   password, username format, password length (>= 6), role, display name; reject a taken username;
   hash the password; append a row with values placed by the sheet's **own** column order (read
   headers fresh, don't assume a fixed layout). Rate-limit repeated attempts per IP.

5. **Reset a forgotten password** (the new piece):
   - Add `Reset` to the set of columns this dashboard's reader recognizes (aliases: `reset`,
     `reset password`, `password reset`, `needs reset`).
   - `getResetRequests()`: every account with a non-blank `Reset` value (any mark — `*` by
     convention) and a password (skip contact-only rows), returned as `{ username, display_name }`.
   - `resetPassword(username, newPassword)`: requires the master password **and** the target
     account currently having a non-blank `Reset` value — reject with a clear error if it doesn't.
     **The master password alone must never be enough** to reach an account nobody marked. Hash
     the new password the same way as registration, write it to the Password cell, and clear the
     Reset cell back to blank so the same mark can't be replayed — **unless the mark is exactly
     `***` (three stars), which is left as it was.** That's the one deliberate exception: a row
     meant to be reset over and over (a shared bulk-import account, for example) stays marked
     instead of needing someone to re-type `*` into the sheet after every use. Re-read the sheet
     fresh (not a cache) right before checking the mark, the same way registration re-reads before
     checking a taken username.
   - POST endpoint taking `{ master, username, password }`; GET endpoint reporting whether it's
     enabled and the current list of flagged accounts (for the sign-in screen to show/hide the
     link and populate a picker).

6. **UI**: a "Reset a password" link next to "Register a new user" on the sign-in screen, shown
   only when the GET above reports at least one flagged account. A small form: master password,
   a picker of flagged accounts (label = display name, value = username), new password. Same
   success/error handling as the existing register form in this dashboard.

7. **Tests**: a fixture account with `Reset` marked; assert `getResetRequests` lists it and
   nothing else; assert resetting an unmarked account is rejected even with the right master
   password; assert resetting the marked one works, clears the mark, and the new password (not
   the old one) signs in afterward.

## Don'ts

- Don't edit the live sheet's header row yourself. The `Reset` column needs to exist there once —
  ask whoever owns the sheet to add it (or do it yourself if you already have edit access), the
  same header text as above so every dashboard's alias list matches.
- Don't invent a different password-hashing scheme or a different `PIN_PEPPER` value for the new
  dashboard — it has to interoperate with every other reader of this sheet.
- Don't let the master password alone authorize a reset. The `Reset` mark is the second factor;
  skipping that check is the one way this feature could be misused.
- Don't run the new dashboard against the real sheet while still testing — use demo/fixture data
  first, the same way the two existing dashboards' test suites do.
