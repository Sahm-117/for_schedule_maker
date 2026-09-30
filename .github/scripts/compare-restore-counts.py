"""Checks that the restored copy holds exactly what the backup file holds.

Usage: compare-restore-counts.py expected.tsv restored.tsv live.tsv   (each line: table<TAB>count)

- expected: rows per app table counted in the backup file itself.
- restored: rows per table in the throwaway database after the restore.
- live: rows per table in the live database right now (information only: the live
  database keeps changing after the backup, so it is never a pass or fail test).

FAILS if any table in the restore has a different number of rows from the backup file, or
the restore has a table the backup has no data for but rows appeared in it. Writes a
table to the job summary and exits 1 on failure.
"""
import os
import sys


def read(path):
    rows = {}
    with open(path) as f:
        for line in f:
            line = line.rstrip("\n")
            if line:
                name, count = line.split("\t")
                rows[name] = int(count)
    return rows


expected, restored, live = read(sys.argv[1]), read(sys.argv[2]), read(sys.argv[3])
failures, lines = [], []
for table in sorted(set(expected) | set(restored)):
    want, got, now = expected.get(table, 0), restored.get(table), live.get(table)
    if got is None:
        status = "MISSING FROM RESTORE"
    elif got != want:
        status = f"MISMATCH (backup file has {want})"
    else:
        status = "ok"
    if status != "ok":
        failures.append(f"{table}: backup file {want}, restored {got} ({status})")
    if now is None:
        note = "new table? not live"
    elif now == want:
        note = "same as live"
    elif now > want:
        note = f"live has {now - want} more since the backup"
    else:
        note = f"live has {want - now} fewer since the backup"
    lines.append(f"| {table} | {want} | {'-' if got is None else got} | {status} | {note} |")

only_live = sorted(set(live) - set(expected) - set(restored))
summary = [
    "## Backup restore check",
    "",
    f"{len(expected)} app tables, {sum(expected.values())} rows in the backup file, {sum(restored.get(t, 0) for t in expected)} restored.",
    "**FAILED**" if failures else "**Every table restored exactly as the backup file has it.**",
    "",
    *([f"Tables live now that the backup has no data for (created after it, or empty): {', '.join(only_live)}", ""] if only_live else []),
    "| Table | In backup | Restored | Result | Compared with live now |",
    "|---|---|---|---|---|",
    *lines,
]
text = "\n".join(summary)
print(text)
path = os.environ.get("GITHUB_STEP_SUMMARY")
if path:
    with open(path, "a") as f:
        f.write(text + "\n")
if failures:
    print("\nFAILURES:\n" + "\n".join(failures), file=sys.stderr)
    sys.exit(1)
