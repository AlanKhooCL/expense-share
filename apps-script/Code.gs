/**
 * AI Trip Planner - Google Apps Script Backend
 *
 * This script serves the frontend HTML, proxies Gemini API calls (keeping the
 * API key server-side), and persists trip data in a Google Sheet.
 *
 * SETUP:
 * 1. Create a new Google Apps Script project at https://script.google.com
 * 2. Copy this file into the project as Code.gs
 * 3. Copy index.html into the project (File > New > HTML file, name it "Index")
 * 4. Set your Gemini API key:
 *    - Go to Project Settings > Script Properties
 *    - Add property: GEMINI_API_KEY = <your key from https://aistudio.google.com/apikey>
 * 5. Deploy > New deployment > Web app > Anyone can access
 */

// ---------------------------------------------------------------------------
// Web App entry point
// ---------------------------------------------------------------------------

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('AI Trip Planner')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------

/** Returns (and lazily creates) the spreadsheet used for storage. */
function getOrCreateSheet_() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('SHEET_ID');

  if (ssId) {
    try {
      return SpreadsheetApp.openById(ssId);
    } catch (e) {
      // Sheet was deleted; fall through and create a new one.
    }
  }

  const ss = SpreadsheetApp.create('AI Trip Planner - Data');
  props.setProperty('SHEET_ID', ss.getId());

  // Create the trips sheet with a header row
  const sheet = ss.getActiveSheet();
  sheet.setName('trips');
  sheet.appendRow(['id', 'json', 'createdAt', 'updatedAt']);
  sheet.setFrozenRows(1);

  return ss;
}

function getTripsSheet_() {
  const ss = getOrCreateSheet_();
  let sheet = ss.getSheetByName('trips');
  if (!sheet) {
    sheet = ss.insertSheet('trips');
    sheet.appendRow(['id', 'json', 'createdAt', 'updatedAt']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ---------------------------------------------------------------------------
// CRUD operations exposed to the client via google.script.run
// ---------------------------------------------------------------------------

/** Return all trips as a JSON-parseable array. */
function getTrips() {
  const sheet = getTripsSheet_();
  const rows = sheet.getDataRange().getValues();
  const trips = [];
  for (let i = 1; i < rows.length; i++) {
    try {
      trips.push(JSON.parse(rows[i][1]));
    } catch (e) { /* skip corrupt rows */ }
  }
  return JSON.stringify(trips);
}

/** Save a trip (insert or update). Expects a JSON string. */
function saveTrip(tripJson) {
  const trip = JSON.parse(tripJson);
  const sheet = getTripsSheet_();
  const rows = sheet.getDataRange().getValues();
  const now = new Date().toISOString();

  // Look for existing row with this id
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === trip.id) {
      sheet.getRange(i + 1, 2).setValue(tripJson);
      sheet.getRange(i + 1, 4).setValue(now);
      return 'updated';
    }
  }

  // Insert new row
  sheet.appendRow([trip.id, tripJson, now, now]);
  return 'created';
}

/** Delete a trip by id. */
function deleteTrip(tripId) {
  const sheet = getTripsSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === tripId) {
      sheet.deleteRow(i + 1);
      return 'deleted';
    }
  }
  return 'not_found';
}

// ---------------------------------------------------------------------------
// Gemini API proxy
// ---------------------------------------------------------------------------

/**
 * Generate a trip itinerary using the Gemini API.
 * Called from the client via google.script.run.generateTripWithAI(payload).
 *
 * @param {Object} payload - { destination, startDate, endDate, preferences }
 * @returns {string} JSON string of the generated trip
 */
function generateTripWithAI(payload) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it in Project Settings > Script Properties.');
  }

  const tripId = new Date().getTime().toString();
  const dest = payload.destination;
  const systemPrompt = 'You are an expert travel planner. Create a highly detailed travel itinerary. Respond ONLY with a raw JSON object matching exactly the requested structure. Generate at least 3 days of events, and assign a realistic \'expense\' cost (in SGD) to relevant events. Provide REAL latitude/longitude for \'latlng\' arrays. Include helpful tips in <span> tags inside desc fields.';

  const userQuery = [
    'Destination: ' + dest,
    'Start Date: ' + payload.startDate,
    'End Date: ' + payload.endDate,
    'User Preferences: ' + (payload.preferences || 'No special preferences'),
    '',
    'Required JSON Structure:',
    '{',
    '    "id": "' + tripId + '",',
    '    "overview": {',
    '        "title": "A catchy title for ' + dest + '",',
    '        "dates": "' + payload.startDate + ' to ' + payload.endDate + '",',
    '        "totalBudget": "Base flights/accomm estimate in SGD"',
    '    },',
    '    "budget": [',
    '        { "item": "Flights", "cost": "$...", "amount": 1000, "icon": "plane-takeoff" },',
    '        { "item": "Hotel", "cost": "$...", "amount": 800, "icon": "bed-double" }',
    '    ],',
    '    "locations": [',
    '        { "id": "loc1", "name": "City Name", "color": "pink", "image": "https://picsum.photos/seed/' + dest.replace(/\s/g, '') + '1/1000/600" }',
    '    ],',
    '    "itinerary": [',
    '        {',
    '            "day": 1,',
    '            "date": "Day 1 formatted date",',
    '            "location": "loc1",',
    '            "title": "Arrival & Exploration",',
    '            "events": [',
    '                { "time": "10:00 AM", "desc": "Event description <span class=\'block text-sm font-normal text-slate-500 mt-1\'>Helpful tip</span>", "icon": "map-pin", "expense": 15, "latlng": [1.3521, 103.8198], "link": "https://maps.google.com/..." }',
    '            ]',
    '        }',
    '    ]',
    '}',
    '',
    'Make sure "color" in locations is one of: pink, orange, purple, blue, green.',
    'Make sure "icon" is a valid standard lucide icon name (e.g. map-pin, utensils, coffee, camera, bed-double, plane-takeoff, shopping-bag, train).',
    'Include Google Maps links for major attractions.',
  ].join('\n');

  const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=' + apiKey;

  const requestBody = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: 'application/json',
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(apiUrl, options);
  const status = response.getResponseCode();

  if (status !== 200) {
    throw new Error('Gemini API returned status ' + status + ': ' + response.getContentText().substring(0, 300));
  }

  const data = JSON.parse(response.getContentText());
  const jsonText = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

  if (!jsonText) {
    throw new Error('No valid response from Gemini API.');
  }

  // Validate it parses as JSON
  const trip = JSON.parse(jsonText);

  // Persist to sheet
  saveTrip(jsonText);

  return jsonText;
}

/**
 * AI Research chat - ask Gemini a travel-related question.
 * Called from the client via google.script.run.chatWithAI(payload).
 *
 * @param {Object} payload - { message, tripContext }
 * @returns {string} AI response text
 */
function chatWithAI(payload) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it in Project Settings > Script Properties.');
  }

  const systemPrompt = [
    'You are a helpful travel research assistant. The user is planning a trip and may ask about:',
    '- Restaurant recommendations for specific areas',
    '- Activity suggestions and things to do',
    '- Transportation tips and logistics',
    '- Budget estimates and cost breakdowns',
    '- Cultural tips and local customs',
    '- Weather and packing advice',
    '',
    'Be specific, practical, and include real place names with approximate costs in SGD when relevant.',
    'Keep responses concise but informative (under 300 words).',
    'If the user provides trip context, tailor your advice to their specific itinerary.',
  ].join('\n');

  var userMessage = payload.message;
  if (payload.tripContext) {
    userMessage = 'My current trip context: ' + payload.tripContext + '\n\nMy question: ' + payload.message;
  }

  const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=' + apiKey;

  const requestBody = {
    contents: [{ parts: [{ text: userMessage }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(apiUrl, options);
  const status = response.getResponseCode();

  if (status !== 200) {
    throw new Error('Gemini API error: ' + status);
  }

  const data = JSON.parse(response.getContentText());
  var text = '';
  try {
    text = data.candidates[0].content.parts[0].text;
  } catch (e) {
    text = 'Sorry, I could not generate a response. Please try again.';
  }

  return text;
}
