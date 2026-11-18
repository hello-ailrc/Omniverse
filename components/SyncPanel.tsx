'use client';
import { useEffect, useState } from 'react';
import { signIn, signOut, signUp, syncNow, useSyncStatus, type SyncStatus } from '@/lib/sync';
import { Close, Cloud } from './icons';

function label(s: SyncStatus): string {
  if (s.state === 'off') return 'Sync off';
  if (!s.ready) return 'Sync';
  switch (s.state) {
    case 'signed-out':
      return 'Sign in';
    case 'syncing':
      return 'Syncing';
    case 'synced':
      return s.pending ? 'Waiting' : 'Synced';
    case 'offline':
      return 'Offline';
    default:
      return 'Sync problem';
  }
}

function ago(t?: number): string {
  if (!t) return 'not yet';
  const secs = Math.round((Date.now() - t) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// The sync button in the library header, and the panel it opens.
export default function SyncPanel() {
  const s = useSyncStatus();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [, tick] = useState(0);

  // Keep "2 min ago" current while the panel is open.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => tick((n) => n + 1), 20000);
    return () => clearInterval(t);
  }, [open]);

  const go = async (kind: 'in' | 'up') => {
    if (!email.trim() || !password) {
      setNote('Enter your email and a password.');
      return;
    }
    setBusy(true);
    setNote('');
    if (kind === 'in') {
      const err = await signIn(email.trim(), password);
      if (err) setNote(err);
      else setPassword('');
    } else {
      const res = await signUp(email.trim(), password);
      if (res.error) setNote(res.error);
      else if (res.confirm) setNote('Account created. Open the confirmation email Supabase sent you, tap the link, then sign in here.');
      else setPassword('');
    }
    setBusy(false);
  };

  return (
    <>
      <button
        className={'sync-btn' + (s.state === 'error' ? ' bad' : '')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Cloud />
        {label(s)}
      </button>

      {open && (
        <div className="sync-sheet" role="dialog" aria-label="Sync">
          <div className="row">
            <strong>Sync across devices</strong>
            <button className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
              <Close />
            </button>
          </div>

          {s.state === 'off' && (
            <p className="muted" style={{ margin: 0 }}>
              Sync is not set up on this site yet. Add the Supabase address and key in Vercel, then redeploy.
            </p>
          )}

          {s.state !== 'off' && s.ready && !s.email && (
            <form
              className="sync-form"
              onSubmit={(e) => {
                e.preventDefault();
                void go('in');
              }}
            >
              <label htmlFor="sync-email">Email</label>
              <input
                id="sync-email"
                className="field"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label htmlFor="sync-pass">Password</label>
              <input
                id="sync-pass"
                className="field"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="add-row">
                <button className="btn primary" type="submit" disabled={busy}>
                  Sign in
                </button>
                <button className="btn" type="button" disabled={busy} onClick={() => void go('up')}>
                  Create account
                </button>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Use the same email and password on your iPad, phone and laptop. Articles already on this device are added
                to your account when you sign in.
              </p>
            </form>
          )}

          {s.email && (
            <>
              <p style={{ margin: 0 }}>
                Signed in as <strong>{s.email}</strong>
              </p>
              <p className={s.state === 'error' ? 'error' : 'muted'} style={{ margin: 0 }} role="status">
                {s.state === 'syncing' && 'Syncing now.'}
                {s.state === 'synced' && `Last synced ${ago(s.lastSync)}.`}
                {s.state === 'offline' && 'Offline. Changes are kept on this device and sync when you are back online.'}
                {s.state === 'error' && (s.message ?? 'Sync failed.')}
                {s.pending > 0 && s.state !== 'syncing' && ` ${s.pending} ${s.pending === 1 ? 'change' : 'changes'} waiting.`}
              </p>
              <div className="add-row">
                <button className="btn primary" onClick={() => void syncNow()} disabled={s.state === 'syncing'}>
                  Sync now
                </button>
                <button className="btn" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            </>
          )}

          {note && (
            <p className="muted" role="alert" style={{ margin: 0 }}>
              {note}
            </p>
          )}
        </div>
      )}
    </>
  );
}
