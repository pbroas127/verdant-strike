
import React, { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import Lobby from './components/Lobby';
import GameWorld from './components/GameWorld';
import Auth from './components/Auth';
import { supabase, Profile } from './lib/supabase';

export type View = 'lobby' | 'game';

const App: React.FC = () => {
  const [view, setView] = useState<View>('lobby');
  const [netConfig, setNetConfig] = useState<{
    code: string;
    isHost: boolean;
    peer: any;
    conn: any;
    worldData?: any;
    playerId?: string;
  } | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) {
        supabase.from('profiles').select('*').eq('id', s.user.id).single()
          .then(({ data }) => { if (data) setProfile(data as Profile); });
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) { setProfile(null); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLaunchGame = (code: string, isHost: boolean, peer: any, conn: any, worldData?: any, playerId?: string) => {
    setNetConfig({ code, isHost, peer, conn, worldData, playerId: playerId ?? (isHost ? 'p0' : 'p1') });
    setView('game');
  };

  const handleBackToLobby = () => {
    if (Array.isArray(netConfig?.conn)) netConfig!.conn.forEach((c: any) => c?.close());
    else if (netConfig?.conn) netConfig.conn.close();
    if (netConfig?.peer) netConfig.peer.destroy();
    setView('lobby');
    setNetConfig(null);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  if (authLoading) {
    return (
      <div className="w-screen h-screen bg-[#04291e] flex items-center justify-center">
        <div className="text-white/40 font-black tracking-widest uppercase text-sm animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!profile) {
    return <Auth onAuth={(p) => {
      setProfile(p);
      // Also grab the active session so the game has it for stats saving
      supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    }} />;
  }

  return (
    <div className="w-screen h-screen bg-[#064e3b] overflow-hidden">
      {view === 'lobby' ? (
        <Lobby onLaunch={handleLaunchGame} username={profile.username} onLogout={handleLogout} />
      ) : (
        <GameWorld
          lobbyCode={netConfig?.code || ''}
          isHost={netConfig?.isHost || false}
          peer={netConfig?.peer}
          conn={netConfig?.conn}
          initialWorldData={netConfig?.worldData}
          playerId={netConfig?.playerId}
          onExit={handleBackToLobby}
          session={session}
        />
      )}
    </div>
  );
};

export default App;
