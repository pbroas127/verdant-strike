
import React from 'react';
import { Player, Item, WORLD_SIZE, RARITY_COLORS, Rarity, StormState } from '../types';
import pistolLogoUrl from '../Assets/pistollogo.png';
import arLogoUrl from '../Assets/ARlogo.png';
import shotgunLogoUrl from '../Assets/Shotgunlogo.png';
import grenadeLogoUrl from '../Assets/Grenadelogo.png';
import smokeLogoUrl from '../Assets/Smokelogo.png';

interface HUDProps {
  player: Player;
  storm: StormState;
  remainingPlayers: number;
  ammoAlert: string | null;
  isGameOver: boolean;
  placement: number;
  onExit: () => void;
  supplyDrops?: Array<{ id: string; x: number; y: number }>;
  isThrowModeActive?: boolean;
  onInventorySwap?: (from: number, to: number) => void;
  onInventoryDrop?: (slot: number) => void;
  onSpectate?: () => void;
  killedByName?: string;
  winnerName?: string;
  worldSize?: number;
}

const HUD: React.FC<HUDProps> = ({ player, storm, remainingPlayers, ammoAlert, isGameOver, placement, onExit, supplyDrops = [], isThrowModeActive = false, onInventorySwap, onInventoryDrop, onSpectate, killedByName, winnerName, worldSize: ws = WORLD_SIZE }) => {
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const currentItem = player.inventory[player.selectedSlot];
  const ammoCount = currentItem?.ammo ?? 0;
  const isGun = currentItem?.type === 'pistol' || currentItem?.type === 'assault_rifle' || currentItem?.type === 'shotgun';
  const isMed = currentItem && ['band_aid', 'medkit', 'heal_potion', 'heal_shot', 'golden_wrap'].includes(currentItem.type);

  const getArmorColor = () => {
    if (player.maxArmorHealth <= 0) return 'bg-white/10';
    const percent = (player.armorHealth / player.maxArmorHealth) * 100;
    if (percent > 70) return 'bg-green-500';
    if (percent > 40) return 'bg-yellow-500';
    if (percent > 15) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getRarityDmg = (item: typeof currentItem) => {
    if (!item) return 0;
    if (item.type === 'assault_rifle') {
      const arLevels: Record<Rarity, number> = { common: 22, uncommon: 27, rare: 32, epic: 37, legendary: 42 };
      return arLevels[item.rarity];
    }
    if (item.type === 'shotgun') {
      const sgLevels: Record<Rarity, number> = { common: 50, uncommon: 60, rare: 75, epic: 90, legendary: 110 };
      return sgLevels[item.rarity];
    }
    const base = 15;
    const levels: Record<Rarity, number> = { common: 0, uncommon: 3, rare: 6, epic: 9, legendary: 12 };
    return base + levels[item.rarity];
  };

  const formatTime = (ticks: number) => {
    const seconds = Math.max(0, Math.ceil(ticks / 60));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getItemContent = (item: Item, size: 'sm' | 'lg') => {
    const px = size === 'sm' ? 'w-8 h-8' : 'w-12 h-12';
    const arPx = size === 'sm' ? 'w-10 h-10' : 'w-14 h-14';
    if (item.type === 'pistol') {
      return <img src={pistolLogoUrl} className={`${px} object-contain`} style={{ filter: `drop-shadow(0 0 6px ${RARITY_COLORS[item.rarity]})` }} />;
    }
    if (item.type === 'assault_rifle') {
      return <img src={arLogoUrl} className={`${arPx} object-contain`} style={{ filter: `drop-shadow(0 0 6px ${RARITY_COLORS[item.rarity]})` }} />;
    }
    if (item.type === 'shotgun') {
      return <img src={shotgunLogoUrl} className={`${arPx} object-contain`} style={{ filter: `drop-shadow(0 0 6px ${RARITY_COLORS[item.rarity]})` }} />;
    }
    if (item.type === 'grenade') {
      return <img src={grenadeLogoUrl} className={`${px} object-contain`} style={{ filter: `drop-shadow(0 0 6px ${RARITY_COLORS[item.rarity]})` }} />;
    }
    if (item.type === 'smoke_grenade') {
      return <img src={smokeLogoUrl} className={`${px} object-contain`} style={{ filter: `drop-shadow(0 0 6px ${RARITY_COLORS[item.rarity]})` }} />;
    }
    const emojiSize = size === 'sm' ? 'text-2xl' : 'text-5xl';
    const emoji = item.type === 'armor' ? '🛡️'
      : item.type === 'band_aid' ? '🩹'
      : item.type === 'medkit' ? '🎒'
      : item.type === 'heal_potion' ? '🧪'
      : item.type === 'heal_shot' ? '💉'
      : item.type === 'golden_wrap' ? '🩹'
      : '📦';
    return <span className={`${emojiSize} drop-shadow-md brightness-150`}>{emoji}</span>;
  };

  return (
    <div className="fixed inset-0 pointer-events-none select-none p-6 font-sans overflow-hidden">
      {/* Game Over Screen */}
      {isGameOver && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center z-[100] pointer-events-auto">
          <div className="flex flex-col items-center animate-in zoom-in duration-500">
            {placement === 1 ? (
              <>
                <h1 className="text-yellow-400 text-9xl font-black mb-2 tracking-tighter drop-shadow-[0_0_30px_rgba(234,179,8,0.5)]">VICTORY</h1>
                <p className="text-white text-3xl font-black italic uppercase mb-6 bg-white/10 px-6 py-2 rounded-full">Winner Winner Chicken Dinner!</p>
              </>
            ) : (
              <>
                <h1 className="text-white text-8xl font-black mb-4 tracking-tighter drop-shadow-2xl">GAME OVER</h1>
                <p className="text-white/60 text-2xl font-bold mb-6 italic uppercase">You placed <span className="text-red-400">#{placement}</span></p>
              </>
            )}
            
            {winnerName && (
              <p className="text-yellow-400 text-xl font-black tracking-wider mb-2">{winnerName} has won!</p>
            )}

            <div className="grid grid-cols-2 gap-3 mb-8 w-80">
              <div className="bg-white/5 rounded-xl px-4 py-3 text-center border border-white/8">
                <div className="text-white/40 text-[10px] font-black tracking-widest uppercase mb-1">Damage Dealt</div>
                <div className="text-white font-black text-2xl">{player.damageDealt ?? 0}</div>
              </div>
              <div className="bg-white/5 rounded-xl px-4 py-3 text-center border border-white/8">
                <div className="text-white/40 text-[10px] font-black tracking-widest uppercase mb-1">Damage Taken</div>
                <div className="text-white font-black text-2xl">{player.damageTaken ?? 0}</div>
              </div>
              <div className="bg-white/5 rounded-xl px-4 py-3 text-center border border-white/8">
                <div className="text-white/40 text-[10px] font-black tracking-widest uppercase mb-1">Shots Fired</div>
                <div className="text-white font-black text-2xl">{player.shotsFired ?? 0}</div>
              </div>
              <div className="bg-white/5 rounded-xl px-4 py-3 text-center border border-white/8">
                <div className="text-white/40 text-[10px] font-black tracking-widest uppercase mb-1">Accuracy</div>
                <div className="text-white font-black text-2xl">
                  {(player.shotsFired ?? 0) > 0 ? Math.round(((player.shotsHit ?? 0) / player.shotsFired!) * 100) : 0}%
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3">
              <button
                onClick={onExit}
                className="px-12 py-5 bg-white text-black font-black text-xl rounded-full hover:scale-110 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.3)]"
              >
                EXIT TO LOBBY
              </button>
              {onSpectate && killedByName && (
                <button
                  onClick={onSpectate}
                  className="px-10 py-4 bg-cyan-500/20 text-cyan-300 font-black text-base rounded-full border border-cyan-400/40 hover:bg-cyan-500/40 hover:scale-105 active:scale-95 transition-all tracking-widest uppercase"
                >
                  SPECTATE {killedByName}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top Left: Minimap */}
      <div className="absolute top-6 left-6 w-48 h-48 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden shadow-2xl p-1">
        <div className="w-full h-full relative bg-green-900/30 rounded-xl overflow-hidden">
          {/* Current storm edge — only shown when storm is active */}
          {(storm.phase === 'closing' || storm.phase === 'holding') && (
            <div
              className="absolute rounded-full"
              style={{
                left: `${(storm.x / ws) * 100}%`,
                top: `${(storm.y / ws) * 100}%`,
                width: `${(storm.radius / ws) * 200}%`,
                height: `${(storm.radius / ws) * 200}%`,
                transform: 'translate(-50%, -50%)',
                border: '2px solid rgba(239,68,68,0.6)',
              }}
            />
          )}
          {/* Next target outline (shown during safe phases) */}
          {(storm.phase === 'initial_wait' || storm.phase === 'waiting') && (
            <div
              className="absolute rounded-full border-dashed"
              style={{
                left: `${(storm.x / ws) * 100}%`,
                top: `${(storm.y / ws) * 100}%`,
                width: `${(storm.nextTargetRadius / ws) * 200}%`,
                height: `${(storm.nextTargetRadius / ws) * 200}%`,
                transform: 'translate(-50%, -50%)',
                border: '2px dashed rgba(255,255,255,0.55)',
                backgroundColor: 'rgba(255,255,255,0.02)',
              }}
            />
          )}
          {/* Supply drops — pulsing blue dots */}
          {supplyDrops.map(sd => (
            <div key={sd.id} className="absolute z-10" style={{ left:`${(sd.x/ws)*100}%`, top:`${(sd.y/ws)*100}%`, transform:'translate(-50%,-50%)' }}>
              <div className="absolute w-3 h-3 bg-blue-400 rounded-full opacity-60 animate-ping" />
              <div className="relative w-2 h-2 bg-blue-400 rounded-full border border-yellow-400 shadow-[0_0_6px_rgba(59,130,246,1)]" />
            </div>
          ))}
          <div
            className="absolute w-3 h-3 bg-white rounded-full border border-white shadow-[0_0_8px_rgba(255,255,255,1)] z-10"
            style={{
              left: `${(player.x / ws) * 100}%`,
              top: `${(player.y / ws) * 100}%`,
              transform: 'translate(-50%, -50%)'
            }}
          />
        </div>
      </div>

      {/* Top Center: Storm Timer */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
        <div className="bg-black/60 backdrop-blur-md px-6 py-2 rounded-2xl border border-white/10 shadow-2xl flex items-center gap-4">
          <span className="text-2xl">
            {storm.phase === 'holding' ? '💀' : storm.phase === 'closing' ? '⛈️' : '🕘'}
          </span>
          <span className={`text-xl font-black ${
            storm.phase === 'holding' ? 'text-red-500 animate-pulse' :
            storm.phase === 'closing' ? 'text-orange-400 animate-pulse' :
            'text-white'
          }`}>
            {formatTime(storm.timer)}
          </span>
        </div>
        <div className={`text-[10px] font-black tracking-widest uppercase px-3 py-0.5 rounded-full ${
          storm.phase === 'holding' ? 'bg-red-500/30 text-red-300' :
          storm.phase === 'closing' ? 'bg-orange-500/20 text-orange-300' :
          'bg-white/10 text-white/50'
        }`}>
          {storm.phase === 'initial_wait' ? 'SAFE ZONE' :
           storm.phase === 'waiting'      ? 'SAFE ZONE' :
           storm.phase === 'closing'      ? 'STORM CLOSING' :
                                            'IN STORM'}
        </div>
      </div>

      {/* Top Right: Stats */}
      <div className="absolute top-6 right-6 flex flex-col items-end gap-2">
        <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl flex items-center gap-3 border border-white/10 shadow-2xl">
          <span className="text-2xl">💀</span>
          <span className="text-white font-bold text-xl">{player.kills}</span>
        </div>
        <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl flex items-center gap-3 border border-white/10 shadow-2xl">
          <span className="text-2xl">👤</span>
          <span className="text-white font-bold text-xl">{remainingPlayers}</span>
        </div>
      </div>

      {/* Bottom Left: Health */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-1">
        <div className="flex justify-between items-center w-72 px-2">
           <span className="text-white text-[10px] font-black tracking-widest drop-shadow-md opacity-60 uppercase">Vital Signs</span>
           <span className="text-white text-sm font-black drop-shadow-md">{Math.round(player.health)}%</span>
        </div>
        <div className="w-72 h-6 bg-black/40 backdrop-blur-md rounded-full border border-white/10 overflow-hidden p-1 shadow-2xl">
          <div 
            className={`h-full rounded-full transition-all duration-300 ${player.health < 30 ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-green-400 to-green-600'}`}
            style={{ width: `${(player.health / player.maxHealth) * 100}%` }}
          />
        </div>
      </div>

      {/* Bottom Center: Inventory */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-end gap-6">
        <div className="flex flex-col items-center gap-2">
          {isMed && (
            <div className="bg-white/90 text-black px-3 py-1 rounded-full text-[10px] font-black animate-bounce shadow-lg">
              PRESS <span className="underline">E</span> TO USE {currentItem.name.toUpperCase()}
            </div>
          )}
          {(currentItem?.type === 'grenade' || currentItem?.type === 'smoke_grenade') && (
            <div className={`${isThrowModeActive ? 'bg-red-500/90 animate-pulse' : 'bg-green-500/90 animate-bounce'} text-white px-3 py-1 rounded-full text-[10px] font-black shadow-lg`}>
              {isThrowModeActive
                ? 'LEFT CLICK TO THROW · RIGHT CLICK CANCEL'
                : `PRESS E TO AIM ${currentItem.name.toUpperCase()}`}
            </div>
          )}
          <div className="flex gap-2 p-2 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl pointer-events-auto">
            {player.inventory.map((item, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1">
                <div
                  draggable={!!item}
                  onDragStart={e => { if (item) { setDragFrom(idx); e.dataTransfer.effectAllowed = 'move'; } }}
                  onDragOver={e => { if (dragFrom !== null) e.preventDefault(); }}
                  onDrop={e => { e.preventDefault(); if (dragFrom !== null && dragFrom !== idx) onInventorySwap?.(dragFrom, idx); setDragFrom(null); }}
                  onDragEnd={e => { if (e.dataTransfer.dropEffect === 'none' && dragFrom !== null) onInventoryDrop?.(dragFrom); setDragFrom(null); }}
                  className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center transition-all duration-200 relative overflow-hidden ${
                    item ? 'cursor-grab active:cursor-grabbing' : ''
                  } ${
                    player.selectedSlot === idx && dragFrom !== idx ? 'scale-110 shadow-lg border-white' :
                    dragFrom === idx ? 'opacity-40 border-white/40 scale-95' :
                    dragFrom !== null ? 'border-white/40 ring-1 ring-white/20' :
                    'border-white/10'
                  }`}
                  style={{ backgroundColor: item ? `${RARITY_COLORS[item.rarity]}44` : 'rgba(255,255,255,0.05)' }}
                >
                  {item && (
                    <div className="flex flex-col items-center">
                      {getItemContent(item, 'sm')}
                      {item.ammo !== undefined && (
                         <span className={`absolute bottom-1 right-1 text-[8px] font-bold bg-black/50 px-1 rounded ${item.ammo === 0 ? 'text-red-500' : 'text-white'}`}>
                           {item.ammo}
                         </span>
                      )}
                      {item.count !== undefined && item.count > 0 && (
                         <span className="absolute top-1 right-1 text-[8px] font-bold bg-white/20 text-white px-1 rounded">
                           x{item.count}
                         </span>
                      )}
                    </div>
                  )}
                </div>
                <span className={`text-[9px] font-bold ${player.selectedSlot === idx ? 'text-white' : 'text-white/40'}`}>
                  {idx + 1}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Armor Status */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-black text-white/40 tracking-widest uppercase">Armor</span>
            <div 
              className="w-16 h-16 bg-black/40 backdrop-blur-md rounded-xl border-2 flex items-center justify-center relative shadow-2xl transition-colors"
              style={{ borderColor: player.currentArmor ? RARITY_COLORS[player.currentArmor.rarity] : 'rgba(255,255,255,0.1)' }}
            >
               {player.currentArmor ? <span className="text-3xl drop-shadow-[0_0_8px_white]">🛡️</span> : <span className="text-white/10 text-[8px]">NONE</span>}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="text-white text-[9px] font-black drop-shadow-md">{Math.round(player.armorHealth)}</div>
            <div className="w-3 h-16 bg-black/40 backdrop-blur-md rounded-full border border-white/10 p-0.5">
              <div 
                className={`w-full rounded-full transition-all duration-500 ${getArmorColor()}`}
                style={{ 
                  height: `${player.maxArmorHealth > 0 ? (player.armorHealth / player.maxArmorHealth) * 100 : 0}%`,
                  marginTop: `${player.maxArmorHealth > 0 ? 100 - (player.armorHealth / player.maxArmorHealth) * 100 : 100}%`
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Right: Current Weapon Detail */}
      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-1 text-white">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black tracking-widest opacity-50 uppercase">DMG Output:</span>
          <span className="text-2xl font-black text-blue-400 italic">
            {isGun ? getRarityDmg(currentItem) : '0'}
          </span>
        </div>
        <div className="flex items-end gap-4">
          <div className={`text-7xl font-black tracking-tighter leading-none ${ammoCount < 10 && isGun ? 'text-red-500 animate-pulse' : 'text-white'}`}>
            {isGun ? ammoCount : '--'}
          </div>
          <div 
            className="w-20 h-20 rounded-2xl border-2 flex items-center justify-center shadow-2xl transition-all"
            style={{ 
              borderColor: currentItem ? RARITY_COLORS[currentItem.rarity] : 'rgba(255,255,255,0.1)',
              backgroundColor: currentItem ? `${RARITY_COLORS[currentItem.rarity]}33` : 'rgba(0,0,0,0.4)'
            }}
          >
            {currentItem ? getItemContent(currentItem, 'lg') : (
               <div className="text-[10px] opacity-20 font-black">EMPTY</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HUD;
