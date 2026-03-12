# AI Trip Planner

A web-based trip planning application powered by Google's Gemini AI. Plan detailed itineraries with AI-generated suggestions, track expenses per activity, view routes on interactive maps, and research destinations with an AI chat assistant.

## Features

- **AI-Generated Itineraries** -- Describe your destination, dates, and preferences; Gemini builds a full day-by-day plan with real coordinates, expense estimates, and tips.
- **AI Research Chat** -- A slide-out panel where you can ask travel questions (restaurant recs, logistics, budget tips) with context from your current trip.
- **Multi-Trip Dashboard** -- Create and manage multiple trips from a single interface.
- **Interactive Maps** -- Each day has a toggleable Leaflet map showing numbered stops and a route polyline.
- **Expense Tracker** -- Edit per-event costs inline; totals roll up by day, location, and trip.
- **Sample Trip Import** -- One-click import of a pre-built "East Asia Spring Escape" itinerary (Tokyo, Jeju, Seoul) to see the app in action.

## Architecture

```
index.html          -- Frontend (Tailwind CSS, Leaflet, Lucide icons)
apps-script/
  Code.gs           -- Google Apps Script backend (Gemini proxy, Google Sheets storage)
  appsscript.json   -- Apps Script project manifest
```

### How it works

| Mode | AI Calls | Data Storage |
|------|----------|-------------|
| **Google Apps Script** (recommended) | Server-side via `UrlFetchApp` -- API key stays private in Script Properties | Google Sheets |
| **Standalone** (open `index.html` directly) | Client-side `fetch` -- requires setting `FALLBACK_API_KEY` in source | `localStorage` |

The frontend auto-detects which mode it is running in by checking for `google.script.run`.

## Deployment (Google Apps Script)

This is the recommended approach. Your Gemini API key stays server-side and trip data persists in Google Sheets.

### 1. Get a Gemini API key

Go to [Google AI Studio](https://aistudio.google.com/apikey) and create an API key.

### 2. Create the Apps Script project

1. Go to [script.google.com](https://script.google.com) and click **New project**.
2. Rename the project to "AI Trip Planner" (or anything you like).

### 3. Add the backend code

1. In the script editor, replace the contents of `Code.gs` with the contents of [`apps-script/Code.gs`](apps-script/Code.gs).
2. Click the `+` next to **Files** and select **HTML**. Name it `Index` (not `Index.html` -- Apps Script adds the extension automatically).
3. Paste the contents of [`index.html`](index.html) into the `Index.html` file.

### 4. Set the API key

1. Click the gear icon (Project Settings) in the left sidebar.
2. Scroll down to **Script Properties** and click **Add script property**.
3. Set the property name to `GEMINI_API_KEY` and paste your API key as the value.
4. Click **Save script properties**.

### 5. Deploy as a web app

1. Click **Deploy** > **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set **Execute as** to "Me" and **Who has access** to "Anyone" (or "Anyone with Google account" for restricted access).
4. Click **Deploy**.
5. Copy the web app URL -- this is your live trip planner.

### 6. Use it

Open the web app URL in your browser. You can:
- Click **Import Sample** to load the pre-built East Asia trip.
- Click **New Trip** to generate an AI itinerary from scratch.
- Click the **Research** button in the nav bar to open the AI chat assistant.

## Standalone Mode (Local Development)

If you just want to open `index.html` in a browser without Apps Script:

1. Open `index.html` in a text editor.
2. Find `const FALLBACK_API_KEY = '';` near the top of the `<script>` block.
3. Set it to your Gemini API key: `const FALLBACK_API_KEY = 'your-key-here';`
4. Open `index.html` in a browser.

Note: In standalone mode, trip data is stored in `localStorage` (browser-only, not synced across devices) and the API key is exposed in client-side code.

## Tech Stack

- **Frontend**: HTML, Tailwind CSS (CDN), Lucide Icons, Leaflet.js (maps)
- **Backend**: Google Apps Script (server-side JavaScript)
- **AI**: Google Gemini API (`gemini-2.5-flash-preview-05-20`)
- **Storage**: Google Sheets (via Apps Script) or localStorage (standalone)

## Project Structure

```
.
├── index.html                 # Frontend application
├── apps-script/
│   ├── Code.gs                # Apps Script backend
│   └── appsscript.json        # Apps Script manifest
└── README.md                  # This file
```

## License

MIT
