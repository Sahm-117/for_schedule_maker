import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../services/api';

type ContactMethod = 'email' | 'phone';

const isValidNigerianPhone = (value: string) => /^0[7-9][0-1]\d{8}$/.test(value);

const Signup: React.FC = () => {
  const [contactMethod, setContactMethod] = useState<ContactMethod>('email');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleMethodSwitch = (method: ContactMethod) => {
    setContactMethod(method);
    setContact('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!contact.trim()) {
      setError(`Please enter your ${contactMethod === 'email' ? 'email address' : 'phone number'}.`);
      return;
    }
    if (contactMethod === 'phone' && !isValidNigerianPhone(contact.trim())) {
      setError('Enter a valid Nigerian phone number (e.g. 08012345678).');
      return;
    }
    setLoading(true);
    try {
      const payload =
        contactMethod === 'email'
          ? { name: name.trim(), email: contact.trim().toLowerCase(), password, role: 'SUPPORT' as const }
          : { name: name.trim(), phone: contact.trim(), password, role: 'SUPPORT' as const };
      await authApi.register(payload);
      setDone(true);
    } catch (err: any) {
      // API returns a friendly message (e.g. phone/email already registered).
      setError(err.message || 'Sign up didn’t go through. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img src="/logo-mark.png" alt="FOF Ops" className="h-16 w-16 rounded-xl border border-gray-200 p-2 bg-white object-contain" />
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold text-gray-900">FOF IKD Ops</h2>
        <p className="mt-1 text-center text-sm text-gray-500">Create your Support account</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-xl sm:px-10 border border-gray-100">
          {done ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Account created!</h3>
              <p className="text-sm text-gray-500">You can now log in with your {contactMethod === 'email' ? 'email' : 'phone number'} and password.</p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark"
              >
                Go to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Contact method toggle */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Sign up with</p>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleMethodSwitch('email')}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      contactMethod === 'email'
                        ? 'bg-primary text-white'
                        : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMethodSwitch('phone')}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      contactMethod === 'phone'
                        ? 'bg-primary text-white'
                        : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    Phone Number
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              {contactMethod === 'email' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    value={contact}
                    onChange={(e) => setContact(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="08100000000"
                    maxLength={11}
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${
                      contact.length > 0 && !isValidNigerianPhone(contact)
                        ? 'border-red-400 bg-red-50'
                        : 'border-gray-300'
                    }`}
                  />
                  {contact.length > 0 && !isValidNigerianPhone(contact) ? (
                    <p className="mt-1 text-xs text-red-500">Must be 11 digits starting with 0 (e.g. 08012345678)</p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-400">Use this number to log in — don't forget it.</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {showPassword
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      }
                    </svg>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary-dark focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>

              <p className="text-center text-xs text-gray-400">
                Already have an account?{' '}
                <Link to="/login" className="text-primary hover:underline">Log in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Signup;
