// FOF sign-up sync - Google Apps Script
//
// Everything that might change (which tab, which question goes where)
// lives in the "Sync settings" tab of this spreadsheet, not in this code.
// Use the menu FOF Sync > Check setup after changing the form.
//
// Only paste this file again if a developer changes the code itself.

// The real value lives in Apps Script, in Supabase (GOOGLE_SHEET_SECRET)
// and in the maintainer's local .env.cron.local. Never commit it.
var SECRET = 'PASTE-GOOGLE_SHEET_SECRET-HERE';

// Where form sign-ups are sent, so supports can see in the app who has
// registered. Same project as everything else; only the path differs.
var APP_ENDPOINT = 'https://vnmeeqvwqaeczjlvzoul.supabase.co/functions/v1/receive-form-registration';

// Supabase will not accept a call without this header. It is the public key
// that already ships inside the FOF web app, so it is not a secret -- SECRET
// above is what actually proves the call came from this spreadsheet.
var APP_ANON_KEY = 'PASTE-SUPABASE-ANON-KEY-HERE';

var SETTINGS_TAB = 'Sync settings';
var FIRST_MAP_ROW = 7;

// App fields a prospect can carry. The names in column A of the settings tab
// must be one of these (they are filled in for you).
var APP_FIELDS = {
  'Timestamp': 'registeredAt',
  'Email': 'email',
  'First name': 'firstName',
  'Surname': 'surname',
  'Gender': 'gender',
  'Age range': 'ageRange',
  'Occupation': 'occupation',
  'Note': 'note',
  'WhatsApp number': 'phone',
  'Registered by': 'registeredBy',
  'How they heard': 'source'
};

var DEFAULT_TAB = 'Form Responses 1';
var DEFAULT_SOURCE = 'Registered in the FOF app';
var DEFAULT_MAP = [
  ['Timestamp', 'Timestamp'],
  ['Email', 'Email Address'],
  ['First name', 'What is your first name'],
  ['Surname', 'What is your surname'],
  ['Gender', "What's your Gender?"],
  ['Age range', 'Age Range?'],
  ['Occupation', 'Occupation'],
  ['Occupation', "What's your occupation?"],
  ['Note', 'Any Other Questions or Concerns?'],
  ['WhatsApp number', 'Please Share Your WhatsApp Number'],
  ['Registered by', 'Who Registered You for FOF?'],
  ['How they heard', 'How did you learn about the FOF program?']
];

// ---------------------------------------------------------------------
// Form sign-ups -> the FOF app
// ---------------------------------------------------------------------

// Runs on every form submission. Set it up once with
// FOF Sync > Connect form sign-ups.
//
// Supports can then see who has registered without asking the back office.
// A failure here is logged and left alone: it must never stop the response
// reaching the spreadsheet, which is still the record of truth.
function onFormSubmit(e) {
  try {
    if (!e || !e.namedValues) return;
    var answers = {};
    var keys = Object.keys(e.namedValues);
    for (var i = 0; i < keys.length; i++) {
      var value = e.namedValues[keys[i]];
      answers[keys[i]] = Array.isArray(value) ? value.join(', ') : String(value);
    }

    var first = pickAnswer(answers, 'First name');
    var surname = pickAnswer(answers, 'Surname');
    var fullName = (first + ' ' + surname).replace(/\s+/g, ' ').trim();
    var phone = pickAnswer(answers, 'WhatsApp number');

    // Without these two there is nobody to match, so there is nothing to send.
    if (!fullName || !phone) {
      Logger.log('FOF sign-up skipped: no name or number in ' + JSON.stringify(answers));
      return;
    }

    if (isAppAddedRow(answers)) {
      Logger.log('FOF sign-up skipped: added in the app, not a form sign-up');
      return;
    }

    var payload = {
      secret: SECRET,
      responseId: e.range ? (e.range.getSheet().getName() + ':' + e.range.getRow()) : null,
      fullName: fullName,
      phone: phone,
      email: pickAnswer(answers, 'Email'),
      signedUpAt: new Date().toISOString(),
      answers: answers
    };

    var response = UrlFetchApp.fetch(APP_ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + APP_ANON_KEY, apikey: APP_ANON_KEY },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    Logger.log('FOF sign-up sent: ' + response.getResponseCode() + ' ' + response.getContentText());
  } catch (err) {
    Logger.log('FOF sign-up failed: ' + err);
  }
}

// Finds a submitted answer using the question titles already configured in the
// Sync settings tab, so a renamed question is fixed in one place for both
// directions. Falls back to matching on the field name itself.
// Cached for the life of one run: readSettings() reads the spreadsheet, and
// importing a few hundred rows calls this four times per row.
var SETTINGS_CACHE = null;
function cachedSettings() {
  if (!SETTINGS_CACHE) SETTINGS_CACHE = readSettings();
  return SETTINGS_CACHE;
}

// True when a row's "How they heard" answer is the marker text the old
// app->sheet push used to write in, meaning this row was never actually
// filled in on the form -- it was a contact added in the app.
function isAppAddedRow(answers) {
  var heard = clean(pickAnswer(answers, 'How they heard'));
  var marker = clean(cachedSettings().sourceText || DEFAULT_SOURCE);
  return !!heard && heard === marker;
}

function pickAnswer(answers, label) {
  var settings = cachedSettings();
  var keys = Object.keys(answers);
  for (var i = 0; i < settings.map.length; i++) {
    if (settings.map[i].label !== label || !settings.map[i].heading) continue;
    for (var j = 0; j < keys.length; j++) {
      if (clean(keys[j]) === clean(settings.map[i].heading)) {
        return String(answers[keys[j]]).trim();
      }
    }
  }
  for (var k = 0; k < keys.length; k++) {
    if (clean(keys[k]).indexOf(clean(label)) !== -1) return String(answers[keys[k]] || '').trim();
  }
  return '';
}

// ---------------------------------------------------------------------
// Bringing in the sign-ups that were already here
// ---------------------------------------------------------------------
//
// The submit trigger only catches new responses. These two read the rows
// already sitting in the form tab and offer them to the app.
//
// Preview writes nothing at all. Import writes, but stays quiet: the app skips
// its usual "new sign-up" alert to the admins, which would otherwise mean one
// notification per historical row.
//
// Both are safe to run more than once. Each row is keyed by its position, so a
// row that has already been imported is recognised and skipped.

function previewPastSignUps() {
  runPastSignUps(true);
}

function importPastSignUps() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert(
    'Import past sign-ups',
    'This adds everyone already in the form tab to the FOF app. Rows already imported are skipped. Continue?',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;
  runPastSignUps(false);
}

function runPastSignUps(dryRun) {
  SETTINGS_CACHE = null;
  var settings = cachedSettings();
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(settings.tabName);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Cannot find the tab "' + settings.tabName + '". Check Sync settings B2.');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('There are no form responses in "' + settings.tabName + '" yet.');
    return;
  }

  var width = sheet.getLastColumn();
  var heads = sheet.getRange(1, 1, 1, width).getValues()[0];
  var rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();

  var counts = { matched: 0, created: 0, duplicate: 0, skipped: 0, appAdded: 0, failed: 0 };
  var examples = [];

  for (var i = 0; i < rows.length; i++) {
    var answers = {};
    for (var c = 0; c < width; c++) {
      var head = String(heads[c]).trim();
      if (head) answers[head] = String(rows[i][c]);
    }

    var first = pickAnswer(answers, 'First name');
    var surname = pickAnswer(answers, 'Surname');
    var fullName = (first + ' ' + surname).replace(/\s+/g, ' ').trim();
    var phone = pickAnswer(answers, 'WhatsApp number');
    if (!fullName || !phone) { counts.skipped++; continue; }

    if (isAppAddedRow(answers)) {
      Logger.log('FOF sign-up skipped: added in the app, not a form sign-up');
      counts.appAdded++;
      continue;
    }

    var stamp = pickAnswer(answers, 'Timestamp');
    var payload = {
      secret: SECRET,
      responseId: settings.tabName + ':' + (i + 2),
      fullName: fullName,
      phone: phone,
      email: pickAnswer(answers, 'Email'),
      signedUpAt: stamp ? new Date(stamp).toISOString() : null,
      answers: answers,
      backfill: true,
      dryRun: dryRun === true
    };

    try {
      var response = UrlFetchApp.fetch(APP_ENDPOINT, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + APP_ANON_KEY, apikey: APP_ANON_KEY },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      var body = JSON.parse(response.getContentText());
      if (body.outcome === 'MATCHED') counts.matched++;
      else if (body.outcome === 'CREATED') counts.created++;
      else if (body.outcome === 'DUPLICATE') counts.duplicate++;
      else counts.failed++;
      if (body.wouldDo && examples.length < 8) examples.push('- ' + body.wouldDo);
    } catch (err) {
      counts.failed++;
      Logger.log('Past sign-up row ' + (i + 2) + ' failed: ' + err);
    }
  }

  var title = dryRun ? 'Preview: nothing was changed' : 'Past sign-ups imported';
  var lines = [
    'Rows read: ' + rows.length,
    '',
    (dryRun ? 'Would match an existing contact: ' : 'Matched an existing contact: ') + counts.matched,
    (dryRun ? 'Would be added as a new prospect: ' : 'Added as a new prospect: ') + counts.created,
    'Already imported, skipped: ' + counts.duplicate,
    'No name or number, skipped: ' + counts.skipped,
    'Added in the app, not a form sign-up, skipped: ' + counts.appAdded,
    'Failed: ' + counts.failed
  ];
  if (examples.length) lines.push('', 'For example:', examples.join('\n'));
  SpreadsheetApp.getUi().alert(title, lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

// Creates the submit trigger. Safe to run twice: the old one is replaced.
function connectFormSignUps() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'onFormSubmit') ScriptApp.deleteTrigger(existing[i]);
  }
  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(book).onFormSubmit().create();
  SpreadsheetApp.getUi().alert('Form sign-ups are now sent to the FOF app.');
}

// ---------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FOF Sync')
    .addItem('Check setup', 'checkSetup')
    .addItem('Connect form sign-ups', 'connectFormSignUps')
    .addItem('Preview past sign-ups', 'previewPastSignUps')
    .addItem('Import past sign-ups', 'importPastSignUps')
    .addItem('Rebuild settings tab', 'rebuildSettings')
    .addToUi();
}

function checkSetup() {
  var result = validate(true);
  var ui = SpreadsheetApp.getUi();
  if (result.ok) {
    ui.alert('FOF Sync', 'All good. Every field has a matching column in "'
      + result.tabName + '".', ui.ButtonSet.OK);
  } else {
    ui.alert('FOF Sync', 'Needs attention:\n\n- '
      + result.problems.join('\n- ')
      + '\n\nFix the red rows in "' + SETTINGS_TAB
      + '", then run Check setup again.',
      ui.ButtonSet.OK);
  }
}

function rebuildSettings() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var old = book.getSheetByName(SETTINGS_TAB);
  if (old) {
    book.deleteSheet(old);
  }
  createSettings(book);
  checkSetup();
}

// ---------------------------------------------------------------------
// Web app (called by the FOF app)
// ---------------------------------------------------------------------

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) {
    return json({ ok: false, error: 'Not authorised' });
  }
  if (!body.fullName) {
    return json({ ok: false, error: 'fullName is required' });
  }

  var settings = readSettings();
  var sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(settings.tabName);
  if (!sheet) {
    return json({ ok: false,
      error: 'No tab named "' + settings.tabName + '" (check Sync settings)' });
  }

  var width = Math.max(sheet.getLastColumn(), 1);
  var heads = sheet.getRange(1, 1, 1, width).getValues()[0];
  var fields = buildFields(body, settings.sourceText);
  var plan = planColumns(settings.map, heads);
  var values = blank(width);

  for (var i = 0; i < plan.targets.length; i++) {
    values[plan.targets[i][0] - 1] = fields[plan.targets[i][1]];
  }

  var row = sheet.getLastRow() + 1;
  var target = sheet.getRange(row, 1, 1, width);
  target.setValues([values]);
  target
    .setFontColor('#1f1f1f')
    .setBackground('#ffffff')
    .setFontWeight('normal')
    .setFontSize(10)
    .setVerticalAlignment('middle');

  for (var t = 0; t < plan.targets.length; t++) {
    if (plan.targets[t][1] === 'registeredAt') {
      var cell = sheet.getRange(row, plan.targets[t][0]);
      cell.setValue(fields.registeredAt);
      cell.setNumberFormat('M/d/yyyy H:mm:ss');
      cell.setHorizontalAlignment('right');
    }
  }

  return json({
    ok: true,
    action: 'added',
    row: row,
    tab: settings.tabName,
    missingHeadings: plan.missing
  });
}

function doGet() {
  var result = validate(false);
  return json({
    ok: result.ok,
    tab: result.tabName,
    problems: result.problems
  });
}

// ---------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------

function createSettings(book) {
  var sheet = book.insertSheet(SETTINGS_TAB);
  sheet.getRange('A1').setValue('FOF sign-up sync settings')
    .setFontSize(14).setFontWeight('bold');
  sheet.getRange('A2').setValue('Sign-ups go into this tab')
    .setFontWeight('bold');
  sheet.getRange('B2').setValue(DEFAULT_TAB);
  sheet.getRange('A3').setValue('"How they heard" text for app prospects')
    .setFontWeight('bold');
  sheet.getRange('B3').setValue(DEFAULT_SOURCE);
  sheet.getRange('A4').setValue(
    'If a form question is renamed, change it in column B below, '
    + 'then run FOF Sync > Check setup. Do not rename column A.')
    .setFontColor('#666666');

  sheet.getRange(FIRST_MAP_ROW - 1, 1, 1, 3)
    .setValues([['App field', 'Column heading in the form tab', 'Status']])
    .setFontWeight('bold').setBackground('#eeeeee');

  var rows = [];
  for (var i = 0; i < DEFAULT_MAP.length; i++) {
    rows.push([DEFAULT_MAP[i][0], DEFAULT_MAP[i][1], '']);
  }
  sheet.getRange(FIRST_MAP_ROW, 1, rows.length, 3).setValues(rows);
  sheet.setColumnWidth(1, 260);
  sheet.setColumnWidth(2, 380);
  sheet.setColumnWidth(3, 200);
  sheet.setFrozenRows(FIRST_MAP_ROW - 1);
  return sheet;
}

function readSettings() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(SETTINGS_TAB) || createSettings(book);
  var tabName = String(sheet.getRange('B2').getValue()).trim()
    || DEFAULT_TAB;
  var sourceText = String(sheet.getRange('B3').getValue()).trim();
  var last = sheet.getLastRow();
  var map = [];
  if (last >= FIRST_MAP_ROW) {
    var count = last - FIRST_MAP_ROW + 1;
    var rows = sheet.getRange(FIRST_MAP_ROW, 1, count, 2).getValues();
    for (var i = 0; i < rows.length; i++) {
      var label = String(rows[i][0]).trim();
      var heading = String(rows[i][1]).trim();
      if (label || heading) {
        map.push({ row: FIRST_MAP_ROW + i, label: label, heading: heading });
      }
    }
  }
  return { sheet: sheet, tabName: tabName, sourceText: sourceText, map: map };
}

// Checks every settings row against the form tab. When writeStatus is
// true it also colours the Status column and refreshes the dropdowns.
function validate(writeStatus) {
  var settings = readSettings();
  var problems = [];
  var sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(settings.tabName);

  if (!sheet) {
    problems.push('No tab named "' + settings.tabName + '"');
    return { ok: false, tabName: settings.tabName, problems: problems };
  }

  var width = Math.max(sheet.getLastColumn(), 1);
  var heads = sheet.getRange(1, 1, 1, width).getValues()[0];
  var headsClean = [];
  var headList = [];
  for (var h = 0; h < heads.length; h++) {
    headsClean.push(clean(heads[h]));
    if (String(heads[h]).trim()) {
      headList.push(String(heads[h]).trim());
    }
  }

  for (var i = 0; i < settings.map.length; i++) {
    var entry = settings.map[i];
    var status = 'OK';
    if (!APP_FIELDS[entry.label]) {
      status = 'Unknown app field';
    } else if (!entry.heading) {
      status = 'No heading chosen';
    } else if (headsClean.indexOf(clean(entry.heading)) === -1) {
      status = 'Heading not found';
    }
    if (status !== 'OK') {
      problems.push(entry.label + ': ' + status
        + (entry.heading ? ' ("' + entry.heading + '")' : ''));
    }
    if (writeStatus) {
      var cell = settings.sheet.getRange(entry.row, 3);
      cell.setValue(status);
      cell.setBackground(status === 'OK' ? '#d9ead3' : '#f4cccc');
    }
  }

  if (writeStatus && headList.length && settings.map.length) {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(headList, true)
      .setAllowInvalid(true)
      .build();
    settings.sheet
      .getRange(FIRST_MAP_ROW, 2, settings.map.length, 1)
      .setDataValidation(rule);
  }

  return { ok: problems.length === 0, tabName: settings.tabName,
    problems: problems };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

// Returns columns to fill ([column, key]) and headings that were missing.
function planColumns(map, heads) {
  var targets = [];
  var missing = [];
  for (var i = 0; i < map.length; i++) {
    var key = APP_FIELDS[map[i].label];
    if (!key || !map[i].heading) {
      continue;
    }
    var want = clean(map[i].heading);
    var found = false;
    for (var c = 0; c < heads.length; c++) {
      if (clean(heads[c]) === want) {
        targets.push([c + 1, key]);
        found = true;
      }
    }
    if (!found) {
      missing.push(map[i].label + ' -> "' + map[i].heading + '"');
    }
  }
  return { targets: targets, missing: missing };
}

function buildFields(body, sourceText) {
  var name = String(body.fullName || '').trim().replace(/\s+/g, ' ');
  var space = name.indexOf(' ');
  var when = body.registeredAt ? new Date(body.registeredAt) : new Date();
  return {
    registeredAt: when,
    email: String(body.email || ''),
    firstName: space === -1 ? name : name.substring(0, space),
    surname: space === -1 ? '' : name.substring(space + 1),
    gender: String(body.gender || ''),
    ageRange: String(body.ageRange || ''),
    occupation: String(body.occupation || ''),
    note: String(body.note || ''),
    phone: body.phone ? "'" + String(body.phone) : '',
    registeredBy: String(body.registeredBy || ''),
    source: sourceText || ''
  };
}

function clean(text) {
  return String(text)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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
