'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight, ShieldCheck} from 'lucide-react';
import {api, browserDb} from '@/lib/platform-client';

export default function AdminLogin() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const {error} = await browserDb().auth.signInWithPassword({
        email: String(form.get('email') || '').trim(),
        password: String(form.get('password') || ''),
      });
      if (error) throw error;
      const {user} = await api('me');
      if (user.role !== 'super_admin') {
        await browserDb().auth.signOut({scope: 'local'});
        throw new Error('This account does not have administrator access.');
      }
      router.replace('/admin');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="pp-auth-layout">
    <div className="pp-auth-image">
      <div className="pp-kicker">PICPRO ADMINISTRATION</div>
      <h2>Your platform.<br/><em>The complete picture.</em></h2>
      <p>Manage photographers, events, and platform settings.</p>
    </div>
    <div className="pp-auth-form">
      <ShieldCheck size={35}/>
      <div className="pp-kicker">SUPER ADMIN</div>
      <h1>Admin login.</h1>
      <p>Sign in with your administrator account.</p>
      <form onSubmit={submit}>
        <label>Email address<input name="email" type="email" autoComplete="username" required/></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={128}/></label>
        <button className="pp-button" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in as admin'} <ArrowRight size={17}/>
        </button>
      </form>
      {message && <p className="pp-message" role="alert">{message}</p>}
    </div>
  </div>;
}
