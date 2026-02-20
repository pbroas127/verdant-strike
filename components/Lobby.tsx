
import React, { useState, useEffect, useRef } from 'react';
import { Crate, EnvObject, Item, WORLD_SIZE } from '../types';

declare const Peer: any;

interface LobbyProps {
  onLaunch: (code: string, isHost: boolean, peer: any, conn: any, worldData?: any) => void;
}

const Lobby: React.FC<LobbyProps> = ({ onLaunch }) => {
  const [menuState, setMenuState] = useState<'main' | 'create' | 'join' | 'waiting'>('main');
  const [lobbyCode, setLobbyCode] = useState('');
  const [enteredCode, setEnteredCode] = useState('');
  const [playerCount, setPlayerCount] = useState(1);
  const [isHost, setIsHost] = useState(false);
  const [status, setStatus] = useState('');
  
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isLaunchingRef = useRef(false);

  const cleanupPeer = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (connRef.current) {
      connRef.current.close();
      connRef.current = null;
    }
  };

  const generateWorldData = () => {
    const crates: Crate[] = [];
    const envObjects: EnvObject[] = [];
    for(let i=0; i<25; i++) {
      crates.push({ 
        id: `crate-${i}`, 
        x: Math.random() * (WORLD_SIZE - 400) + 200, 
        y: Math.random() * (WORLD_SIZE - 400) + 200, 
        health: 3, maxHealth: 3 
      });
    }
    const wallTypes = ['stone_wall', 'wood_wall', 'metal_wall'];
    for(let i=0; i<45; i++) {
      const typeRoll = Math.random();
      let type: any = 'tree';
      if (typeRoll < 0.25) type = wallTypes[Math.floor(Math.random() * wallTypes.length)];
      else if (typeRoll < 0.5) type = 'bush';
      envObjects.push({ 
        id: `env-${i}`, 
        x: Math.random() * WORLD_SIZE, 
        y: Math.random() * WORLD_SIZE, 
        type, 
        size: type.includes('wall') ? 30 : 40 + Math.random() * 30, 
        leafTimer: 300 
      });
    }
    return { crates, envObjects, items: [] as Item[] };
  };

  const initHost = () => {
    cleanupPeer();
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    setLobbyCode(code);
    setIsHost(true);
    setStatus('Connecting to signaling server...');

    const peer = new Peer(`verdant-strike-${code}`);
    peerRef.current = peer;

    peer.on('open', () => {
      setStatus('Waiting for opponent...');
    });

    peer.on('connection', (conn: any) => {
      connRef.current = conn;
      setPlayerCount(2);
      setStatus('Opponent joined!');
      
      conn.on('close', () => {
        setPlayerCount(1);
        setStatus('Opponent left.');
      });
    });

    peer.on('error', (err: any) => {
      console.error(err);
      setStatus('Connection Error.');
    });
  };

  const initJoin = (code: string) => {
    cleanupPeer();
    setIsHost(false);
    setStatus('Joining...');

    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', () => {
      const conn = peer.connect(`verdant-strike-${code}`);
      connRef.current = conn;

      conn.on('open', () => {
        setMenuState('waiting');
        setPlayerCount(2);
        setStatus('Connected to host!');
      });

      conn.on('data', (data: any) => {
        if (data.type === 'START_GAME') {
          isLaunchingRef.current = true;
          onLaunch(code, false, peer, conn, data.worldData);
        }
      });

      conn.on('close', () => {
        setMenuState('main');
        setStatus('Host disconnected.');
      });
    });

    peer.on('error', (err: any) => {
      console.error(err);
      setStatus('Lobby not found.');
    });
  };

  const startGame = () => {
    if (isHost && connRef.current) {
      const worldData = generateWorldData();
      connRef.current.send({ type: 'START_GAME', worldData });
      isLaunchingRef.current = true;
      onLaunch(lobbyCode, true, peerRef.current, connRef.current, worldData);
    }
  };

  useEffect(() => {
    if (menuState === 'create') initHost();
    return () => {
      if (!isLaunchingRef.current) cleanupPeer();
    };
  }, [menuState === 'create']);

  // Background scene drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      ctx.fillStyle = '#064e3b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= canvas.width; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
      for (let y = 0; y <= canvas.height; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
      const drawTree = (x: number, y: number) => {
        ctx.fillStyle = '#451a03'; ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#166534'; ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.fill();
      };
      drawTree(centerX - 200, centerY - 150);
      drawTree(centerX + 250, centerY + 180);
      ctx.save(); ctx.translate(centerX, centerY); ctx.fillStyle = '#ffe0bd'; ctx.strokeStyle = '#d4b38e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(12, -15, 7, 0, Math.PI*2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(12, 15, 7, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(10, -6, 2.5, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(10, 6, 2.5, 0, Math.PI*2); ctx.fill(); ctx.restore();
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, []);

  return (
    <div className="relative w-full h-full flex items-center justify-center font-sans overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      
      <div className="absolute top-12 left-12 flex flex-col pointer-events-auto">
        <h1 className="text-white text-7xl font-black italic tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">VERDANT STRIKE</h1>
        <div className="h-1 w-48 bg-white/20 mt-2"></div>
        
        <div className="mt-12 flex flex-col gap-4 items-start">
          {menuState === 'main' && (
            <>
              <button onClick={() => setMenuState('create')} className="px-10 py-4 bg-white text-black font-black text-xl rounded-xl hover:bg-blue-400 hover:text-white transition-all shadow-2xl">CREATE GAME</button>
              <button onClick={() => setMenuState('join')} className="px-10 py-4 bg-black/40 text-white font-black text-xl rounded-xl border border-white/10 hover:bg-white hover:text-black transition-all shadow-2xl backdrop-blur-md">JOIN GAME</button>
              <button className="px-10 py-4 bg-black/40 text-white/40 font-black text-xl rounded-xl border border-white/10 opacity-50 cursor-not-allowed">SETTINGS</button>
            </>
          )}

          {menuState === 'create' && (
            <div className="flex flex-col gap-6 animate-in slide-in-from-left duration-300">
              <div className="bg-black/60 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl">
                <span className="text-white/40 text-xs font-black tracking-widest uppercase">Lobby Code</span>
                <div className="text-white text-6xl font-black tracking-widest mt-1 font-mono">{lobbyCode}</div>
                <div className="mt-6 flex items-center gap-3">
                  <div className={`w-3 h-3 ${playerCount >= 2 ? 'bg-green-500' : 'bg-yellow-500'} rounded-full animate-pulse`}></div>
                  <span className="text-white/80 font-bold">Players: {playerCount} / 2</span>
                  <div className="text-white/40 text-sm ml-auto">{status}</div>
                </div>
              </div>
              
              {playerCount >= 2 ? (
                <button onClick={startGame} className="px-12 py-5 bg-green-500 text-white font-black text-2xl rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(34,197,94,0.3)]">START GAME</button>
              ) : (
                <div className="bg-white/10 px-8 py-4 rounded-xl text-white/40 font-black italic">WAITING FOR PLAYER...</div>
              )}
              
              <button onClick={() => setMenuState('main')} className="text-white/40 font-bold hover:text-white transition-colors uppercase tracking-widest text-sm">Leave Lobby</button>
            </div>
          )}

          {menuState === 'join' && (
            <div className="flex flex-col gap-6 animate-in slide-in-from-left duration-300">
              <div className="bg-black/60 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl">
                <span className="text-white/40 text-xs font-black tracking-widest uppercase">Enter Code</span>
                <input type="text" maxLength={4} value={enteredCode} onChange={(e) => setEnteredCode(e.target.value.toUpperCase())} placeholder="----" className="bg-transparent text-white text-6xl font-black tracking-widest mt-2 font-mono outline-none border-b-4 border-white/10 focus:border-blue-500 transition-colors w-48" />
                <div className="text-white/40 text-xs mt-2 uppercase">{status}</div>
              </div>

              <div className="flex gap-4">
                <button onClick={() => enteredCode.length === 4 && initJoin(enteredCode)} className="px-10 py-4 bg-white text-black font-black text-xl rounded-xl hover:bg-blue-400 hover:text-white transition-all disabled:opacity-50" disabled={enteredCode.length < 4}>JOIN</button>
                <button onClick={() => setMenuState('main')} className="px-10 py-4 bg-black/40 text-white font-black text-xl rounded-xl border border-white/10 hover:bg-white hover:text-black transition-all">BACK</button>
              </div>
            </div>
          )}

          {menuState === 'waiting' && (
            <div className="flex flex-col gap-6 animate-in slide-in-from-left duration-300">
              <div className="bg-black/60 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl">
                <span className="text-white/40 text-xs font-black tracking-widest uppercase">Lobby Code</span>
                <div className="text-white text-6xl font-black tracking-widest mt-1 font-mono">{enteredCode}</div>
                <div className="mt-6 flex items-center gap-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-white/80 font-bold">Connected</span>
                </div>
              </div>
              <div className="bg-white/10 px-8 py-4 rounded-xl text-white/60 font-black italic flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                WAITING FOR HOST...
              </div>
              <button onClick={() => { cleanupPeer(); setMenuState('main'); }} className="text-white/40 font-bold hover:text-white transition-colors uppercase tracking-widest text-sm text-left">Leave Lobby</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Lobby;
