
import React, { useState } from 'react';
import { supabase, Profile } from '../lib/supabase';

interface AuthProps {
  onAuth: (profile: Profile) => void;
}

const Auth: React.FC<AuthProps> = ({ onAuth }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');

  const handleLogin = async () => {
    setError(''); setLoading(true);
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) { setError(authErr.message); setLoading(false); return; }
    if (!data.user) { setError('Login failed.'); setLoading(false); return; }

    const { data: profile, error: profErr } = await supabase
      .from('profiles').select('*').eq('id', data.user.id).single();
    if (profErr || !profile) { setError('Could not load profile.'); setLoading(false); return; }
    onAuth(profile as Profile);
    setLoading(false);
  };

  const handleSignup = async () => {
    setError('');
    if (!username.trim() || username.length < 3) { setError('Username must be at least 3 characters.'); return; }
    if (username.length > 20) { setError('Username must be 20 characters or less.'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { setError('Username can only contain letters, numbers, and underscores.'); return; }
    setLoading(true);

    const { data, error: authErr } = await supabase.auth.signUp({ email, password });
    if (authErr) { setError(authErr.message); setLoading(false); return; }
    if (!data.user) { setConfirmMsg('Check your email to confirm your account, then log in.'); setLoading(false); return; }

    // Create profile
    const { error: profErr } = await supabase.from('profiles').insert({ id: data.user.id, username: username.trim() });
    if (profErr) {
      setError(profErr.message.includes('unique') ? 'That username is already taken.' : profErr.message);
      setLoading(false); return;
    }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
    if (profile) { onAuth(profile as Profile); }
    else { setConfirmMsg('Check your email to confirm your account, then log in.'); }
    setLoading(false);
  };

  const submit = () => mode === 'login' ? handleLogin() : handleSignup();

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden" style={{ backgroundColor: '#04291e' }}>
      {/* Animated background grid */}
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
        backgroundSize: '80px 80px'
      }} />

      <div className="relative z-10 w-full max-w-md mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-white text-5xl font-black italic tracking-tighter leading-none drop-shadow-[0_0_40px_rgba(255,255,255,0.15)]">
            VERDANT STRIKE
          </h1>
          <p className="text-white/30 text-xs font-black tracking-[0.5em] uppercase mt-2">Battle Royale</p>
        </div>

        {/* Card */}
        <div className="bg-black/60 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-[0_32px_80px_rgba(0,0,0,0.6)] overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-white/8">
            <button
              onClick={() => { setMode('login'); setError(''); setConfirmMsg(''); }}
              className={`flex-1 py-4 font-black text-sm tracking-widest uppercase transition-all ${
                mode === 'login'
                  ? 'text-white bg-white/6 border-b-2 border-green-400'
                  : 'text-white/30 hover:text-white/60'
              }`}
            >Login</button>
            <button
              onClick={() => { setMode('signup'); setError(''); setConfirmMsg(''); }}
              className={`flex-1 py-4 font-black text-sm tracking-widest uppercase transition-all ${
                mode === 'signup'
                  ? 'text-white bg-white/6 border-b-2 border-green-400'
                  : 'text-white/30 hover:text-white/60'
              }`}
            >Sign Up</button>
          </div>

          <div className="p-8 flex flex-col gap-4">
            {confirmMsg ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">📧</div>
                <p className="text-white font-bold text-lg mb-2">Check your email</p>
                <p className="text-white/50 text-sm">{confirmMsg}</p>
                <button
                  onClick={() => { setConfirmMsg(''); setMode('login'); }}
                  className="mt-6 px-8 py-3 bg-green-500 text-white font-black rounded-2xl hover:bg-green-400 transition-all"
                >Go to Login</button>
              </div>
            ) : (
              <>
                {/* Email */}
                <div>
                  <label className="text-white/40 text-[10px] font-black tracking-widest uppercase block mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    placeholder="you@example.com"
                    className="w-full rounded-xl px-4 py-3 outline-none transition-all font-bold"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)', caretColor: '#ffffff' }}
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="text-white/40 text-[10px] font-black tracking-widest uppercase block mb-2">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    placeholder="••••••••"
                    className="w-full rounded-xl px-4 py-3 outline-none transition-all font-bold"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)', caretColor: '#ffffff' }}
                  />
                </div>

                {/* Username (signup only) */}
                {mode === 'signup' && (
                  <div>
                    <label className="text-white/40 text-[10px] font-black tracking-widest uppercase block mb-2">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && submit()}
                      placeholder="YourGamertag"
                      maxLength={20}
                      className="w-full rounded-xl px-4 py-3 outline-none transition-all font-bold"
                      style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)', caretColor: '#ffffff' }}
                    />
                    <p className="text-white/25 text-[10px] mt-1 ml-1">Letters, numbers, underscores only</p>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm font-bold">
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={submit}
                  disabled={loading || !email || !password || (mode === 'signup' && !username)}
                  className="w-full py-4 bg-green-500 text-white font-black text-lg rounded-2xl hover:bg-green-400 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_30px_rgba(34,197,94,0.3)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 mt-1"
                >
                  {loading
                    ? (mode === 'login' ? 'Logging in...' : 'Creating account...')
                    : (mode === 'login' ? 'ENTER THE ZONE' : 'CREATE ACCOUNT')}
                </button>
              </>
            )}
          </div>
        </div>

        <p className="text-white/15 text-center text-[10px] font-bold tracking-widest uppercase mt-4">
          Verdant Strike v0.1 Alpha
        </p>
      </div>
    </div>
  );
};

export default Auth;
