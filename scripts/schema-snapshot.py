#!/usr/bin/env python3
"""
Write a fresh snapshot of the live FOF database schema (structure only, never people's data):

  docs/schema/schema.sql   every enum, table (columns, keys, checks), index, row-level-security policy, trigger,
                           view, function and scheduled job in the `public` and `analytics` schemas, as SQL
  docs/schema/SCHEMA.md    a readable reference: tables grouped by area, their columns and links, and the functions
                           the app may call

It reads the database's own catalogue through the Supabase Management API (HTTPS), so it works where the database
port is closed. Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF in the environment, or in the git-ignored
.env.local at the repo root.

    python3 scripts/schema-snapshot.py            # writes both files
    python3 scripts/schema-snapshot.py --check    # exits 1 if the committed files are out of date

Where the database port is reachable, `pg_dump --schema-only --schema=public --schema=analytics` gives an exact dump
too; this script's output is rebuilt from the catalogue (pg_get_*def), which is what pg_dump uses for most objects.
To rebuild a working database, restoring a nightly backup (BACKUP_RESTORE.md) is still the dependable route.
"""
import json
import os
import re
import ssl
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'docs', 'schema')
SCHEMAS = ('public', 'analytics')


def load_env():
    path = os.path.join(ROOT, '.env.local')
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            m = re.match(r'^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$', line)
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip().strip('"').strip("'")


def sql(query):
    ref = os.environ['SUPABASE_PROJECT_REF']
    token = os.environ['SUPABASE_ACCESS_TOKEN']
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{ref}/database/query?read_only=true',
        data=json.dumps({'query': query}).encode(),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json', 'User-Agent': 'fof-schema-snapshot'},
        method='POST')
    cafile = os.environ.get('SSL_CERT_FILE') or os.environ.get('REQUESTS_CA_BUNDLE')
    ctx = ssl.create_default_context(cafile=cafile) if cafile else ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=180) as res:
        data = json.loads(res.read())
    if isinstance(data, dict) and 'message' in data:
        raise SystemExit(f'query failed: {data["message"]}')
    return data


NS = "n.nspname IN ('public','analytics')"
# Objects that belong to an extension (pgcrypto, pg_net, ...) are not FOF's: leave them out.
NOT_EXT = "NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = {oid} AND d.deptype = 'e')"


def fetch():
    q = {}
    q['enums'] = sql(f"""
      SELECT n.nspname s, t.typname name, to_jsonb(array_agg(e.enumlabel ORDER BY e.enumsortorder)) labels
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE {NS} GROUP BY 1, 2 ORDER BY 1, 2""")
    q['tables'] = sql(f"""
      SELECT n.nspname s, c.relname name, c.relrowsecurity rls, c.reltuples::bigint approx_rows,
             obj_description(c.oid, 'pg_class') comment
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE {NS} AND c.relkind IN ('r','p') AND {NOT_EXT.format(oid='c.oid')} ORDER BY 1, 2""")
    q['columns'] = sql(f"""
      SELECT n.nspname s, c.relname tbl, a.attnum num, a.attname col, format_type(a.atttypid, a.atttypmod) typ,
             a.attnotnull AS not_null, pg_get_expr(ad.adbin, ad.adrelid) dflt, a.attidentity ident, a.attgenerated gen,
             col_description(c.oid, a.attnum) comment
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      WHERE {NS} AND c.relkind IN ('r','p') AND a.attnum > 0 AND NOT a.attisdropped ORDER BY 1, 2, 3""")
    q['constraints'] = sql(f"""
      SELECT n.nspname s, c.relname tbl, k.conname name, k.contype typ, pg_get_constraintdef(k.oid) def,
             fn.nspname fs, f.relname ftbl
      FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_class f ON f.oid = k.confrelid LEFT JOIN pg_namespace fn ON fn.oid = f.relnamespace
      WHERE {NS} ORDER BY 1, 2, CASE k.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'f' THEN 2 ELSE 3 END, 3""")
    q['indexes'] = sql(f"""
      SELECT n.nspname s, c.relname tbl, i.relname name, pg_get_indexdef(x.indexrelid) def
      FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_class c ON c.oid = x.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE {NS} AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = x.indexrelid)
      ORDER BY 1, 2, 3""")
    q['policies'] = sql("""
      SELECT schemaname s, tablename tbl, policyname name, permissive, to_jsonb(roles) roles, cmd, qual, with_check
      FROM pg_policies WHERE schemaname IN ('public','analytics') ORDER BY 1, 2, 3""")
    q['triggers'] = sql(f"""
      SELECT n.nspname s, c.relname tbl, t.tgname name, pg_get_triggerdef(t.oid) def
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE {NS} AND NOT t.tgisinternal ORDER BY 1, 2, 3""")
    q['views'] = sql(f"""
      SELECT n.nspname s, c.relname name, c.relkind kind, pg_get_viewdef(c.oid, true) def
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE {NS} AND c.relkind IN ('v','m') AND {NOT_EXT.format(oid='c.oid')} ORDER BY 1, 2""")
    q['sequences'] = sql(f"""
      SELECT n.nspname s, c.relname name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE {NS} AND c.relkind = 'S'
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype IN ('a','i','e'))
      ORDER BY 1, 2""")
    q['functions'] = sql(f"""
      SELECT n.nspname s, p.proname name, pg_get_function_identity_arguments(p.oid) args,
             pg_get_function_result(p.oid) result, p.prosecdef secdef, l.lanname lang,
             has_function_privilege('anon', p.oid, 'EXECUTE') app_callable,
             obj_description(p.oid, 'pg_proc') comment, pg_get_functiondef(p.oid) def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
      WHERE {NS} AND p.prokind IN ('f','p') AND {NOT_EXT.format(oid='p.oid')} ORDER BY 1, 2, 3""")
    q['cron'] = sql("SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname")
    q['extensions'] = sql("SELECT extname, extversion FROM pg_extension ORDER BY 1")
    q['buckets'] = sql("SELECT id, public FROM storage.buckets ORDER BY id")
    return q


def qi(name):
    return name if re.fullmatch(r'[a-z_][a-z0-9_]*', name) else '"' + name.replace('"', '""') + '"'


def fq(s, name):
    return f'{qi(s)}.{qi(name)}'


def build_sql(q, stamp):
    out = [
        '-- FOF Ops database schema: structure only, no data.',
        f'-- Generated {stamp} from the live database catalogue by scripts/schema-snapshot.py. Do not edit by hand;',
        '-- change the database with a migration in supabase/migrations/, then run the script again.',
        '-- Covers the public and analytics schemas. Supabase-managed schemas (auth, storage, realtime, vault, cron, net)',
        '-- come with every Supabase project and are not repeated here.',
        '',
        '-- Extensions: ' + ', '.join(f"{e['extname']} {e['extversion']}" for e in q['extensions']),
        '-- Storage buckets: ' + ', '.join(f"{b['id']} ({'public' if b['public'] else 'private'})" for b in q['buckets']),
        '',
        'CREATE SCHEMA IF NOT EXISTS analytics;',
        '',
        '-- Types ' + '-' * 100,
    ]
    for e in q['enums']:
        labels = ', '.join("'" + l.replace("'", "''") + "'" for l in e['labels'])
        out.append(f"CREATE TYPE {fq(e['s'], e['name'])} AS ENUM ({labels});")
    out += ['', '-- Sequences ' + '-' * 96]
    out += [f"CREATE SEQUENCE {fq(s['s'], s['name'])};" for s in q['sequences']]

    cols = defaultdict(list)
    for c in q['columns']:
        cols[(c['s'], c['tbl'])].append(c)
    cons = defaultdict(list)
    for c in q['constraints']:
        cons[(c['s'], c['tbl'])].append(c)

    out += ['', '-- Tables ' + '-' * 99]
    fks = []
    for t in q['tables']:
        key = (t['s'], t['name'])
        lines = []
        for c in cols[key]:
            line = f"  {qi(c['col'])} {c['typ']}"
            if c['ident'] in ('a', 'd'):
                line += f" GENERATED {'ALWAYS' if c['ident'] == 'a' else 'BY DEFAULT'} AS IDENTITY"
            elif c['gen'] == 's' and c['dflt']:
                line += f" GENERATED ALWAYS AS ({c['dflt']}) STORED"
            elif c['dflt'] is not None:
                line += f" DEFAULT {c['dflt']}"
            if c['not_null']:
                line += ' NOT NULL'
            lines.append(line)
        for k in cons[key]:
            if k['typ'] == 'f':
                fks.append(f"ALTER TABLE {fq(*key)} ADD CONSTRAINT {qi(k['name'])} {k['def']};")
            else:
                lines.append(f"  CONSTRAINT {qi(k['name'])} {k['def']}")
        out.append(f"CREATE TABLE {fq(*key)} (\n" + ',\n'.join(lines) + '\n);')
        if t['comment']:
            out.append(f"COMMENT ON TABLE {fq(*key)} IS '{t['comment'].replace(chr(39), chr(39) * 2)}';")
        if t['rls']:
            out.append(f'ALTER TABLE {fq(*key)} ENABLE ROW LEVEL SECURITY;')
        out.append('')
    out += ['-- Foreign keys ' + '-' * 93] + fks
    out += ['', '-- Indexes ' + '-' * 98] + [i['def'] + ';' for i in q['indexes']]

    out += ['', '-- Views ' + '-' * 100]
    for v in q['views']:
        kind = 'MATERIALIZED VIEW' if v['kind'] == 'm' else 'VIEW'
        out.append(f"CREATE {kind} {fq(v['s'], v['name'])} AS\n{v['def'].rstrip().rstrip(';')};\n")

    out += ['-- Functions ' + '-' * 96]
    for f in q['functions']:
        out.append(f['def'].rstrip() + ';\n')

    out += ['-- Row-level-security policies ' + '-' * 78]
    for p in q['policies']:
        roles = p['roles'] if isinstance(p['roles'], list) else str(p['roles']).strip('{}').split(',')
        line = (f"CREATE POLICY {qi(p['name'])} ON {fq(p['s'], p['tbl'])} AS {p['permissive']} FOR {p['cmd']}"
                f" TO {', '.join(roles)}")
        if p['qual']:
            line += f" USING ({p['qual']})"
        if p['with_check']:
            line += f" WITH CHECK ({p['with_check']})"
        out.append(line + ';')

    out += ['', '-- Triggers ' + '-' * 97] + [t['def'] + ';' for t in q['triggers']]

    out += ['', '-- Scheduled jobs (pg_cron) ' + '-' * 81]
    for j in q['cron']:
        cmd = j['command'].replace('$cron$', '')
        out.append(f"SELECT cron.schedule('{j['jobname']}', '{j['schedule']}', $cron${cmd}$cron$);"
                   + ('' if j['active'] else '  -- inactive'))
    return '\n'.join(out) + '\n'


AREAS = [
    ('Accounts, roles and sessions', r'^(User|AppSession|Role|Permission|SignIn|UserCohort|StaffLabel|Label$|UserLabel|LoginReminder)'),
    ('Public API (other church apps)', r'^Api'),
    ('Practice mode', r'^Practice'),
    ('Corporate prayers', r'^(CorporatePrayer|PrayerMilestone)'),
    ('Faith projects and testimonies', r'^(FaithProject|FaithHelp|FaithThread|Testimon)'),
    ('Sign-ups and follow-ups', r'^(FollowUp|SheetRegistration|Lead|Mobilis|Registration|ParticipantHandover)'),
    ('Attendance', r'^(Attendance|Absence|ClassSignal|CheckIn)'),
    ('Groups and group meetings', r'^(Group|MeetingAttendance|MeetingRecording|Discussion|Team$)'),
    ('Supports and hubs', r'^(SupportHub|Hub|SupportSession|Support|Training|CoverRequest|DepartmentReferral|ManualNote|ManualQuestion)'),
    ('Participants', r'^(Participant|Reflection|Profile|Teen|Household|EscalationNotice)'),
    ('Programme: cohorts, weeks, planner', r'^(Cohort|Week|Planner|PublicHoliday|ChurchEvent|Class)'),
    ('Schedule, tasks and approvals', r'^(Activity|Day|Schedule|PendingChange|RejectedChange|Approval|Rota|Checklist|Task|Duty)'),
    ('Notifications and announcements', r'^(Notification|notification_settings|Push|push_subscriptions|Telegram|Announcement|Reminder|Email|Digest|MessageTemplate|AppNudge)'),
    ('Surveys and feedback', r'^(Survey|Feedback|ClassFeedback|Weekly)'),
    ('Content: scriptures, resources, website, birthdays', r'^(Scripture|Inspiration|Resource|Website|Birthday|Document|Recap)'),
    ('Settings', r'^(App)?Setting'),
    ('App onboarding and tours', r'^(OnboardingEvent|TourProgress)'),
]


def area_of(name):
    for title, rx in AREAS:
        if re.search(rx, name):
            return title
    return 'Other'


def short_default(d):
    if d is None:
        return ''
    d = re.sub(r'::[a-z_ "A-Z]+(\[\])?', '', d)
    return d if len(d) <= 40 else d[:37] + '...'


def md_cell(text):
    return (text or '').replace('|', '\\|').replace('\n', ' ')


def build_md(q, stamp):
    cols = defaultdict(list)
    for c in q['columns']:
        cols[(c['s'], c['tbl'])].append(c)
    links = defaultdict(list)   # table -> [(column(s), target)]
    linked_from = defaultdict(set)
    for k in q['constraints']:
        if k['typ'] == 'f':
            m = re.match(r'FOREIGN KEY \(([^)]*)\) REFERENCES ([^(]+)\(([^)]*)\)', k['def'])
            if m:
                links[(k['s'], k['tbl'])].append((m.group(1).replace('"', ''), f"{k['ftbl']}.{m.group(3).replace(chr(34), '')}"))
                linked_from[(k['fs'], k['ftbl'])].add(k['tbl'])
    pk = {}
    for k in q['constraints']:
        if k['typ'] == 'p':
            pk[(k['s'], k['tbl'])] = re.sub(r'^PRIMARY KEY \((.*)\)$', r'\1', k['def']).replace('"', '')
    trig = defaultdict(list)
    for t in q['triggers']:
        trig[(t['s'], t['tbl'])].append(t['name'])
    pol = defaultdict(int)
    for p in q['policies']:
        pol[(p['s'], p['tbl'])] += 1

    tables = q['tables']
    callable_fns = [f for f in q['functions'] if f['app_callable'] and f['s'] == 'public']
    internal_fns = [f for f in q['functions'] if not f['app_callable']]
    by_area = defaultdict(list)
    for t in tables:
        by_area['Analytics views and tables' if t['s'] == 'analytics' else area_of(t['name'])].append(t)

    o = [
        '# FOF Ops database schema',
        '',
        f'Generated {stamp} from the live database by `scripts/schema-snapshot.py`. Do not edit by hand: change the',
        'database with a migration in `supabase/migrations/`, then run `python3 scripts/schema-snapshot.py`.',
        'The exact SQL is in [`schema.sql`](schema.sql). Business rules are in [`FLOW_MAP.md`](../../FLOW_MAP.md) section 4.',
        '',
        '## At a glance',
        '',
        '| Item | Count |',
        '| --- | --- |',
        f"| Tables | {len(tables)} ({sum(1 for t in tables if t['rls'])} with row-level security on) |",
        f"| Views | {len(q['views'])} |",
        f"| Functions | {len(q['functions'])} ({len(callable_fns)} the app may call, {len(internal_fns)} internal) |",
        f"| Triggers | {len(q['triggers'])} |",
        f"| Row-level-security policies | {len(q['policies'])} |",
        f"| Enum types | {len(q['enums'])} |",
        f"| Scheduled jobs | {len(q['cron'])} |",
        '',
        '**How access works.** The app signs people in itself (an `AppSession` token sent as the `x-session-token`',
        'header) and talks to the database as the `anon` role. Tables are locked by row-level security; the app reads',
        'and writes through `SECURITY DEFINER` functions that check the session first. Other church apps never touch',
        'tables: they go through the `public-api` edge function (FLOW_MAP rule 118).',
        '',
        '**Extensions:** ' + ', '.join(e['extname'] for e in q['extensions']) + '.',
        '**Storage buckets:** ' + ', '.join(f"`{b['id']}` ({'public' if b['public'] else 'private'})" for b in q['buckets']) + '.',
        '',
        '## Scheduled jobs',
        '',
        '| Job | Schedule (UTC) | Runs |',
        '| --- | --- | --- |',
    ]
    for j in q['cron']:
        o.append(f"| `{j['jobname']}` | `{j['schedule']}` | `{md_cell(j['command'].strip())}` |")
    o += ['', '## Tables by area', '']
    order = [a for a, _ in AREAS] + ['Analytics views and tables', 'Other']
    o.append(' · '.join(f"[{a}](#{re.sub(r'[^a-z0-9 -]', '', a.lower()).replace(' ', '-')}) ({len(by_area[a])})"
                        for a in order if by_area[a]))
    for a in order:
        if not by_area[a]:
            continue
        o += ['', f'### {a}', '']
        for t in by_area[a]:
            key = (t['s'], t['name'])
            name = t['name'] if t['s'] == 'public' else f"{t['s']}.{t['name']}"
            facts = [f"about {max(t['approx_rows'], 0):,} rows" if t['approx_rows'] >= 0 else 'not analysed yet',
                     'row-level security on' if t['rls'] else '**row-level security OFF**',
                     f"{pol[key]} {'policy' if pol[key] == 1 else 'policies'}"]
            if trig[key]:
                facts.append('triggers: ' + ', '.join(f'`{x}`' for x in trig[key]))
            o.append(f'#### `{name}`')
            o.append('')
            if t['comment']:
                o += [md_cell(t['comment']), '']
            o.append(' · '.join(facts) + (f" · key: `{pk[key]}`" if key in pk else ''))
            o += ['', '| Column | Type | Null | Default | Links to |', '| --- | --- | --- | --- | --- |']
            lk = {}
            for colset, target in links[key]:
                for c in colset.split(', '):
                    lk[c] = target
            for c in cols[key]:
                o.append(f"| `{c['col']}` | {md_cell(c['typ'])} | {'' if c['not_null'] else 'yes'} | "
                         f"{md_cell(short_default(c['dflt']))} | {('`' + lk[c['col']] + '`') if c['col'] in lk else ''} |")
            if linked_from.get(key):
                o += ['', 'Referenced by: ' + ', '.join(f'`{x}`' for x in sorted(linked_from[key]))]
            o.append('')

    if q['views']:
        o += ['## Views', '', '| View | Kind |', '| --- | --- |']
        for v in q['views']:
            o.append(f"| `{v['s']}.{v['name']}` | {'materialized view' if v['kind'] == 'm' else 'view'} |")
        o.append('')

    o += ['## Functions the app may call', '',
          'Callable with the public (anon) key; each checks the caller itself (a session token, or an admin session).',
          'Full definitions are in `schema.sql`.', '', '| Function | Arguments | Returns |', '| --- | --- | --- |']
    for f in callable_fns:
        o.append(f"| `{f['name']}` | {md_cell(f['args'])} | {md_cell(f['result'])} |")
    o += ['', f'## Internal functions ({len(internal_fns)})', '',
          'Helpers, trigger functions and jobs the public key cannot call: ' +
          ', '.join(f"`{f['name']}`" for f in internal_fns) + '.', '']
    o += ['## Enum types', '', '| Type | Values |', '| --- | --- |']
    for e in q['enums']:
        o.append(f"| `{e['name']}` | {', '.join(e['labels'])} |")
    return '\n'.join(o) + '\n'


def main():
    load_env()
    for name in ('SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF'):
        if not os.environ.get(name):
            raise SystemExit(f'{name} is not set (environment or .env.local).')
    q = fetch()
    stamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    files = {'schema.sql': build_sql(q, stamp), 'SCHEMA.md': build_md(q, stamp)}
    if '--check' in sys.argv:
        stale = []
        for name, text in files.items():
            path = os.path.join(OUT_DIR, name)
            old = open(path, encoding='utf-8').read() if os.path.exists(path) else ''
            strip = lambda s: re.sub(r'Generated \d{4}-\d\d-\d\d \d\d:\d\d UTC', '', s)
            if strip(old) != strip(text):
                stale.append(name)
        if stale:
            print('Out of date: ' + ', '.join(stale) + '. Run python3 scripts/schema-snapshot.py')
            sys.exit(1)
        print('docs/schema is up to date.')
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, text in files.items():
        with open(os.path.join(OUT_DIR, name), 'w', encoding='utf-8') as fh:
            fh.write(text)
    others = [t['name'] for t in q['tables'] if t['s'] == 'public' and area_of(t['name']) == 'Other']
    print(f"Wrote docs/schema/schema.sql and docs/schema/SCHEMA.md: {len(q['tables'])} tables, "
          f"{len(q['functions'])} functions, {len(q['policies'])} policies, {len(q['triggers'])} triggers.")
    if others:
        print('Tables filed under "Other" (add them to AREAS):', ', '.join(others))


if __name__ == '__main__':
    main()
