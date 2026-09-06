# The Third Position

A longitudinal contradiction experiment for discovering how you actually think.

This is not a personality quiz, a journal, a mood tracker, or a chatbot. Each day
it gives you two genuinely opposing, defensible positions and asks you to construct
a **third position** that preserves what's valid in both — not a compromise, a
resolution with a specific structural shape. Over months, it accumulates evidence
about *how* you resolve tension: which moves you reach for, where they change by
domain, where you contradict yourself, and where no single rule has ever emerged.

Everything runs entirely in your browser. There is no server, no account, no
AI in the loop, no analytics, and no cost. Your responses never leave the device.

## Running it locally

There's no build step. Any static file server works:

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

Or just open `index.html` directly in a browser (IndexedDB and the service
worker both work from `file://` in most browsers, though a local server is
more reliable, especially for the installable/offline behavior).

On an iPad: open it in Safari, tap Share → "Add to Home Screen" to install it
as a standalone app. It works fully offline after the first load.

## How the daily flow works

1. **Today's Contradiction** shows one dilemma: Position A, Position B, both
   deliberately defensible.
2. You write a third position (minimum length enforced, and pure "both are
   partly right"-style non-answers are rejected — you have to name an actual
   move).
3. You tag **what kind of move you made** (Condition, Threshold, Sequence,
   Different Levels, Different Functions, Reversibility, Control/Agency,
   Feedback Loop, Context, New Variable, Preserve Contradiction, or Other).
4. Optionally: confidence, difficulty, and a one-line note on why it interested
   or bothered you.

One dilemma is presented per day by default (there's an "add an extra
observation" option if you want to do more). The dilemma bank cycles through
domains rather than repeating one; once you've seen every dilemma at least
once, it starts resurfacing older ones, favoring whichever you haven't seen
in the longest time.

## Where the dilemma bank lives

`js/dilemmas.js`. It's a plain JavaScript array — no build step, no schema
migration. Each dilemma looks like this:

```js
{
  id: "d001",
  domain: "knowledge & evidence",
  positionA: "Keep researching until the contradictions in the evidence are resolved.",
  positionB: "Act on the strongest available evidence despite unresolved uncertainty.",
  tension: "when accumulated evidence becomes sufficient grounds for action",
  constructs: ["sufficiency vs completeness", "provisional commitment"],
  family: "SUFFICIENCY_TO_COMMIT",
  twinGroup: "TWIN_SUFFICIENCY", // optional — see "structural twins" below
}
```

`tension`, `constructs`, `family`, and `twinGroup` are never shown to you
before you answer — they're the hidden metadata the discovery engine uses
afterward.

### Adding your own dilemmas

Append an object to the `DILEMMAS` array with a new unique `id` (never reuse
or renumber an existing id — responses reference dilemmas by id, so changing
one silently orphans past data). Everything else — selection, the archive,
discovery detection, the contradiction map — picks up new entries
automatically; there's nothing else to wire up.

### Structural twins

Some dilemmas share a `twinGroup` value even though they look nothing alike
on the surface — e.g. "when is evidence sufficient to commit" (research),
"when is trust sufficient without certainty" (relationships), and "when
should a creative decision stop being revised" (creativity) are three
surface-different dilemmas probing the same underlying tension
(`TWIN_SUFFICIENCY`). The app deliberately avoids telling you they're
related, and tries to space twins at least ~10 days apart when picking
what to show you next. Once you've answered two or more dilemmas in the
same twin group, **Pattern Lab** shows them side by side.

## How insights are calculated

All of the logic lives in `js/discovery.js`, in one function,
`computeDiscoveries(responses)`. It runs over your full response history
(each response enriched with its dilemma's hidden metadata) and looks for:

- **Recurring mechanism** — the same move (e.g. "Condition") used 3+ times
  across 2+ different domains. Reported as `OBSERVED_PATTERN`.
- **Domain split** — two domains with enough responses each, where the
  dominant move differs between them. Reported as `DOMAIN_SPLIT`. This is a
  first-class, valid result — the engine is explicitly built to report "there
  is no single rule here" rather than average the difference away.
- **Structural twin comparison** — when you've answered 2+ dilemmas from the
  same twin group, whether you resolved them the same way (`OBSERVED_PATTERN`)
  or differently (`CONTRADICTION`).
- **Evolution** — whether your dominant mechanism in the first half of your
  history differs meaningfully from your most recent half.
- **Outlier** — a single response using a mechanism that appears nowhere else
  in an otherwise consistent log. Always reported at `low` confidence, as a
  single data point.
- **Open mystery** — a tension (structural `family`) you've faced 3+ times
  with a different mechanism nearly every time (high entropy of mechanism
  choice). Reported as an unresolved question, not a hidden pattern you
  haven't noticed.

Every insight carries: observed pattern, evidence count, domains, any
counterexamples, a confidence label (`low` / `moderate` / `high` — never
certainty), example responses, an alternative (competing, more boring)
explanation of the same data, and what future evidence would disconfirm it.
Nothing is inferred from a single response except an `OUTLIER`, and that is
explicitly labeled low-confidence for exactly that reason.

Discoveries are (re)computed and saved at milestones — 5, 12, 25, 50, 100
responses, then every 50 after that — so the app doesn't nag you with
constant analysis after every entry. You can always see everything computed
so far on the **Discoveries** page.

## Contradiction Map

**Contradiction Map** draws a plain SVG, three concentric rings: domains
(outer), structural families/tensions (middle), mechanisms (inner). Line
thickness and opacity encode how often a domain or family co-occurred with a
given mechanism; node size encodes frequency. No layout library or physics
simulation is used — positions are computed deterministically
(`js/map.js`) — so it's not the classic force-directed dance, but it needs no
dependency and it's easy to reason about what it shows.

## Data, privacy, and export

- All data is stored locally in this browser's IndexedDB (`js/db.js`). It is
  never transmitted anywhere — there is no server for it to go to.
- **Data / Export** lets you:
  - export a full JSON backup (responses + computed discoveries)
  - export responses as CSV
  - import a JSON backup (this **replaces** all current local data — you're
    asked to confirm)
  - permanently delete all local data (requires typing `DELETE` to confirm)
- Because everything is local to one browser profile, a JSON export is also
  your only way to move data between devices or browsers, or to keep a
  backup outside the browser's storage.

## Project layout

```
index.html            app shell
css/styles.css         all styling
js/dilemmas.js          the dilemma bank (edit this to add dilemmas)
js/mechanisms.js        the fixed vocabulary of "moves"
js/db.js                 IndexedDB wrapper
js/discovery.js          the longitudinal pattern-detection engine
js/map.js                Contradiction Map rendering (plain SVG)
js/exportImport.js       JSON/CSV export, JSON import
js/app.js                UI controller, daily-dilemma selection, all views
manifest.webmanifest     PWA manifest
service-worker.js        offline caching
```

No build tools, no package manager, no dependencies. Open it and it runs.

## What this deliberately does not do

- No AI, no API calls of any kind, during normal use.
- No login, no account, no cloud sync.
- No personality score, no single trait label, no "you are an X person."
  If your behavior differs by domain, the app is built to say so plainly
  rather than average it into one number.
