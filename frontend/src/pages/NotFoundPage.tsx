import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// Any address that isn't a real page lands here, says so, then sends the
// visitor back to the FOF page ("/") on its own.
const REDIRECT_AFTER_MS = 4000;

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => navigate('/', { replace: true }), REDIRECT_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0b0b0c] px-6 text-center text-white">
      <p className="text-[80px] font-extrabold leading-none text-[#f97316] sm:text-[112px]">404</p>
      <h1 className="mt-4 text-[22px] font-bold sm:text-[28px]">This page does not exist</h1>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-white/60">
        The link may be old or mistyped. Taking you back to Foundation of Faith in a few seconds.
      </p>
      <Link to="/" replace className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-[#f97316] px-6 text-[14px] font-semibold text-white">
        Go to FOF now
      </Link>
    </main>
  );
};

export default NotFoundPage;
