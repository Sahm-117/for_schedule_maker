// FOF lead sync - Google Apps Script
//
// Everything that might change (which tab, which question goes where)
// lives in the "Sync settings" tab of this spreadsheet, not in this code.
// Use the menu FOF Sync > Check setup after changing the form.
//
// Only paste this file again if a developer changes the code itself.

// The real value lives in Apps Script, in Supabase (GOOGLE_SHEET_SECRET)
// and in the maintainer's local .env.cron.local. Never commit it.
var SECRET = 'PASTE-GOOGLE_SHEET_SECRET-HERE';

var SETTINGS_TAB = 'Sync settings';
var FIRST_MAP_ROW = 7;

// App fields a lead can carry. The names in column A of the settings tab
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
// Menu
// ---------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FOF Sync')
    .addItem('Check setup', 'checkSetup')
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
  sheet.getRange('A1').setValue('FOF lead sync settings')
    .setFontSize(14).setFontWeight('bold');
  sheet.getRange('A2').setValue('Leads go into this tab')
    .setFontWeight('bold');
  sheet.getRange('B2').setValue(DEFAULT_TAB);
  sheet.getRange('A3').setValue('"How they heard" text for app leads')
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
