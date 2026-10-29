import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import AppOverflowMenu from '../components/AppOverflowMenu';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { apiAccessApi, type ApiClientRow, type ApiRequestRow } from '../services/apiAccess';

// Church app access: keys for other church apps to read FOF through the API (FLOW_MAP rule 118).
// Full admins issue a key per app, choose what it may read, switch it off or back on, and see its requests.
// The key is shown once, when it is made; FOF keeps only a fingerprint of it.

type Scope = { id: string; label: string; hint: string };

const SCOPES: Scope[] = [
  { id: 'people:lookup', label: 'Check if someone is in FOF', hint: 'By phone number or email.' },
  { id: 'people:read', label: 'Participants: profiles and progress', hint: 'Contact details, photo, date of birth, group, attendance.' },
  { id: 'faith:read', label: 'Faith projects', hint: 'What each participant is believing God for.' },
  { id: 'team:read', label: 'The FOF team', hint: 'Supports and admins, their hubs and groups.' },
  { id: 'groups:read', label: 'Groups and hubs', hint: 'Meeting days and times, supports and leads. Never call links.' },
  { id: 'schedule:read', label: 'Class weeks and schedule', hint: 'Class dates, teachers and the weekly programme.' },
  { id: 'planner:read', label: 'Year planner', hint: 'Cohort phases, church events and holidays.' },
  { id: 'content:read', label: 'Scriptures, announcements, resources', hint: 'Only what everyone in the programme sees.' },
  { id: 'birthdays:read', label: 'Birthdays and birthday pictures', hint: 'Upcoming birthdays and the finished graphic.' },
  { id: 'cohorts:read', label: 'Current and next cohort', hint: 'Dates only.' },
];
const TEEN_SCOPE = 'teens:read';
const labelOf = (id: string) => (id === TEEN_SCOPE ? 'Teenagers in full' : SCOPES.find((s) => s.id === id)?.label ?? id);

const when = (iso: string | null) => {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};

const Overlay: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, footer, wide }) => createPortal(
  <div className="fixed inset-0 z-[80] flex items-end bg-black/50 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-gray-500 hover:bg-gray-100">&times;</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>}
    </div>
  </div>,
  document.body,
);

const ScopePicker: React.FC<{ value: string[]; onChange: (next: string[]) => void }> = ({ value, onChange }) => {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((s) => s !== id) : [...value, id]);
  const teen = value.includes(TEEN_SCOPE);
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-gray-900">What this app may read</legend>
      <p className="mt-0.5 text-[13px] text-gray-500">Choose only what it needs. Reflections, personal notes, chat messages and who gave anonymous feedback are never shared.</p>
      <div className="mt-3 grid gap-2">
        {SCOPES.map((s) => (
          <label key={s.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 ${value.includes(s.id) ? 'border-primary bg-primary-50' : 'border-gray-200'}`}>
            <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary" checked={value.includes(s.id)} onChange={() => toggle(s.id)} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900">{s.label}</span>
              <span className="block text-[13px] text-gray-500">{s.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <label className={`mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 ${teen ? 'border-red-300 bg-red-50' : 'border-dashed border-gray-300'}`}>
        <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500" checked={teen} onChange={() => toggle(TEEN_SCOPE)} />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900">Teenagers in full</span>
          <span className="block text-[13px] text-gray-600">
            Without this, a teenager shows as name and cohort only. With it, the app also sees their contact details, photo,
            date of birth, attendance and guardian. Tick it only for an app that has been approved for teens; every teen it views is recorded.
          </span>
        </span>
      </label>
    </fieldset>
  );
};

const AppForm: React.FC<{
  title: string; submitLabel: string; initial?: ApiClientRow; busy: boolean;
  onSubmit: (v: { name: string; notes: string; scopes: string[] }) => void; onClose: () => void;
}> = ({ title, submitLabel, initial, busy, onSubmit, onClose }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [scopes, setScopes] = useState<string[]>(initial?.scopes ?? []);
  const ready = name.trim().length > 0 && scopes.length > 0 && !busy;
  return (
    <Overlay
      title={title}
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="h-11 rounded-2xl px-4 text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
          <button type="button" disabled={!ready} onClick={() => onSubmit({ name: name.trim(), notes: notes.trim(), scopes })}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
            {busy && <Spinner className="h-4 w-4" />}{submitLabel}
          </button>
        </>
      )}
    >
      <div className="grid gap-4">
        <label className="block">
          <span className="text-sm font-semibold text-gray-900">App name</span>
          <input id="api-app-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="For example: Church platform (test)"
            className="mt-1 w-full rounded-2xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:ring-primary" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gray-900">Who asked, and why <span className="font-normal text-gray-400">(optional)</span></span>
          <textarea id="api-app-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} placeholder="For example: Digital team, to show FOF status in the member app"
            className="mt-1 w-full rounded-2xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:ring-primary" />
        </label>
        <ScopePicker value={scopes} onChange={setScopes} />
      </div>
    </Overlay>
  );
};

const KeyReveal: React.FC<{ appName: string; apiKey: string; onClose: () => void }> = ({ appName, apiKey, onClose }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(apiKey); setCopied(true); } catch { /* the key stays selectable below */ }
  };
  return (
    <Overlay title="Copy the key now" onClose={onClose}
      footer={<button type="button" onClick={onClose} className="h-11 rounded-2xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark">I've saved it</button>}>
      <p className="text-sm text-gray-700">This is the key for <span className="font-semibold">{appName}</span>. It is shown only this once: FOF keeps a fingerprint of it, not the key.</p>
      <div className="mt-3 flex items-stretch gap-2">
        <code className="min-w-0 flex-1 select-all break-all rounded-2xl bg-gray-900 px-3.5 py-3 font-mono text-[13px] text-white">{apiKey}</code>
        <button type="button" onClick={() => void copy()} className="flex-none rounded-2xl border border-gray-200 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50">{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-[13px] text-gray-600">
        <li>Send it to the app's developer privately, not in a group chat.</li>
        <li>It belongs on their server, never inside a phone app or web page.</li>
        <li>If it is ever lost or leaked, switch this app off here and make a new key.</li>
      </ul>
    </Overlay>
  );
};

const Activity: React.FC<{ app: ApiClientRow; onClose: () => void }> = ({ app, onClose }) => {
  const [rows, setRows] = useState<ApiRequestRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    apiAccessApi.activity(app.id).then((r) => { if (alive) setRows(r); }).catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [app.id]);
  return (
    <Overlay title={`${app.name}: recent requests`} onClose={onClose} wide>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!rows && !error && <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>}
      {rows && rows.length === 0 && <p className="py-6 text-center text-sm text-gray-500">No requests yet.</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3 font-semibold">When</th><th className="py-2 pr-3 font-semibold">Asked for</th>
                <th className="py-2 pr-3 font-semibold">Result</th><th className="py-2 font-semibold">Teens shown</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.at}-${i}`} className="border-t border-gray-100">
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{new Date(r.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                  <td className="py-2 pr-3 font-mono text-[12.5px] text-gray-800">{r.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '{id}')}</td>
                  <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status < 400 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{r.status === 0 ? '…' : r.status}</span></td>
                  <td className={`py-2 tabular-nums ${r.teenRecords > 0 ? 'font-semibold text-red-700' : 'text-gray-400'}`}>{r.teenRecords}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Overlay>
  );
};

const AdminApiAccessPage: React.FC = () => {
  const { isRealAdmin } = useAuth();
  const toast = useToast();
  const [apps, setApps] = useState<ApiClientRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ApiClientRow | null>(null);
  const [viewing, setViewing] = useState<ApiClientRow | null>(null);
  const [switchingOff, setSwitchingOff] = useState<ApiClientRow | null>(null);
  const [revealed, setRevealed] = useState<{ name: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setApps(await apiAccessApi.list()); setLoadError(''); } catch (e) { setLoadError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!isRealAdmin) return <Navigate to="/settings" replace />;

  const create = async (v: { name: string; notes: string; scopes: string[] }) => {
    setBusy(true);
    try {
      const made = await apiAccessApi.create(v.name, v.scopes, v.notes);
      setCreating(false);
      setRevealed({ name: v.name, key: made.key });
      void load();
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    } finally { setBusy(false); }
  };

  const save = async (app: ApiClientRow, v: { name: string; notes: string; scopes: string[] }) => {
    setBusy(true);
    try {
      await apiAccessApi.update(app.id, { name: v.name, notes: v.notes, scopes: v.scopes });
      setEditing(null);
      toast({ message: 'Access updated' });
      void load();
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    } finally { setBusy(false); }
  };

  const setActive = async (app: ApiClientRow, active: boolean) => {
    setBusy(true);
    try {
      await apiAccessApi.update(app.id, { active });
      setSwitchingOff(null);
      toast({ message: active ? `${app.name} switched back on` : `${app.name} switched off` });
      void load();
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        title="Church app access"
        subtitle="Keys that let other church apps read FOF. Each app sees only what you allow, and you can switch it off at any time."
        action={(
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCreating(true)} className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark">New key</button>
            <AppOverflowMenu align="right" items={[{ label: 'Open the API docs', onClick: () => { window.open('/api-docs.html', '_blank', 'noopener'); } }]} />
          </div>
        )}
      />

      {loadError && <div className="surface-card mb-4 p-4 text-sm text-red-700">{loadError === 'SESSION_EXPIRED' ? 'Please sign in again.' : loadError}</div>}
      {!apps && !loadError && <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>}

      {apps && apps.length === 0 && (
        <div className="surface-card p-8 text-center">
          <p className="text-base font-semibold text-gray-900">No church apps connected yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">When an app's developer is ready, make a key for it and choose what it may read. You'll see the key once to send to them.</p>
          <button type="button" onClick={() => setCreating(true)} className="mt-4 inline-flex h-11 items-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark">Make the first key</button>
        </div>
      )}

      {apps && apps.length > 0 && (
        <div className="grid gap-3">
          {apps.map((app) => (
            <div key={app.id} className={`surface-card p-5 ${app.isActive ? '' : 'opacity-70'}`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-gray-900">{app.name}</h3>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${app.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{app.isActive ? 'On' : 'Switched off'}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-gray-500">
                    Key {app.keyPrefix}… · made {when(app.createdAt)}{app.createdBy ? ` by ${app.createdBy}` : ''} · last used {when(app.lastUsedAt)}
                  </p>
                  {app.notes && <p className="mt-1 text-sm text-gray-700">{app.notes}</p>}
                </div>
                <AppOverflowMenu
                  align="right"
                  items={[
                    { label: 'Recent requests', onClick: () => setViewing(app) },
                    { label: 'Change access', onClick: () => setEditing(app) },
                    app.isActive
                      ? { label: 'Switch off', tone: 'danger' as const, onClick: () => setSwitchingOff(app) }
                      : { label: 'Switch back on', onClick: () => void setActive(app, true) },
                  ]}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {app.scopes.map((s) => (
                  <span key={s} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s === TEEN_SCOPE ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{labelOf(s)}</span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-gray-600">
                <span><span className="font-semibold tabular-nums text-gray-900">{app.requests7d}</span> requests this week</span>
                {app.refused7d > 0 && <span><span className="font-semibold tabular-nums text-red-700">{app.refused7d}</span> refused</span>}
                {app.scopes.includes(TEEN_SCOPE) && <span><span className="font-semibold tabular-nums text-red-700">{app.teenRecords30d}</span> teen records viewed in 30 days</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <AppForm title="New key for a church app" submitLabel="Make key" busy={busy} onSubmit={(v) => void create(v)} onClose={() => setCreating(false)} />}
      {editing && <AppForm title={`Change access: ${editing.name}`} submitLabel="Save" initial={editing} busy={busy} onSubmit={(v) => void save(editing, v)} onClose={() => setEditing(null)} />}
      {revealed && <KeyReveal appName={revealed.name} apiKey={revealed.key} onClose={() => setRevealed(null)} />}
      {viewing && <Activity app={viewing} onClose={() => setViewing(null)} />}
      {switchingOff && createPortal(
        <ConfirmationModal
          isOpen
          title={`Switch off ${switchingOff.name}?`}
          message="Its key stops working straight away. You can switch it back on later; the same key will work again."
          confirmText="Switch off"
          confirmLoading={busy}
          onConfirm={() => void setActive(switchingOff, false)}
          onClose={() => setSwitchingOff(null)}
        />,
        document.body,
      )}
    </div>
  );
};

export default AdminApiAccessPage;
