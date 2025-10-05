import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
// Force deployment update

const Login: React.FC = () => {
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(emailOrPhone, password);
      navigate('/');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Login failed';

      // Provide better error messages
      if (errorMessage.includes('User not found') || errorMessage.includes('Invalid credentials') || errorMessage.includes('Unauthorized')) {
        setError('Invalid login credentials. Please check your email/phone and password and try again.');
      } else if (errorMessage.includes('does not exist')) {
        setError('Account not found. Please contact an administrator to create your account.');
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        setError('Connection error. Please check your internet connection and try again.');
      } else {
        setError('Login failed. Please try again or contact support if the problem persists.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img
              src="/logo-covenant-nation.svg"
              alt="The Covenant Nation Logo"
              className="h-16 w-auto"
              onError={(e) => {
                // Fallback if logo doesn't load
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.parentElement?.querySelector('.logo-fallback');
                if (fallback) fallback.style.display = 'block';
              }}
            />
            <div className="logo-fallback" style={{ display: 'none' }}>
              <div className="h-16 w-16 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">FOF</span>
              </div>
            </div>
          </div>

          <h2 className="text-3xl font-extrabold text-gray-900">
            FOF Schedule Editor
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Foundation of Faith Programme Schedule Management
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="emailOrPhone" className="block text-sm font-medium text-gray-700 mb-1">
                Email or Phone Number
              </label>
              <input
                id="emailOrPhone"
                name="emailOrPhone"
                type="text"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm"
                placeholder="Enter your email or phone number"
                value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="appearance-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
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
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md border border-red-200">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading || !emailOrPhone || !password}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Signing in...
                </div>
              ) : (
                'Sign in'
              )}
            </button>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-500">
              Don't have an account? Contact your administrator to create one.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;