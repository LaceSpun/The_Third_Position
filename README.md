# The Third Position

A longitudinal pattern-recognition experiment for discovering how you actually think.

Every session shows you three short stances. Two of them secretly share a
real underlying reasoning pattern; one doesn't. You tap the two that belong
together, connecting them with a string — whichever one is left over is
revealed as the odd one out. That's it. Over months, the app studies not
which side of anything you're on, but *what kind of reasoning connections
you reliably spot, and which ones you miss* — accumulating evidence about
that rather than asserting it after one good (or bad) guess.

Everything runs entirely in your browser. There is no required server, no
account, and normal use costs nothing. The one optional exception — AI-
generated puzzles via your own free Groq API key — is off by default and
described in full below.

## Running it locally

There's no build step. Any static file server works:

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

Or open `index.html` directly in a browser (IndexedDB and the service
worker both work from `file://` in most browsers, though a local server is
more reliable, especially for the installable/offline behavior).

On an iPad: open it in Safari, tap Share → "Add to Home Screen" to install it
as a standalone app. It works fully offline after the first load, using the
hand-written fallback bank (see below) — the AI layer is the only thing
that needs a network connection, and only when you've turned it on.

## How it works

1. Three stances appear as loosely pinned cards on a board — not a stacked
   list, deliberately, since a list-of-options felt like every other choice
   in the app.
2. Tap the two that share a real underlying logic. A string is drawn
   between them live.
3. Whichever card you didn't touch is revealed as either the genuine odd
   one out (green string, you got it) or not (red string, the true odd one
   gets highlighted amber either way, so you learn the answer regardless).
4. You can optionally leave a one-line note on why it was tricky or
   obvious.
5. Tap "Next puzzle" and go again — there's no daily cap, no pacing gate on
   this loop. What accumulates slowly is the evidence in **Discoveries**,
   not the ability to play.

## Where puzzle content comes from

**Hybrid, and AI is preferred when it's on.** Every puzzle request:

1. If AI Assist is enabled (see below), asks Groq to invent a brand new
   triad on the spot — unlimited variety, any domain, a fresh angle each
   time.
2. If AI Assist is off, or that request fails or returns something
   malformed, falls back automatically to the hand-written bank in
   `js/oddOneOut.js` (18 triads to start). The app never depends on the
   network to function; a failed AI call is silently absorbed and you see
   an offline-bank puzzle instead, with a small note saying so.

### Adding to the offline bank

`js/oddOneOut.js` is a plain array, no build step, self-service to extend.
Each entry:

```js
{
  id: "oo019",            // unique, stable forever — never renumber
  stances: ["…", "…", "…"], // exactly 3 short statements, canonical order
  oddIndex: 2,             // which one (0-2) does NOT share the logic
  sharedLogic: "a short label for what the other two share",
  explanation: "one sentence on why, shown after the pick",
}
```

The two non-odd stances need a *real* structural logic in common — intent
vs. outcome, rule vs. exception, individual vs. system, and so on — not
just similar wording or topic. A good triad should still take a moment to
see through even once you're looking for it.

## Optional AI Assist (Groq)

Everything above works with zero network access. There is exactly one
opt-in exception, off by default: under **Data / Export → AI Assist**, you
can paste in your own [Groq](https://console.groq.com) API key (Groq's
cloud inference service — not xAI's "Grok" — currently has a genuinely free
tier with generous daily limits on strong open models). Turning it on makes
every new puzzle request try Groq first, asking it to invent a fresh triad
in the same shape as the offline bank, validated strictly (exactly 3
stances, a valid index, non-empty labels) before it's ever shown to you —
anything malformed is treated as a failure and falls back to the offline
bank automatically.

**The privacy tradeoff, stated plainly:** turning this on sends a request
to Groq's API, using your own key, directly from your browser, each time a
new puzzle is generated. There's still no backend — nothing else changes —
but that one request does leave the device. Leave it off to use only the
offline bank. The API key and the on/off toggle live in `localStorage` (not
IndexedDB), are never included in JSON export, and are removable any time
via "Forget saved key."

**Model + automatic fallback:** the default is `openai/gpt-oss-120b`. If
that model 404s (unavailable to your key) or hits a rate limit, requests
fall through automatically to `openai/gpt-oss-20b`, then `qwen/qwen3.6-27b`
(a Groq preview model, listed last on purpose since preview models can be
pulled at short notice) — all defined in `js/groq.js`. Any other failure
(bad key, network error) stops immediately rather than burning through the
whole chain. A small note appears on a puzzle whenever a fallback model
actually answered instead of your configured one.

These three models are all *reasoning* models — they spend part of their
token budget "thinking" before writing a final answer. Requests use the
current `max_completion_tokens` field (not the deprecated `max_tokens`),
set `reasoning_effort: "low"` and a hidden reasoning channel on the gpt-oss
models so only the final answer comes back, and request strict JSON output
(`response_format: json_object`) so the triad can be parsed reliably.
`qwen/qwen3.6-27b` only supports `"none"`/`"default"` for
`reasoning_effort` (not `"low"`), so that field is deliberately left unset
for it. If your Groq account's model access changes in the future, "Check
available models" in the settings UI (a live `GET /openai/v1/models` with
your key) tells you what's actually available right now rather than
requiring a code update.

## Appearance: light/dark mode and palettes

The compact button in the header (☾/☀) toggles between dark and light mode
instantly, with no page reload. Under **Data / Export → Appearance** there's
a fuller control:

- **Mode**: Dark, Light, or Auto (follows your OS/browser's
  `prefers-color-scheme`).
- **Palette**: four hand-tuned presets (Lab, Slate & steel, Rust & moss,
  Violet & teal), each with its own dark *and* light variant, so switching
  mode never resets your color choice. Pick **Custom** to set your own
  Accent, Accent 2, Accent 3, and Danger colors with plain color pickers —
  they apply live as you drag.

All of this lives in `js/theme.js`, loaded early in `<head>` so it applies
before the page paints (no flash of the wrong theme). It only ever writes to
one `localStorage` key (`thirdPosition.theme`) — never IndexedDB, never
exported, never sent anywhere.

## How Discoveries are calculated

All of the logic lives in `js/insights.js`, in one function,
`computeInsights(checks)`, run over your full Pattern Check history
whenever the gate trips (next milestone — 5, 12, 25, 50, 100, then every 50
— or roughly 4 days since the last check with new data). It looks for:

- **Overall accuracy** — a plain baseline stat, always reported once
  there's enough evidence.
- **A category you tend to miss** — a shared-logic label with 3+ attempts
  and a notably lower hit rate than your overall average.
- **A category you consistently spot** — the mirror: notably *higher* than
  average, so this isn't just a list of blind spots.
- **Evolution** — a real swing between your first-half and second-half
  accuracy, in either direction.
- **AI-generated vs. hand-written difficulty** — if you have 5+ attempts of
  each and a meaningfully different hit rate, whether one source is
  consistently harder for you.
- **A current streak** — 5+ attempts in a row all correct or all missed,
  reported at low confidence since short streaks happen by chance.

Every insight carries an evidence count, a confidence label (`low` /
`moderate` / `high` — never certainty), example attempts, an alternative
(more boring, competing) explanation of the same data, and what would
disconfirm it. Nothing is inferred from fewer than 3–5 attempts in a given
category. Below the confirmed discoveries, a **Building Evidence** section
shows categories with exactly 2 attempts — "one more would tip this
either way" — recomputed live, never persisted, never claimed as a finding.

## Data, privacy, and export

- All data is stored locally in this browser's IndexedDB (`js/db.js`). It
  is never transmitted anywhere — there is no server for it to go to —
  unless you've opted into AI Assist above.
- **Data / Export** lets you:
  - export a full JSON backup (every attempt, computed discoveries, and app
    metadata — never the Groq key, which stays local to the browser it was
    entered in)
  - export attempts as CSV
  - import a JSON backup (this **replaces** all current local data — you're
    asked to confirm)
  - permanently delete all local data (requires typing `DELETE` to confirm)
- Because everything is local to one browser profile, a JSON export is also
  your only way to move data between devices or browsers, or to keep a
  backup outside the browser's storage. A JSON export moves your data but
  not your Groq key — each browser/device needs its own key entered
  separately if you use AI Assist there too.

## Project layout

```
index.html            app shell
css/styles.css         all styling
js/theme.js              light/dark mode + selectable/custom color palettes
js/db.js                 IndexedDB wrapper
js/oddOneOut.js          the offline fallback triad bank (edit to add triads)
js/groq.js               optional, off-by-default AI puzzle generation (Groq)
js/patternCheck.js       triad selection: AI first, offline bank fallback
js/insights.js           the longitudinal pattern-detection engine
js/exportImport.js       JSON/CSV export, JSON import
js/app.js                UI controller, routing, all views
manifest.webmanifest     PWA manifest
service-worker.js        offline caching
```

No build tools, no package manager, no dependencies. Open it and it runs.

## What this deliberately does not do

- No AI, no API calls of any kind, during normal use — the one opt-in,
  off-by-default exception (Groq-powered puzzle generation) is described
  above and never activates without you pasting in your own key.
- No login, no account, no cloud sync.
- No personality score, no single trait label, no "you are an X person."
  If your accuracy genuinely differs by category or changes over time, the
  app is built to say so plainly, with the evidence stated, rather than
  average it into one number.
