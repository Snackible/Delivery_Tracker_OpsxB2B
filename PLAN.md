# B2B x Ops Delivery Tracker — Plan

Status: built and running on demo data (see README.md). Still needed to go live: the service-account JSON key, the users sheet link, an email provider key, and the Vercel deploy. The plan below is the original design; where it differs from the code (for example the tracker has no Mongo and keeps no logs), the code and README win.

## 1. Purpose
A two-sided dashboard over the BD Ops Sales Tracking Sheet.
- **B2B (Snackible BD team)** tracks whether deliveries are on time, flags orders urgent (shown red), and sends reminders to Ops.
- **Ops** sees what is due or late, records delivery, and gets automatic reminders.
- Status updates automatically from dates; urgent orders show red.

## 2. Stack (matches Task_Manager_New)
- Plain Node (ESM), vanilla JS frontend, no build step.
- Vercel serverless functions in `api/`, Apps Script time trigger as the scheduler (Vercel's Hobby cron slot is already used by Task Tracker).
- Google Sheets via service account (hand-rolled JWT, as in `lib/sheetsAuth.js`).
- **Everything lives in Google Sheets, no database.** App-only state (urgent flags, ops notes, the daily-email marker) goes in two small tabs of the orders spreadsheet. No logs are kept.
- Runs on bundled demo data when no credentials are set.

## 3. Data sources
### Orders sheet — `Sheet1` (A1:I78 today)
Date · Snackible POC · Ref No · Client Name · Hampers / Loose Products · Product List · Expected Delivery date · Operations Delivery Date · Delivery Status

- **Key:** Ref No. Rows are matched by Ref No at write time (re-read column C, then update that row), never by cached row number, so manual edits and inserts can't misdirect a write.
- Dates are `dd/mm/yyyy`, timezone Asia/Kolkata.

### Potential orders — `Sheet2`
| Col | Header | Notes |
|---|---|---|
| A | Date | date lead logged |
| B | Snackible POC | same names as Sheet1 |
| C | Lead Ref | e.g. `Lead-Oct26-001`, unique |
| D | Client Name | |
| E | Hampers / Loose Products | |
| F | Product List | |
| G | Expected Delivery date | if it converts |
| H | Stage | New / Quoted / Negotiating / Won / Lost |
| I | Follow-up Date | drives follow-up reminders to the POC |
| J | Converted Ref No | set on conversion |

Convert-to-order copies the lead into Sheet1 with a new Ref No, writes it to column J, sets Stage = Won.

### Users sheet (separate spreadsheet)
`username · password · role · account_id · display_name · Email · Contact`. Roles: `ops`, `b2b`, `admin`.
- **Email** is the address used for sending (as the logged-in user) and receiving. **Contact** is the WhatsApp number (digits, with country code).
- Both columns are the single source for contact details, so nothing is entered or stored in the app. Add or change one by editing the sheet (cached ~60 s). This replaces the "enter once, saved in storage" idea from Task_Manager_New.
- Users with no Email or Contact are greyed out for that channel in the recipient dropdown, and skipped by the automatic send.
- Read server-side only, cached ~60 s, never sent to the browser.
- `display_name` is matched to Snackible POC for a "My orders" filter.
- Passwords are plain text today. Plan: keep as-is for launch, add an optional hashed-password column later.

## 4. App-only state (two extra tabs in the orders spreadsheet)
| Tab | Columns | Notes |
|---|---|---|
| `Tracker_Meta` | Ref No · Urgent (TRUE/blank) · Urgent By · Urgent At · Ops Note | one row per order that is urgent or has an ops note; rows are matched by Ref No |
| `Tracker_State` | key · value | single row `lastDailyEmail` = date of the last automatic email |

- **No reminder log, no login-attempt log.** Nothing about sent reminders is recorded.
- Sessions are stateless signed cookies, nothing stored.
- Login rate-limiting is in-memory per function instance (best-effort, resets on cold start).
- The service account creates both tabs on first run if they don't exist.

## 5. Status engine
Computed on every read, not typed by hand.

| Status | Rule |
|---|---|
| **Cancelled** | Delivery Status = Cancelled. No reminders. |
| **Delivered** | Delivery Status = Delivered/Done, or Ops Delivery Date filled. No reminders. |
| **Overdue** | not finished and due date before today |
| **Due today** | due date = today |
| **Upcoming** | due date after today |
| **Needs date** | no usable expected date |

- **Urgent** is a simple on/off toggle that B2B controls. Urgent = red row, pinned to top, listed first and flagged in the daily email. Applies to any open status.
  - Order list sorts urgent first, then days overdue, then due date. The same order is used in the daily email.
  - Urgent never changes the status (Overdue, Due today and so on); it only affects colour, sorting and email placement.
- **Date parsing:**
  - `dd/mm/yy` and `dd/mm/yyyy`.
  - "17th October" and similar, with the year inferred from the order date.
  - **"Asap" = due on the order date**, so it turns overdue the next day.
  - "No clue…" and unparseable text → Needs date.
- **Reminders cover everything open**, old September rows included, unless Cancelled or Delivered. Ops gets a bulk "mark Delivered / Cancelled" action to clear the backlog.

## 6. Reminder engine
- **Rule (decided): one automatic email a day, to ops only.** Nobody else is emailed automatically. Manual sends are separate: B2B can send as many as needed, to anyone chosen in the dropdown, and they neither count toward nor block the daily automatic email.
- **Manual reminder (B2B):** modal with a prefilled message (order, client, Ref No, due date, days overdue).
  - **Sender = whoever is logged in**, taken from their row in the users sheet. **Recipient** = a dropdown of users from the sheet (one or several, or "all ops"). Channel = email, WhatsApp or both.
  - Email: sent *From* the logged-in user's address with their display name, with that address as Reply-To. This needs `snackible.com` verified at the email provider. If a user's address is on another domain, the mail goes from the system sender instead with Reply-To set to them.
  - WhatsApp: opens a `wa.me/<Contact>` link per recipient (sent from the user's own WhatsApp).
  - The server looks up addresses and numbers from the sheet. The browser only gets names and which channels each person has, never the addresses or numbers. Not logged. A short per-user cooldown on the Send button (in-memory) stops accidental double-clicks.
- **Automatic daily digest (Apps Script trigger or any page refresh → `api/cron-reminders`, protected by `CRON_SECRET`):**
  - **One email**, addressed to every user with role `ops` who has an email in the users sheet. **Urgent orders are listed first, flagged in red, inside the same email.**
  - Contents: overdue, due today, due tomorrow, plus a Needs-date section (orders with no expected date, so ops knows which ones BD still has to date).
  - Skips Delivered and Cancelled orders. Skips the run if `Tracker_State.lastDailyEmail` is already today. To limit double sends from simultaneous triggers, the app writes `date|random-id` first, re-reads it, and only sends if its own id is still there. This isn't atomic like a database, so in a rare race ops could get two emails that day. Sends nothing if there is nothing open.
  - BD POCs are not emailed automatically. They see their own overdue and Needs-date orders on the dashboard, and can use manual reminders.
- **Channels (decided):**
  - Email: sent automatically by the server via an email provider.
  - WhatsApp: manual `wa.me` only (a person taps Send), same as Task_Manager_New. An in-app "reminder due" badge prompts it. Numbers come from the `Contact` column.
- **Send on refresh:** any orders load also runs the same daily check server-side (never from the browser), so the digest still goes out on the first visit of the day if the timer has missed.
- **Timer: Apps Script instead of Vercel Cron.** The Task Tracker already uses the Hobby cron slot. An Apps Script (`appscript/Code.gs`) with a **daily trigger around 9am IST** calls `GET /api/cron-reminders` via `UrlFetchApp` with `Authorization: Bearer <CRON_SECRET>`. No `crons` entry in `vercel.json`.
  - The trigger runs as the Google account that creates it, so it stops if that account is removed.
  - Apps Script only acts as the clock; all logic stays in the Node app.
- **[OPEN]** Email provider (Resend, SMTP/Gmail, other) and the sender address.

## 7. Auth and permissions
- `POST /api/login` checks credentials against the users sheet using a constant-time compare, then sets an httpOnly, Secure, SameSite cookie signed with `SESSION_SECRET` (12 h expiry). Failed attempts are rate-limited.
- **b2b:** set expected date, toggle urgent on/off (ops sees it but can't change it), send reminders, mark Cancelled, manage Sheet2 and convert leads.
- **ops:** set Ops Delivery Date, mark Delivered, add ops note. Cannot flag urgent or cancel.
- **admin:** everything.
- Every API route enforces role server-side. The browser never sees the sheet ID, key, passwords or email addresses. The recipient dropdown gets only name, role and whether an email exists.

## 8. API routes
`login` · `logout` · `orders` (GET) · `order-update` (POST) · `urgent` (POST: `{refNo, urgent: true|false}`) · `remind` (POST) · `recipients` (GET: names and available channels only) · `leads` (GET/POST) · `convert-lead` (POST) · `cron-reminders` (called by Apps Script) · `refresh`

## 9. Frontend views
- **Login.**
- **Orders (shared):** table with status chips, red urgent rows, filters (status, POC, client, search), "Needs date" and "Overdue by N days" counts. Auto-refresh.
- **B2B actions:** inline expected date, urgent toggle on each row, Remind ops, Cancel.
- **Ops view:** queue sorted urgent → overdue → due today, with one-click Delivered and a delivery-date field.
- **Pipeline (Sheet2):** leads by stage, follow-up dates, Convert to order.

## 10. Config (Vercel env vars)
`GOOGLE_SERVICE_ACCOUNT_EMAIL` · `GOOGLE_PRIVATE_KEY` (from the JSON key; added in the Vercel dashboard, never committed) · `SHEET_ID_ORDERS` · `SHEET_ID_USERS` · `SESSION_SECRET` · `CRON_SECRET` · email provider key. `.env.example` is committed with blanks.

## 11. Project layout
```
server.js           local dev server
api/                Vercel functions (routes above)
lib/                sheetsAuth, sheetsClient, metaStore (Tracker_Meta/State), dateParser,
                    statusEngine, reminderEngine, mailer, auth, roles
data/               demo fixture (the 77 current rows)
public/             index.html, app.js, styles.css
appscript/Code.gs   daily trigger that calls /api/cron-reminders
vercel.json         (no crons)
```

## 12. Build phases
1. Skeleton, demo data, Orders table, date parser and status engine (tested against the 77 rows).
2. Service-account Sheets read, then login and roles.
3. Write-back: expected date, ops delivery date, Delivered, Cancelled.
4. `Tracker_Meta` tab: urgent toggle, red styling, ops notes.
5. Manual reminders (email and WhatsApp link) with the recipient dropdown.
6. Automation: daily digest to ops, send-on-refresh fallback, Apps Script daily trigger, `Tracker_State` dedupe.
7. Pipeline tab and convert-to-order.
8. Deploy to Vercel, set env vars, end-to-end check.

## 13. Security notes
- Rotate the Sheets API key that was pasted into chat. It isn't needed.
- The service-account JSON goes only in Vercel env vars or a local `.env` that is git-ignored. Never paste it in chat.
- The service account needs **Editor** access on the orders spreadsheet (already granted) and Viewer on the users spreadsheet.
