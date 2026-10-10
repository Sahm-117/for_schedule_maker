import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useAppData } from '../context/AppDataContext';
import { surveyApi } from '../services/api';
import type { SurveyListItem } from '../types';
import SurveyBuilderModal from '../components/surveys/SurveyBuilderModal';
import { AUDIENCE_LABEL, STATE_LABEL, STATE_TONE, formatDay } from '../components/surveys/surveyUtils';

const CARD = 'surface-card p-4';

const timingNote = (s: SurveyListItem): string => {
  if (s.state === 'DRAFT') return 'Not published yet';
  if (s.state === 'OFF') return 'Turned off';
  if (s.timingMode === 'WEEKS_AFTER_START') {
    const weeks = s.weeksAfterStart ?? 0;
    return `Opens ${weeks} week${weeks === 1 ? '' : 's'} after the cohort starts, for ${s.openForDays ?? 14} days`;
  }
  if (s.timingMode === 'WEEKS_BEFORE_END') {
    const weeks = s.weeksBeforeEnd ?? 1;
    return `Appears ${weeks} week${weeks === 1 ? '' : 's'} before the cohort ends`;
  }
  if (s.state === 'SCHEDULED') return `Opens ${formatDay(s.opensAt)}`;
  if (s.state === 'CLOSED') return `Closed ${formatDay(s.closesAt)}`;
  return s.closesAt ? `Closes ${formatDay(s.closesAt)}` : 'Open with no closing date';
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'SCHEDULED', label: 'Scheduled' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'DRAFT', label: 'Drafts' },
];

const AdminSurveysPage: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canAdd = can('surveys', 'add');
  const canEdit = can('surveys', 'edit');
  const canDelete = can('surveys', 'delete');
  const { activeCohort } = useAppData();
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<SurveyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [builder, setBuilder] = useState<{ open: boolean; id?: string | null; copyOf?: string | null }>({ open: false });
  const [deleting, setDeleting] = useState<SurveyListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeCohort) return;
    try {
      setItems(await surveyApi.adminList(activeCohort.id));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load surveys.');
    } finally {
      setLoading(false);
    }
  }, [activeCohort]);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    if (tab === 'all') return items;
    if (tab === 'CLOSED') return items.filter((s) => s.state === 'CLOSED' || s.state === 'OFF');
    return items.filter((s) => s.state === tab);
  }, [items, tab]);

  const editing = builder.id ? items.find((s) => s.id === builder.id) : undefined;

  if (user?.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await surveyApi.adminDelete(deleting.id);
      toast({ message: 'Survey deleted.' });
      setDeleting(null);
      void load();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not delete it.', tone: 'error' });
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Surveys"
        subtitle="Ask participants, supports and staff questions, and see what they said."
        action={canAdd ? (
          <button type="button" onClick={() => setBuilder({ open: true })} className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark">
            New survey
          </button>
        ) : undefined}
      />
      <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} scrollable className="mb-4 max-w-xl" />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : error ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-gray-500">No surveys here yet.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((s) => (
            <div key={s.id} className={CARD}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-bold text-gray-900">{s.title}</p>
                    {s.builtinKey && <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700">Built-in</span>}
                    {s.anonymous && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">Anonymous</span>}
                  </div>
                  <p className="mt-1 text-[13px] text-gray-500">
                    For {AUDIENCE_LABEL[s.audience]} · {s.scope === 'GENERAL' ? 'All cohorts' : s.cohortName || 'This cohort'} · {timingNote(s)}
                  </p>
                </div>
                <span className={`inline-flex flex-none items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATE_TONE[s.state]}`}>{STATE_LABEL[s.state]}</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${s.eligible ? Math.min(100, (s.answered / s.eligible) * 100) : 0}%` }} />
                </span>
                <span className="flex-none text-right text-[12.5px] text-gray-500">{s.answered} of {s.eligible} answered</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[13px] font-semibold">
                <button type="button" onClick={() => navigate(`/surveys/${s.id}`)} className="rounded-xl bg-gray-100 px-3 py-1.5 text-gray-700 hover:bg-gray-200">Results</button>
                {canEdit && <button type="button" onClick={() => setBuilder({ open: true, id: s.id })} className="rounded-xl bg-gray-100 px-3 py-1.5 text-gray-700 hover:bg-gray-200">Edit</button>}
                {canAdd && !s.builtinKey && <button type="button" onClick={() => setBuilder({ open: true, copyOf: s.id })} className="rounded-xl bg-gray-100 px-3 py-1.5 text-gray-700 hover:bg-gray-200">Duplicate</button>}
                {canDelete && !s.builtinKey && <button type="button" onClick={() => setDeleting(s)} className="rounded-xl bg-red-50 px-3 py-1.5 text-red-600 hover:bg-red-100">Delete</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <SurveyBuilderModal
        isOpen={builder.open}
        onClose={() => setBuilder({ open: false })}
        onSaved={() => void load()}
        surveyId={builder.id}
        copyOfId={builder.copyOf}
        cohortId={activeCohort?.id ?? null}
        cohortName={activeCohort?.name ?? null}
        hasAnswers={(editing?.answered ?? 0) > 0}
      />
      <ConfirmationModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete this survey?"
        message={deleting ? `"${deleting.title}" and all of its answers will be removed. This cannot be undone.` : ''}
        confirmText="Delete"
        confirmLoading={deleteBusy}
      />
    </div>
  );
};

export default AdminSurveysPage;
