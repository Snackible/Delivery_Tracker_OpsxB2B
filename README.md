# Delivery Tracker

A two-sided dashboard over the BD Ops Sales Tracking Sheet. **BD** sees which orders are late, flags urgent ones (red) and sends reminders. **Ops** sees a queue and records deliveries. Status is computed from dates, never typed. Plain Node and vanilla JS, no dependencies, no build step. Google Sheets is the only datastore.

Design and decisions: [PLAN.md](PLAN.md), [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md).

## Run it locally

```
npm run dev
```

Open http://localhost:3000. With no Google credentials it runs on bundled demo data (the 76 real order rows) and shows test logins on the sign-in page. Edits stay in memory. `npm test` runs the date and status tests.

## Connect the real sheets

1. **Share** the orders spreadsheet with the service account (Editor) and the users spreadsheet (Editor, so a missing email or number saved from the dashboard is remembered). The address is in `.env.example`.
2. Copy `.env.example` to `.env` and fill in `GOOGLE_PRIVATE_KEY` (the `private_key` from the downloaded JSON key, on one line with `\n` for line breaks), `SHEET_ID_USERS` and `SESSION_SECRET`.
3. Restart `npm run dev`. The banner "Demo data" disappears when the sheets are connected.

**Orders sheet** (`Sheet1`): Date, Snackible POC, Ref No, Client Name, Hampers / Loose Products, Product List, Expected Delivery date, Operations Delivery Date, Delivery Status. Columns are found by header name, so order does not matter. The app writes only Expected Delivery date, Operations Delivery Date and Delivery Status.

**Potential orders** (`Sheet2`): Date, Snackible POC, Lead Ref, Client Name, Hampers / Loose Products, Product List, Expected Delivery date, Stage, Follow-up Date, Converted Ref No. The header row is created for you if the tab is empty.

**Users sheet**: username, password, role (`ops`, `b2b` or `admin`), account_id, display_name, Email, Contact. `display_name` should match the Snackible POC name for "My orders". `Contact` is a WhatsApp number with country code.

**Tab the app creates** in the orders spreadsheet: `Tracker_Meta` (urgent flags and ops notes). No logs are kept.

## Registering new users

The master password is the password of the user whose role is `master-admin` in the users sheet (that role signs in as a full admin). The sign-in screen shows **Register a new user**, and whoever knows that password can add a BD or Ops account (username, password, the name shown on orders, optional email and WhatsApp number). The new row is added to the users sheet. Admin accounts are added in the sheet by hand. With no master-admin user in the sheet, registration is off. Wrong guesses are rate-limited per address.

## How status works

| Status | Rule |
|---|---|
| Cancelled | Delivery Status says Cancelled. No reminders. |
| Delivered | Delivery Status says Delivered or Done, or an Operations Delivery Date is set. No reminders. |
| Overdue / Due today / Upcoming | By expected date against today (India time). |
| Needs date | No usable expected date. |

Expected dates may be `dd/mm/yy`, `17th October` and similar. **Asap is due on the order date**, so it is late the next day. Urgent is a BD-only on/off flag shown in red and sorted first.

## Roles

- **BD (`b2b`)**: set expected dates, flag urgent, cancel, reopen, mark delivered, send reminders, manage the pipeline.
- **Ops (`ops`)**: mark delivered with a date, add notes, see the queue.
- **Admin**: everything.

## Reminders

- **Urgent alert:** the moment BD flags an order urgent (not when it is already urgent, or turned off) ops get an email about that order through the mail script, and the dashboard says whether it went out. A problem sending never blocks the flag.
- **Sound alerts:** the dashboard checks for changes every 30 seconds, also in a background tab, and plays a short tone with a notice when an order is newly urgent (three high beeps) or newly overdue (a two-note drop). There is no setting for it: it is always on. Tones come from the browser, no files, and browsers only allow sound after a first click on the page.
- **Manual** (BD, to ops only): the **Remind** button on an order reminds ops about **that one order**, with no checkboxes. Recipients are always the ops users from the users sheet (or a one-off email or number under **Send to someone else**). **Email opens as a draft in your own Gmail** and **WhatsApp as a chat**; you press Send in each, so it comes from you, and both buttons sit ready in the dialog. If an ops user has no email or number, **Add email / Add number** saves it to the users sheet for next time. Nothing is sent by the server and nothing is logged.
- **Resend daily email** (master senders only, the top button): sends the daily email to ops again on demand, after a confirm dialog that shows who gets it.
- **Remind ops about several orders** (master senders only, the top button): the same dialog with order checkboxes (urgent and late are ticked, plus quick picks for all open orders), and, when the mail script is set up, **Send full list now**.
- **Automatic**: **one email a day to ops** (urgent first, then overdue, due today, due tomorrow, and a short needs-a-date list), sent when the Apps Script timer calls the app, around 9am India time. Every call sends, and there is no once-a-day marker, so running the timer function by hand or pressing **Resend daily email** sends it again. Nothing is sent when nothing is open or no ops user has an email saved. Opening the dashboard does not send anything.
- **Automatic email:** the daily email to ops, urgent alerts and the master "send now" go through `appscript/Code.gs`, deployed as a web app under a Snackible Google account (`APPS_SCRIPT_MAIL_URL` + `MAIL_SECRET`). There is no "from" setting: it sends from that account, with the signed-in person's email from the Users sheet as Reply-To. With the script not set up, these emails are a dry run and only logged to the server console.

## Deploy to Vercel

1. Push this folder to the GitHub repo and import it in Vercel (framework preset **Other**, no build command, no output directory).
2. Add every variable from `.env.example` under Settings, Environment Variables.
3. Deploy. `public/` is served as the site and `api/*.js` as functions (7 of the 12 allowed on the Hobby plan).
4. Set up email and the daily timer: follow the steps at the top of [appscript/Code.gs](appscript/Code.gs) (Script properties, deploy as a web app, run `installDailyTrigger` once), then set `APPS_SCRIPT_MAIL_URL` and `MAIL_SECRET` in Vercel. No Vercel cron is used.

## Security notes

- The service-account key, `SESSION_SECRET`, `CRON_SECRET` and email key live only in environment variables. `.env` is git-ignored.
- Sign-in compares passwords in constant time, rate-limits failures per username and address (best effort per server instance), and sets an httpOnly signed cookie that lasts 12 hours. Passwords in the users sheet are plain text today; a hashed column is a sensible next step.
- Every API route checks the session and the role. The browser never receives the sheet IDs, passwords or stored email addresses and numbers. WhatsApp links include the number only for the recipients you chose to send to.
- Rotate any API key that has been pasted into chat or a ticket.
