# Feedback of 18/11 (app test round) — design

Date: 2026-11-19
Status: approved in chat by the user on 2026-11-19
Source: the user's test notes `zenc-18-11-26.pdf` (local stack, web and Expo Go)

## Why

The user tested the multi-shop build (PRs #99–#103) on web and on the phone and wrote down fixes and wishes for the
customer, owner and login screens. This spec turns them into four PRs. Decisions below were taken with the user in
chat on 2026-11-19.

## Decisions

- Status badges: **scheduled** uses the shop's **accent** colour; confirmed (green), no-show (red), completed and
  cancelled (grey) keep their fixed meaning colours (a red brand must not make every badge look like a no-show).
- Closed dates stay in **Manage → Opening hours**. ("Revenue" in the notes was a mistake.)
- The owner's "Agenda" tab is called **"Calendar"** in English; Portuguese and Spanish keep "Agenda".
- The notifications prompt applies to **every role** (owners and professionals need booking notices most).
- Colour wheel library: `reanimated-color-picker` (works on web and Expo Go, uses the installed Reanimated 4).

## Scope

### PR A — quick fixes

1. **Customer profile:** the install card (part 3's `InstallPrompt`) is the first item of the profile when the app is
   not installed; text "Install the **Zenc** app" with "Zenc" in bold (pt/es/en).
2. **Sign out** moves from the customer profile into the customer Settings screen.
3. **Login screen:** content centred vertically (no longer stuck at the top), the Zenc wordmark above the fields,
   an eye icon on the password field that toggles visibility (also on the signup and reset-password password fields if
   they share the component).
4. **CEP field** (owner Shop screen): max length 9 characters (`00000-000`).
5. **Owner Agenda tab:** the "Day: <date>" range line is removed in day view (it repeats the date box); it stays in
   week and month view where it shows the range.
6. **Tab name:** English `tabs.agenda` and the agenda title become "Calendar".

### PR B — bugs

1. **Owner booking form keeps its step.** Opening "new appointment" after finishing or leaving mid-way reopens on
   the step where it stopped (after finishing: the last checkout step). Fix: the form always starts at step 1 with
   empty state when opened anew. Root cause first (systematic debugging), with a regression test.
2. **Theme freeze.** After changing the shop colours and switching back to the Zenc colours, the web app stopped
   responding; the Opening hours screen showed mixed old/new colours (orange switch track, teal knob). Reproduce in
   the browser, find the cause, fix, regression test.
3. **Notification tap target.** Tapping an "awaiting confirmation" notification in the inbox does not open the
   appointment to confirm, on web and in Expo Go. Fix the route so it opens that appointment (the same screen the
   owner/professional uses to confirm). Check the other notification types' targets while there.

### PR C — dates and the owner booking flow

1. **`DateField` component** (shared):
   - Shows the date formatted for the locale with `‹` and `›` buttons on the sides. The arrows move by one step
     without opening anything (a day; in the Agenda's week view a week, in month view a month).
   - Tapping the date opens a **calendar pop-up** in the project pop-up style (centred floating card, X top-right,
     tap outside closes) with `‹ ›` to change month; tapping a day selects it and closes.
   - Optional min/max date (e.g. closed dates cannot be in the past).
2. Used in: the owner **Agenda** date box, the owner **booking form** date ("Local date" text field today), and
   **closed dates**.
3. **Closed dates (Manage → Opening hours):** a "Closed dates" section lists the future closed dates (each with a
   remove button) and an "Add closed date" button that opens the calendar; picking a day asks for confirmation
   before closing it. Past dates are not listed.
4. **Owner booking form:** service and professional become two steps: first the service, then only the
   professionals who offer it.
5. Other owner screens that still type dates as text stay as they are in this round.

### PR D — appearance and notifications

1. **Colour wheel:** on the Appearance screen, an "Other colour" option opens a pop-up with a circular colour picker
   (hue wheel plus brightness), next to the existing swatches and hex code field, which stay.
2. **Scheduled badge** (`StatusBadge`) uses the shop accent colour (background tint, dot and text) instead of the
   fixed warning colour. Other statuses unchanged.
3. **Notifications prompt:**
   - After the first sign-in or account creation on a device, a pop-up asks to turn on notifications with
     **Turn on** and **Not now**. Shown once per device (remembered locally); tapping Turn on runs part 4's
     permission + subscribe flow (web) or the Expo push registration (native).
   - iPhone browser not installed: the pop-up points to the install guide instead (web push needs the installed app).
   - Unsupported browser or permission already granted/denied: no pop-up.
4. **Settings switch** "Notifications" in every role's settings: on = subscribed on this device; off = deactivates
   this device's subscription/token (it cannot change the browser's own permission; if the browser denied it, the
   switch explains how to re-enable it in the browser settings).

## Out of scope

Replacing date text fields in other owner screens, per-type notification preferences, changing the inbox itself,
colours of statuses other than scheduled.

## Testing

- Jest/RNTL for each change: `DateField` (arrows step by day/week/month, pop-up opens/selects/closes, min date),
  closed dates list + confirm, booking form steps and reset, badge accent class, prompt states (first sign-in,
  once per device, iPhone not installed, unsupported, granted/denied), settings switch on/off, login eye toggle,
  CEP max length, profile order.
- Regression tests for the three bugs, written failing first.
- Browser screenshots (web, mobile width) of every changed screen, with computed-style checks for the colour changes.
- Gates per PR: typecheck, root `npm run lint`, Jest, re-run after the last commit.
