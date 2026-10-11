import React, { useCallback, useEffect, useState } from 'react';
import { telegramApi, type TelegramStatus } from '../services/api';
import { usePolling } from '../hooks/usePolling';
import { Toggle } from './corporatePrayers/ui';
import { useToast } from './Toast';
import Spinner from './Spinner';

// Telegram copy of the app's notifications, for everyone (staff and participants). It is a backup for people whose phone did not
// show the push, so it says the same thing and tells them to open the app (a link would open a browser, not the installed app).

const BOT_USERNAME = 'FOFOpsBot';
const CODE_MINUTES = 15;

const TelegramCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const toast = useToast();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openUrl, setOpenUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await telegramApi.status());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // While waiting for the person to press Start in Telegram, check every few seconds until it shows as connected.
  const waiting = openUrl !== null && !status?.connected;
  usePolling(load, waiting ? 4000 : null);
  useEffect(() => { if (status?.connected) setOpenUrl(null); }, [status?.connected]);
  // The code lasts 15 minutes: after that stop waiting and offer a fresh one.
  useEffect(() => {
    if (!openUrl) return undefined;
    const timer = window.setTimeout(() => setOpenUrl(null), CODE_MINUTES * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [openUrl]);

  const connect = async () => {
    setBusy(true);
    try {
      const code = await telegramApi.connectCode();
      const url = `https://t.me/${BOT_USERNAME}?start=${code}`;
      setOpenUrl(url);
    } catch {
      toast({ message: 'Could not start the Telegram connection. Please try again.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const setEnabled = async (enabled: boolean) => {
    setBusy(true);
    try {
      await telegramApi.setEnabled(enabled);
      await load();
    } catch {
      toast({ message: 'Could not change that. Please try again.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await telegramApi.disconnect();
      setOpenUrl(null);
      await load();
    } catch {
      toast({ message: 'Could not disconnect. Please try again.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (status && !status.eligible) return null;

  return (
    <section className={`rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)] ${className}`} data-wt="telegram-card">
      <h3 className="text-base font-bold text-gray-900">Telegram</h3>
      {!status && !failed && <div className="mt-3 flex items-center gap-2 text-xs text-gray-500"><Spinner />Loading…</div>}
      {failed && !status && <p className="mt-2 text-xs text-gray-500">Telegram is not available right now.</p>}

      {status && !status.connected && (
        <div className="mt-2">
          <p className="text-xs text-gray-500">Get the same notifications on Telegram too, in case your phone does not show them. Open the FOF Ops app to respond.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {openUrl ? (
              <a href={openUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">Open Telegram</a>
            ) : (
              <button type="button" onClick={() => void connect()} disabled={busy} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                {busy ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Please wait…</span> : 'Connect Telegram'}
              </button>
            )}
            {openUrl && <button type="button" onClick={() => void connect()} disabled={busy} className="text-xs font-semibold text-gray-500 underline disabled:opacity-60">Get a new link</button>}
          </div>
          {openUrl && <p className="mt-2 text-xs text-gray-500">In Telegram, press <span className="font-semibold">Start</span>, then come back here. This link works for {CODE_MINUTES} minutes.</p>}
        </div>
      )}

      {status?.connected && (
        <div className="mt-3 space-y-3">
          <Toggle
            id="telegram-enabled"
            checked={status.enabled}
            onChange={(next) => void setEnabled(next)}
            disabled={busy || status.blocked}
            label={status.enabled ? 'Telegram is on' : 'Telegram is paused'}
            hint={status.blocked
              ? 'You blocked the bot. Press Start in the FOF Ops chat on Telegram to get messages again.'
              : 'You get a copy of your notifications on Telegram.'}
          />
          <button type="button" onClick={() => void disconnect()} disabled={busy} className="text-xs font-semibold text-gray-500 underline disabled:opacity-60">Disconnect Telegram</button>
        </div>
      )}
    </section>
  );
};

export default TelegramCard;
