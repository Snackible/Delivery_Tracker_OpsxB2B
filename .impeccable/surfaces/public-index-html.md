---
version: 1
slug: "public-index-html"
primary_target: "public/index.html"
related_targets: []
---

# Surface brief: Delivery Tracker dashboard

Mode: Operate. Surface: the whole app (login, Orders, Ops queue, Pipeline, reminder dialog). Audience: Snackible BD team and Ops, daily use, desktop and phone equally. Task: see what is late, nudge the right person, record delivery. Constraints: internal tool, corporate-friendly, calm, light and dark themes, status never by colour alone, red reserved for urgent. Unresolved: logo (none supplied), email provider.

## Direction contract

THESIS: Orders are marks on a shared date axis. The one idea is a due rail: every row shows where its due date sits against today, so lateness is read as distance, not as a label to decode. Refuses the category default of a flat table with pastel pills as the only signal.

OWN-WORLD: A laboratory plate in corporate dress: quiet neutral ground (cool paper in light, graphite in dark), one steel-blue accent for actions, hairline rules, one grotesque with tabular numerals. Status colours are prominent and strictly assigned: urgent red, overdue orange, due-today amber, on-time green, needs-date grey with dashed marks; each also carries a shape and a word. Recognisable with content removed by the thin vertical due marks on a ruled axis, doubled when late.

STORY: A BD person sees in seconds which orders are late, who owns them and what to do, then sends a reminder in three clicks. An ops person sees a queue sorted by urgency and marks delivery in two taps.

FIRST VIEWPORT: Left rail with product name, Orders, Ops queue, Pipeline, theme switch, user. Main: page title with the primary Remind ops action at right; a strip of four count tiles coloured by status (Overdue, Due today, Urgent, Needs date) that double as filters; a filter bar; then a standard table with a Due rail column, status chip (solid colour, icon, word), urgent rows tinted red. Primary action sits top right.

FORM: operate-c-emission-line-rail, position 1 of the bolder hand, seed: 078639722ae2a21d. Lends palette discipline, hairline marks, one type size ranking, state-by-shape; layout and controls stay standard web components.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
