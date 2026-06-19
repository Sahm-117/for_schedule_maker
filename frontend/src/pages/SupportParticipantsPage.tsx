import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { participantsApi, faithProjectsApi } from '../services/api';
import type { FaithProject, FaithProjectStatus, Participant } from '../types';
import ModalShell from '../components/followups/ModalShell';

const STATUS_OPTIONS: Array<{ value: FaithProjectStatus; label: string; cls: string }> = [
  { value: 'NOT_DRAFTED', label: 'Not Drafted', cls: 'bg-neutral-100 text-neutral-600' },
  { value: 'UNDER_REFINEMENT', label: 'Under Refinement', cls: 'bg-amber-100/80 text-amber-700' },
  { value: 'APPROVED', label: 'Approved', cls: 'bg-emerald-100/80 text-emerald-700' },
];

const statusCls = (s: FaithProjectStatus) => STATUS_OPTIONS.find((o) => o.value === s)?.cls ?? 'bg-neutral-100 text-neutral-600';
const statusLabel = (s: FaithProjectStatus) => STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;

// ── Faith Project inline editor ───────────────────────────────────────────────

interface FaithProjectPanelProps {
  participant: Participant;
  existing: FaithProject | null;
  onSaved: (fp: FaithProject) => void;
  userId?: string;
}

const FaithProjectPanel: React.FC<FaithProjectPanelProps> = ({ participant, existing, onSaved, userId }) => {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<FaithProjectStatus>(existing?.status ?? 'NOT_DRAFTED');
  const [body, setBody] = useState(existing?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setStatus(existing?.status ?? 'NOT_DRAFTED');
    setBody(existing?.body ?? '');
  }, [existing]);

  const handleSave = async () => {
    setSaving(true);
    setErr('');
    try {
      const { project } = await faithProjectsApi.upsertForParticipant(participant.id, {
        body: body.trim() || null,
        status,
        updatedById: userId ?? null,
      });
      onSaved(project);
      setOpen(false);
    } catch (e: any) {
      setErr(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const s: FaithProjectStatus = existing?.status ?? 'NOT_DRAFTED';

  return (
    <>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCls(s)}`}>
          {statusLabel(s)}
        </span>
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary underline">
          Update
        </button>
      </div>

      <ModalShell
        isOpen={open}
        onClose={() => setOpen(false)}
        title={`Faith Project — ${participant.fullName}`}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50 active:scale-95">Cancel</button>
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Status</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition active:scale-95 ${
                    status === opt.value ? opt.cls + ' ring-2 ring-offset-1 ring-primary/40' : 'border border-orange-100 bg-white text-gray-500 hover:bg-orange-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Progress notes…"
            />
          </div>
        </div>
      </ModalShell>
    </>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const SupportParticipantsPage: React.FC = () => {
  const { user } = useAuth();
  const { activeCohort, liveRevision } = useAppData();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [projects, setProjects] = useState<Map<string, FaithProject>>(new Map());
  const [loading, setLoading] = useState(true);

  if (!user || user.role !== 'SUPPORT') return <Navigate to="/support" replace />;

  const load = useCallback(async () => {
    if (!activeCohort || !user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { participants: ps } = await participantsApi.getAll({
        cohortId: activeCohort.id,
        supportId: user.id,
      });
      setParticipants(ps);

      // Load faith projects for these participants
      const fps = await Promise.all(
        ps.map((p) => faithProjectsApi.getByParticipant(p.id).then((r) => r.projects[0] ?? null))
      );
      const map = new Map<string, FaithProject>();
      fps.forEach((fp, i) => { if (fp) map.set(ps[i].id, fp); });
      setProjects(map);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort, user?.id]);

  useEffect(() => { void load(); }, [load, liveRevision]);

  return (
    <div className="page-content">
      <PageHeader
        title="My Participants"
        subtitle={`${participants.length} in your group`}
      />

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : participants.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
          <p className="text-sm text-gray-500">You have no participants assigned yet.</p>
          <p className="mt-1 text-xs text-gray-400">Ask an admin to add you to a group.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {participants.map((p) => {
            const fp = projects.get(p.id) ?? null;
            return (
              <div key={p.id} className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{p.fullName}</p>
                    {p.phone && <p className="text-xs text-gray-400">{p.phone}</p>}
                  </div>
                  {p.groupName && (
                    <span className="rounded-full bg-violet-100/80 px-2.5 py-0.5 text-xs font-semibold text-violet-700">{p.groupName}</span>
                  )}
                </div>

                <div className="mt-3 border-t border-orange-50 pt-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Faith Project</p>
                  <FaithProjectPanel
                    participant={p}
                    existing={fp}
                    userId={user?.id}
                    onSaved={(saved) => setProjects((prev) => new Map(prev).set(p.id, saved))}
                  />
                  {fp?.body && <p className="mt-1.5 text-xs text-gray-500 line-clamp-2">{fp.body}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SupportParticipantsPage;
