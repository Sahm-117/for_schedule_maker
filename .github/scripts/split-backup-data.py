"""Splits the backup's data.sql so the restore check can be strict where it matters.

Usage: split-backup-data.py data.sql out_dir

Writes out_dir/public.sql (the app's own tables, restored strictly) and one small file per
Supabase-managed table in out_dir/other/ (auth, storage and so on, restored best effort,
because the throwaway database's copy of those internal tables can be a different version
from the live project's). Every file starts with the same SET lines.
"""
import os
import re
import sys

MANAGED = {
    "auth", "storage", "realtime", "_realtime", "vault", "supabase_functions", "extensions",
    "graphql", "graphql_public", "pgsodium", "net", "cron", "supabase_migrations", "pgbouncer",
    "_analytics", "supabase_vault",
}
COPY_RE = re.compile(r'^COPY\s+"?([A-Za-z0-9_]+)"?\."?([A-Za-z0-9_]+)"?')
TRIGGER_RE = re.compile(r"^ALTER TABLE .* (DISABLE|ENABLE) TRIGGER ALL;\s*$")
SET_RE = re.compile(r"^(SET |SELECT pg_catalog\.set_config)")
SETVAL_RE = re.compile(r"setval\('\"?([A-Za-z0-9_]+)\"?\.\"?([A-Za-z0-9_]+)")

src, out = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(out, "other"), exist_ok=True)
with open(src, encoding="utf-8", errors="surrogateescape", newline="") as f:
    lines = f.read().split("\n")

preamble, public, other = [], [], []
ignored = 0
expected = {}
i = 0
while i < len(lines):
    line = lines[i]
    m = COPY_RE.match(line)
    if m:
        j = i
        while j < len(lines) and lines[j] != "\\.":
            j += 1
        chunk = lines[i:j + 1]
        if m.group(1) in MANAGED:
            other.append((m.group(1), m.group(2), chunk))
        else:
            public.extend(chunk + [""])
            expected[m.group(2)] = expected.get(m.group(2), 0) + max(len(chunk) - 2, 0)
        i = j + 1
        continue
    s = SETVAL_RE.search(line)
    if s:
        (other.append((s.group(1), "seq_" + s.group(2), [line])) if s.group(1) in MANAGED else public.append(line))
    elif TRIGGER_RE.match(line):
        ignored += 1  # the restore disables triggers itself (session_replication_role)
    elif SET_RE.match(line):
        preamble.append(line)
    elif line.strip() and not line.startswith("--"):
        public.append(line)  # anything unexpected stays in order, in the strict part
        print(f"kept in order: {line[:100]}", file=sys.stderr)
    i += 1


def write(path, body):
    with open(path, "w", encoding="utf-8", errors="surrogateescape", newline="") as f:
        f.write("\n".join(preamble + [""] + body) + "\n")


write(os.path.join(out, "public.sql"), public)
with open(os.path.join(out, "expected.tsv"), "w") as f:
    f.writelines(f"{t}\t{n}\n" for t, n in sorted(expected.items()))
for n, (schema, name, chunk) in enumerate(other):
    write(os.path.join(out, "other", f"{n:03d}_{schema}_{name}.sql"), chunk)
print(f"public.sql: {sum(1 for l in public if COPY_RE.match(l))} tables; other: {len(other)} files; preamble lines: {len(preamble)}; trigger toggles ignored: {ignored}")
