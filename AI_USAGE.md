# AI Usage

This document records how AI was used to build FlightHub, the prompts that produced the largest changes, where the AI's first attempt was wrong, and how those mistakes were caught and corrected.

---

## Tool

**Claude Code** (Anthropic, Claude Opus 4) — used inside VS Code as a paired IDE assistant. Claude had read/write access to the workspace and could run shell commands (Python, npm, sqlite3, git) directly.

No other AI tool was used.

---

## How the collaboration was structured

I treated Claude as a junior engineer who's strong on syntax and stack knowledge but needs **explicit acceptance criteria** and **verification at every step**. The pattern was:

1. **State the goal in plain language** — "the plane should loop above the midpoint then continue", not "modify @keyframes lpFly"
2. **Let Claude propose the implementation** — file changes, library choices, schema changes
3. **Reject anything that overshoots or misses** — short, direct corrections worked better than long re-specifications
4. **Test every change visually or with cURL** — never trusted the model's claim that something worked without seeing it
5. **Have Claude write the boring parts** (CSS keyframes, repetitive JSX, docstrings) but make the design decisions myself

This kept Claude productive while keeping me accountable for the architecture.

---

## Categories of work and the prompts that drove them

### Initial review
> *"These are the requirements. Check all the functionalities to make sure everything is implemented."*

Used as a first pass. Claude grep'd the codebase, mapped each requirement to actual code, and surfaced inconsistencies (port mismatch, folder casing, stale docs) that would have failed a reviewer test.

### Schema + data changes
> *"Update the DB and the UI to show the full name of cities in destinations and origins."*

Triggered a migration from 3-letter codes to full city names. Required schema, seed data, router filter logic, and frontend display all to change in lockstep.

### Concurrency / correctness
> *"Why is this showing 148 seats but I deleted the entries from DB?"*

Forced Claude to explain a non-obvious architectural choice (cached `available_seats` counter, decoupled from `COUNT(*)` of bookings). Led to a documented resync SQL in README troubleshooting.

### UI / UX iterations
> *"The aeroplane should move in a smooth way."*
> *"The dashes should not move progressively along with plane. It should just be present."*
> *"The first box and 2nd box width does not match."*

These were short, vague-sounding prompts that worked because Claude had the full context of the running app. Each one required Claude to **diagnose** before fixing.

### Animation specification
> *"When it reaches the midpoint, the aeroplane should move in an oval shape directed above and then reach its destination."*

Most demanding prompt of the session. Required understanding rotated coordinate systems, parametric ellipse math, and CSS keyframe interpolation behavior.

### Documentation
> *"Update the README.md — Setup instructions, how to run backend and frontend, assumptions"*
> *"Now check ARCHITECTURE.md — Data model, API design, how you resolved ambiguities"*

Kept the docs in sync with the code by re-deriving them from the current state, not from earlier drafts.

---

## Things Claude got wrong (and how I corrected them)

### 1. Over-engineering the city-name change

**What Claude did:** When asked to switch from IATA codes to city names, its first move was to add a normalized `Airport` table (`code`, `city`, `country`) and join it from `flights`. Wrote the model, the seed, the new endpoint.

**Why it was wrong:** I didn't ask for a normalized lookup. I wanted city names in the columns directly. Claude defaulted to "the textbook-correct relational model" instead of the simplest thing that worked.

**Correction:**
> *"No I don't want this. I want to display the complete city names like Islamabad instead of ISB both in DB and UI."*

Claude re-did the work in the simpler way: widened the existing `origin`/`destination` columns from `VARCHAR(3)` to `VARCHAR(100)` and stored full names directly. Took 5 minutes vs. 30 for the abandoned approach.

**Lesson:** When the prompt has *one* sentence of intent, the model assumes patterns from training data ("normalize lookup data") instead of the literal request. Worth catching early.

---

### 2. Animated the dashes when I asked for static dashes

**What Claude did:** When asked to make the path dashes follow the plane's loop shape, Claude built it correctly — but also added an SVG mask reveal animation so the dashes drew progressively as the plane flew.

**Why it was wrong:** I never asked for the reveal. The user's mental model was a *map* — the route line is always there; the plane traces it. The reveal made it look like a slow-motion drawing.

**Correction:**
> *"The dashes should not move progressively along with plane. It should just be present."*

Claude removed the mask, the `lpDrawSvgPath` keyframes, and the `<defs>` block. Path now renders fully on splash entry.

**Lesson:** Claude added "polish" I didn't ask for. Two-line correction was faster than catching it during specification, but I should have been more explicit upfront.

---

### 3. Plane animation looked janky despite "correct" keyframes

**What Claude did:** Implemented the oval loop with 4 keyframes (every 90°: bottom → right → top → left → back) and `cubic-bezier(0.4, 0, 0.2, 1)` easing.

**Why it was wrong:** Linear interpolation between 4 points around an oval traces a *diamond*, not a smooth curve. And `cubic-bezier` ease-in-out was being applied between **every pair of keyframes**, so the plane hesitated at every corner. Result: visible stuttering.

**Correction:**
> *"The aeroplane is lagging. It should move in a smooth way."*

Claude diagnosed both causes correctly:
- Switched easing to `linear` (constant speed, no per-segment ease)
- Added 4 intermediate keyframes (every 45° instead of 90°), parameterized from the actual ellipse equation: `X = cx + rx·sin(θ)`, `dY = cy − ry·cos(θ)`, `rotation = −θ`

The math was right the second time, with explanation. The first attempt was right algorithmically but ignored how CSS interpolation actually behaves.

**Lesson:** Claude knew the formulas, but didn't think about *what linear interpolation between sparse keyframes looks like*. A code review eye is still required, even on math-heavy CSS.

---

### 4. Stale documentation

**What Claude did:** Through the session, the schema, ports, and folder names changed. The original ARCHITECTURE.md and README still referenced JFK/LAX flights, USD pricing, port 8001, lowercase `frontend/`, and a `departure_datetime` column that no longer existed.

**Why it was wrong:** Code changes didn't propagate to docs unless I asked for it. Anyone running the app from the README would have copied broken cURL examples.

**Correction:**
- **Round 1** (during initial review): Caught the port mismatch and folder casing before they shipped.
- **Round 2** (explicit ask): Rewrote both docs from current code state, replacing every JSON example with real Pakistani city / PKR data.

**Lesson:** Docs are a separate work item, not a side effect. Every code change has a doc-debt that has to be paid down explicitly.

---

### 5. Native browser dialogs in a styled UI

**What Claude did:** Used `confirm()` and `alert()` for the cancel-booking flow.

**Why it was wrong:** They look nothing like the rest of the app — black system chrome on a purple-and-white styled UI. Reviewer-visible inconsistency.

**Correction:**
> *"This popup for cancelling the booking does not go with the UI. Make it according to the UI."*

Built `showConfirm()` returning `Promise<boolean>` and `showToast()` for success/error. Added `#confirm-modal` reusing the existing `.modal` class system. Both replace the native dialogs everywhere.

**Lesson:** Default `confirm()`/`alert()` is an "it works" choice that fails design review. Should be flagged as tech-debt the moment it's written.

---

### 6. Timezone handling

**What Claude did:** Backend stored timestamps via `datetime.utcnow()` (correct — UTC) but Pydantic serialized them as **naive ISO strings without a `Z` suffix**. Frontend's `new Date(ts)` then parsed them as **local time** instead of UTC.

**Why it was wrong:** A booking made at 8:16 PM PKT (15:16 UTC) showed up as "3:16 PM" in the booking detail modal — exactly the UTC offset off.

**Correction:**
> *"Why is it showing the booked time wrong? I just booked it 1 min ago but it is showing me wrong time."*

Two-line fix: `new Date(booking.booked_at + 'Z').toLocaleString()`. Tagging with `Z` forces UTC parsing so `toLocaleString()` correctly converts to local time. Documented as a deferred trade-off in ARCHITECTURE — proper fix is `DateTime(timezone=True)` columns, but the frontend tag is sufficient for a local-dev tool.

**Lesson:** Naive datetimes + ISO serialization = silent timezone bugs. Worth catching with a unit test on a real deployment.

---

## Strategies that worked

- **Concrete failure descriptions** — *"showing 148/150 but I deleted the bookings"* led Claude straight to the cached-counter explanation. *"Fix the seats"* would not have.
- **Asking why before how** — *"Why is the time wrong"* got an explanation that informed the fix. *"Add a Z to the timestamp"* would have papered over the cause.
- **Pushing back on the first attempt** — Roughly 1 in 4 of Claude's first-pass implementations needed correction (mostly over-engineering or missed UX details). Cheap to fix in-session, expensive if shipped.
- **Visual verification** — Animation and layout work was reviewed by running the app and looking, not by reading the diff. Type-checking and linting catch *syntactic* correctness, not *visual* correctness.
- **Incremental commits in conversation, not git** — Each change was small enough to verify before the next. Long batched changes would have hidden the keyframe-easing bug and the mask-reveal mismatch.

---

## What I would do differently

- **Specify what *not* to do** earlier. "Don't add a reveal animation" upfront would have saved one round-trip on the dashes.
- **Treat docs as a peer file, not a follow-up.** The stale README/ARCHITECTURE issues were avoidable if I'd asked for the doc update in the same prompt as each code change.
- **Run an end-to-end smoke test before declaring done.** Several issues (port mismatch, timezone display, cached counter) only surfaced when actually running the app. A 5-minute manual test catches more than a careful code review.
