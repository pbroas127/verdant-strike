
import React, { useState } from 'react';
import Lobby from './components/Lobby';
import GameWorld from './components/GameWorld';

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

  return (
    <div className="w-screen h-screen bg-[#064e3b] overflow-hidden">
      {view === 'lobby' ? (
        <Lobby onLaunch={handleLaunchGame} />
      ) : (
        <GameWorld
          lobbyCode={netConfig?.code || ''}
          isHost={netConfig?.isHost || false}
          peer={netConfig?.peer}
          conn={netConfig?.conn}
          initialWorldData={netConfig?.worldData}
          playerId={netConfig?.playerId}
          onExit={handleBackToLobby}
        />
      )}
    </div>
  );
};

export default App;
