import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usersApi, authApi, labelsApi, pushSubscriptionsApi, practiceApi } from '../services/api';
import type { User, Label } from '../types';
import AppSelect from './AppSelect';
import ConfirmationModal from './ConfirmationModal';
import LabelChip from './LabelChip';
import { formatDate, formatDateTime } from '../utils/time';
import { sortByText } from '../utils/sort';
import { selectedFirst } from '../utils/selectedFirst';
import { useAuth } from '../hooks/useAuth';
import Spinner from './Spinner';
import InviteMessageCard, { type InviteDetails } from './InviteMessageCard';
import { toLocalNigerianPhone } from '../utils/phone';

const ROLE_BADGE: Record<User['role'], string> = {
  ADMIN: 'bg-orange-100/80 text-orange-700',
  SUPPORT: 'bg-sky-100/80 text-sky-700',
  PARTICIPANT: 'bg-neutral-100 text-neutral-600',
};
// Everyone holds at least their home role; some hold more and can switch between them.
type StaffRole = 'ADMIN' | 'SUPPORT';
const rolesOf = (user: User): StaffRole[] => (user.roles && user.roles.length > 0 ? user.roles : [user.role as StaffRole]);
const RoleBadges: React.FC<{ user: User }> = ({ user }) => (
  <span className="inline-flex flex-wrap justify-end gap-1">
    {rolesOf(user).map((role) => (
      <span key={role} className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_BADGE[role]}`}>{ROLE_LABEL[role]}</span>
    ))}
  </span>
);
const ROLE_LABEL: Record<User['role'], string> = {
  ADMIN: 'Admin',
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

// 8 characters, no look-alikes (0/O, 1/l/I), so it reads cleanly over WhatsApp.
const generateFirstTimePassword = () => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};

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
  const [firstTimeTarget, setFirstTimeTarget] = useState<User | null>(null);
  const [firstTimePassword, setFirstTimePassword] = useState(false);
  const [firstTimeBusy, setFirstTimeBusy] = useState(false);
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUserLabels, setSelectedUserLabels] = useState<Label[]>([]);
  const [labelEditIds, setLabelEditIds] = useState<string[]>([]);
  const [editingLabels, setEditingLabels] = useState(false);
  const [savingLabels, setSavingLabels] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [newUserLabelIds, setNewUserLabelIds] = useState<string[]>([]);
  const [selectedUserDraft, setSelectedUserDraft] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordSaving, setResetPasswordSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | User['role']>('ALL');
  // Staff userIds with no saved push subscription — "No alerts" tag + filter.
  const [subscribedUserIds, setSubscribedUserIds] = useState<Set<string>>(new Set());
  const [notInstalledIds, setNotInstalledIds] = useState<Set<string>>(new Set());
  const [noAlertsOnly, setNoAlertsOnly] = useState(false);
  const [noAlertsCopied, setNoAlertsCopied] = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState<User | null>(null);
  const [roleChangeValues, setRoleChangeValues] = useState<StaffRole[]>(['SUPPORT']);

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'SUPPORT' as 'ADMIN' | 'SUPPORT',
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
    pushSubscriptionsApi.listNotInstalledUserIds()
      .then((ids) => setNotInstalledIds(new Set(ids)))
      .catch(() => setNotInstalledIds(new Set()));
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
      // Email and phone can be added or corrected here (e.g. an account made with
      // a phone only). The phone is saved as 080… so it's what they sign in with.
      const nextEmail = selectedUserDraft.email.trim().toLowerCase();
      const phoneInput = selectedUserDraft.phone.trim();
      const nextPhone = phoneInput ? toLocalNigerianPhone(phoneInput) : '';
      if (nextPhone === null) {
        setError('Enter a valid Nigerian phone number, e.g. 08012345678.');
        return;
      }
      if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
        setError('Enter a valid email address.');
        return;
      }
      if (!nextEmail && !nextPhone) {
        setError('Keep at least an email or a phone number so they can sign in.');
        return;
      }
      const response = await usersApi.update(selectedUser.id, {
        name: nextName,
        email: nextEmail || null,
        phone: nextPhone || null,
      });
      setSelectedUserDraft((prev) => ({ ...prev, email: response.user.email || '', phone: response.user.phone || '' }));
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
    if (!newUser.name || (!newUser.email && !newUser.phone)) return;
    // Pasted any way (+234…, spaces…), saved as 080… so it's the number they sign in with.
    const phone = newUser.phone.trim() ? toLocalNigerianPhone(newUser.phone) : '';
    if (phone === null) {
      setError('Enter a valid Nigerian phone number, e.g. 08012345678.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setInvite(null);

    // A first-time password for the invite; they choose their own at first sign-in.
    const password = generateFirstTimePassword();

    try {
      // Send only the fields actually provided. Previously this copied the phone
      // into the email field for phone-only users, polluting email with a phone
      // number. register() already omits empty email/phone.
      const userData = {
        name: newUser.name,
        password,
        role: newUser.role,
        ...(newUser.email ? { email: newUser.email } : {}),
        ...(phone ? { phone } : {}),
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
      setInvite({ name: newUser.name, email: newUser.email.trim(), phone, password });
      setNewUser({ name: '', email: '', phone: '', role: 'SUPPORT' });
      setNewUserLabelIds([]);
    } catch (error: any) {
      // The API layer already returns a friendly message (e.g. phone/email
      // already registered), so surface it directly.
      setError(getErrorMessage(error, 'Could not create the account. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (user: User) => {
    const password = generateFirstTimePassword();
    setResetPasswordSaving(true);
    setError('');
    setSuccess('');
    setInvite(null);
    try {
      // Saving a password from here marks it temporary, so they choose their own at next sign-in.
      await usersApi.update(user.id, { password });
      setInvite({ name: user.name, email: user.email ?? '', phone: user.phone ?? '', password, kind: 'reset' });
      setResetPasswordUserId(null);
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

  // A test account keeps working, but follow-up assignment and counts skip it.
  const handleTestChange = async (targetUser: User) => {
    const nextIsTest = !targetUser.isTest;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await usersApi.setTest(targetUser.id, nextIsTest);
      const updated = { ...targetUser, isTest: nextIsTest };
      setUsers((prev) => prev.map((entry) => (entry.id === targetUser.id ? updated : entry)));
      if (selectedUser?.id === targetUser.id) setSelectedUser(updated);
      setSuccess(nextIsTest
        ? `${targetUser.name} is now a test account. Follow-up assignment and counts will ignore them.`
        : `${targetUser.name} is no longer a test account.`);
    } catch (error: any) {
      setError(getErrorMessage(error, 'Failed to update the account.'));
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

  const handleRoleChange = async (userId: string, newRoles: StaffRole[]) => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await usersApi.update(userId, { roles: newRoles });
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
    const matchesRole = roleFilter === 'ALL' || rolesOf(user).includes(roleFilter as StaffRole);
    const haystack = [user.name, user.email, user.phone].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = searchQuery.trim().length === 0 || haystack.includes(searchQuery.trim().toLowerCase());
    const matchesAlerts = !noAlertsOnly || hasNoAlerts(user);
    return matchesRole && matchesSearch && matchesAlerts;
  }), (user) => user.name);

  // At-a-glance head count beside the list title.
  const activeUsers = users.filter((u) => u.isActive !== false);
  const deactivatedCount = users.length - activeUsers.length;
  const headCount = [
    `${activeUsers.filter((u) => rolesOf(u).includes('ADMIN')).length} admins`,
    `${activeUsers.filter((u) => rolesOf(u).includes('SUPPORT')).length} supports`,
    deactivatedCount > 0 ? `${deactivatedCount} deactivated` : '',
  ].filter(Boolean).join(' · ');

  // WhatsApp-ready list of the supports shown under the "No alerts" filter,
  // with install videos, so an admin can paste it into a group chat.
  const noAlertsSupports = noAlertsOnly ? filteredUsers.filter((user) => rolesOf(user).includes('SUPPORT')) : [];
  const noAlertsMessage = [
    'The following supports do not have alerts set up on their phone yet, so they are missing reminders:',
    '',
    ...noAlertsSupports.map((user, i) => `${i + 1}. ${user.name}`),
    '',
    '*If you already have the app:* open it, go to *Profile → Reminders* and tap *Enable on this device*, then tap *Allow*.',
    '',
    "*If you haven't installed the app yet:* watch the video for your phone, then open the app, sign in and tap *Allow* when it asks about notifications.",
    'Android: https://youtu.be/VaQ8qL11bos',
    'iPhone: https://youtu.be/wyXzG3JqndY',
    '',
    'Open the app here: https://fof.tcnikorodu.org',
  ].join('\n');
  const copyNoAlertsMessage = async () => {
    try {
      await navigator.clipboard.writeText(noAlertsMessage);
      setNoAlertsCopied(true);
      setTimeout(() => setNoAlertsCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const renderStatusBadge = (user: User) => (
    <>
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${user.isActive === false ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>
        {user.isActive === false ? 'Inactive' : 'Active'}
      </span>
      {user.isTest && (
        <span title="Test account: works normally, but follow-up assignment and counts ignore it." className="ml-1 inline-flex rounded-full border border-dashed border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-500">Test</span>
      )}
    </>
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
        <button onClick={() => { setRoleChangeTarget(user); setRoleChangeValues(rolesOf(user)); setOpenMenuId(null); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50" role="menuitem">Roles</button>
        <button onClick={() => { void handleTestChange(user); setOpenMenuId(null); }} disabled={loading} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50" role="menuitem">{user.isTest ? 'Unmark as test' : 'Mark as test'}</button>
        <button onClick={() => { setResetPasswordUserId(user.id); setError(''); setOpenMenuId(null); }} className="w-full px-4 py-2.5 text-left text-sm text-orange-500 hover:bg-gray-50" role="menuitem">Reset password</button>
        <button onClick={() => { setFirstTimeTarget(user); setFirstTimePassword(false); setOpenMenuId(null); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50" role="menuitem">Reset first-time experience</button>
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
              onBlur={() => setNewUser((prev) => ({ ...prev, phone: toLocalNigerianPhone(prev.phone) ?? prev.phone }))}
              onPaste={(e) => { const pasted = e.clipboardData.getData('text'); const local = toLocalNigerianPhone(pasted); if (local) { e.preventDefault(); setNewUser((prev) => ({ ...prev, phone: local })); } }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-primary"
              placeholder="08012345678"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Role *</label>
            <AppSelect
              value={newUser.role}
              onChange={(value) => setNewUser((prev) => ({ ...prev, role: value as 'ADMIN' | 'SUPPORT' }))}
              options={[
                { value: 'SUPPORT', label: 'Support' },
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
            disabled={loading || !newUser.name || (!newUser.email && !newUser.phone)}
            className="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Creating...</span>) : 'Create User'}
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
        {invite && <InviteMessageCard details={invite} onDismiss={() => setInvite(null)} />}

        {showCreateForm && showUserList && !embedded && renderCreateForm()}
        {showCreateForm && !showUserList && renderCreateForm()}

        {showUserList && (
          <>
            <div className="mb-4 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-medium">Users ({filteredUsers.length})</h3>
                  <p className="text-xs text-gray-500">{headCount}</p>
                </div>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-primary sm:max-w-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
                <div className="min-w-0">
                  <AppSelect
                    value={roleFilter}
                    onChange={(value) => setRoleFilter(value as 'ALL' | User['role'])}
                    options={[
                      { value: 'ALL', label: 'All roles' },
                      { value: 'ADMIN', label: 'Admin' },
                      { value: 'SUPPORT', label: 'Support' },
                    ]}
                    placeholder="All roles"
                    compact
                  />
                </div>
                {noAlertsCount > 0 && (
                  <div className="min-w-0">
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
                {noAlertsSupports.length > 0 && (
                  <div className="col-span-2 flex min-w-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void copyNoAlertsMessage()}
                      className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      {noAlertsCopied ? 'Copied ✓' : 'Copy message'}
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(noAlertsMessage)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-[#25D366] px-3 text-sm font-semibold text-white hover:bg-[#1ebe5b]"
                    >
                      WhatsApp
                    </a>
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
                            {user.isActive !== false && notInstalledIds.has(user.id) && (
                              <span title="Has never opened the app from their Home Screen." className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">Not installed</span>
                            )}
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
                          <RoleBadges user={user} />
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
                        <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100">
                          <p className="flex-1 text-xs text-gray-600">Give {user.name.split(' ')[0]} a new first-time password?</p>
                          <button
                            onClick={() => { void handleResetPassword(user); }}
                            disabled={resetPasswordSaving}
                            className="text-xs px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
                          >
                            {resetPasswordSaving ? '...' : 'Reset'}
                          </button>
                          <button
                            onClick={() => setResetPasswordUserId(null)}
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
                              {user.isActive !== false && notInstalledIds.has(user.id) && (
                                <span title="Has never opened the app from their Home Screen." className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">Not installed</span>
                              )}
                              {hasNoAlerts(user) && (
                                <span title="No saved push subscription on any device." className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">No alerts</span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500">{user.email || user.phone}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <RoleBadges user={user} />
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
                                <span className="text-xs text-gray-600">New first-time password?</span>
                                <button
                                  onClick={() => { void handleResetPassword(user); }}
                                  disabled={resetPasswordSaving}
                                  className="text-xs px-2 py-1 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50"
                                >
                                  {resetPasswordSaving ? '...' : 'Reset'}
                                </button>
                                <button
                                  onClick={() => setResetPasswordUserId(null)}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={selectedUserDraft.email}
                    onChange={(e) => setSelectedUserDraft((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="Add an email"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={selectedUserDraft.phone}
                    onChange={(e) => setSelectedUserDraft((prev) => ({ ...prev, phone: e.target.value }))}
                    onPaste={(e) => { const local = toLocalNigerianPhone(e.clipboardData.getData('text')); if (local) { e.preventDefault(); setSelectedUserDraft((prev) => ({ ...prev, phone: local })); } }}
                    onBlur={() => setSelectedUserDraft((prev) => ({ ...prev, phone: toLocalNigerianPhone(prev.phone) ?? prev.phone }))}
                    placeholder="08012345678"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
                    <RoleBadges user={selectedUser} />
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
                            {savingLabels ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving...</span>) : 'Save tags'}
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
                  {savingProfile ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving...</span>) : 'Save Changes'}
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
        isOpen={!!firstTimeTarget}
        onClose={() => setFirstTimeTarget(null)}
        onConfirm={async () => {
          const target = firstTimeTarget;
          if (!target) return;
          setFirstTimeBusy(true);
          try {
            await practiceApi.resetFirstTime(target.id, firstTimePassword);
            setError('');
            setSuccess(`${target.name} will see the first-time experience on their next sign-in.`);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not reset.');
          } finally {
            setFirstTimeBusy(false);
            setFirstTimeTarget(null);
          }
        }}
        title={`Reset for ${firstTimeTarget?.name ?? 'this user'}?`}
        message="Next time they sign in it feels brand new: the welcome and page tours, role introductions and the Get the app prompt all show again. Schedule, hubs, groups, messages and attendance are not touched."
        type="warning"
        confirmText="Reset"
        confirmLoading={firstTimeBusy}
      >
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={firstTimePassword} onChange={(e) => setFirstTimePassword(e.target.checked)} />
          Also ask them to set a new password
        </label>
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={!!roleChangeTarget}
        onClose={() => setRoleChangeTarget(null)}
        onConfirm={() => { if (roleChangeTarget) void handleRoleChange(roleChangeTarget.id, roleChangeValues); }}
        title={`Roles for ${roleChangeTarget?.name ?? 'this user'}`}
        message="Someone with more than one role can switch between them from their profile menu, without logging out. They always sign in as the lowest one."
        type="warning"
        confirmText="Save roles"
        confirmDisabled={!roleChangeTarget || roleChangeValues.length === 0 || [...roleChangeValues].sort().join() === [...rolesOf(roleChangeTarget)].sort().join()}
      >
        <div className="space-y-2">
          {(['SUPPORT', 'ADMIN'] as StaffRole[]).map((role) => {
            const on = roleChangeValues.includes(role);
            const lockedSelf = role === 'ADMIN' && roleChangeTarget?.id === currentUser?.id;
            return (
              <label key={role} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium ${on ? 'border-orange-300 bg-orange-50' : 'border-gray-200'} ${lockedSelf ? 'opacity-70' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={lockedSelf}
                  onChange={() => setRoleChangeValues((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))}
                />
                {ROLE_LABEL[role]}{lockedSelf ? ' (you can’t remove your own)' : ''}
              </label>
            );
          })}
        </div>
      </ConfirmationModal>
    </>
  );
};

export default UserManagement;
