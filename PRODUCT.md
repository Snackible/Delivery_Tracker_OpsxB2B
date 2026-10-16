# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Plain Node ESM, vanilla JS frontend with no build step, Vercel serverless functions in `api/`, Google Sheets (service account) as the only datastore. Matches the sibling Task_Manager_New project. No framework.

## Users
Two internal groups at Snackible, a food and gifting company selling snack hampers and loose products to businesses.
- **BD / B2B team** (Prabhnoor, Dhyana, Kritik, Amal, Shivani and others): own client orders, know the promised delivery date, chase ops when deliveries run late. Mostly at a desk, sometimes on a phone.
- **Ops team**: pack and deliver orders, record when something actually left or arrived. Need a clear queue of what is due or late. Desktop and phone equally.
- An **admin** role exists with full access.

## Product Purpose
A two-sided delivery tracker over the BD Ops Sales Tracking Sheet. It shows whether each order is on time, computes status automatically from dates, lets BD mark orders urgent (shown red) and send reminders to ops, and sends ops one automatic email a day listing what is late or due. Success: no order silently goes late, and BD stops chasing ops through scattered messages.

## Positioning
The sheet is the source of truth people already edit. This tool adds status that computes itself, a shared view of lateness, and reminders from the logged-in person to the right person, without replacing the sheet.

## Operating Context
- Orders live in one Google Sheet (Ref No like `Oct26-559`, client, hamper or loose products, expected delivery date, ops delivery date, delivery status). A second tab holds potential orders (leads).
- Expected dates are messy: `dd/mm/yy`, "17th October", "Asap", or blank. Most orders currently have no expected date.
- Logins and contact details (email, WhatsApp contact) come from a separate users sheet. Dates are India time (Asia/Kolkata).
- Reminders: manual email or WhatsApp `wa.me` link sent as the logged-in user to a chosen recipient; one automatic email a day to ops.

## Capabilities and Constraints
- Roles: `ops`, `b2b`, `admin`. B2B can set expected dates, toggle urgent, mark Cancelled, send reminders, manage leads. Ops can set ops delivery date and mark Delivered.
- Statuses: Delivered, Cancelled, Overdue, Due today, Upcoming, Needs date. Urgent is an on/off overlay, red.
- No database, no logs. App-only flags live in a `Tracker_Meta` tab.
- Works on desktop and phone equally. Order volume may grow from tens to a few hundred.
- Demo data (the current 77 rows) must let the app run without credentials.

## Brand Commitments
None supplied. No logo or palette. Red is the fixed meaning of urgent.

## Evidence on Hand
The 77 real order rows from the sheet. No customers' contact details, no testimonials, no metrics. Do not invent any.

## Product Principles
1. The next action is visible: what is late, who owns it, how to nudge them.
2. Status is computed, never typed; the sheet stays the source of truth.
3. Red means urgent and nothing else means red.
4. Fast for people mid-task: a delivery is marked in two taps, a reminder in three.
5. Honest about messy data: a missing date is shown as "needs date", not hidden.

## Accessibility & Inclusion
Status and urgency must never rely on colour alone. Works on small phones.
