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

**Tabs the app creates** in the orders spreadsheet: `Tracker_Meta` (urgent flags and ops notes) and `Tracker_State` (the date of the last daily email). No logs are kept.

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

- **Manual** (BD): pick orders, pick recipients from the users sheet, send by email and/or WhatsApp. If someone has no email or number, **Add email / Add number** saves it to the users sheet for next time. **Send to someone else** takes a one-off email or WhatsApp number that is not saved. Email goes out as the signed-in user when their address is on the verified sending domain; otherwise it comes from `EMAIL_FROM` with Reply-To set to them. WhatsApp opens a `wa.me` chat and a person presses Send. Not logged.
- **Automatic**: **one email a day to ops** (urgent first, then overdue, due today, due tomorrow, and a short needs-a-date list), sent after `DIGEST_HOUR_IST`. It goes out on the first orders load of the day or when the Apps Script timer calls the app, whichever comes first. The one-a-day marker is a single row in `Tracker_State`. This is not atomic like a database, so in a rare race ops could get two.
- Without `RESEND_API_KEY`, emails are a dry run and only logged to the server console.

## Deploy to Vercel

1. Push this folder to the GitHub repo and import it in Vercel (framework preset **Other**, no build command, no output directory).
2. Add every variable from `.env.example` under Settings, Environment Variables.
3. Deploy. `public/` is served as the site and `api/*.js` as functions (7 of the 12 allowed on the Hobby plan).
4. Set up the daily timer: paste [appscript/Code.gs](appscript/Code.gs) into a new Apps Script project, add `APP_URL` and `CRON_SECRET` as Script properties, and run `installDailyTrigger` once. No Vercel cron is used.

## Security notes

- The service-account key, `SESSION_SECRET`, `CRON_SECRET` and email key live only in environment variables. `.env` is git-ignored.
- Sign-in compares passwords in constant time, rate-limits failures per username and address (best effort per server instance), and sets an httpOnly signed cookie that lasts 12 hours. Passwords in the users sheet are plain text today; a hashed column is a sensible next step.
- Every API route checks the session and the role. The browser never receives the sheet IDs, passwords or stored email addresses and numbers. WhatsApp links include the number only for the recipients you chose to send to.
- Rotate any API key that has been pasted into chat or a ticket.
