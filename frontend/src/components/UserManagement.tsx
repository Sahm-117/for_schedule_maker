import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usersApi, authApi, labelsApi, pushSubscriptionsApi } from '../services/api';
import type { User, Label } from '../types';
import AppSelect from './AppSelect';
import ConfirmationModal from './ConfirmationModal';
import LabelChip from './LabelChip';
import { formatDate, formatDateTime } from '../utils/time';
import { sortByText } from '../utils/sort';
import { selectedFirst } from '../utils/selectedFirst';
import { useAuth } from '../hooks/useAuth';

const ROLE_BADGE: Record<User['role'], string> = {
  ADMIN: 'bg-orange-100/80 text-orange-700',
  SOP_PREPARER: 'bg-indigo-100/80 text-indigo-700',
  SUPPORT: 'bg-sky-100/80 text-sky-700',
  PARTICIPANT: 'bg-neutral-100 text-neutral-600',
};
const ROLE_LABEL: Record<User['role'], string> = {
  ADMIN: 'Admin',
  SOP_PREPARER: 'SOP Preparer',
  SUPPORT: 'Support',
  PARTICIPANT: 'Participant',
};

interface UserManagementProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  showUserList?: boolean;
  showCreateForm?: boolean;
}

const UserManagement: React.FC<UserManagementProps> = ({
  isOpen,
  onClose,
  embedded = false,
  showUserList = true,
  showCreateForm = true,
}) => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUserLabels, setSelectedUserLabels] = useState<Label[]>([]);
  const [labelEditIds, setLabelEditIds] = useState<string[]>([]);
  const [editingLabels, setEditingLabels] = useState(false);
  const [savingLabels, setSavingLabels] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showPasswordInForm, setShowPasswordInForm] = useState(false);

  const [newUserLabelIds, setNewUserLabelIds] = useState<string[]>([]);
  const [selectedUserDraft, setSelectedUserDraft] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordSaving, setResetPasswordSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | User['role']>('ALL');
  // Staff userIds with no saved push subscription — "No alerts" tag + filter.
  const [subscribedUserIds, setSubscribedUserIds] = useState<Set<string>>(new Set());
  const [noAlertsOnly, setNoAlertsOnly] = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState<User | null>(null);
  const [roleChangeValue, setRoleChangeValue] = useState<'ADMIN' | 'SOP_PREPARER' | 'SUPPORT'>('SUPPORT');

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'SUPPORT' as 'ADMIN' | 'SOP_PREPARER' | 'SUPPORT',
  });

  const shouldRender = embedded || isOpen;

  useEffect(() => {
    if (shouldRender && showUserList) {
      loadUsers();
    }
    if (shouldRender && (showUserList || showCreateForm)) {
      loadLabels();
    }
  }, [shouldRender, showCreateForm, showUserList]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await usersApi.getAll({ includeInactive: true });
      setUsers(sortByText(response.users, (user) => user.name));
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
    pushSubscriptionsApi.listSubscribedUserIds()
      .then((ids) => setSubscribedUserIds(new Set(ids)))
      .catch(() => setSubscribedUserIds(new Set()));
  };

  const loadLabels = async () => {
    try {
      const response = await labelsApi.getAll();
      setAllLabels(sortByText(response.labels, (label) => label.name));
    } catch {
      // non-critical
    }
  };

  const openUserDetails = async (user: User) => {
    setSelectedUser(user);
    setSelectedUserDraft({
      name: user.name,
      email: user.email || '',
      phone: user.phone || '',
    });
    setEditingLabels(false);
    setSelectedUserLabels([]);
    setLabelEditIds([]);
    try {
      const response = await usersApi.getUserLabels(user.id);
      setSelectedUserLabels(sortByText(response.labels, (label) => label.name));
      setLabelEditIds(response.labels.map((l) => l.id));
    } catch {
      // non-critical
    }
  };

  const handleSaveProfile = async () => {
    if (!selectedUser) return;
    const nextName = selectedUserDraft.name.trim();
    if (!nextName) {
      setError('Name is required.');
      return;
    }

    setSavingProfile(true);
    setError('');
    setSuccess('');
    try {
      const response = await usersApi.update(selectedUser.id, { name: nextName });
      setSelectedUser(response.user);
      setUsers((prev) => sortByText(
        prev.map((entry) => (entry.id === selectedUser.id ? { ...entry, ...response.user } : entry)),
        (user) => user.name
      ));
      setSuccess('User profile updated.');
    } catch (err: any) {
      setError(err.message || 'Failed to update user profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveLabels = async () => {
    if (!selectedUser) return;
    setSavingLabels(true);
    setError('');
    setSuccess('');
    try {
      await usersApi.setUserLabels(selectedUser.id, labelEditIds);
      setSelectedUserLabels(sortByText(allLabels.filter((l) => labelEditIds.includes(l.id)), (label) => label.name));
      setEditingLabels(false);
      setSuccess('Activity tags updated');
    } catch {
      setError('Failed to update activity tags');
    } finally {
      setSavingLabels(false);
    }
  };

  const toggleLabelEdit = (labelId: string) => {
    setLabelEditIds((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId]
    );
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || (!newUser.email && !newUser.phone) || !newUser.password) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Send only the fields actually provided. Previously this copied the phone
      // into the email field for phone-only users, polluting email with a phone
      // number. register() already omits empty email/phone.
      const userData = {
        name: newUser.name,
        password: newUser.password,
        role: newUser.role,
        ...(newUser.email ? { email: newUser.email } : {}),
        ...(newUser.phone ? { phone: newUser.phone } : {}),
      };
      const created = await authApi.register(userData);
      if (newUser.role === 'SUPPORT' && newUserLabelIds.length > 0 && created?.user?.id) {
        await usersApi.setUserLabels(created.user.id, newUserLabelIds);
      }
      if (created?.user) {
        setUsers((prev) => sortByText(
          [...prev.filter((entry) => entry.id !== created.user.id), created.user],
          (user) => user.name
        ));
      }
      setSuccess('User created successfully');
      setNewUser({ name: '', email: '', phone: '', password: '', role: 'SUPPORT' });
      setNewUserLabelIds([]);
      setShowPasswordInForm(false);
    } catch (error: any) {
      // The API layer already returns a friendly message (e.g. phone/email
      // already registered), so surface it directly.
      setError(getErrorMessage(error, 'Could not create the account. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (resetPasswordValue.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    setResetPasswordSaving(true);
    setError('');
    try {
      await usersApi.update(userId, { password: resetPasswordValue });
      setSuccess('Password reset. They will be asked to choose a new one when they next sign in.');
      setResetPasswordUserId(null);
      setResetPasswordValue('');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setResetPasswordSaving(false);
    }
  };

  const getErrorMessage = (error: any, fallback: string) => error?.response?.data?.error || error?.message || fallback;

  const handleActivationChange = async (targetUser: User) => {
    const currentlyActive = targetUser.isActive !== false;
    if (currentlyActive && targetUser.id === currentUser?.id) {
      setError('You cannot deactivate your own account.');
      return;
    }

    const action = currentlyActive ? 'deactivate' : 'reactivate';
    const confirmed = confirm(
      currentlyActive
        ? `Deactivate "${targetUser.name}"? They will be logged out and will not be able to log in, but their records will stay in the app.`
        : `Reactivate "${targetUser.name}"? They will be able to log in again.`
    );
    if (!confirmed) return;

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await usersApi.update(targetUser.id, {
        isActive: !currentlyActive,
        deactivatedAt: currentlyActive ? new Date().toISOString() : null,
      });
      setUsers((prev) => sortByText(
        prev.map((entry) => (entry.id === targetUser.id ? { ...entry, ...response.user } : entry)),
        (user) => user.name
      ));
      if (selectedUser?.id === targetUser.id) {
        setSelectedUser(response.user);
      }
      setSuccess(`User ${action}d successfully.`);
    } catch (error: any) {
      setError(getErrorMessage(error, `Failed to ${action} user.`));
    } finally {
      setLoading(false);
    }
  };

  const handlePermanentDeleteUser = async (targetUser: User) => {
    if (targetUser.id === currentUser?.id) {
      setError('You cannot permanently delete your own account.');
      return;
    }

    if (!confirm(`Permanently delete "${targetUser.name}"? This cannot be undone. Use Deactivate if you only need to block login and keep their records.`)) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await usersApi.delete(targetUser.id);
      setUsers((prev) => prev.filter((entry) => entry.id !== targetUser.id));
      setSuccess('User permanently deleted successfully.');
      if (selectedUser?.id === targetUser.id) setSelectedUser(null);
    } catch (error: any) {
      setError(getErrorMessage(error, 'Failed to permanently delete user.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'ADMIN' | 'SOP_PREPARER' | 'SUPPORT') => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await usersApi.update(userId, { role: newRole });
      setUsers((prev) => sortByText(
        prev.map((entry) => (entry.id === userId ? { ...entry, ...response.user } : entry)),
        (user) => user.name
      ));
      if (selectedUser?.id === userId) setSelectedUser(response.user);
      setSuccess('User role updated successfully');
    } catch (error: any) {
      setError(getErrorMessage(error, 'Failed to update user role'));
    } finally {
      setLoading(false);
    }
  };

  if (!shouldRender) return null;

  // Active and not in subscribedUserIds — an inactive user was never expected
  // to receive alerts, so they don't count as "no alerts".
  const hasNoAlerts = (user: User) => user.isActive !== false && !subscribedUserIds.has(user.id);
  const noAlertsCount = users.filter(hasNoAlerts).length;

  const filteredUsers = sortByText(users.filter((user) => {
    const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
    const haystack = [user.name, user.email, user.phone].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = searchQuery.trim().length === 0 || haystack.includes(searchQuery.trim().toLowerCase());
    const matchesAlerts = !noAlertsOnly || hasNoAlerts(user);
    return matchesRole && matchesSearch && matchesAlerts;
  }), (user) => user.name);

  const renderStatusBadge = (user: User) => (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${user.isActive === false ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>
      {user.isActive === false ? 'Inactive' : 'Active'}
    </span>
  );

  const toggleUserMenu = (userId: string, anchor: HTMLElement) => {
    if (openMenuId === userId) {
      setOpenMenuId(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    setMenuPosition({
      top: Math.min(rect.bottom + 8, window.innerHeight - 220),
      left: Math.max(12, Math.min(rect.right - 176, window.innerWidth - 188)),
    });
    setOpenMenuId(userId);
  };

  const renderUserMenu = (user: User) => openMenuId === user.id && createPortal(
    <>
      <button type="button" aria-label="Close user actions" className="fixed inset-0 z-[90] cursor-default" onClick={() => setOpenMenuId(null)} />
      <div className="fixed z-[100] w-44 rounded-2xl border border-gray-200 bg-white py-1 shadow-xl" style={menuPosition} role="menu">
        <button onClick={() => { openUserDetails(user); setOpenMenuId(null); }} className="w-full px-4 py-2.5 text-left text-sm text-blue-600 hover:bg-gray-50" role="menuitem">Manage</button>
        <button onClick={() => { setRoleChangeTarget(user); setRoleChangeValue(user.role as 'ADMIN' | 'SOP_PREPARER' | 'SUPPORT'); setOpenMenuId(null); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50" role="menuitem">Change role</button>
        <button onClick={() => { setResetPasswordUserId(user.id); setResetPasswordValue(''); setError(''); setOpenMenuId(null); }} className="w-full px-4 py-2.5 text-left text-sm text-orange-500 hover:bg-gray-50" role="menuitem">Reset password</button>
        <button onClick={() => { void handleActivationChange(user); setOpenMenuId(null); }} disabled={loading || (user.isActive !== false && user.id === currentUser?.id)} className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50" role="menuitem">{user.isActive === false ? 'Reactivate' : 'Deactivate'}</button>
        <button onClick={() => { void handlePermanentDeleteUser(user); setOpenMenuId(null); }} disabled={loading || user.id === currentUser?.id} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50" role="menuitem">Permanent delete</button>
      </div>
    </>,
    document.body,
  );

  const renderCreateForm = () => (
    <div className={showUserList ? 'mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4' : ''}>
      {showUserList && <h4 className="mb-3 text-md font-medium">Add New User</h4>}
      <form onSubmit={handleAddUser} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
            <input
              type="text"
              value={newUser.name}
              onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-primary"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-primary"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Phone Number</label>
            <input
              type="tel"
              value={newUser.phone}
              onChange={(e) => setNewUser((prev) => ({ ...prev, phone: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-primary"
              placeholder="+1234567890"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password *</label>
            <div className="relative">
              <input
                type={showPasswordInForm ? 'text' : 'password'}
                value={newUser.password}
                onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 focus:border-primary focus:outline-none focus:ring-primary"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPasswordInForm(!showPasswordInForm)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Role *</label>
            <AppSelect
              value={newUser.role}
              onChange={(value) => setNewUser((prev) => ({ ...prev, role: value as 'ADMIN' | 'SOP_PREPARER' | 'SUPPORT' }))}
              options={[
                { value: 'SUPPORT', label: 'Support' },
                { value: 'SOP_PREPARER', label: 'SOP Preparer' },
                { value: 'ADMIN', label: 'Admin' },
              ]}
              placeholder="Choose role"
              compact
            />
          </div>
        </div>
        {newUser.role === 'SUPPORT' && allLabels.length > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Activity tags</label>
            <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border border-gray-200 bg-white p-3">
              {selectedFirst(allLabels, (label) => newUserLabelIds.includes(label.id)).map((label) => (
                <label key={label.id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newUserLabelIds.includes(label.id)}
                    onChange={() =>
                      setNewUserLabelIds((prev) =>
                        prev.includes(label.id)
                          ? prev.filter((id) => id !== label.id)
                          : [...prev, label.id]
                      )
                    }
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <LabelChip name={label.name} color={label.color} size="sm" />
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="mt-2 text-sm text-gray-500">* Required. Either email or phone must be provided.</div>
        <div className="flex justify-end gap-2">
          {!embedded && (
            <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !newUser.name || (!newUser.email && !newUser.phone) || !newUser.password}
            className="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  );

  const content = (
    <>
      <div className="p-6">
        {!embedded && (
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">{showUserList ? 'User Management' : 'Create User'}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {error && <div className="mb-4 text-red-600 text-sm bg-red-50 p-3 rounded">{error}</div>}
        {success && <div className="mb-4 text-green-600 text-sm bg-green-50 p-3 rounded">{success}</div>}

        {showCreateForm && showUserList && !embedded && renderCreateForm()}
        {showCreateForm && !showUserList && renderCreateForm()}

        {showUserList && (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-medium">Users ({filteredUsers.length})</h3>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-primary sm:w-64"
                />
                <div className="sm:w-56">
                  <AppSelect
                    value={roleFilter}
                    onChange={(value) => setRoleFilter(value as 'ALL' | User['role'])}
                    options={[
                      { value: 'ALL', label: 'All roles' },
                      { value: 'ADMIN', label: 'Admin' },
                      { value: 'SOP_PREPARER', label: 'SOP Preparer' },
                      { value: 'SUPPORT', label: 'Support' },
                    ]}
                    placeholder="All roles"
                    compact
                  />
                </div>
                {noAlertsCount > 0 && (
                  <div className="sm:w-44">
                    <AppSelect
                      value={noAlertsOnly ? 'no-alerts' : ''}
                      onChange={(value) => setNoAlertsOnly(value === 'no-alerts')}
                      options={[
                        { value: '', label: 'All alerts' },
                        { value: 'no-alerts', label: `No alerts (${noAlertsCount})` },
                      ]}
                      placeholder="All alerts"
                      compact
                    />
                  </div>
                )}
              </div>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading users...</p>
              </div>
            ) : (
              <div>
                {filteredUsers.length === 0 && !loading && (
                  <div className="text-center py-8 text-gray-500">No users found</div>
                )}

                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {filteredUsers.map((user) => (
                    <div key={user.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900 text-sm truncate">{user.name}</p>
                            {renderStatusBadge(user)}
                            {hasNoAlerts(user) && (
                              <span title="No saved push subscription on any device." className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">No alerts</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 truncate">{user.email || user.phone}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {user.createdAt ? formatDate(user.createdAt) : ''}
                          </p>
                        </div>
                        {/* Role badge + hamburger */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_BADGE[user.role]}`}>{ROLE_LABEL[user.role]}</span>
                          <div>
                            <button
                              onClick={(event) => toggleUserMenu(user.id, event.currentTarget)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7h16M4 12h16M4 17h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                      {/* Inline reset password */}
                      {resetPasswordUserId === user.id && (
                        <div className="mt-3 flex items-center gap-2 pt-3 border-t border-gray-100">
                          <input
                            type="text"
                            value={resetPasswordValue}
                            onChange={(e) => setResetPasswordValue(e.target.value)}
                            placeholder="New password (min 6)"
                            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            onClick={() => handleResetPassword(user.id)}
                            disabled={resetPasswordSaving}
                            className="text-xs px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
                          >
                            {resetPasswordSaving ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setResetPasswordUserId(null); setResetPasswordValue(''); }}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredUsers.map((user) => (
                        <tr key={user.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium text-gray-900">{user.name}</div>
                              {renderStatusBadge(user)}
                              {hasNoAlerts(user) && (
                                <span title="No saved push subscription on any device." className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">No alerts</span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500">{user.email || user.phone}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_BADGE[user.role]}`}>{ROLE_LABEL[user.role]}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {user.createdAt ? formatDate(user.createdAt) : 'N/A'}
                          </td>
                          <td className="px-6 py-4 text-right text-sm">
                            <div className="inline-flex">
                              <button
                                onClick={(event) => toggleUserMenu(user.id, event.currentTarget)}
                                className="rounded-xl border border-orange-100 p-2 text-gray-500 hover:bg-orange-50 hover:text-gray-700"
                              >
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7h16M4 12h16M4 17h16" />
                                </svg>
                              </button>
                            </div>
                            {resetPasswordUserId === user.id && (
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="text"
                                  value={resetPasswordValue}
                                  onChange={(e) => setResetPasswordValue(e.target.value)}
                                  placeholder="New password (min 6)"
                                  className="text-sm border border-gray-300 rounded px-2 py-1 w-40 focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <button
                                  onClick={() => handleResetPassword(user.id)}
                                  disabled={resetPasswordSaving}
                                  className="text-xs px-2 py-1 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50"
                                >
                                  {resetPasswordSaving ? '...' : 'Save'}
                                </button>
                                <button
                                  onClick={() => { setResetPasswordUserId(null); setResetPasswordValue(''); }}
                                  className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {openMenuId && (() => {
                  const menuUser = users.find((user) => user.id === openMenuId);
                  return menuUser ? renderUserMenu(menuUser) : null;
                })()}
              </div>
            )}
          </>
        )}

        {!embedded && showUserList && (
          <div className="flex justify-end pt-4 border-t mt-6">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              Close
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {embedded ? (
        <div className="surface-card overflow-hidden">
          {content}
        </div>
      ) : (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className={`w-full overflow-y-auto bg-white shadow-xl ${showUserList ? 'max-h-[92vh] rounded-t-3xl sm:max-w-4xl sm:rounded-2xl' : 'max-h-[92vh] rounded-t-3xl sm:max-w-2xl sm:rounded-2xl'}`}>
            {content}
          </div>
        </div>
      )}

      {/* User Details + Activity Tag Assignment Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold">Manage User</h3>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={selectedUserDraft.name}
                    onChange={(e) => setSelectedUserDraft((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email/Phone</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">{selectedUser.email || selectedUser.phone || 'N/A'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      selectedUser.role === 'ADMIN' ? 'bg-orange-100 text-orange-700'
                      : selectedUser.role === 'SOP_PREPARER' ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-blue-100 text-blue-700'
                    }`}>
                      {selectedUser.role === 'ADMIN' ? 'Admin' : selectedUser.role === 'SOP_PREPARER' ? 'SOP Preparer' : 'Support'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
                    {renderStatusBadge(selectedUser)}
                    {selectedUser.isActive === false && selectedUser.deactivatedAt && (
                      <span className="ml-2 text-xs text-gray-500">
                        Deactivated {formatDateTime(selectedUser.deactivatedAt)}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User ID</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono">{selectedUser.id}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Created</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
                    {selectedUser.createdAt ? formatDateTime(selectedUser.createdAt) : 'N/A'}
                  </div>
                </div>

                {/* Activity Tag Assignment */}
                {selectedUser.role === 'SUPPORT' && (
                  <div>
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Activity tags
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          This user will only see activities with these tags.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingLabels(true)}
                        className="rounded-full border border-primary p-2 text-primary hover:bg-primary/5"
                        aria-label="Edit activity tags"
                        title="Edit activity tags"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m15.232 5.232 3.536 3.536M9 11l6.232-6.232a2.5 2.5 0 1 1 3.536 3.536L12.536 14.5A4 4 0 0 1 10.7 15.6L7 17l1.4-3.7a4 4 0 0 1 1.1-1.836Z" />
                        </svg>
                      </button>
                    </div>
                    {!editingLabels ? (
                      <div className="rounded-2xl border border-orange-100 bg-orange-50/40 px-4 py-4">
                        {selectedUserLabels.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {selectedUserLabels.map((label) => (
                              <LabelChip key={label.id} name={label.name} color={label.color} size="md" />
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No activity tags selected yet.</p>
                        )}
                      </div>
                    ) : allLabels.length > 0 ? (
                      <>
                        <div className="border border-gray-200 rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                          {selectedFirst(allLabels, (label) => labelEditIds.includes(label.id)).map((label) => (
                            <label key={label.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={labelEditIds.includes(label.id)}
                                onChange={() => toggleLabelEdit(label.id)}
                                className="rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <LabelChip name={label.name} color={label.color} size="sm" />
                            </label>
                          ))}
                        </div>

                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={handleSaveLabels}
                            disabled={savingLabels}
                            className="px-4 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary-dark disabled:opacity-50"
                          >
                            {savingLabels ? 'Saving...' : 'Save tags'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setLabelEditIds([])}
                            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                          >
                            Clear All
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLabelEditIds(selectedUserLabels.map((label) => label.id));
                              setEditingLabels(false);
                            }}
                            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No labels created yet. Create labels first.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-6 border-t mt-6">
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50 mr-2"
                >
                  {savingProfile ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!roleChangeTarget}
        onClose={() => setRoleChangeTarget(null)}
        onConfirm={() => { if (roleChangeTarget) void handleRoleChange(roleChangeTarget.id, roleChangeValue); }}
        title={`Change role for ${roleChangeTarget?.name ?? 'this user'}?`}
        message="They will get the permissions of the new role the next time they load the app."
        type="warning"
        confirmText="Change role"
        confirmDisabled={!roleChangeTarget || roleChangeValue === roleChangeTarget.role}
      >
        <AppSelect
          value={roleChangeValue}
          onChange={(value) => setRoleChangeValue(value as 'ADMIN' | 'SOP_PREPARER' | 'SUPPORT')}
          options={[
            { value: 'SUPPORT', label: 'Support' },
            { value: 'SOP_PREPARER', label: 'SOP Preparer' },
            { value: 'ADMIN', label: 'Admin' },
          ]}
          placeholder="Choose role"
          compact
        />
      </ConfirmationModal>
    </>
  );
};

export default UserManagement;
