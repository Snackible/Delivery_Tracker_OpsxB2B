---
name: Delivery Tracker
description: A calm corporate shell where colour is spent only on delivery status, read against a shared due-date rail.
colors:
  accent: "#1f5fa8"
  accent-hover: "#194e8a"
  on-accent: "#ffffff"
  paper: "#f3f5f8"
  surface: "#ffffff"
  surface-2: "#f7f8fa"
  ink: "#17202b"
  muted: "#566475"
  line: "#d8dee6"
  line-strong: "#b9c3cf"
  urgent: "#c62828"
  urgent-bg: "#fdecea"
  overdue: "#b45309"
  overdue-bg: "#fdf0dc"
  today: "#f2b01e"
  today-ink: "#1b1300"
  today-mark: "#a16207"
  today-bg: "#fdf3d6"
  upcoming: "#1e7b4f"
  upcoming-bg: "#e3f4ea"
  needs-date: "#5b6777"
  needs-date-bg: "#eceff3"
  delivered: "#3f6a99"
  cancelled: "#6b7280"
  dark-paper: "#11151a"
  dark-surface: "#1a2028"
  dark-surface-2: "#212832"
  dark-ink: "#e7ecf2"
  dark-muted: "#a3aebc"
  dark-line: "#2b343f"
  dark-line-strong: "#3b4654"
  dark-accent: "#7eb4f2"
  dark-urgent: "#ff6b66"
  dark-overdue: "#ff9a4d"
  dark-today: "#f5c451"
  dark-upcoming: "#4cc38a"
  dark-needs-date: "#8d99a8"
  dark-delivered: "#7ba3cf"
  dark-cancelled: "#8b93a1"
typography:
  title:
    fontFamily: "Hanken Grotesk, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Hanken Grotesk, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.45
  body:
    fontFamily: "Hanken Grotesk, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Hanken Grotesk, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.45
  column-head:
    fontFamily: "Hanken Grotesk, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0.04em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  view-x: "28px"
components:
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-default-hover:
    backgroundColor: "{colors.surface-2}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-small:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "30px"
  chip-status-overdue:
    backgroundColor: "{colors.overdue}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 10px 0 8px"
    height: "26px"
  chip-status-today:
    backgroundColor: "{colors.today}"
    textColor: "{colors.today-ink}"
    rounded: "{rounded.sm}"
    padding: "0 10px 0 8px"
    height: "26px"
  chip-status-upcoming:
    backgroundColor: "{colors.upcoming}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 10px 0 8px"
    height: "26px"
  tag-urgent:
    backgroundColor: "{colors.urgent}"
    textColor: "#ffffff"
    rounded: "4px"
    padding: "1px 8px"
  filter-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 6px 0 12px"
    height: "34px"
  filter-chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
    height: "36px"
  table-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    width: "560px"
---

# Design System: Delivery Tracker

## Overview

**Creative North Star: "The Plate Reader"**

A laboratory plate in corporate dress. The ground is quiet and neutral (cool paper in light, graphite in dark), actions share one steel-blue accent, rules are hairlines, and a single grotesque with tabular numerals carries all text. Everything loud is reserved for delivery status, so a glance at the screen answers "what is late" before any word is read.

The one signature idea is the due rail: each order carries a thin vertical mark on a ruled date axis with today in the middle, so lateness reads as distance from the centre line, not as a label to decode. Layout and controls stay standard web components (a sidebar, a table, buttons, native dialogs); the rail and the status system are where the identity lives.

**Key Characteristics:**
- Neutral ground, one blue accent, five assigned status hues, each with its own shape and word.
- Hairline borders and a single soft shadow; depth is mostly tonal.
- One typeface (Hanken Grotesk), 14px base, tabular figures everywhere.
- Light and dark themes share one semantic token set; only values change.
- Dense but not tight: 36px controls, 8px radius, 10-14px cell padding.

## Colors

A cool-neutral shell with a steel-blue accent, where the only saturated colours are the status set.

### Primary
- **Steel Blue** (`accent`; dark `#7eb4f2`): the only action colour. Primary buttons, active nav item (14% tint plus blue text), focus ring, caret, selection, banner icons. Hover deepens to `accent-hover` (dark `#a2c9f7`).

### Secondary (status set; each colour has one job)
- **Urgent Red** (`urgent`; dark `#ff6b66`): the BD-set urgent flag only. Urgent tag, urgent row tint (`urgent-bg`), urgent ring around the chip, urgent rail mark, pressed flag button, urgent count badge.
- **Overdue Orange** (`overdue`; dark `#ff9a4d`): past due date. Solid chip, rail mark (doubled), overdue count badge.
- **Due-today Amber** (`today`, with dark `today-ink` text; rail stroke uses the deeper `today-mark`): due today. Solid chip, thicker 3px rail mark.
- **On-time Green** (`upcoming`; dark `#4cc38a`): due in the future. Solid chip, rail mark.
- **Needs-date Slate** (`needs-date`; dark `#8d99a8`): no usable expected date. Dashed-outline chip (no fill), dashed rail mark parked at the right edge.
- **Delivered Blue-grey** (`delivered`) and **Cancelled Grey** (`cancelled`): finished states, quiet. Delivered is a dot on the rail, cancelled is a cross; cancelled text is struck through.

### Neutral
- **Cool Paper** (`paper`; dark graphite `#11151a`): page ground.
- **Surface** (`surface`; dark `#1a2028`) and **Surface 2** (`surface-2`; dark `#212832`): cards, sidebar, dialogs; table header, hover fills.
- **Ink** (`ink`; dark `#e7ecf2`) and **Muted** (`muted`; dark `#a3aebc`): text and secondary text. Ink also carries destructive and error emphasis (bold plus ink border), never red.
- **Hairline** (`line`) and **Strong Hairline** (`line-strong`): dividers, and control borders respectively.

### Named Rules
**The Red Means Urgent Rule.** Red appears only for the urgent flag. Overdue is orange, errors are ink-bordered, destructive actions are bold with an ink border. If it is red, a person marked it urgent.

**The Never Colour Alone Rule.** Every status is colour plus shape plus word: chip = fill + icon + label; rail = mark geometry (double line, thick line, dashed line, dot, cross) + an aria-label; urgent = red + flag icon + "Urgent" text. Needs-date and cancelled differ from the others by outline and strike-through, not hue.

**The Spend Colour On Status Rule.** Chrome stays neutral and blue. A new saturated hue on a non-status element is a defect.

## Typography

**Display Font:** none; headings use the same face.
**Body Font:** Hanken Grotesk (with Segoe UI, system-ui, sans-serif), loaded 400/500/600/700 from Google Fonts.

**Character:** a plain, slightly warm grotesque that reads as software, not brand. Rank comes from weight and a few sizes, not from font changes. Tabular numerals are set on `body` so refs, dates and counts align in columns.

### Hierarchy
- **Title** (700, 22px; 20px under 860px, -0.01em): page heading, with `text-wrap: balance`.
- **Headline** (700, 17px): dialog titles. Brand name is 16px (20px on login).
- **Body** (400, 14px, 1.45): table cells, form text. Emphasis uses 600/700, not size.
- **Label** (600-700, 13px): chips, filter counts, small buttons, secondary line under due dates (12px).
- **Column head** (600, 12px, 0.04em, uppercase): table headers only, in muted ink on Surface 2.

### Named Rules
**The One Face Rule.** Hanken Grotesk only; rank with weight and the sizes above. No second family.

## Layout

A two-column shell: a sticky 216px left rail (brand, nav with counts, theme switch, user) and a fluid main view with 24px 28px padding. Pages open with a heading row (title left, primary action right), then filter chips, then a toolbar (search up to 360px, selects), then the content.

Spacing is a loose 4/8/12/16/24 rhythm; gaps of 6-14px between controls, 10px between stacked cards.

Responsive rule, two steps. At 1180px and below the sidebar is replaced by a sticky top bar and a fixed bottom tab bar (56px targets). At 860px and below the orders table becomes a stack of cards: header row hidden; each row is a grid with ref and status on line one, client on line two, due text and the rail on line three, actions on line four behind a hairline. Urgent rows keep their red tint and gain a red border. Filter chips become a horizontal scroller, the search goes full width, action buttons grow to 40px, and dialogs dock to the bottom as sheets (full width, 14px top radius). Content on card rows is never dropped, only rearranged.

## Elevation & Depth

Mostly tonal: Surface over Paper, separated by 1px hairlines. One soft two-layer shadow (`0 1px 2px` plus `0 2px 8px` at 5-6% ink; heavier black in dark) lifts the table container, login card, menus and toasts. Dialogs alone use a deeper ambient shadow (`0 12px 40px rgb(0 0 0 / 0.25)`) over a 50% navy backdrop.

### Named Rules
**The One Shadow Rule.** Use the shared `--shadow` token for lifted surfaces; only modal dialogs get the deeper one. No hard offset shadows.

## Shapes

Gently rounded, never pill except for filter chips and count badges. 8px on buttons, inputs, banners, menus; 6px on status chips, nav items and icon buttons; 10px on the table container and mobile cards; 12px on dialogs and the login card; 4px on the urgent tag. The focus ring is a 2px outline in accent with 2px offset.

## Components

### Buttons
- **Shape:** 8px radius, 36px high (small: 30px, 13px type), 600 weight, 14px side padding, 8px icon gap.
- **Default:** Surface fill, strong hairline border, ink text; hover to Surface 2 with muted border.
- **Primary:** Steel Blue fill and border, on-accent text; hover to accent-hover. One per view (e.g. Remind ops, top right).
- **Ghost:** transparent until hover. **Danger:** ink border and 700 weight, never red. **Attn:** accent border and text.
- **Icon button:** 32px square, 6px radius, muted; pressed state (urgent flag) fills red with white icon.
- **Disabled:** 50% opacity. Transitions are 0.15s on background and border only.
- **Small with optional label:** icon-only 32px square on desktop, label returns on mobile.

### Chips
- **Status chip:** 26px high, 6px radius, 13px/700, 15px icon + word. Overdue, Today, Upcoming are solid fills with AA text (`today` uses dark ink). Needs-date is a 1.5px dashed outline, transparent fill. Delivered and Cancelled are muted solid fills; Cancelled is struck through. On urgent rows, active chips gain a two-ring red halo.
- **Urgent tag:** red, 4px radius, 11px/700 uppercase with flag icon, sits beside the order ref. Paired with the red-tinted row.
- **Filter chip:** 34px pill, strong hairline; selected inverts to ink fill with paper text (`aria-pressed`). Carries a count badge coloured by the status it filters (overdue, today, urgent, upcoming, needs-date), neutral when zero (70% opacity if unselected). These double as the status count strip.

### Inputs / Fields
- **Style:** 36px high, 8px radius, strong hairline border, Surface fill; textarea min 96px. Labels are 600, above the field with 14px top margin.
- **Focus:** global 2px accent outline, 2px offset.
- **Error:** ink text, bold, 1.5px ink border box (no red).

### Navigation
Left rail items are 38px, 6px radius, muted 600 text with a trailing count; hover to Surface 2; current page gets a 14% accent tint with accent text (`aria-current="page"`). Under 1180px the same destinations become the bottom tab bar with icon over 12px label, accent when current.

### Orders table (container)
Surface container, 1px hairline, 10px radius, shared shadow. Header on Surface 2. Row hover is a 5% accent wash. Urgent rows are tinted `urgent-bg`. Finished rows mute their text. Actions sit right with a native details menu (min 180px, 4px padding, 34px items).

### Dialogs
Native `<dialog>` with `showModal()`, 560px max, 12px radius, header / scrolling body / footer separated by hairlines, footer actions right-aligned with 8px gap. Under 860px it docks to the bottom edge as a full-width sheet.

### Toasts
Ink fill with paper text, 8px radius, bottom-right (full width above the tab bar on mobile). Error toast flips to Surface with a 2px ink border.

### Due Rail (signature)
A 168px column (184x30 SVG viewBox) with a hairline axis, ticks at -14, -7, 0, +7, +14 days, and a dotted today line at centre. The header cell repeats the axis with "-14d / today / +14d" labels and a solid ink today line. Each order draws one mark at its day offset, clamped to the axis with a small chevron when beyond 14 days: overdue is two parallel 2px orange strokes (doubled when late), due today is one 3px amber stroke on the centre line, upcoming is one 2px green stroke, needs-date is a dashed slate stroke parked at the right end, delivered is a 4px-radius dot, cancelled is a cross, and urgent orders recolour their mark red. Marks settle in with a 0.7s `cubic-bezier(0.16, 1, 0.3, 1)` slide from the late or early side, staggered 14ms per row for the first 30 rows. Each rail has an aria-label with due date and status.

## Do's and Don'ts

### Do:
- **Do** keep the screen neutral and let status carry all saturated colour.
- **Do** pair every status with an icon or shape and a word; give each rail mark its own geometry.
- **Do** use the semantic tokens (`--surface`, `--ink`, `--line-strong`, status triplets); every new component must work in both themes.
- **Do** use the 36px control height, 8px radius, 600 weight, and the global 2px accent focus ring.
- **Do** keep tabular numerals on, and keep one primary button per view.
- **Do** collapse tables to card rows at 860px with the same content and actions.
- **Do** honour `prefers-reduced-motion` for any new animation (rail settle, toast pop and button transitions already do).

### Don't:
- **Don't** use red for anything but urgent (errors, destructive actions, overdue, cancel).
- **Don't** signal status with colour alone, or with a pastel pill that has no icon or word.
- **Don't** add a second typeface, or use size jumps where weight would do.
- **Don't** introduce a new accent or decorative saturated hue.
- **Don't** use hard offset shadows or heavy ambient shadows outside dialogs.
- **Don't** hide data on mobile; rearrange it.
