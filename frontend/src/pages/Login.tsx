import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, Link } from 'react-router-dom';

const isValidNigerianPhone = (value: string) => /^0[7-9][0-1]\d{8}$/.test(value);
const looksLikePhone = (value: string) => /^[0-9+]/.test(value) && !value.includes('@');

const Icon: React.FC<{ d: string; className?: string }> = ({ d, className = 'h-[18px] w-[18px]' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d={d} />
  </svg>
);

const PATHS = {
  mail: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm0 1 8 6 8-6',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 15h2',
  user: 'M20 21a8 8 0 1 0-16 0m8-11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z',
  eye: 'M2.5 12C3.8 7.9 7.5 5 12 5s8.2 2.9 9.5 7c-1.3 4.1-5 7-9.5 7s-8.2-2.9-9.5-7Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c4.5 0 8.2 2.9 9.5 7a10 10 0 0 1-2.2 3.6M6.4 6.4A10 10 0 0 0 2.5 12c1.3 4.1 5 7 9.5 7a9.8 9.8 0 0 0 4.2-.9',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  alert: 'M12 8v5m0 3h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  calendar: 'M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  people: 'M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 7 18.5V20m5-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 9v-1a3 3 0 0 0-2.2-2.9M16.5 5.2a3 3 0 0 1 0 5.6',
  bell: 'M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0m6 0H9',
};

const Login: React.FC = () => {
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const trimmed = emailOrPhone.trim();
  const identifierIcon = trimmed.includes('@') ? PATHS.mail : looksLikePhone(trimmed) ? PATHS.phone : PATHS.user;
  const phoneHint = looksLikePhone(trimmed) && trimmed.length >= 4 && !isValidNigerianPhone(trimmed)
    ? 'Use the 11-digit format, e.g. 08012345678'
    : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (looksLikePhone(trimmed) && !isValidNigerianPhone(trimmed)) {
      setError('Enter a valid Nigerian phone number (e.g. 08012345678).');
      return;
    }

    setLoading(true);

    try {
      await login(trimmed.toLowerCase(), password);
      const cachedUser = JSON.parse(localStorage.getItem('user') || 'null');
      navigate(cachedUser?.role === 'SUPPORT' ? '/support' : cachedUser?.role === 'PARTICIPANT' ? '/me' : '/dashboard');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Login failed';

      if (errorMessage.includes('User not found') || errorMessage.includes('Invalid credentials') || errorMessage.includes('Unauthorized')) {
        // A failed login is usually a typo, or a stale cached app that can't find
        // the account, so cover both.
        setError("We couldn't sign you in. Double-check your email (or phone number) and password. If it still fails, tap “Refresh” at the top to update the app, or reinstall it, then sign in with your email.");
      } else if (errorMessage.includes('Account deactivated')) {
        setError('This account has been deactivated. Please contact an administrator.');
      } else if (errorMessage.includes('does not exist')) {
        setError('Account not found. Please contact an administrator to create your account.');
      } else if (errorMessage.includes('Login service unavailable') || errorMessage.includes('network') || errorMessage.includes('fetch')) {
        setError('Connection error. Please check your internet connection and try again.');
      } else {
        setError('Login failed. Please try again or contact support if the problem persists.');
      }
    } finally {
      setLoading(false);
    }
  };

  const checkCaps = (event: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(event.getModifierState?.('CapsLock') ?? false);
  };

  const fieldShell = 'group relative flex items-center rounded-2xl border border-[#ece6e0] bg-white/80 transition focus-within:border-primary focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(255,145,77,0.14)]';
  const inputCls = 'peer h-[54px] w-full rounded-2xl border-0 bg-transparent pl-12 text-[15px] text-gray-900 shadow-none placeholder:text-gray-400 focus:border-0 focus:shadow-none focus:outline-none focus:ring-0';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fbf7f3]">
      {/* The update prompt is mounted once, app-wide, in App.tsx — it's
          reachable here too since it renders outside the router's Routes. */}

      {/* Soft light behind everything */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="fof-orb absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[#ffb27d]/40 blur-3xl" />
        <div className="fof-orb-slow absolute -bottom-40 right-[-120px] h-[480px] w-[480px] rounded-full bg-[#ff914d]/25 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(31,26,23,0.05)_1px,transparent_0)] [background-size:22px_22px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full items-stretch gap-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10">

          {/* Brand story — desktop */}
          <aside className="fof-rise relative hidden overflow-hidden rounded-[32px] bg-[#1f1a17] p-10 text-white shadow-[0_30px_80px_-30px_rgba(31,26,23,0.6)] lg:flex lg:flex-col">
            <div aria-hidden="true" className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#ff914d]/35 blur-3xl" />
            <div aria-hidden="true" className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[#ffb27d]/15 blur-3xl" />

            <Link to="/" className="relative inline-flex w-fit rounded-2xl bg-white p-2.5 shadow-lg">
              <img src="/logo-full.png" alt="The Covenant Nation | Ikorodu" className="h-11 w-auto object-contain" />
            </Link>

            <div className="relative mt-auto pt-16">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#ffb27d]">Foundation of Faith</p>
              <h1 className="mt-4 text-[40px] font-extrabold leading-[1.08] tracking-tight">
                Everything FOF runs on,
                <span className="block bg-gradient-to-r from-[#ffb27d] to-[#ff914d] bg-clip-text text-transparent">in one place.</span>
              </h1>

              <ul className="mt-9 space-y-4">
                {[
                  { icon: PATHS.calendar, title: 'Your week at a glance', body: 'The schedule, your duties and what is due today.' },
                  { icon: PATHS.people, title: 'Groups that stay on track', body: 'Attendance, meetings, faith projects and follow-ups.' },
                  { icon: PATHS.bell, title: 'Never miss an update', body: 'Announcements and reminders the moment they matter.' },
                ].map((item) => (
                  <li key={item.title} className="flex gap-3.5">
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white/[0.08] text-[#ffb27d] ring-1 ring-white/10">
                      <Icon d={item.icon} />
                    </span>
                    <span>
                      <span className="block text-[15px] font-semibold">{item.title}</span>
                      <span className="block text-sm text-white/60">{item.body}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-12 text-xs text-white/40">The Covenant Nation · Ikorodu</p>
            </div>
          </aside>

          {/* Sign-in */}
          <main className="fof-rise flex flex-col justify-center [animation-delay:80ms]">
            {/* Brand — mobile */}
            <div className="mb-7 flex flex-col items-center text-center lg:hidden">
              <Link to="/" className="rounded-2xl bg-white p-2.5 shadow-[0_10px_30px_-12px_rgba(31,26,23,0.25)]">
                <img src="/logo-full.png" alt="The Covenant Nation | Ikorodu" className="h-11 w-auto object-contain" />
              </Link>
              <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#c2410c]">Foundation of Faith</p>
            </div>

            <div className="mx-auto w-full max-w-[440px] rounded-[28px] border border-white/70 bg-white/85 p-7 shadow-[0_24px_70px_-28px_rgba(31,26,23,0.35)] backdrop-blur-xl sm:p-9">
              <div>
                <h2 className="text-[28px] font-extrabold tracking-tight text-gray-900">Welcome back</h2>
                <p className="mt-1.5 text-[15px] text-gray-500">Sign in to FOF Ops</p>
              </div>

              <form className="mt-8 space-y-4" onSubmit={handleSubmit} noValidate>
                <div>
                  <label htmlFor="emailOrPhone" className="mb-1.5 block text-[13px] font-semibold text-gray-700">
                    Email or phone number
                  </label>
                  <div className={fieldShell}>
                    <span className="pointer-events-none absolute left-4 z-10 text-gray-400 transition group-focus-within:text-primary">
                      <Icon d={identifierIcon} />
                    </span>
                    <input
                      id="emailOrPhone"
                      name="emailOrPhone"
                      type="text"
                      inputMode={looksLikePhone(trimmed) ? 'tel' : 'email'}
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      className={`${inputCls} pr-4`}
                      placeholder="you@example.com or 0801…"
                      value={emailOrPhone}
                      onChange={(e) => setEmailOrPhone(e.target.value)}
                    />
                  </div>
                  {phoneHint && <p className="mt-1.5 text-xs text-amber-700">{phoneHint}</p>}
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-[13px] font-semibold text-gray-700">
                    Password
                  </label>
                  <div className={fieldShell}>
                    <span className="pointer-events-none absolute left-4 z-10 text-gray-400 transition group-focus-within:text-primary">
                      <Icon d={PATHS.lock} />
                    </span>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      className={`${inputCls} pr-14`}
                      placeholder="Your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={checkCaps}
                      onKeyDown={checkCaps}
                    />
                    {/* Always visible and always above the input, even while typing. */}
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute right-2 z-20 grid h-10 w-10 place-items-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                    >
                      <Icon d={showPassword ? PATHS.eyeOff : PATHS.eye} />
                    </button>
                  </div>
                  {capsLock && <p className="mt-1.5 text-xs font-medium text-amber-700">Caps Lock is on</p>}
                </div>

                {error && (
                  <div role="alert" className="flex gap-2.5 rounded-2xl bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-700">
                    <span className="mt-0.5 flex-none"><Icon d={PATHS.alert} className="h-4 w-4" /></span>
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !emailOrPhone || !password}
                  className="group/btn relative mt-2 flex h-[54px] w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-[#ff914d] to-[#ff7a2f] text-[15px] font-bold text-white shadow-[0_14px_30px_-12px_rgba(255,122,47,0.7)] transition hover:shadow-[0_18px_36px_-12px_rgba(255,122,47,0.85)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <span className="transition-transform group-hover/btn:translate-x-0.5">
                        <Icon d={PATHS.arrow} className="h-[18px] w-[18px]" />
                      </span>
                    </>
                  )}
                </button>
              </form>
            </div>

            <p className="mt-6 text-center text-xs text-gray-400 lg:hidden">The Covenant Nation · Ikorodu</p>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Login;
