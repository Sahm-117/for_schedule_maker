import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import AppOverflowMenu from '../components/AppOverflowMenu';
import ConfirmationModal from '../components/ConfirmationModal';
import PageLoader from '../components/PageLoader';
import { useToast } from '../components/Toast';
import { permissionsApi } from '../services/supabase-api';
import {
  MODULES,
  type ModuleKey,
  type ModulePermission,
  type PermissionAction,
  type PermissionRole,
} from '../utils/permissions';

type Grid = Record<ModuleKey, ModulePermission>;

const ACTIONS: Array<{ key: PermissionAction; label: string }> = [
  { key: 'view', label: 'See' },
  { key: 'add', label: 'Add' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
];

const NEW_ID = 'NEW';
const ADMIN_ID = 'ADMIN';

const emptyGrid = (): Grid =>
  Object.fromEntries(MODULES.map((m) => [m.key, { view: false, add: false, edit: false, delete: false }])) as Grid;

const fullGrid = (): Grid =>
  Object.fromEntries(MODULES.map((m) => [m.key, { view: true, add: true, edit: true, delete: true }])) as Grid;

const gridFromRole = (role: PermissionRole | null): Grid => {
  const grid = emptyGrid();
  role?.modules.forEach((m) => { grid[m.module] = { view: m.view, add: m.add, edit: m.edit, delete: m.delete }; });
  return grid;
};

const sameGrid = (a: Grid, b: Grid) => MODULES.every((m) => ACTIONS.every((x) => a[m.key][x.key] === b[m.key][x.key]));

// Add, Edit and Delete only make sense with See, and removing See removes the rest.
const withTick = (current: ModulePermission, action: PermissionAction, on: boolean): ModulePermission => {
  if (action === 'view') return on ? { ...current, view: true } : { view: false, add: false, edit: false, delete: false };
  return on ? { ...current, [action]: true, view: true } : { ...current, [action]: false };
};

const GROUPS = MODULES.reduce<Array<{ label: string; modules: typeof MODULES }>>((acc, def) => {
  const last = acc[acc.length - 1];
  if (last && last.label === def.group) last.modules.push(def);
  else acc.push({ label: def.group, modules: [def] });
  return acc;
}, []);

const AdminRolesPage: React.FC = () => {
  const toast = useToast();
  const [roles, setRoles] = useState<PermissionRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState<string>(ADMIN_ID);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [grid, setGrid] = useState<Grid>(fullGrid());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PermissionRole | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingSelect, setPendingSelect] = useState<string | null>(null);

  const selectedRole = useMemo(() => roles.find((r) => r.id === selectedId) ?? null, [roles, selectedId]);
  const isAdminRow = selectedId === ADMIN_ID;
  const isNew = selectedId === NEW_ID;
  const isSystem = !!selectedRole?.isSystem;

  const original = useMemo(() => gridFromRole(selectedRole), [selectedRole]);
  const dirty = !isAdminRow && (
    isNew
      ? name.trim() !== '' || !sameGrid(grid, emptyGrid()) || description.trim() !== ''
      : !!selectedRole && (
        (!isSystem && name.trim() !== selectedRole.name)
        || description.trim() !== (selectedRole.description ?? '')
        || !sameGrid(grid, original)
      )
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setRoles(await permissionsApi.listRoles());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the roles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openRole = useCallback((id: string, list: PermissionRole[]) => {
    setSelectedId(id);
    setError('');
    if (id === ADMIN_ID) {
      setName('Admin'); setDescription('Always sees and does everything. This cannot be changed.'); setGrid(fullGrid());
    } else if (id === NEW_ID) {
      setName(''); setDescription(''); setGrid(emptyGrid());
    } else {
      const role = list.find((r) => r.id === id) ?? null;
      setName(role?.name ?? ''); setDescription(role?.description ?? ''); setGrid(gridFromRole(role));
    }
  }, []);

  const choose = (id: string) => {
    if (id === selectedId) return;
    if (dirty) { setPendingSelect(id); return; }
    openRole(id, roles);
  };

  const setCell = (module: ModuleKey, action: PermissionAction, on: boolean) =>
    setGrid((prev) => ({ ...prev, [module]: withTick(prev[module], action, on) }));

  const toggleRow = (module: ModuleKey) =>
    setGrid((prev) => {
      const all = ACTIONS.every((a) => prev[module][a.key]);
      return { ...prev, [module]: all ? { view: false, add: false, edit: false, delete: false } : { view: true, add: true, edit: true, delete: true } };
    });

  const toggleColumn = (action: PermissionAction) =>
    setGrid((prev) => {
      const all = MODULES.every((m) => prev[m.key][action]);
      const next = { ...prev };
      MODULES.forEach((m) => { next[m.key] = withTick(prev[m.key], action, !all); });
      return next;
    });

  const save = async () => {
    if (!isNew && !selectedRole) return;
    if (!isSystem && name.trim() === '') { setError('Give the role a name.'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await permissionsApi.saveRole({
        id: isNew ? null : selectedId,
        name: name.trim(),
        description: description.trim() || null,
        modules: MODULES.filter((m) => ACTIONS.some((a) => grid[m.key][a.key])).map((m) => ({ module: m.key, ...grid[m.key] })),
      });
      const next = isNew ? [...roles, saved] : roles.map((r) => (r.id === saved.id ? saved : r));
      setRoles(next);
      openRole(saved.id, next);
      toast({ message: `Saved "${saved.name}".`, tone: 'success' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the role.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => openRole(selectedId, roles);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await permissionsApi.deleteRole(deleteTarget.id);
      const next = roles.filter((r) => r.id !== deleteTarget.id);
      setRoles(next);
      openRole(ADMIN_ID, next);
      toast({ message: `Deleted "${deleteTarget.name}".`, tone: 'success' });
      setDeleteTarget(null);
    } catch (e) {
      setDeleteTarget(null);
      setError(e instanceof Error ? e.message : 'Could not delete the role.');
    } finally {
      setDeleting(false);
    }
  };

  const customRoles = roles.filter((r) => !r.isSystem);
  const supportRole = roles.find((r) => r.isSystem);
  const readOnly = isAdminRow;

  return (
    <div>
      <PageHeader
        title="Roles"
        subtitle="Decide what each role can see and do, then give roles to people on the Users page."
        action={(
          <button
            type="button"
            onClick={() => choose(NEW_ID)}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            New role
          </button>
        )}
      />

      <div className="mb-4 rounded-2xl bg-amber-100/80 px-4 py-3 text-sm text-amber-700" data-testid="roles-notice">
        For now this hides menus, pages and buttons. It does not yet block the data behind them, so only give a role to someone you trust.
      </div>

      {loading ? (
        <PageLoader label="Loading roles…" />
      ) : loadError ? (
        <div className="surface-card px-6 py-8 text-center">
          <p className="text-sm text-gray-600">{loadError}</p>
          <button type="button" onClick={() => void load()} className="mt-4 inline-flex h-10 items-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark">Try again</button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <div className="surface-card self-start p-3" data-testid="roles-list">
            <RoleRow label="Admin" sub="Everything, always" badge="Built-in" active={selectedId === ADMIN_ID} onClick={() => choose(ADMIN_ID)} />
            {supportRole && (
              <RoleRow label={supportRole.name} sub={`${supportRole.memberCount} ${supportRole.memberCount === 1 ? 'person' : 'people'}`} badge="Built-in" active={selectedId === supportRole.id} onClick={() => choose(supportRole.id)} />
            )}
            {customRoles.map((r) => (
              <RoleRow key={r.id} label={r.name} sub={`${r.memberCount} ${r.memberCount === 1 ? 'person' : 'people'}`} active={selectedId === r.id} onClick={() => choose(r.id)} />
            ))}
            {isNew && <RoleRow label={name.trim() || 'New role'} sub="Not saved yet" active onClick={() => undefined} />}
            {customRoles.length === 0 && !isNew && (
              <p className="px-3 py-3 text-xs text-gray-500">No custom roles yet. Use New role to make one.</p>
            )}
          </div>

          <div className="min-w-0">
            <div className="surface-card p-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <label htmlFor="role-name" className="mb-1 block text-sm font-medium text-gray-700">Role name</label>
                    <input
                      id="role-name"
                      type="text"
                      value={name}
                      maxLength={60}
                      disabled={readOnly || isSystem}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Registrar"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-primary disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="role-description" className="mb-1 block text-sm font-medium text-gray-700">Note (optional)</label>
                    <input
                      id="role-description"
                      type="text"
                      value={description}
                      disabled={readOnly}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What is this role for?"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-primary disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                </div>
                {selectedRole && !selectedRole.isSystem && (
                  <AppOverflowMenu align="right" items={[{ label: 'Delete role', tone: 'danger', onClick: () => setDeleteTarget(selectedRole) }]} />
                )}
              </div>
              {isSystem && (
                <p className="mt-3 text-xs text-gray-500">
                  Support screens never change. These ticks only apply to a Support person who has also been given Team member access, in their Team member view.
                </p>
              )}
              {!isAdminRow && !isSystem && (
                <p className="mt-3 text-xs text-gray-500">
                  People get these ticks when they are a Team member with this role. Tick See first; Add, Edit and Delete switch it on for you.
                </p>
              )}
            </div>

            <div className="surface-card mt-4 overflow-hidden" data-testid="roles-grid">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Module</th>
                    {ACTIONS.map((a) => (
                      <th key={a.key} className="w-16 px-2 py-3 text-center">
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => toggleColumn(a.key)}
                          title={`Tick or clear ${a.label} for every module`}
                          className="rounded-lg px-1.5 py-0.5 uppercase hover:bg-gray-100 disabled:cursor-default disabled:hover:bg-transparent"
                        >
                          {a.label}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.map((group) => (
                    <React.Fragment key={group.label}>
                      <tr>
                        <td colSpan={5} className="bg-gray-50/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{group.label}</td>
                      </tr>
                      {group.modules.map((m) => (
                        <tr key={m.key} className="border-t border-gray-50" data-module={m.key}>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              disabled={readOnly}
                              onClick={() => toggleRow(m.key)}
                              title="Tick or clear this whole row"
                              className="text-left font-medium text-gray-800 hover:text-primary disabled:cursor-default disabled:hover:text-gray-800"
                            >
                              {m.label}
                            </button>
                          </td>
                          {ACTIONS.map((a) => (
                            <td key={a.key} className="px-2 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={grid[m.key][a.key]}
                                disabled={readOnly}
                                aria-label={`${m.label} ${a.label}`}
                                onChange={(e) => setCell(m.key, a.key, e.target.checked)}
                                className="h-4 w-4 cursor-pointer rounded accent-[var(--color-primary)] disabled:cursor-default"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {error && <p className="mt-3 rounded-xl bg-red-100/80 px-4 py-2.5 text-sm text-red-700" role="alert">{error}</p>}

            {!readOnly && (
              <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-3 rounded-2xl border-t border-gray-100 bg-white/80 px-4 py-3 shadow-lg backdrop-blur-xl">
                <span className="text-[13px] font-medium text-gray-700">{dirty ? 'Unsaved changes' : 'No changes'}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancel}
                    disabled={!dirty || saving}
                    className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={!dirty || saving}
                    className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-40"
                  >
                    {saving ? 'Saving…' : isNew ? 'Create role' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        title={`Delete "${deleteTarget?.name ?? ''}"?`}
        message={deleteTarget && deleteTarget.memberCount > 0
          ? `${deleteTarget.memberCount} ${deleteTarget.memberCount === 1 ? 'person holds' : 'people hold'} this role. It cannot be deleted until they are moved to another role.`
          : 'No one holds this role. This cannot be undone.'}
        type="danger"
        confirmText="Delete role"
        confirmDisabled={!!deleteTarget && deleteTarget.memberCount > 0}
        confirmLoading={deleting}
      />

      <ConfirmationModal
        isOpen={!!pendingSelect}
        onClose={() => setPendingSelect(null)}
        onConfirm={() => { if (pendingSelect) openRole(pendingSelect, roles); setPendingSelect(null); }}
        title="Discard your changes?"
        message="You have unsaved changes to this role. Switching now throws them away."
        type="warning"
        confirmText="Discard"
      />
    </div>
  );
};

const RoleRow: React.FC<{ label: string; sub: string; badge?: string; active: boolean; onClick: () => void }> = ({ label, sub, badge, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'true' : undefined}
    className={`mb-1 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left transition last:mb-0 ${active ? 'bg-primary-50 text-primary' : 'text-gray-700 hover:bg-gray-50'}`}
  >
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold">{label}</span>
      <span className="block text-xs text-gray-500">{sub}</span>
    </span>
    {badge && <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">{badge}</span>}
  </button>
);

export default AdminRolesPage;
