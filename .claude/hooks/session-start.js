#!/usr/bin/env node
/**
 * SessionStart hook — summarises the previous session into .sessions/
 * Runs automatically when a new Claude Code session opens.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// Summarisation runs through the `claude` CLI itself (claude -p), reusing whatever
// auth already lets the user run Claude Code — no separate ANTHROPIC_API_KEY needed.
const PROJECT_ROOT = process.env.CLAUDE_PROJECT_ROOT || process.cwd();

// Claude's config/state dir. Honour CLAUDE_CONFIG_DIR — transcripts are filed under
// <config>/projects/, and when the user runs with a custom config dir (e.g.
// ~/.claude-work) the default ~/.claude is STALE and the real transcripts live
// elsewhere. Hardcoding ~/.claude was why sessions silently failed to save.
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(process.env.HOME, '.claude');
const PROJECTS_BASE = path.join(CONFIG_DIR, 'projects');

// Manual invocation: when run by hand (`--manual`/`--now`), save the current/most-recent
// session even if the project-specific transcript dir can't be resolved (e.g. case-insensitive
// path collisions, or the session was started from a parent workspace dir). Automatic hook
// runs leave MANUAL false, so default behaviour is unchanged.
const MANUAL = process.argv.includes('--manual') || process.argv.includes('--now');

// Path to the claude CLI binary. Resolved once so failures are clear if it's missing.
function resolveClaudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  try {
    return execSync('command -v claude', { stdio: 'pipe' }).toString().trim();
  } catch {
    return 'claude'; // fall back to PATH lookup at spawn time
  }
}
const CLAUDE_BIN = resolveClaudeBin();

// Runs a prompt through `claude -p` (non-interactive print mode) and returns stdout.
// Uses the CLI's own authenticated session — no API key required. Returns null on
// any failure (missing binary, non-zero exit, empty output) so callers can skip
// gracefully instead of throwing mid-hook.
function runClaudePrompt(prompt, { model } = {}) {
  const args = ['-p', '--output-format', 'text'];
  if (model) args.push('--model', model);
  const result = spawnSync(CLAUDE_BIN, args, {
    input: prompt,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120000,
  });
  if (result.error) {
    console.error('[session-start] Failed to run claude CLI:', result.error.message);
    return null;
  }
  if (result.status !== 0) {
    console.error('[session-start] claude CLI exited non-zero:', result.stderr?.trim() || result.status);
    return null;
  }
  const text = (result.stdout || '').trim();
  return text || null;
}

// Only run inside real project directories (git repo OR has package.json).
// Avoids creating .sessions/ when claude is launched from $HOME or a scratch dir.
const looksLikeProject =
  fs.existsSync(path.join(PROJECT_ROOT, '.git')) ||
  fs.existsSync(path.join(PROJECT_ROOT, 'package.json'));
if (!looksLikeProject || PROJECT_ROOT === process.env.HOME) {
  process.exit(0);
}

const SESSIONS_DIR = path.join(PROJECT_ROOT, '.sessions');
const INDEX_FILE = path.join(SESSIONS_DIR, 'INDEX.md');

const CLAUDE_PROJECTS_DIR = path.join(PROJECTS_BASE, sanitizePath(PROJECT_ROOT));

function sanitizePath(p) {
  // Claude sanitizes paths by replacing /, spaces, and underscores with -, leading / becomes leading -
  return p.replace(/[\/ _]/g, '-');
}

function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_FILE)) {
    fs.writeFileSync(
      INDEX_FILE,
      '# Session Index\n\n| Date | Session | Summary | Key changes | Branch |\n|------|---------|---------|-------------|--------|\n'
    );
  }
}

// Most-recent .jsonl transcript inside a single project dir.
function mostRecentJsonlIn(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? { path: path.join(dir, files[0].name), mtime: files[0].mtime } : null;
}

function getMostRecentJsonl() {
  // Explicit override: CLAUDE_TRANSCRIPT=<path to .jsonl> forces that transcript.
  // Needed when a session was launched from a parent directory, so its recorded
  // cwd does not match the project root and the cwd-scan below cannot find it.
  const override = process.env.CLAUDE_TRANSCRIPT;
  if (override && fs.existsSync(override)) return override;

  const target = path.resolve(PROJECT_ROOT);

  // (a) Fast path: most-recent transcript in the reconstructed dir for THIS project,
  //     but only trust it if its recorded cwd matches this project (or it's an old
  //     cwd-less transcript sitting in the exact-match dir — those predate cwd and are
  //     safe to trust since they're already in this project's own dir).
  const here = mostRecentJsonlIn(CLAUDE_PROJECTS_DIR);
  if (here) {
    const cwd = readTranscriptCwd(here.path);
    if (cwd === null || cwd === target) return here.path;
  }

  // (b) Authoritative match: scan all project dirs for the most-recent transcript whose
  //     recorded cwd IS this project. Runs for both automatic and manual, so automatic
  //     saves work even when the transcript was filed under a parent-workspace dir.
  const byCwd = findMostRecentJsonlForProject(PROJECT_ROOT);
  if (byCwd) return byCwd;

  // (c) Manual-only last resort: nothing matched by cwd (e.g. only old cwd-less
  //     transcripts exist). Grab the globally-newest transcript so a hand-run still saves
  //     SOMETHING — but warn that the match is unverified and could be another project.
  //     Automatic runs never reach here, so they can never grab the wrong project.
  if (!MANUAL) return null;
  const base = PROJECTS_BASE;
  if (!fs.existsSync(base)) return null;
  let best = null;
  for (const entry of fs.readdirSync(base)) {
    const candidate = mostRecentJsonlIn(path.join(base, entry));
    if (candidate && (!best || candidate.mtime > best.mtime)) best = candidate;
  }
  if (best) {
    console.error(
      '[session-start] WARNING: no transcript matched this project by cwd; ' +
      'falling back to the globally-newest transcript (--manual). This may belong to ' +
      'a different project — verify the saved note.'
    );
    return best.path;
  }
  return null;
}

// Read the `cwd` recorded in a transcript. This is the authoritative signal for
// which project a transcript belongs to — far more reliable than reconstructing a
// dir name from the path (Claude may file a transcript under a parent-workspace
// dir, or a case-insensitive path collision can shift it). `cwd` is NOT on the
// first line (that's a {mode,sessionId,type} summary record) — it appears on the
// message lines, so scan the first several lines for the first one carrying it.
// Returns null for old-format transcripts that never record cwd.
function readTranscriptCwd(jsonlPath) {
  try {
    const fd = fs.openSync(jsonlPath, 'r');
    // Read a generous head chunk — enough to cover the first handful of message
    // lines without slurping a multi-MB transcript.
    const buf = Buffer.alloc(64 * 1024);
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const head = buf.toString('utf8', 0, bytes);
    const lines = head.split('\n');
    // Drop the last (possibly truncated) line so we never JSON.parse a partial.
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.cwd) return path.resolve(obj.cwd);
      } catch {}
    }
    return null;
  } catch {
    return null;
  }
}

// Most-recent transcript across ALL project dirs whose recorded `cwd` matches
// the given project root. Independent of how the transcript dir was named, so it
// works even when the session was launched from a parent workspace dir.
function findMostRecentJsonlForProject(projectRoot) {
  const base = PROJECTS_BASE;
  if (!fs.existsSync(base)) return null;
  const target = path.resolve(projectRoot);
  let best = null;
  for (const entry of fs.readdirSync(base)) {
    const dir = path.join(base, entry);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const full = path.join(dir, f);
      if (readTranscriptCwd(full) !== target) continue;
      const mtime = fs.statSync(full).mtime;
      if (!best || mtime > best.mtime) best = { path: full, mtime };
    }
  }
  return best ? best.path : null;
}

function getSessionId(jsonlPath) {
  return path.basename(jsonlPath, '.jsonl');
}

function isAlreadySummarised(sessionId) {
  if (!fs.existsSync(INDEX_FILE)) return false;
  // The index stores the 8-char prefix, so check for that (the full id never matched,
  // which is why sessions were getting duplicate rows on each hook fire).
  return fs.readFileSync(INDEX_FILE, 'utf8').includes(`session: ${sessionId.slice(0, 8)}`);
}

function extractTranscript(jsonlPath) {
  const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n');
  const messages = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'user' && obj.message?.content) {
        const text = Array.isArray(obj.message.content)
          ? obj.message.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ')
          : obj.message.content;
        if (text.trim()) messages.push(`USER: ${text.trim().slice(0, 500)}`);
      } else if (obj.type === 'assistant' && obj.message?.content) {
        const text = Array.isArray(obj.message.content)
          ? obj.message.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ')
          : '';
        if (text.trim()) messages.push(`ASSISTANT: ${text.trim().slice(0, 500)}`);
      }
    } catch {}
  }
  // Sample the START and END of the session (not just the first N) so the
  // summary reflects where the session ended up, not only where it began —
  // long sessions previously dropped the entire back half (incl. the final
  // outcome). Short sessions (<= HEAD+TAIL) are kept whole.
  const HEAD = 40;
  const TAIL = 60;
  const selected =
    messages.length <= HEAD + TAIL
      ? messages
      : [
          ...messages.slice(0, HEAD),
          '... [middle of session omitted] ...',
          ...messages.slice(-TAIL),
        ];
  return selected.join('\n');
}

function getCurrentBranch() {
  try {
    return execSync('git branch --show-current', { cwd: PROJECT_ROOT, stdio: 'pipe' })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function getChangedFiles() {
  try {
    return execSync('git diff --name-only HEAD~1 HEAD 2>/dev/null | wc -l', {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
    })
      .toString()
      .trim();
  } catch {
    return '?';
  }
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

function summarise(transcript, branch, sessionId) {
  const prompt = `You are summarising a Claude Code session for a developer's session log.

Branch: ${branch}
Session ID: ${sessionId}

Transcript (truncated — samples the START and END of the session; a
"[middle of session omitted]" marker may separate them):
${transcript}

The END of the transcript reflects the FINAL state of the session. When the
start and end disagree (e.g. work that was planned early then completed, pushed,
or renamed later), PREFER THE END for whatWasDone, filesChanged and pendingTasks
so the summary captures where the session actually ended up.

Produce a JSON object with exactly these fields:
{
  "title": "short human-readable title of what was done in this session (max 10 words)",
  "slug": "kebab-case version of the title for the filename (max 80 chars)",
  "summary": "one sentence summary for INDEX.md (max 120 chars)",
  "keyChanges": "3-6 short highlight phrases (the headline changes), separated by '; ' — for the INDEX table. Keep each phrase under 6 words.",
  "whatWasDone": "bullet list of key work done",
  "filesChanged": "bullet list of important files touched",
  "keyDecisions": "bullet list of key decisions or patterns established",
  "backendNotes": "any handoff notes for backend team or 'None'",
  "pendingTasks": "bullet list of pending tasks or 'None'",
  "errorsFixed": "bullet list of errors hit and how fixed, or 'None'"
}

Return ONLY valid JSON. No markdown, no explanation.`;

  const text = runClaudePrompt(prompt, { model: 'claude-haiku-4-5-20251001' });
  if (!text) return null;

  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // The model may decline or answer in prose (e.g. transcripts containing
    // credentials). Salvage an embedded JSON object if there is one, otherwise
    // skip this summarisation cleanly rather than throwing.
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try { return JSON.parse(cleaned.slice(first, last + 1)); } catch (_) {}
    }
    console.error('[session-start] summariser did not return JSON; skipping. First 120 chars: ' + cleaned.slice(0, 120));
    return null;
  }
}

function writeSessionFile(date, data, sessionId) {
  const filename = `${date}_${data.slug}.md`;
  const filepath = path.join(SESSIONS_DIR, filename);
  const content = `# Session: ${data.title}

**Date:** ${date}
**Branch:** ${data.branch || 'unknown'}
**Session ID:** ${sessionId}

## What Was Done
${data.whatWasDone}

## Files Changed
${data.filesChanged}

## Key Decisions & Patterns
${data.keyDecisions}

## Backend / Handoff Notes
${data.backendNotes}

## Pending Tasks
${data.pendingTasks}

## Errors Hit & Fixes
${data.errorsFixed}
`;
  fs.writeFileSync(filepath, content);
  return filename;
}

// Make a string safe for a single Markdown table cell (no pipes/newlines).
function cell(value) {
  return String(value || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

function appendToIndex(date, data, filename, fileCount, sessionId) {
  const shortId = sessionId.slice(0, 8);
  const link = `[${shortId}](${filename})`;
  const keyChanges = cell(data.keyChanges || data.summary);
  const summary = `${cell(data.summary)} (session: ${shortId})`;
  const row = `| ${date} | ${link} | ${summary} | ${keyChanges} | ${data.branch || 'unknown'} |`;

  // One row per session: replace an existing row for this session id, else append.
  let content = fs.readFileSync(INDEX_FILE, 'utf8');
  const lines = content.split('\n');
  const idx = lines.findIndex((l) => l.includes(`session: ${shortId}`) || l.includes(`(${filename})`));
  if (idx !== -1) {
    lines[idx] = row;
    fs.writeFileSync(INDEX_FILE, lines.join('\n'));
  } else {
    if (!content.endsWith('\n')) content += '\n';
    fs.writeFileSync(INDEX_FILE, content + row + '\n');
  }
}

// --- Effort routing self-improvement ---

function readRecentEffortLog(since) {
  const logFile = path.join(process.env.HOME, '.claude', 'effort-log.jsonl');
  if (!fs.existsSync(logFile)) return [];
  return fs
    .readFileSync(logFile, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(e => e && e.ts >= since);
}

function analyseEffortLog(entries) {
  if (!entries.length) return null;
  const sample = entries.slice(-30);
  const prompt = `You are reviewing effort-level routing decisions made during a Claude Code session.

Each entry has: prompt (first 120 chars), effort chosen (low/medium/high/max), matched pattern (or null if default).

Entries:
${JSON.stringify(sample, null, 2)}

Rules for miscalibration signals:
- "low" on a prompt that contains reasoning words (why, how, debug, trace, fix) may be underpowered
- "high" or "max" on a simple lookup prompt may be overpowered
- "medium" default on a prompt that clearly matches a lookup pattern may be underpowered

If you see clear mismatches, suggest ONLY the specific pattern additions or removals needed in effort-rules.json.
Be conservative — only flag clear cases. If everything looks fine, say "No changes needed."

Reply in plain text, max 5 bullet points. No code blocks.`;

  return runClaudePrompt(prompt, { model: 'claude-haiku-4-5-20251001' });
}

function appendEffortSuggestions(sessionFile, suggestions) {
  if (!fs.existsSync(sessionFile)) return;
  fs.appendFileSync(
    sessionFile,
    `\n## Effort Routing Suggestions\n\n${suggestions}\n`
  );
}

async function main() {
  try {
    ensureSessionsDir();

    const jsonlPath = getMostRecentJsonl();
    if (!jsonlPath) {
      console.log(
        MANUAL
          ? '[session-start] No transcript found in any project dir — nothing to save'
          : '[session-start] No previous session found — skipping (run with --manual to force-save the most recent transcript)'
      );
      return;
    }

    const sessionId = getSessionId(jsonlPath);
    if (isAlreadySummarised(sessionId)) {
      console.log('[session-start] Session already summarised — skipping');
      return;
    }

    const transcript = extractTranscript(jsonlPath);
    if (!transcript) {
      console.log('[session-start] Empty transcript — skipping');
      return;
    }

    const branch = getCurrentBranch();
    const fileCount = getChangedFiles();
    const date = todayDate();

    const data = summarise(transcript, branch, sessionId);
    if (!data) return;

    data.branch = branch;

    const filename = writeSessionFile(date, data, sessionId);
    appendToIndex(date, data, filename, fileCount, sessionId);

    console.log(`[session-start] Session saved: .sessions/${filename}`);

    // Analyse effort routing decisions from this session
    const sessionStartTime = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(); // last 4h
    const effortEntries = readRecentEffortLog(sessionStartTime);
    if (effortEntries.length > 0) {
      const suggestions = analyseEffortLog(effortEntries);
      if (suggestions && suggestions !== 'No changes needed.') {
        const sessionFilePath = path.join(SESSIONS_DIR, filename);
        appendEffortSuggestions(sessionFilePath, suggestions);
        console.log('[session-start] Effort routing suggestions appended to session file');
      }
    }
  } catch (err) {
    console.error('[session-start] Error:', err.message);
  }
}

main();
