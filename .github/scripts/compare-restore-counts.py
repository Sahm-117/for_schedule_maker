"""Compares row counts of the live database with the restored backup.

Usage: compare-restore-counts.py live.tsv restored.tsv   (each line: table<TAB>count)

The backup is taken a little before the check, so the live database can be slightly
ahead. A table fails if it is missing from the restore, empty in the restore while the
live one has rows, or has lost more than 10% of a live table of 20 or more rows.
Writes a table to the job summary and exits 1 if anything failed.
"""
import os
import sys


def read(path):
    rows = {}
    with open(path) as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            name, count = line.split("\t")
            rows[name] = int(count)
    return rows


live, restored = read(sys.argv[1]), read(sys.argv[2])
failures, lines = [], []
for table in sorted(live):
    want = live[table]
    got = restored.get(table)
    if got is None:
        status = "MISSING"
    elif want > 0 and got == 0:
        status = "EMPTY"
    elif want >= 20 and got < want * 0.9:
        status = "SHORT"
    else:
        status = "ok"
    if status != "ok":
        failures.append(f"{table}: live {want}, restored {got} ({status})")
    lines.append(f"| {table} | {want} | {'-' if got is None else got} | {status} |")

total_live, total_restored = sum(live.values()), sum(restored.get(t, 0) for t in live)
summary = [
    "## Backup restore check",
    "",
    f"{len(live)} tables, {total_live} live rows, {total_restored} restored rows.",
    "**FAILED**" if failures else "**All tables restored.**",
    "",
    "| Table | Live | Restored | Result |",
    "|---|---|---|---|",
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
