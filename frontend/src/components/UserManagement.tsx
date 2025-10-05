import React, { useState, useEffect } from 'react';
import { usersApi, authApi } from '../services/api';
import type { User } from '../types';

interface UserManagementProps {
  isOpen: boolean;
  onClose: () => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ isOpen, onClose }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showPasswordInForm, setShowPasswordInForm] = useState(false);
  const [showPasswordInDetails, setShowPasswordInDetails] = useState(false);

  // Add user form state
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'SUPPORT' as 'ADMIN' | 'SUPPORT',
  });

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await usersApi.getAll();
      setUsers(response.users);
    } catch (error) {
      console.error('Failed to load users:', error);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || (!newUser.email && !newUser.phone) || !newUser.password) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Use phone as email if email is not provided
      const userData = {
        ...newUser,
        email: newUser.email || newUser.phone
      };
      await authApi.register(userData);
      setSuccess('User created successfully');
      setNewUser({ name: '', email: '', phone: '', password: '', role: 'SUPPORT' });
      setShowAddUser(false);
      setShowPasswordInForm(false);
      loadUsers();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to create user';
      if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
        setError('A user with this email/phone already exists. Please use a different email or phone number.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to delete user "${userName}"?`)) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await usersApi.delete(userId);
      setSuccess('User deleted successfully');
      loadUsers();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'ADMIN' | 'SUPPORT') => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await usersApi.update(userId, { role: newRole });
      setSuccess('User role updated successfully');
      loadUsers();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to update user role');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">User Management</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 text-red-600 text-sm bg-red-50 p-3 rounded">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 text-green-600 text-sm bg-green-50 p-3 rounded">
                {success}
              </div>
            )}

            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Users ({users.length})</h3>
              <button
                onClick={() => setShowAddUser(!showAddUser)}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
              >
                {showAddUser ? 'Cancel' : 'Add User'}
              </button>
            </div>

            {showAddUser && (
              <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <h4 className="text-md font-medium mb-3">Add New User</h4>
                <form onSubmit={handleAddUser} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Name *
                      </label>
                      <input
                        type="text"
                        value={newUser.name}
                        onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                        placeholder="user@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={newUser.phone}
                        onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                        placeholder="+1234567890"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Password *
                      </label>
                      <div className="relative">
                        <input
                          type={showPasswordInForm ? 'text' : 'password'}
                          value={newUser.password}
                          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswordInForm(!showPasswordInForm)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        >
                          {showPasswordInForm ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Role *
                      </label>
                      <select
                        value={newUser.role}
                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'ADMIN' | 'SUPPORT' })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                      >
                        <option value="SUPPORT">Support</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    * Required fields. Either email or phone number must be provided.
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={loading || !newUser.name || (!newUser.email && !newUser.phone) || !newUser.password}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      {loading ? 'Creating...' : 'Create User'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {loading && !showAddUser ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading users...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{user.name}</div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value as 'ADMIN' | 'SUPPORT')}
                            className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-primary focus:border-primary"
                            disabled={loading}
                          >
                            <option value="SUPPORT">Support</option>
                            <option value="ADMIN">Admin</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                          <button
                            onClick={() => setSelectedUser(user)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View Details
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id, user.name)}
                            disabled={loading}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {users.length === 0 && !loading && (
                  <div className="text-center py-8 text-gray-500">
                    No users found
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-4 border-t mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-60">
          <div className="bg-white rounded-lg max-w-lg w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold">User Details</h3>
                <button
                  onClick={() => {
                    setSelectedUser(null);
                    setShowPasswordInDetails(false);
                  }}
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
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
                    {selectedUser.name}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email/Phone</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
                    {selectedUser.email}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      selectedUser.role === 'ADMIN'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {selectedUser.role}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User ID</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono">
                    {selectedUser.id}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Created Date</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
                    {selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString() : 'Not available'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <div className="flex">
                    <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-l-md">
                      ••••••••
                    </div>
                    <button
                      onClick={() => setShowPasswordInDetails(!showPasswordInDetails)}
                      className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-200 rounded-r-md hover:bg-gray-200 text-gray-600"
                      title="Passwords are encrypted and cannot be viewed"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Passwords are encrypted and cannot be displayed for security reasons.</p>
                </div>
              </div>

              <div className="flex justify-end pt-6 border-t mt-6 space-x-3">
                <button
                  onClick={() => {
                    setSelectedUser(null);
                    setShowPasswordInDetails(false);
                  }}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UserManagement;