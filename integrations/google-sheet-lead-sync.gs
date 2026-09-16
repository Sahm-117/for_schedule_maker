// FOF lead sync - Google Apps Script
// Paste, save, then Deploy > Manage deployments > New version.

// The real value lives in Apps Script, in Supabase (GOOGLE_SHEET_SECRET)
// and in the maintainer's local .env.cron.local. Never commit it.
var SECRET = 'PASTE-GOOGLE_SHEET_SECRET-HERE';
var TAB_NAME = 'Form Responses 1';

// Every lead is a new row; existing form responses are never changed.
var APPEND_ONLY = true;

// Your form's headings -> the value to put there.
// Headings are compared ignoring case, spaces and quote style.
// A heading that appears twice gets the value in both columns.
var MAP = [
  ['Timestamp', 'registeredAt'],
  ['Email Address', 'email'],
  ['What is your first name', 'firstName'],
  ['What is your surname', 'surname'],
  ["What's your Gender?", 'gender'],
  ['Age Range?', 'ageRange'],
  ['Occupation', 'occupation'],
  ["What's your occupation?", 'occupation'],
  ['Any Other Questions or Concerns?', 'note'],
  ['Please Share Your WhatsApp Number', 'phone'],
  ['Who Registered You for FOF?', 'registeredBy'],
  ['How did you learn about the FOF program?', 'source']
];

// What goes in "How did you learn about the FOF program?" for app leads.
var APP_SOURCE = 'Registered in the FOF app';

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) {
    return json({ ok: false, error: 'Not authorised' });
  }
  if (!body.fullName) {
    return json({ ok: false, error: 'fullName is required' });
  }

  var sheet = getSheet();
  var width = Math.max(sheet.getLastColumn(), 1);
  var fields = buildFields(body);
  var targets = getTargets(sheet);
  var values = blank(width);

  for (var i = 0; i < targets.length; i++) {
    var col = targets[i][0];
    var key = targets[i][1];
    values[col - 1] = fields[key];
  }

  sheet.appendRow(values);
  return json({ ok: true, action: 'added', row: sheet.getLastRow() });
}

// Open the /exec URL to see how each heading is mapped,
// plus the answers already used for gender and age range.
function doGet() {
  var sheet = getSheet();
  var width = sheet.getLastColumn();
  var heads = sheet.getRange(1, 1, 1, width).getValues()[0];
  var targets = getTargets(sheet);
  var mapped = {};
  for (var i = 0; i < targets.length; i++) {
    mapped[heads[targets[i][0] - 1]] = targets[i][1];
  }
  return json({
    ok: true,
    tab: TAB_NAME,
    mapped: mapped,
    existingGenders: distinct(sheet, targets, 'gender'),
    existingAgeRanges: distinct(sheet, targets, 'ageRange')
  });
}

function buildFields(body) {
  var name = String(body.fullName || '').trim().replace(/\s+/g, ' ');
  var space = name.indexOf(' ');
  var first = space === -1 ? name : name.substring(0, space);
  var last = space === -1 ? '' : name.substring(space + 1);
  var when = body.registeredAt ? new Date(body.registeredAt) : new Date();
  return {
    registeredAt: when,
    email: String(body.email || ''),
    firstName: first,
    surname: last,
    gender: String(body.gender || ''),
    ageRange: String(body.ageRange || ''),
    occupation: String(body.occupation || ''),
    note: String(body.note || ''),
    phone: String(body.phone || ''),
    registeredBy: String(body.registeredBy || ''),
    source: APP_SOURCE
  };
}

// Returns [column number, field key] for every heading in MAP.
function getTargets(sheet) {
  var width = sheet.getLastColumn();
  var heads = sheet.getRange(1, 1, 1, width).getValues()[0];
  var out = [];
  for (var m = 0; m < MAP.length; m++) {
    var want = clean(MAP[m][0]);
    for (var c = 0; c < heads.length; c++) {
      if (clean(heads[c]) === want) {
        out.push([c + 1, MAP[m][1]]);
      }
    }
  }
  return out;
}

function distinct(sheet, targets, key) {
  var last = sheet.getLastRow();
  var seen = {};
  if (last < 2) {
    return [];
  }
  for (var i = 0; i < targets.length; i++) {
    if (targets[i][1] !== key) {
      continue;
    }
    var col = targets[i][0];
    var vals = sheet.getRange(2, col, last - 1, 1).getValues();
    for (var r = 0; r < vals.length; r++) {
      var v = String(vals[r][0]).trim();
      if (v) {
        seen[v] = true;
      }
    }
  }
  return Object.keys(seen);
}

function clean(text) {
  return String(text)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(TAB_NAME);
  if (!sheet) {
    throw new Error('No tab named ' + TAB_NAME);
  }
  return sheet;
}

function blank(width) {
  var out = [];
  for (var i = 0; i < width; i++) {
    out.push('');
  }
  return out;
}

function json(o) {
  var out = ContentService.createTextOutput(JSON.stringify(o));
  return out.setMimeType(ContentService.MimeType.JSON);
}
