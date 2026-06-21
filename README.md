# Wayfarer

A walking guide that watches your location, finds nearby places of interest via
Wikipedia, rewrites the facts into a short spoken narration with Claude, and
speaks it aloud with Deepgram Aura. Passive only — no mic, no chat, just a
voice that narrates as you walk.

## Stack

- **Frontend:** React + Vite, plain CSS (no framework)
- **Geolocation:** Browser Geolocation API (`watchPosition`)
- **Place discovery:** Wikipedia Geosearch API (keyless, CORS-enabled, called
  directly from the browser)
- **Narration writing:** Claude (`claude-sonnet-4-6`), via a small Express backend
- **Text-to-speech:** Deepgram Aura, via the same backend

## Why there's a backend at all

The Geolocation and Wikipedia calls run entirely client-side — no secrets
involved. But the Claude and Deepgram calls both need API keys, and API keys
can never live in frontend code (anyone can read your bundle's network
requests and steal them). So `backend/` is a minimal Express server with two
routes that proxy those calls and hold the real secrets in environment
variables.

## Project layout

```
walking-guide/
├── backend/
│   ├── server.js            Express app: /api/narrate, /api/speak, /api/health
│   ├── narratorPrompt.js    The narrator's personality/system prompt — tune here
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── lib/
    │   │   ├── geo.js          Haversine distance helper
    │   │   └── wikipedia.js    Geosearch + extracts client
    │   ├── hooks/
    │   │   ├── useGeolocation.js   Wraps watchPosition lifecycle
    │   │   └── useWalkingGuide.js  Orchestrates the whole pipeline (the core logic)
    │   ├── App.jsx
    │   └── App.css
    └── .env.example
```

## Setup

**Backend:**
```bash
cd backend
cp .env.example .env
# fill in ANTHROPIC_API_KEY and DEEPGRAM_API_KEY in .env
npm install
npm run dev
```

**Frontend** (separate terminal):
```bash
cd frontend
cp .env.example .env   # only needed if backend isn't on localhost:3001
npm install
npm run dev
```

Open the printed localhost URL. Your browser will prompt for location
permission — accept it, or nothing will happen.

### Testing on a phone

Geolocation accuracy on a laptop (wifi-triangulated) is often hundreds of
meters off, which makes this app pretty unconvincing in dev. To actually test
it like a walking guide, run it on your phone:

1. Geolocation requires HTTPS (or `localhost`) — a plain `http://<lan-ip>:5173`
   from your phone will likely be blocked.
2. Easiest fix: tunnel the Vite dev server with something like `ngrok http 5173`
   and open the HTTPS tunnel URL on your phone.
3. Point `VITE_BACKEND_URL` at a similarly tunneled backend, or deploy the
   backend somewhere reachable.

## How the narration loop works

1. `useGeolocation` keeps a live `watchPosition` subscription and exposes the
   latest coordinates.
2. `useWalkingGuide` watches for position updates, but only acts when **both**
   gates pass: the user moved at least `MIN_MOVE_METERS` since the last check,
   and at least `MIN_SECONDS_BETWEEN_CHECKS` have elapsed. This stops the app
   from hammering Wikipedia on every GPS jitter.
3. When triggered, it queries Wikipedia Geosearch for nearby geotagged
   articles within `SEARCH_RADIUS_METERS`, fetches plain-text summaries for
   them in one batched call, and picks the closest one that's within
   `NARRATE_WITHIN_METERS` and not on cooldown (`RE_NARRATE_COOLDOWN_MS` —
   default 30 min — so it won't repeat the same spot if you loop back).
4. That place's raw Wikipedia extract is sent to `/api/narrate`, where Claude
   rewrites it into a short spoken-style script using the system prompt in
   `narratorPrompt.js`.
5. The script is sent to `/api/speak`, which calls Deepgram Aura and streams
   back an MP3, which the browser plays via the `Audio` API.
6. Status (`idle` / `searching` / `narrating` / `speaking`) and a running
   history of narrated places drive the UI.

All the tuning constants live at the top of `useWalkingGuide.js`:

| Constant | Default | Effect |
|---|---|---|
| `SEARCH_RADIUS_METERS` | 400 | How far out to look for Wikipedia places |
| `MIN_MOVE_METERS` | 40 | Minimum movement before re-checking |
| `MIN_SECONDS_BETWEEN_CHECKS` | 8 | Throttle on Wikipedia queries |
| `NARRATE_WITHIN_METERS` | 60 | How close you must be to actually trigger narration |
| `RE_NARRATE_COOLDOWN_MS` | 30 min | How long before a place can be re-narrated |

## Known limitations / things to expect

- **Wikipedia coverage is sparse.** Only geotagged articles show up — mostly
  landmarks, notable buildings, parks. Expect long quiet stretches in ordinary
  residential streets. This is the single biggest gap between "demo" and
  "actually useful everywhere" — a real product would likely blend in another
  source (OpenStreetMap POIs, a custom places database) for coverage between
  landmarks.
- **GPS accuracy varies a lot**, especially indoors or downtown with tall
  buildings. The `accuracy` field from the Geolocation API is shown in the
  footer so you can sanity-check it.
- **No interruption/conversation yet** — this build is intentionally passive
  narration only. The pipeline (`useWalkingGuide`) is kept separate from the
  UI specifically so a chat/voice layer could be added later without
  rewriting the location or narration logic.
- **Audio autoplay:** browsers restrict autoplay before any user gesture. You
  may need one tap/click on the page before the first narration will actually
  produce sound — this is standard browser policy, not a bug.
- **Cost shape:** each narrated place costs one Claude call + one Deepgram
  call. At the default tuning this is infrequent (gated by both distance and
  cooldown), but a long walk through a dense historic district could trigger
  many in a row — worth keeping an eye on usage if that matters to you.
