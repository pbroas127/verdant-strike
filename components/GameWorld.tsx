
import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Player, Item, Bullet, GameState, WORLD_SIZE, Crate, EnvObject, WaterBody, Particle, ItemType, Rarity, RARITY_COLORS, StormState, NetworkMessage, Building, Campfire, Grenade, SmokeCloud, Barrel, SandbagBarrier } from '../types';
import HUD from './HUD';
import pistolLogoUrl from '../Assets/pistollogo.png';
import arLogoUrl from '../Assets/ARlogo.png';
import shotgunLogoUrl from '../Assets/Shotgunlogo.png';
import grenadeLogoUrl from '../Assets/Grenadelogo.png';
import smokeLogoUrl from '../Assets/Smokelogo.png';
import topDownPistolUrl from '../Assets/TopDownPistol.png';
import topDownARUrl from '../Assets/TopDownAR.png';
import topDownShotgunUrl from '../Assets/TopDownShotgun.png';

// ─── Line-of-sight helpers (used for explosion blocking) ─────────────────────
function segmentIntersectsAABB(
  ax: number, ay: number, bx: number, by: number,
  minX: number, minY: number, maxX: number, maxY: number
): boolean {
  const dx = bx - ax, dy = by - ay;
  let tmin = 0, tmax = 1;
  if (dx === 0) {
    if (ax < minX || ax > maxX) return false;
  } else {
    const tx1 = (minX - ax) / dx, tx2 = (maxX - ax) / dx;
    tmin = Math.max(tmin, Math.min(tx1, tx2));
    tmax = Math.min(tmax, Math.max(tx1, tx2));
  }
  if (dy === 0) {
    if (ay < minY || ay > maxY) return false;
  } else {
    const ty1 = (minY - ay) / dy, ty2 = (maxY - ay) / dy;
    tmin = Math.max(tmin, Math.min(ty1, ty2));
    tmax = Math.min(tmax, Math.max(ty1, ty2));
  }
  return tmin <= tmax;
}

function explosionBlocked(ex: number, ey: number, px: number, py: number, s: import('../types').GameState): boolean {
  for (const bld of s.buildings) {
    for (const wr of bld.wallRects) {
      const wx = bld.x + wr.x, wy = bld.y + wr.y;
      if (segmentIntersectsAABB(ex, ey, px, py, wx - wr.w / 2, wy - wr.h / 2, wx + wr.w / 2, wy + wr.h / 2)) {
        return true;
      }
    }
  }
  for (const obj of s.envObjects) {
    if (obj.type.includes('wall')) {
      if (obj.w && obj.h) {
        if (segmentIntersectsAABB(ex, ey, px, py, obj.x - obj.w / 2, obj.y - obj.h / 2, obj.x + obj.w / 2, obj.y + obj.h / 2)) {
          return true;
        }
      } else {
        const r = obj.size / 2;
        if (segmentIntersectsAABB(ex, ey, px, py, obj.x - r, obj.y - r, obj.x + r, obj.y + r)) {
          return true;
        }
      }
    }
  }
  return false;
}

const PLAYER_SPEED = 4.5;
const PUNCH_COOLDOWN = 12;
const BULLET_SPEED = 16;
const PICKUP_RANGE = 70;
const SHOOT_COOLDOWN = 400;
const AR_SHOOT_COOLDOWN = 100;
const AR_AUTO_COOLDOWN = 100;
const SHOTGUN_COOLDOWN = 700;
const STORM_DAMAGE = 5;
const PLAYER_RADIUS = 20;
const THROW_RANGE = 500;

interface GameWorldProps {
  lobbyCode: string;
  isHost: boolean;
  peer: any;
  conn: any; // host: any[] of client connections; client: single connection to host
  initialWorldData?: { crates: Crate[], envObjects: EnvObject[], items: Item[], waterBodies?: WaterBody[], playerIds?: string[], buildings?: Building[], campfires?: Campfire[], barrels?: Barrel[], sandbagBarriers?: SandbagBarrier[], usernames?: Record<string, string>, skinColors?: Record<string, string>, worldSize?: number, spawnPoints?: Array<{ x: number; y: number }> };
  onExit: () => void;
  playerId?: string;
  session?: Session | null;
}

const GameWorld: React.FC<GameWorldProps> = ({ lobbyCode, isHost, peer, conn, initialWorldData, onExit, playerId, session }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const pistolImgRef = useRef<HTMLImageElement | null>(null);
  const arImgRef = useRef<HTMLImageElement | null>(null);
  const shotgunLogoImgRef = useRef<HTMLImageElement | null>(null);
  const grenadeLogoImgRef = useRef<HTMLImageElement | null>(null);
  const smokeLogoImgRef = useRef<HTMLImageElement | null>(null);
  const topDownPistolImgRef = useRef<HTMLImageElement | null>(null);
  const topDownARImgRef = useRef<HTMLImageElement | null>(null);
  const topDownShotgunImgRef = useRef<HTMLImageElement | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const mousePos = useRef({ x: 0, y: 0 });
  const lastShootTime = useRef(0);
  const muzzleFlashRef = useRef(false);
  const lastStormTick = useRef(0);
  const frameCount = useRef(0);
  const lastUpdateTime = useRef(performance.now());
  const nearbyItemRef = useRef<Item | null>(null);
  const fogAlphaRef = useRef<Record<string, number>>({});
  const playerBeingHealedRef = useRef(false);
  const screenShakeRef = useRef(0);
  const lastGrenadeTime = useRef(0);
  const throwModeRef = useRef(false);
  const mouseDownRef = useRef(false);

  // Core immutable IDs — derived from props (stable for component lifetime)
  const localId = playerId ?? (isHost ? 'p0' : 'p1');
  const allPlayerIds: string[] = initialWorldData?.playerIds ?? ['p0', 'p1'];
  const remoteIds = allPlayerIds.filter(id => id !== localId);
  const usernames: Record<string, string> = initialWorldData?.usernames ?? {};
  const skinColors: Record<string, string> = initialWorldData?.skinColors ?? {};
  const worldSize = initialWorldData?.worldSize ?? WORLD_SIZE;

  // Spectate system
  const [spectatingId, setSpectatingId] = useState<string | null>(null);
  const spectatingIdRef = useRef<string | null>(null);
  const [gameWinner, setGameWinner] = useState<string | null>(null);
  const gameWinnerRef = useRef<string | null>(null);
  const killerMapRef = useRef<Record<string, string>>({});

  // Preload weapon images for canvas rendering
  useEffect(() => {
    const p = new Image(); p.src = pistolLogoUrl; pistolImgRef.current = p;
    const a = new Image(); a.src = arLogoUrl; arImgRef.current = a;
    const sg = new Image(); sg.src = shotgunLogoUrl; shotgunLogoImgRef.current = sg;
    const gl = new Image(); gl.src = grenadeLogoUrl; grenadeLogoImgRef.current = gl;
    const sl = new Image(); sl.src = smokeLogoUrl; smokeLogoImgRef.current = sl;
    const tp = new Image(); tp.src = topDownPistolUrl; topDownPistolImgRef.current = tp;
    const ta = new Image(); ta.src = topDownARUrl; topDownARImgRef.current = ta;
    const ts = new Image(); ts.src = topDownShotgunUrl; topDownShotgunImgRef.current = ts;
  }, []);

  const prevRemainingRef = useRef(allPlayerIds.length);
  const localDeathHandled = useRef(false);
  const notifiedDeadRef = useRef<Set<string>>(new Set());
  const victoryFiredRef = useRef(false);

  // Core mutable state — players initialised from spawn points (clear of obstacles) or circle fallback
  const spawnPoints = initialWorldData?.spawnPoints;
  const stateRef = useRef<GameState>({
    players: Object.fromEntries(
      allPlayerIds.map((pid, idx) => {
        const sp = spawnPoints && spawnPoints[idx];
        const angle = (idx / allPlayerIds.length) * Math.PI * 2 - Math.PI / 2;
        const r = worldSize * 0.35;
        const x = sp ? sp.x : Math.round(worldSize / 2 + Math.cos(angle) * r);
        const y = sp ? sp.y : Math.round(worldSize / 2 + Math.sin(angle) * r);
        return [pid, {
          id: pid,
          x,
          y,
          rotation: 0, health: 100, maxHealth: 100,
          armorHealth: 0, maxArmorHealth: 0, currentArmor: null, kills: 0,
          inventory: [null, null, null, null, null], selectedSlot: 0, isPunching: false, punchCooldown: 0,
        }];
      })
    ) as Record<string, Player>,
    localPlayerId: localId,
    bullets: [],
    items: initialWorldData?.items || [],
    crates: initialWorldData?.crates || [],
    envObjects: initialWorldData?.envObjects || [],
    waterBodies: initialWorldData?.waterBodies || [],
    buildings: initialWorldData?.buildings || [],
    campfires: initialWorldData?.campfires || [],
    grenades: [],
    smokeClouds: [],
    barrels: initialWorldData?.barrels || [],
    sandbagBarriers: initialWorldData?.sandbagBarriers || [],
    stormCircle: 0,
    particles: [],
    storm: {
      x: worldSize / 2, y: worldSize / 2,
      radius: worldSize * 0.75,
      targetRadius: Math.round(worldSize * 0.75 * 0.6),
      nextTargetRadius: Math.round(worldSize * 0.75 * 0.6),
      startRadius: worldSize * 0.75,
      phase: 'initial_wait', timer: 7200, phaseTime: 7200
    },
    remainingPlayers: allPlayerIds.length,
    ammoAlert: null, isGameOver: false, placement: 0, lobbyCode, isHost
  });

  const [uiState, setUiState] = useState<GameState>(stateRef.current);
  const [nearbyItem, setNearbyItem] = useState<Item | null>(null);
  const [killFeed, setKillFeed] = useState<Array<{ id: string; killer: string; victim: string }>>([]);
  const [throwModeActive, setThrowModeActive] = useState(false);

  // Save match stats to Supabase when game ends
  useEffect(() => {
    if (uiState.isGameOver && session) {
      const p = uiState.players[localId];
      if (p) {
        supabase.from('match_stats').insert({
          user_id: session.user.id,
          kills: p.kills,
          damage_dealt: p.damageDealt ?? 0,
          damage_taken: p.damageTaken ?? 0,
          shots_fired: p.shotsFired ?? 0,
          shots_hit: p.shotsHit ?? 0,
          placement: uiState.placement,
        });
      }
    }
  }, [uiState.isGameOver]); // eslint-disable-line react-hooks/exhaustive-deps

  // Broadcast to all connections (host: all clients; client: single host conn)
  const safeSend = (data: any) => {
    const conns: any[] = Array.isArray(conn) ? conn : (conn ? [conn] : []);
    conns.forEach(c => { if (c?.open) c.send(data); });
  };

  // Send to a specific player's connection (host only; client always uses safeSend→host)
  const safeSendTo = (data: any, targetId: string) => {
    if (targetId === localId) return; // don't send to self
    if (!Array.isArray(conn)) { if (conn?.open) conn.send(data); return; }
    const idx = parseInt(targetId.replace('p', '')) - 1; // 'p1'→0, 'p2'→1, ...
    if (idx >= 0 && idx < conn.length && conn[idx]?.open) conn[idx].send(data);
  };

  const addKillFeedEntry = useCallback((killer: string, victim: string) => {
    const entry = { id: `${Date.now()}-${Math.random()}`, killer, victim };
    setKillFeed(prev => [...prev.slice(-4), entry]);
    setTimeout(() => setKillFeed(prev => prev.filter(e => e.id !== entry.id)), 5000);
  }, []);

  const spawnParticles = (x: number, y: number, color: string, count: number, type: 'wood' | 'leaf' | 'stone' | 'metal' | 'blood' | 'water') => {
    for (let i = 0; i < count; i++) {
      stateRef.current.particles.push({
        id: Math.random().toString(),
        x, y,
        vx: (Math.random() - 0.5) * (type === 'water' ? 3 : 6),
        vy: (Math.random() - 0.5) * (type === 'water' ? 3 : 6),
        life: type === 'water' ? 25 + Math.random() * 15 : 20 + Math.random() * 20,
        maxLife: type === 'water' ? 40 : 40,
        color,
        size: type === 'leaf' ? 6 + Math.random() * 4 : type === 'water' ? 5 + Math.random() * 7 : 2 + Math.random() * 3
      });
    }
  };

  // Check if a player position is inside any water body
  const isPlayerInWater = (px: number, py: number, waterBodies: WaterBody[]): boolean => {
    return waterBodies.some(wb => {
      if (wb.type === 'pond') {
        const dx = (px - wb.x) / wb.rx;
        const dy = (py - wb.y) / wb.ry;
        return dx * dx + dy * dy <= 1;
      } else {
        if (!wb.points || wb.points.length < 1) return false;
        const halfW = (wb.streamWidth || 55) / 2;
        const allPts = [{ x: wb.x, y: wb.y }, ...wb.points];
        for (let i = 0; i < allPts.length - 1; i++) {
          const ax = allPts[i].x, ay = allPts[i].y;
          const bx = allPts[i + 1].x, by = allPts[i + 1].y;
          const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
          const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2)) : 0;
          const cx = ax + t * (bx - ax), cy = ay + t * (by - ay);
          if (Math.hypot(px - cx, py - cy) < halfW) return true;
        }
        return false;
      }
    });
  };

  const handleCrateHit = useCallback((crateId: string) => {
    if (!isHost) {
      // Spawn optimistic local particles so client sees immediate feedback
      const localCrate = stateRef.current.crates.find(c => c.id === crateId);
      if (localCrate) spawnParticles(localCrate.x, localCrate.y, localCrate.isGold ? '#eab308' : '#78350f', localCrate.isGold ? 8 : 5, 'wood');
      safeSend({ type: 'CRATE_HIT', crateId });
      return;
    }

    const s = stateRef.current;
    const crateIndex = s.crates.findIndex(c => c.id === crateId);
    if (crateIndex === -1) return;

    const crate = s.crates[crateIndex];
    crate.health -= 1;
    spawnParticles(crate.x, crate.y, crate.isGold ? '#eab308' : '#78350f', crate.isGold ? 8 : 5, 'wood');

    if (crate.health <= 0) {
      s.crates.splice(crateIndex, 1);
      const aHMap: Record<Rarity, number> = { common: 25, uncommon: 40, rare: 60, epic: 80, legendary: 100 };

      // Supply drop: 1 legendary + 1 epic + 1 rare
      if (crate.isSupplyDrop) {
        const weapPool: ItemType[] = ['assault_rifle', 'shotgun', 'armor', 'heal_shot', 'golden_wrap'];
        const medPool: ItemType[] = ['armor', 'heal_potion', 'medkit'];
        const drops: Array<{ type: ItemType; rarity: Rarity }> = [
          { type: weapPool[Math.floor(Math.random() * weapPool.length)], rarity: 'legendary' },
          { type: weapPool[Math.floor(Math.random() * weapPool.length)], rarity: 'epic' },
          { type: medPool[Math.floor(Math.random() * medPool.length)], rarity: 'rare' },
        ];
        drops.forEach(({ type, rarity }, i) => {
          const ang = (i / drops.length) * Math.PI * 2;
          s.items.push({
            id: `sdrop-${Math.random()}`, type,
            name: type === 'assault_rifle' ? 'Assault Rifle' : type === 'shotgun' ? 'Shotgun' : type.replace(/_/g, ' '),
            x: crate.x + Math.cos(ang) * 30, y: crate.y + Math.sin(ang) * 30,
            rarity, count: 1,
            ammo: type === 'assault_rifle' ? (rarity === 'legendary' ? 50 : 40) : type === 'shotgun' ? 24 : undefined,
            armorHealth: type === 'armor' ? aHMap[rarity] : undefined,
            vx: Math.cos(ang) * 5, vy: Math.sin(ang) * 5,
          });
        });
        spawnParticles(crate.x, crate.y, '#3b82f6', 16, 'stone');
        safeSend({ type: 'STATE_UPDATE', state: { crates: s.crates, items: s.items }, particleEvents: [{ x: crate.x, y: crate.y, color: '#3b82f6', count: 16 }] });
        return;
      }

      if (crate.isGold) {
        // Gold crate: always 1 drop, always Epic or Legendary
        for (let i = 0; i < 1; i++) {
          const rarity: Rarity = Math.random() > 0.45 ? 'legendary' : 'epic';
          const roll = Math.random();
          let type: ItemType;
          if (roll > 0.65) { type = 'assault_rifle'; }
          else if (roll > 0.35) { type = 'armor'; }
          else if (roll > 0.15) { type = 'shotgun'; }
          else { type = 'heal_shot'; }
          s.items.push({
            id: `drop-${Math.random()}`,
            type,
            name: type === 'assault_rifle' ? 'Assault Rifle' : type === 'shotgun' ? 'Shotgun' : type.replace(/_/g, ' '),
            x: crate.x + (Math.random() - 0.5) * 20,
            y: crate.y + (Math.random() - 0.5) * 20,
            rarity,
            ammo: type === 'assault_rifle' ? (rarity === 'legendary' ? 50 : 40) : type === 'shotgun' ? (rarity === 'legendary' ? 24 : 16) : undefined,
            armorHealth: type === 'armor' ? aHMap[rarity] : undefined,
            count: 1,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8
          });
        }
      } else {
        // Regular crate: 1–2 drops
        const dropCount = Math.floor(Math.random() * 2) + 1;
        for (let i = 0; i < dropCount; i++) {
          const roll = Math.random();
          let type: ItemType = 'pistol';
          let rarity: Rarity = 'common';

          if (roll > 0.92) {
            type = 'ammo_crate';
            rarity = Math.random() > 0.7 ? 'legendary' : 'epic';
          } else if (roll > 0.78) {
            type = 'armor';
            const rr = Math.random();
            rarity = rr > 0.95 ? 'legendary' : rr > 0.8 ? 'epic' : rr > 0.5 ? 'rare' : rr > 0.2 ? 'uncommon' : 'common';
          } else if (roll > 0.72) {
            // Grenade or smoke grenade (smoke is rare)
            const gr = Math.random();
            type = gr > 0.75 ? 'grenade' : 'smoke_grenade';
            rarity = type === 'smoke_grenade' ? 'rare' : 'uncommon';
          } else if (roll > 0.3) {
            const mr = Math.random();
            if (mr > 0.96) { type = 'golden_wrap'; rarity = 'legendary'; }
            else if (mr > 0.85) { type = 'heal_shot'; rarity = 'epic'; }
            else if (mr > 0.6) { type = 'heal_potion'; rarity = 'rare'; }
            else if (mr > 0.3) { type = 'medkit'; rarity = 'uncommon'; }
            else { type = 'band_aid'; rarity = 'common'; }
          } else {
            const rr = Math.random();
            rarity = rr > 0.95 ? 'legendary' : rr > 0.8 ? 'epic' : rr > 0.5 ? 'rare' : rr > 0.2 ? 'uncommon' : 'common';
            if (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary') {
              const wRoll = Math.random();
              if (wRoll > 0.55) { type = 'assault_rifle'; }
              else if (wRoll > 0.2) { type = 'shotgun'; }
            } else if (rarity === 'uncommon' && Math.random() > 0.6) {
              type = 'assault_rifle'; // uncommon AR: lower damage (27), shorter ammo (30)
            }
          }

          const isThrowable = type === 'grenade' || type === 'smoke_grenade';
          s.items.push({
            id: `drop-${Math.random()}`,
            type,
            name: type === 'assault_rifle' ? 'Assault Rifle' : type === 'shotgun' ? 'Shotgun' : type === 'grenade' ? 'Grenade' : type === 'smoke_grenade' ? 'Smoke Grenade' : type.replace(/_/g, ' '),
            x: crate.x + (Math.random() - 0.5) * 20,
            y: crate.y + (Math.random() - 0.5) * 20,
            rarity,
            ammo: type === 'pistol' ? 30 : type === 'assault_rifle' ? (rarity === 'legendary' ? 50 : rarity === 'epic' ? 40 : 30) : type === 'shotgun' ? 16 : undefined,
            armorHealth: type === 'armor' ? aHMap[rarity] : undefined,
            count: isThrowable ? 2 : 1,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8
          });
        }
      }
    }
    // Always broadcast update; include particle event so clients show the same effect
    const pColor = crate.isGold ? '#eab308' : '#78350f';
    const pCount = crate.isGold ? 8 : 5;
    safeSend({ type: 'STATE_UPDATE', state: { crates: s.crates, items: s.items }, particleEvents: [{ x: crate.x, y: crate.y, color: pColor, count: pCount }] });
  }, [isHost]);

  const useMed = useCallback(() => {
    const s = stateRef.current;
    const p = s.players[s.localPlayerId];
    const item = p.inventory[p.selectedSlot];
    if (!item || s.isGameOver || p.health >= p.maxHealth) return;

    const healMap: Record<string, number> = {
      band_aid: 15, medkit: 35, heal_potion: 50, heal_shot: 75, golden_wrap: 100
    };
    const amt = healMap[item.type];
    if (amt === undefined) return;

    const ni = { ...item, count: (item.count || 1) - 1 };
    if (ni.count <= 0) p.inventory[p.selectedSlot] = null; else p.inventory[p.selectedSlot] = ni;
    p.health = Math.min(p.maxHealth, p.health + amt);
  }, []);

  const shoot = useCallback(() => {
    const now = Date.now();
    const s = stateRef.current;
    const p = s.players[s.localPlayerId];
    const item = p.inventory[p.selectedSlot];
    const isGun = item?.type === 'pistol' || item?.type === 'assault_rifle' || item?.type === 'shotgun';
    if (!isGun || s.isGameOver || p.health <= 0) return;

    const cooldown = item!.type === 'assault_rifle' ? AR_SHOOT_COOLDOWN
      : item!.type === 'shotgun' ? SHOTGUN_COOLDOWN
      : SHOOT_COOLDOWN;
    if (now - lastShootTime.current < cooldown) return;

    const ammoNeeded = item!.type === 'shotgun' ? 2 : 1;
    if ((item!.ammo || 0) < ammoNeeded) {
      s.ammoAlert = 'OUT OF AMMO!';
      setTimeout(() => stateRef.current.ammoAlert = null, 1000);
      return;
    }

    lastShootTime.current = now;
    muzzleFlashRef.current = true;
    setTimeout(() => { muzzleFlashRef.current = false; }, 80);

    p.shotsFired = (p.shotsFired || 0) + 1;

    // Shotgun: 5 pellets with spread — total damage split across pellets so close-range hits more
    if (item!.type === 'shotgun') {
      const sgTotalDmg: Record<Rarity, number> = { common: 50, uncommon: 60, rare: 75, epic: 90, legendary: 110 };
      const pelletDmg = Math.ceil(sgTotalDmg[item!.rarity] / 5);
      item!.ammo = (item!.ammo || 0) - 2;
      for (let i = 0; i < 5; i++) {
        const spread = (Math.random() - 0.5) * 0.45;
        const angleI = p.rotation + spread;
        const pellet: Bullet = {
          id: Math.random().toString(),
          x: p.x + Math.cos(p.rotation) * 30,
          y: p.y + Math.sin(p.rotation) * 30,
          vx: Math.cos(angleI) * BULLET_SPEED,
          vy: Math.sin(angleI) * BULLET_SPEED,
          damage: pelletDmg,
          ownerId: p.id,
          life: 22
        };
        s.bullets.push(pellet);
        safeSend({ type: 'BULLET_SPAWN', bullet: pellet });
      }
      return;
    }

    const dmgMap: Record<Rarity, number> = item!.type === 'assault_rifle'
      ? { common: 22, uncommon: 27, rare: 32, epic: 37, legendary: 42 }
      : { common: 15, uncommon: 18, rare: 21, epic: 24, legendary: 27 };

    const angle = p.rotation;
    const ox = 18 * Math.cos(angle) - 10 * Math.sin(angle);
    const oy = 18 * Math.sin(angle) + 10 * Math.cos(angle);

    // AR has longer range than pistol; neither should reach off-screen players
    const bulletLife = item!.type === 'assault_rifle' ? 72 : 50;
    const b: Bullet = {
      id: Math.random().toString(),
      x: p.x + ox + Math.cos(angle) * 30,
      y: p.y + oy + Math.sin(angle) * 30,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      damage: dmgMap[item!.rarity],
      ownerId: p.id,
      life: bulletLife
    };

    s.bullets.push(b);
    item!.ammo = (item!.ammo || 0) - 1;
    safeSend({ type: 'BULLET_SPAWN', bullet: b });
  }, []);

  const handleBarrelHit = useCallback((barrelId: string, chainDepth = 0) => {
    const s = stateRef.current;
    if (!isHost) {
      safeSend({ type: 'BARREL_HIT', barrelId });
      return;
    }
    const barrelIdx = s.barrels.findIndex(b => b.id === barrelId);
    if (barrelIdx === -1) return;
    const barrel = s.barrels[barrelIdx];
    barrel.health--;
    if (barrel.health <= 0) {
      const bx = barrel.x, by = barrel.y;
      s.barrels = s.barrels.filter(b => b.id !== barrelId);
      const AoE = 250;
      (Object.values(s.players) as Player[]).forEach(pl => {
        if (pl.health > 0) {
          const dist = Math.hypot(pl.x - bx, pl.y - by);
          if (dist < AoE && !explosionBlocked(bx, by, pl.x, pl.y, s)) {
            const dmg = Math.round(80 * (1 - dist / AoE));
            if (pl.id === localId) {
              pl.health = Math.max(0, pl.health - dmg);
              pl.damageTaken = (pl.damageTaken || 0) + dmg;
            } else {
              safeSendTo({ type: 'PLAYER_HIT', targetId: pl.id, damage: dmg, attackerId: 'barrel' }, pl.id);
            }
          }
        }
      });
      // Chain explosions for nearby barrels
      if (chainDepth < 3) {
        const nearbyIds = s.barrels.filter(b => Math.hypot(b.x - bx, b.y - by) < 200).map(b => b.id);
        nearbyIds.forEach(nid => handleBarrelHit(nid, chainDepth + 1));
      }
      spawnParticles(bx, by, '#ff4400', 25, 'stone');
      spawnParticles(bx, by, '#ff8800', 15, 'stone');
      spawnParticles(bx, by, '#888888', 10, 'stone');
      screenShakeRef.current = 14;
      safeSend({ type: 'STATE_UPDATE', state: { barrels: s.barrels }, particleEvents: [{ x: bx, y: by, color: '#ff6600', count: 30 }] });
    } else {
      safeSend({ type: 'STATE_UPDATE', state: { barrels: s.barrels } });
    }
  }, [isHost, localId]);

  const throwGrenade = useCallback(() => {
    const now = Date.now();
    if (now - lastGrenadeTime.current < 500) return;
    const s = stateRef.current;
    const p = s.players[s.localPlayerId];
    if (s.isGameOver || p.health <= 0) return;
    const item = p.inventory[p.selectedSlot];
    if (!item || (item.type !== 'grenade' && item.type !== 'smoke_grenade')) {
      // Try finding a grenade in inventory
      const gIdx = p.inventory.findIndex(i => i && (i.type === 'grenade' || i.type === 'smoke_grenade'));
      if (gIdx === -1) return;
      p.selectedSlot = gIdx;
    }
    const gItem = p.inventory[p.selectedSlot];
    if (!gItem || (gItem.type !== 'grenade' && gItem.type !== 'smoke_grenade')) return;
    lastGrenadeTime.current = now;

    const grenade: Grenade = {
      id: Math.random().toString(),
      x: p.x + Math.cos(p.rotation) * 25,
      y: p.y + Math.sin(p.rotation) * 25,
      vx: Math.cos(p.rotation) * 9,
      vy: Math.sin(p.rotation) * 9,
      fuseTimer: 180,
      ownerId: p.id,
      isSmokeGrenade: gItem.type === 'smoke_grenade',
    };
    s.grenades.push(grenade);
    safeSend({ type: 'GRENADE_SPAWN', grenade });

    // Consume from inventory
    const cnt = (gItem.count || 1) - 1;
    if (cnt <= 0) p.inventory[p.selectedSlot] = null;
    else gItem.count = cnt;
  }, [localId]);

  const executeThrowTowardMouse = useCallback(() => {
    const s = stateRef.current;
    const p = s.players[localId];
    const cv = canvasRef.current;
    if (!cv || s.isGameOver || p.health <= 0) return;
    const now = Date.now();
    if (now - lastGrenadeTime.current < 500) return;
    const camX = p.x - cv.width / 2;
    const camY = p.y - cv.height / 2;
    const worldMouseX = mousePos.current.x + camX;
    const worldMouseY = mousePos.current.y + camY;
    const dist = Math.hypot(worldMouseX - p.x, worldMouseY - p.y);
    if (dist > THROW_RANGE) {
      s.ammoAlert = 'OUT OF REACH!';
      setTimeout(() => { stateRef.current.ammoAlert = null; }, 1200);
      return;
    }
    const item = p.inventory[p.selectedSlot];
    if (!item || (item.type !== 'grenade' && item.type !== 'smoke_grenade')) return;
    lastGrenadeTime.current = now;
    const angle = Math.atan2(worldMouseY - p.y, worldMouseX - p.x);
    // v0 = dist * 0.06 so total travel (v0 / (1 - 0.94)) equals dist exactly, but slower
    const throwSpeed = Math.max(2, dist * 0.06);
    const grenade: Grenade = {
      id: Math.random().toString(),
      x: p.x + Math.cos(angle) * 25,
      y: p.y + Math.sin(angle) * 25,
      vx: Math.cos(angle) * throwSpeed,
      vy: Math.sin(angle) * throwSpeed,
      fuseTimer: 180,
      ownerId: p.id,
      isSmokeGrenade: item.type === 'smoke_grenade',
    };
    s.grenades.push(grenade);
    safeSend({ type: 'GRENADE_SPAWN', grenade });
    const cnt = (item.count || 1) - 1;
    if (cnt <= 0) p.inventory[p.selectedSlot] = null; else item.count = cnt;
    throwModeRef.current = false;
    setThrowModeActive(false);
  }, [localId]);

  const punch = useCallback(() => {
    const s = stateRef.current;
    const p = s.players[s.localPlayerId];
    if (p.punchCooldown > 0 || s.isGameOver || p.health <= 0) return;

    const angle = p.rotation;
    const hx = p.x + Math.cos(angle) * 45;
    const hy = p.y + Math.sin(angle) * 45;
    // Increased detection radius for punching crates
    const hc = s.crates.find(c => Math.sqrt((c.x - hx) ** 2 + (c.y - hy) ** 2) < 55);

    if (hc) {
      handleCrateHit(hc.id);
    } else {
      // Check all remote players for punch hit
      for (const rid of remoteIds) {
        const remote = s.players[rid];
        if (remote && remote.health > 0) {
          if (Math.sqrt((remote.x - hx) ** 2 + (remote.y - hy) ** 2) < 55) {
            safeSend({ type: 'PLAYER_HIT', targetId: rid, damage: 5, attackerId: p.id });
            break;
          }
        }
      }
    }

    p.isPunching = true;
    p.punchCooldown = PUNCH_COOLDOWN;
  }, [handleCrateHit]);

  const pickupItem = useCallback((item: Item) => {
    const s = stateRef.current;
    const p = s.players[s.localPlayerId];
    if (s.isGameOver || p.health <= 0) return;

    if (item.type === 'ammo_crate') {
      const cur = p.inventory[p.selectedSlot];
      const isWeapon = cur?.type === 'pistol' || cur?.type === 'assault_rifle' || cur?.type === 'shotgun';
      if (!cur || !isWeapon) {
        s.ammoAlert = 'SELECT A WEAPON FIRST!';
        setTimeout(() => stateRef.current.ammoAlert = null, 1500);
        return;
      }
      const bonus = item.rarity === 'legendary' ? 60 : 30;
      cur.ammo = (cur.ammo || 0) + bonus;
      s.items = s.items.filter(i => i.id !== item.id);
      s.ammoAlert = `+${bonus} AMMO`;
      setTimeout(() => stateRef.current.ammoAlert = null, 1500);
      safeSend({ type: 'STATE_UPDATE', state: { items: s.items } });
      return;
    }

    if (item.type === 'armor') {
      const hMap: Record<Rarity, number> = { common: 25, uncommon: 40, rare: 60, epic: 80, legendary: 100 };
      const max = hMap[item.rarity];
      // Drop existing armor with its current (possibly depleted) health before swapping
      if (p.currentArmor) {
        s.items.push({ ...p.currentArmor, x: p.x, y: p.y, armorHealth: p.armorHealth, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5 });
      }
      p.currentArmor = item;
      p.armorHealth = item.armorHealth ?? max;  // use stored health from drop, not always max
      p.maxArmorHealth = max;
      s.items = s.items.filter(i => i.id !== item.id);
      safeSend({ type: 'STATE_UPDATE', state: { items: s.items } });
      return;
    }

    // Stack meds/throwables of same type up to rarity-based max
    const medTypes = ['band_aid', 'medkit', 'heal_potion', 'heal_shot', 'golden_wrap', 'grenade', 'smoke_grenade'];
      const getMedMaxCount = (t: string, r: Rarity): number => {
      if (t === 'grenade') return 5;
      if (t === 'smoke_grenade') return 3;
      const m: Record<Rarity, number> = { common: 5, uncommon: 5, rare: 3, epic: 2, legendary: 1 };
      return m[r];
    };
    if (medTypes.includes(item.type)) {
      const existingSlot = p.inventory.findIndex(slot => slot && slot.type === item.type);
      if (existingSlot !== -1) {
        const existing = p.inventory[existingSlot]!;
        const maxCount = getMedMaxCount(item.type, existing.rarity);
        const curCount = existing.count || 1;
        if (curCount < maxCount) {
          existing.count = Math.min(maxCount, curCount + (item.count || 1));
          s.items = s.items.filter(i => i.id !== item.id);
          safeSend({ type: 'STATE_UPDATE', state: { items: s.items } });
          return;
        }
        // Stack full — fall through to find empty slot or swap
      }
    }

    const empty = p.inventory.findIndex(slot => slot === null);
    if (empty !== -1) {
      p.inventory[empty] = item;
      s.items = s.items.filter(i => i.id !== item.id);
    } else {
      const old = p.inventory[p.selectedSlot];
      p.inventory[p.selectedSlot] = item;
      s.items = s.items.filter(i => i.id !== item.id);
      if (old) s.items.push({ ...old, x: p.x, y: p.y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5 });
    }
    safeSend({ type: 'STATE_UPDATE', state: { items: s.items } });
  }, []);

  useEffect(() => {
    const conns: any[] = Array.isArray(conn) ? conn : (conn ? [conn] : []);
    if (conns.length === 0) return;

    const processMsg = (msg: NetworkMessage) => {
      const s = stateRef.current;
      if (msg.type === 'STATE_UPDATE') {
        if (msg.state.crates) s.crates = msg.state.crates;
        if (msg.state.items) s.items = msg.state.items;
        if (msg.state.storm) s.storm = msg.state.storm;
        if (msg.state.remainingPlayers !== undefined) {
          s.remainingPlayers = msg.state.remainingPlayers;
          if (s.remainingPlayers === 1 && !gameWinnerRef.current) {
            const winner = (Object.values(s.players) as Player[]).find(pl => pl.health > 0);
            if (winner && winner.id !== localId) {
              const wName = usernames[winner.id] ?? `P${parseInt(winner.id.replace('p', '')) + 1}`;
              gameWinnerRef.current = wName;
              setGameWinner(wName);
              if (spectatingIdRef.current !== null) {
                spectatingIdRef.current = null;
                setSpectatingId(null);
              }
            }
          }
        }
        if (msg.state.campfires) s.campfires = msg.state.campfires;
        if (msg.state.stormCircle !== undefined) s.stormCircle = msg.state.stormCircle;
        if (msg.state.barrels) s.barrels = msg.state.barrels;
        if (msg.state.sandbagBarriers) s.sandbagBarriers = msg.state.sandbagBarriers;
        if (msg.state.grenades) s.grenades = msg.state.grenades;
        if (msg.state.smokeClouds) s.smokeClouds = msg.state.smokeClouds;
        if (msg.state.isGameOver !== undefined && !s.isGameOver) {
          s.isGameOver = msg.state.isGameOver;
          if (msg.state.placement !== undefined) s.placement = msg.state.placement;
        }
        if (msg.particleEvents) {
          msg.particleEvents.forEach(ev => spawnParticles(ev.x, ev.y, ev.color, ev.count, 'wood'));
        }
      } else if (msg.type === 'GRENADE_SPAWN') {
        if (!s.grenades.find(g => g.id === msg.grenade.id)) s.grenades.push(msg.grenade);
      } else if (msg.type === 'BARREL_HIT') {
        if (isHost) handleBarrelHit(msg.barrelId);
      } else if (msg.type === 'PLAYER_SYNC') {
        if (msg.player.id !== localId) s.players[msg.player.id] = { ...s.players[msg.player.id], ...msg.player };
      } else if (msg.type === 'BULLET_SPAWN') {
        s.bullets.push(msg.bullet);
      } else if (msg.type === 'PLAYER_HIT' && msg.targetId === localId) {
        const lp = s.players[localId];
        const wasAlive = lp.health > 0;
        let dmg = msg.damage;
        if (lp.armorHealth > 0) {
          const ab = Math.min(lp.armorHealth, dmg * 0.7);
          lp.armorHealth -= ab; dmg -= ab;
          if (lp.armorHealth <= 0) { lp.armorHealth = 0; lp.currentArmor = null; lp.maxArmorHealth = 0; }
        }
        lp.health = Math.max(0, lp.health - dmg);
        lp.killedBy = msg.attackerId;
        spawnParticles(lp.x, lp.y, '#ef4444', 8, 'blood');
        safeSend({ type: 'STATE_UPDATE', state: {}, particleEvents: [{ x: lp.x, y: lp.y, color: '#ef4444', count: 8 }] });
        if (wasAlive && lp.health <= 0) {
          safeSend({ type: 'KILL_CREDIT', killerId: msg.attackerId, victimId: localId });
        }
      } else if (msg.type === 'KILL_CREDIT') {
        if (msg.killerId === localId) s.players[localId].kills++;
        // Host immediately marks victim dead so remaining-player count is accurate on the very next frame
        if (isHost && s.players[msg.victimId]) s.players[msg.victimId].health = 0;
        killerMapRef.current[msg.victimId] = msg.killerId;
        // Auto-switch spectating if the player we're watching just died
        if (spectatingIdRef.current === msg.victimId) {
          const nextId = msg.killerId;
          const nextPlayer = s.players[nextId];
          if (nextId !== localId && nextPlayer && nextPlayer.health > 0) {
            spectatingIdRef.current = nextId;
            setSpectatingId(nextId);
          } else {
            spectatingIdRef.current = null;
            setSpectatingId(null);
          }
        }
        addKillFeedEntry(msg.killerId, msg.victimId);
      }
    };

    const handlers: Array<[any, Function]> = [];
    conns.forEach((c, connIdx) => {
      const handler = (msg: NetworkMessage) => {
        // Host relay logic
        if (isHost) {
          if (msg.type === 'PLAYER_SYNC' || msg.type === 'BULLET_SPAWN') {
            conns.forEach(oc => { if (oc !== c && oc?.open) oc.send(msg); });
          } else if (msg.type === 'PLAYER_HIT') {
            if (msg.targetId !== localId) { safeSendTo(msg, msg.targetId); return; }
          } else if (msg.type === 'KILL_CREDIT') {
            conns.forEach(oc => { if (oc?.open) oc.send(msg); });
          } else if (msg.type === 'STATE_UPDATE') {
            conns.forEach(oc => { if (oc !== c && oc?.open) oc.send(msg); });
          } else if (msg.type === 'CRATE_HIT') {
            handleCrateHit(msg.crateId); return;
          } else if (msg.type === 'GRENADE_SPAWN') {
            conns.forEach(oc => { if (oc !== c && oc?.open) oc.send(msg); });
          } else if (msg.type === 'BARREL_HIT') {
            handleBarrelHit(msg.barrelId); return;
          }
        }
        processMsg(msg);
      };
      c.on('data', handler);
      handlers.push([c, handler]);
    });

    return () => { handlers.forEach(([c, h]) => c.off('data', h)); };
  }, [conn, isHost, handleCrateHit, handleBarrelHit, localId, addKillFeedEntry]);

  const update = useCallback(() => {
    const s = stateRef.current;
    const p = s.players[s.localPlayerId];

    // Particles always animate regardless of game-over state
    s.particles.forEach(pt => { pt.x += pt.vx; pt.y += pt.vy; pt.vx *= 0.95; pt.vy *= 0.95; pt.life--; });
    s.particles = s.particles.filter(pt => pt.life > 0);
    // Non-host clients stop game logic when dead; host keeps running to maintain authoritative state for others
    // Keep running if spectating so bullets/particles continue animating
    if (s.isGameOver && !isHost && spectatingIdRef.current === null) { setUiState({ ...s }); return; }

    const storm = s.storm;

    // Delta time: convert real elapsed ms to 60fps tick units
    const now = performance.now();
    const deltaMs = Math.min(now - lastUpdateTime.current, 5000); // cap at 5s to avoid huge jumps
    lastUpdateTime.current = now;
    const deltaTicks = (deltaMs / 1000) * 60;

    // Movement: ONLY for local player
    if (p.health > 0) {
      let dx = 0, dy = 0;
      if (keys.current['w']) dy -= 1; if (keys.current['s']) dy += 1;
      if (keys.current['a']) dx -= 1; if (keys.current['d']) dx += 1;

      if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = p.x + (dx / len) * PLAYER_SPEED;
        const ny = p.y + (dy / len) * PLAYER_SPEED;

        let cx = true, cy = true;
        // Building wall collision
        s.buildings.forEach(bld => {
          bld.wallRects.forEach(wr => {
            const wx = bld.x + wr.x, wy = bld.y + wr.y;
            const hw = wr.w / 2 + PLAYER_RADIUS, hh = wr.h / 2 + PLAYER_RADIUS;
            if (Math.abs(wx - nx) < hw && Math.abs(wy - p.y) < hh) cx = false;
            if (Math.abs(wx - p.x) < hw && Math.abs(wy - ny) < hh) cy = false;
          });
        });
        [...s.crates, ...s.envObjects.filter(o => !o.type.includes('bush'))].forEach(obj => {
          const envObj = ('leafTimer' in obj) ? obj as EnvObject : null;
          if (envObj && envObj.w && envObj.h) {
            // AABB collision for rectangular (long) walls
            const hw = envObj.w / 2 + PLAYER_RADIUS;
            const hh = envObj.h / 2 + PLAYER_RADIUS;
            if (Math.abs(envObj.x - nx) < hw && Math.abs(envObj.y - p.y) < hh) cx = false;
            if (Math.abs(envObj.x - p.x) < hw && Math.abs(envObj.y - ny) < hh) cy = false;
          } else {
            const br = ('type' in obj ? (obj.type === 'tree' ? (obj as EnvObject).size * 0.38 : obj.type === 'rock' ? ((obj as EnvObject).size * 0.6) : obj.type.includes('wall') ? 30 : 45) : 45) + PLAYER_RADIUS;
            if (Math.sqrt((obj.x - nx) ** 2 + (obj.y - p.y) ** 2) < br) cx = false;
            if (Math.sqrt((obj.x - p.x) ** 2 + (obj.y - ny) ** 2) < br) cy = false;
          }
        });
        // Sandbag barrier collision
        s.sandbagBarriers.forEach(sb => {
          const br = 30 + PLAYER_RADIUS;
          if (Math.sqrt((sb.x - nx) ** 2 + (sb.y - p.y) ** 2) < br) cx = false;
          if (Math.sqrt((sb.x - p.x) ** 2 + (sb.y - ny) ** 2) < br) cy = false;
        });
        // Barrel collision
        s.barrels.forEach(barrel => {
          const br = 18 + PLAYER_RADIUS;
          if (Math.sqrt((barrel.x - nx) ** 2 + (barrel.y - p.y) ** 2) < br) cx = false;
          if (Math.sqrt((barrel.x - p.x) ** 2 + (barrel.y - ny) ** 2) < br) cy = false;
        });
        if (cx) p.x = Math.max(20, Math.min(worldSize - 20, nx));
        if (cy) p.y = Math.max(20, Math.min(worldSize - 20, ny));
      }

      p.rotation = Math.atan2(mousePos.current.y - window.innerHeight / 2, mousePos.current.x - window.innerWidth / 2);
    }

    // Auto-fire for AR when holding mouse button
    if (mouseDownRef.current && p.health > 0) {
      const item = p.inventory[p.selectedSlot];
      if (item?.type === 'assault_rifle') {
        const now = Date.now();
        if (now - lastShootTime.current >= AR_AUTO_COOLDOWN) {
          shoot();
        }
      }
    }

    if (p.punchCooldown > 0) p.punchCooldown--; else p.isPunching = false;

    // Frequent sync
    if (frameCount.current % 2 === 0) {
      safeSend({ type: 'PLAYER_SYNC', player: p });
    }

    // Timer logic: use real elapsed time so it runs even when tab is hidden
    storm.timer -= deltaTicks;

    // Radius animation during closing — runs on both client and host for smooth visuals
    if (storm.phase === 'closing') {
      const progress = 1 - Math.max(0, storm.timer) / storm.phaseTime;
      storm.radius = storm.startRadius + (storm.targetRadius - storm.startRadius) * Math.min(1, progress);
    }

    // Host authoritative logic: phase transitions
    if (isHost) {
      if (storm.timer <= 0) {
        if (storm.phase === 'initial_wait') {
          storm.startRadius = storm.radius;
          storm.phase = 'closing'; storm.timer = 600; storm.phaseTime = 600;
        } else if (storm.phase === 'closing') {
          storm.radius = storm.targetRadius; // snap
          storm.phase = 'holding'; storm.timer = 3000; storm.phaseTime = 3000;
        } else if (storm.phase === 'holding') {
          // Compute next cycle target and shift center
          const nextTarget = Math.round(storm.targetRadius * 0.6);
          storm.nextTargetRadius = nextTarget;
          const drift = storm.targetRadius * 0.35;
          storm.x = Math.max(storm.targetRadius + 60, Math.min(worldSize - storm.targetRadius - 60,
            storm.x + (Math.random() - 0.5) * drift * 2));
          storm.y = Math.max(storm.targetRadius + 60, Math.min(worldSize - storm.targetRadius - 60,
            storm.y + (Math.random() - 0.5) * drift * 2));
          storm.phase = 'waiting'; storm.timer = 3600; storm.phaseTime = 3600;
          // Supply drop every circle
          s.stormCircle++;
          if (s.stormCircle >= 1) {
            const dropAngle = Math.random() * Math.PI * 2;
            const dropDist = Math.random() * storm.radius * 0.55;
            s.crates.push({
              id: `supply-${Math.random().toString(36).slice(2)}`,
              x: Math.round(storm.x + Math.cos(dropAngle) * dropDist),
              y: Math.round(storm.y + Math.sin(dropAngle) * dropDist),
              health: 8, maxHealth: 8, isSupplyDrop: true,
            });
          }
          safeSend({ type: 'STATE_UPDATE', state: { crates: s.crates, stormCircle: s.stormCircle } });
        } else if (storm.phase === 'waiting') {
          storm.startRadius = storm.radius; // = targetRadius from last holding
          storm.targetRadius = storm.nextTargetRadius;
          storm.phase = 'closing'; storm.timer = 600; storm.phaseTime = 600;
        }
      }

      const alivePlayers = (Object.values(s.players) as Player[]).filter(pl => pl.health > 0);
      s.remainingPlayers = alivePlayers.length;

      // Notify each newly-dead player of their placement exactly once
      (Object.values(s.players) as Player[]).forEach(pl => {
        if (pl.health <= 0 && !notifiedDeadRef.current.has(pl.id)) {
          notifiedDeadRef.current.add(pl.id);
          const deathPlacement = s.remainingPlayers + 1;
          if (pl.id === localId) {
            s.isGameOver = true; s.placement = deathPlacement;
          } else {
            safeSendTo({ type: 'STATE_UPDATE', state: { isGameOver: true, placement: deathPlacement } }, pl.id);
          }
        }
      });

      // Broadcast immediately when player count drops
      if (s.remainingPlayers !== prevRemainingRef.current) {
        prevRemainingRef.current = s.remainingPlayers;
        safeSend({ type: 'STATE_UPDATE', state: { remainingPlayers: s.remainingPlayers } });
      }

      // Victory: trigger exactly once when 1 player remains
      if (s.remainingPlayers === 1 && !victoryFiredRef.current) {
        victoryFiredRef.current = true;
        const survivor = alivePlayers[0];
        if (survivor.id === localId) {
          s.isGameOver = true; s.placement = 1;
        } else {
          safeSendTo({ type: 'STATE_UPDATE', state: { isGameOver: true, placement: 1 } }, survivor.id);
          // Show winner for host if they died earlier
          if (s.isGameOver && s.placement > 1 && !gameWinnerRef.current) {
            const wName = usernames[survivor.id] ?? `P${parseInt(survivor.id.replace('p', '')) + 1}`;
            gameWinnerRef.current = wName;
            setGameWinner(wName);
            if (spectatingIdRef.current !== null) {
              spectatingIdRef.current = null;
              setSpectatingId(null);
            }
          }
        }
      }

      // Frequent state sync for storm and crates
      if (frameCount.current % 20 === 0) {
        safeSend({ type: 'STATE_UPDATE', state: { crates: s.crates, storm, remainingPlayers: s.remainingPlayers } });
      }
    }

    // Storm Damage — during closing and holding phases
    if (p.health > 0 && (storm.phase === 'holding' || storm.phase === 'closing') &&
      Math.sqrt((p.x - storm.x) ** 2 + (p.y - storm.y) ** 2) > storm.radius) {
      if (Date.now() - lastStormTick.current > 1000) {
        lastStormTick.current = Date.now();
        p.health = Math.max(0, p.health - STORM_DAMAGE);
      }
    }

    // Campfire healing
    let campfireUpdated = false;
    let beingHealed = false;
    s.campfires.forEach(cf => {
      const dist = Math.hypot(p.x - cf.x, p.y - cf.y);
      const inRange = dist < 68 && p.health > 0 && p.health < p.maxHealth && cf.uses > 0;
      if (inRange) {
        beingHealed = true;
        cf.healTimer = (cf.healTimer || 0) + deltaTicks;
        if (cf.healTimer >= 60) {
          cf.healTimer -= 60;
          cf.uses = Math.max(0, cf.uses - 1);
          p.health = Math.min(p.maxHealth, p.health + 5);
          cf.regenTimer = 0;
          campfireUpdated = true;
          spawnParticles(p.x, p.y - 10, '#22c55e', 5, 'leaf');
        }
      } else {
        cf.healTimer = 0;
        if (cf.uses < cf.maxUses) {
          cf.regenTimer = (cf.regenTimer || 0) + deltaTicks;
          if (cf.regenTimer >= 600) {
            cf.regenTimer -= 600;
            cf.uses = Math.min(cf.maxUses, cf.uses + 1);
            campfireUpdated = true;
          }
        }
      }
    });
    playerBeingHealedRef.current = beingHealed;
    if (campfireUpdated && frameCount.current % 8 === 0) {
      safeSend({ type: 'STATE_UPDATE', state: { campfires: s.campfires } });
    }

    // Campfire smoke particles (spawned each update)
    if (frameCount.current % 14 === 0) {
      s.campfires.forEach(cf => {
        s.particles.push({
          id: Math.random().toString(), x: cf.x + (Math.random()-0.5)*4, y: cf.y - 12,
          vx: (Math.random()-0.5)*0.4, vy: -0.65 - Math.random()*0.5,
          life: 70 + Math.random()*50, maxLife: 120, color: '#888888',
          size: 5 + Math.random()*5,
        });
      });
    }

    // Bullet Physics
    s.bullets = s.bullets.filter(b => {
      // Decrement life counter — limits range to ~1440px regardless of map size
      if (b.life !== undefined) { b.life--; if (b.life <= 0) return false; }

      const nx = b.x + b.vx, ny = b.y + b.vy;
      let hit = false;

      // Bullet vs Remote Players (visual stop only — damage applied on each victim's client)
      if (!hit && b.ownerId === p.id) {
        for (const rid of remoteIds) {
          const remote = s.players[rid];
          if (remote && remote.health > 0 && Math.sqrt((remote.x - nx) ** 2 + (remote.y - ny) ** 2) < 25) {
            hit = true;
            p.shotsHit = (p.shotsHit || 0) + 1;
            p.damageDealt = (p.damageDealt || 0) + b.damage;
            break;
          }
        }
      }

      // Bullet vs Local Player
      if (!hit && p.health > 0 && b.ownerId !== p.id && Math.sqrt((p.x - nx) ** 2 + (p.y - ny) ** 2) < 25) {
        hit = true;
        let finalDmg = b.damage;
        if (p.armorHealth > 0) {
          const armorAbsorb = Math.min(p.armorHealth, finalDmg * 0.7);
          p.armorHealth -= armorAbsorb;
          finalDmg -= armorAbsorb;
          if (p.armorHealth <= 0) {
            p.armorHealth = 0;
            p.currentArmor = null;
            p.maxArmorHealth = 0;
          }
        }
        const prevHealth = p.health;
        p.health = Math.max(0, p.health - finalDmg);
        p.damageTaken = (p.damageTaken || 0) + finalDmg;
        spawnParticles(nx, ny, '#ef4444', 8, 'blood');
        // Tell the shooter to show blood particles at the hit position
        safeSend({ type: 'STATE_UPDATE', state: {}, particleEvents: [{ x: nx, y: ny, color: '#ef4444', count: 8 }] });
        if (prevHealth > 0 && p.health <= 0) {
          p.killedBy = b.ownerId;
          safeSend({ type: 'KILL_CREDIT', killerId: b.ownerId, victimId: localId });
        }
      }

      // Bullet vs Environment
      s.crates.forEach(c => {
        if (!hit && Math.sqrt((c.x - nx) ** 2 + (c.y - ny) ** 2) < 45) {
          hit = true;
          if (isHost) handleCrateHit(c.id);
        }
      });

      s.envObjects.filter(o => o.type.includes('wall')).forEach(w => {
        if (!hit) {
          let wallHit = false;
          if (w.w && w.h) {
            // AABB for rectangular long walls
            wallHit = Math.abs(w.x - nx) < w.w / 2 + 4 && Math.abs(w.y - ny) < w.h / 2 + 4;
          } else {
            wallHit = Math.sqrt((w.x - nx) ** 2 + (w.y - ny) ** 2) < 30;
          }
          if (wallHit) {
            hit = true;
            const col = w.type.includes('stone') || w.type.includes('mossy') ? '#94a3b8'
              : w.type.includes('metal') ? '#cbd5e1'
              : w.type.includes('brick') ? '#b45309'
              : '#78350f';
            spawnParticles(nx, ny, col, 5, 'stone');
          }
        }
      });
      // Bullet vs Building walls
      if (!hit) {
        const matColors: Record<Building['material'], string> = { wood:'#a16207', stone:'#94a3b8', brick:'#b45309', metal:'#cbd5e1' };
        for (const bld of s.buildings) {
          if (hit) break;
          for (const wr of bld.wallRects) {
            const wx = bld.x + wr.x, wy = bld.y + wr.y;
            if (Math.abs(wx - nx) < wr.w / 2 + 4 && Math.abs(wy - ny) < wr.h / 2 + 4) {
              hit = true;
              spawnParticles(nx, ny, matColors[bld.material], 4, 'stone');
              break;
            }
          }
        }
      }

      // Bullet vs Rocks
      if (!hit) {
        s.envObjects.filter(o => o.type === 'rock').forEach(rock => {
          if (!hit && Math.sqrt((rock.x - nx) ** 2 + (rock.y - ny) ** 2) < rock.size * 0.6) {
            hit = true;
            spawnParticles(nx, ny, '#94a3b8', 5, 'stone');
          }
        });
      }
      // Bullet vs Sandbag barriers
      if (!hit) {
        s.sandbagBarriers.forEach(sb => {
          if (!hit && Math.sqrt((sb.x - nx) ** 2 + (sb.y - ny) ** 2) < 30) {
            hit = true;
            spawnParticles(nx, ny, '#c4a060', 4, 'stone');
          }
        });
      }
      // Bullet vs Barrels
      if (!hit) {
        s.barrels.forEach(barrel => {
          if (!hit && Math.sqrt((barrel.x - nx) ** 2 + (barrel.y - ny) ** 2) < 20) {
            hit = true;
            spawnParticles(nx, ny, '#ff6600', 6, 'stone');
            if (isHost) handleBarrelHit(barrel.id);
            else safeSend({ type: 'BARREL_HIT', barrelId: barrel.id });
          }
        });
      }

      b.x = nx; b.y = ny;
      return !hit && nx > 0 && nx < worldSize && ny > 0 && ny < worldSize;
    });

    // Grenade physics
    s.grenades = s.grenades.filter(g => {
      const GRENADE_R = 5;
      const BOUNCE = 0.4;
      // Bounce helper for circular obstacles
      const bounceCircle = (ox: number, oy: number, r: number) => {
        const nx = g.x + g.vx, ny = g.y + g.vy;
        if (Math.hypot(nx - ox, ny - oy) < r) {
          const len = Math.hypot(g.x - ox, g.y - oy);
          const ndx = len > 0.01 ? (g.x - ox) / len : 1;
          const ndy = len > 0.01 ? (g.y - oy) / len : 0;
          const dot = g.vx * ndx + g.vy * ndy;
          if (dot < 0) { g.vx = (g.vx - 2 * dot * ndx) * BOUNCE; g.vy = (g.vy - 2 * dot * ndy) * BOUNCE; }
        }
      };
      // Bounce off building walls (AABB)
      s.buildings.forEach(bld => {
        bld.wallRects.forEach(wr => {
          const wx = bld.x + wr.x, wy = bld.y + wr.y;
          const hw = wr.w / 2 + GRENADE_R, hh = wr.h / 2 + GRENADE_R;
          const nx = g.x + g.vx, ny = g.y + g.vy;
          if (Math.abs(wx - nx) < hw && Math.abs(wy - ny) < hh) {
            const prevInX = Math.abs(wx - g.x) < hw;
            const prevInY = Math.abs(wy - g.y) < hh;
            if (!prevInX && prevInY) g.vx = -g.vx * BOUNCE;
            else if (prevInX && !prevInY) g.vy = -g.vy * BOUNCE;
            else { g.vx = -g.vx * BOUNCE; g.vy = -g.vy * BOUNCE; }
          }
        });
      });
      // Bounce off env walls
      s.envObjects.filter(o => o.type.includes('wall')).forEach(w => {
        const nx = g.x + g.vx, ny = g.y + g.vy;
        if (w.w && w.h) {
          const hw = w.w / 2 + GRENADE_R, hh = w.h / 2 + GRENADE_R;
          if (Math.abs(w.x - nx) < hw && Math.abs(w.y - ny) < hh) {
            const prevInX = Math.abs(w.x - g.x) < hw;
            const prevInY = Math.abs(w.y - g.y) < hh;
            if (!prevInX && prevInY) g.vx = -g.vx * BOUNCE;
            else if (prevInX && !prevInY) g.vy = -g.vy * BOUNCE;
            else { g.vx = -g.vx * BOUNCE; g.vy = -g.vy * BOUNCE; }
          }
        } else { bounceCircle(w.x, w.y, 30 + GRENADE_R); }
      });
      // Bounce off rocks, crates, sandbags, barrels
      s.envObjects.filter(o => o.type === 'rock').forEach(rock => bounceCircle(rock.x, rock.y, rock.size * 0.6 + GRENADE_R));
      s.crates.forEach(c => bounceCircle(c.x, c.y, 45 + GRENADE_R));
      s.sandbagBarriers.forEach(sb => bounceCircle(sb.x, sb.y, 30 + GRENADE_R));
      s.barrels.forEach(barrel => bounceCircle(barrel.x, barrel.y, 18 + GRENADE_R));

      g.x += g.vx; g.y += g.vy;
      g.vx *= 0.94; g.vy *= 0.94;
      g.fuseTimer--;
      if (g.fuseTimer <= 0) {
        if (isHost) {
          if (!g.isSmokeGrenade) {
            const GREN_RADIUS = 220;
            (Object.values(s.players) as Player[]).forEach(pl => {
              if (pl.health > 0 && pl.id !== g.ownerId) {
                const dist = Math.hypot(pl.x - g.x, pl.y - g.y);
                if (dist < GREN_RADIUS && !explosionBlocked(g.x, g.y, pl.x, pl.y, s)) {
                  const dmg = Math.round(80 * (1 - dist / GREN_RADIUS));
                  if (pl.id === localId) {
                    pl.health = Math.max(0, pl.health - dmg);
                    pl.damageTaken = (pl.damageTaken || 0) + dmg;
                  } else {
                    safeSendTo({ type: 'PLAYER_HIT', targetId: pl.id, damage: dmg, attackerId: g.ownerId }, pl.id);
                  }
                }
              }
            });
            // Chain-trigger barrels in blast radius
            const nearBarrelIds = s.barrels.filter(b => Math.hypot(b.x - g.x, b.y - g.y) < GREN_RADIUS).map(b => b.id);
            nearBarrelIds.forEach(bid => handleBarrelHit(bid));
            spawnParticles(g.x, g.y, '#ff4400', 25, 'stone');
            spawnParticles(g.x, g.y, '#ff8800', 15, 'stone');
            spawnParticles(g.x, g.y, '#ffcc00', 10, 'stone');
            screenShakeRef.current = 14;
            safeSend({ type: 'STATE_UPDATE', state: { grenades: s.grenades, barrels: s.barrels }, particleEvents: [{ x: g.x, y: g.y, color: '#ff6600', count: 30 }] });
          } else {
            s.smokeClouds.push({ id: Math.random().toString(), x: g.x, y: g.y, radius: 0, maxRadius: 280, life: 600 });
            safeSend({ type: 'STATE_UPDATE', state: { smokeClouds: s.smokeClouds } });
          }
        }
        return false;
      }
      return true;
    });

    // Smoke cloud physics - 5 seconds visible, 5 seconds fade out
    s.smokeClouds.forEach(sc => {
      if (sc.radius < sc.maxRadius) sc.radius += (sc.maxRadius - sc.radius) * 0.04;
      sc.life--;
    });
    s.smokeClouds = s.smokeClouds.filter(sc => sc.life > 0);

    // Update network with smoke cloud changes periodically
    if (isHost && frameCount.current % 30 === 0 && s.smokeClouds.length > 0) {
      safeSend({ type: 'STATE_UPDATE', state: { smokeClouds: s.smokeClouds } });
    }

    // Item Proximity
    const dists = s.items.map(i => Math.sqrt((i.x - p.x) ** 2 + (i.y - p.y) ** 2));
    const closeIdx = dists.findIndex(d => d < PICKUP_RANGE);
    const foundItem = closeIdx !== -1 ? s.items[closeIdx] : null;
    nearbyItemRef.current = foundItem;
    setNearbyItem(foundItem);

    if (p.health <= 0 && !localDeathHandled.current) {
      localDeathHandled.current = true;
      // Spurt entire inventory + armor onto the ground
      p.inventory.forEach(i => { if (i) s.items.push({ ...i, x: p.x, y: p.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20 }); });
      if (p.currentArmor) s.items.push({ ...p.currentArmor, x: p.x, y: p.y, armorHealth: p.armorHealth, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20 });
      p.inventory = [null, null, null, null, null];
      p.currentArmor = null;
      // Final sync so host immediately sees health=0 for accurate player count
      safeSend({ type: 'PLAYER_SYNC', player: { ...p } });
      safeSend({ type: 'STATE_UPDATE', state: { items: s.items } });
      // Host handles its own placement in the host logic block below; clients wait for host to confirm
    }

    // Item physics
    s.items.forEach(i => {
      i.x += (i.vx || 0); i.y += (i.vy || 0);
      i.vx = (i.vx || 0) * 0.85; i.vy = (i.vy || 0) * 0.85;
      i.x = Math.max(50, Math.min(worldSize - 50, i.x));
      i.y = Math.max(50, Math.min(worldSize - 50, i.y));
    });

    setUiState({ ...s });
    frameCount.current++;
  }, [isHost, handleCrateHit, handleBarrelHit, localId, shoot]);

  useEffect(() => {
    const hkd = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        stateRef.current.players[localId].selectedSlot = parseInt(e.key) - 1;
      }
      if (e.key === 'e') {
        if (nearbyItemRef.current) {
          pickupItem(nearbyItemRef.current);
        } else {
          const _p = stateRef.current.players[localId];
          const _item = _p.inventory[_p.selectedSlot];
          if (_item && (_item.type === 'grenade' || _item.type === 'smoke_grenade')) {
            throwModeRef.current = true; setThrowModeActive(true);
          } else { useMed(); }
        }
      }
      if (e.key === 'escape') { throwModeRef.current = false; setThrowModeActive(false); }
      if (e.key === 'g') throwGrenade();
      if (e.key === 'q') {
        const p = stateRef.current.players[localId];
        const item = p.inventory[p.selectedSlot];
        if (item) {
          p.inventory[p.selectedSlot] = null;
          stateRef.current.items.push({ ...item, x: p.x, y: p.y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5 });
          safeSend({ type: 'STATE_UPDATE', state: { items: stateRef.current.items } });
        }
      }
    };
    const hku = (e: KeyboardEvent) => keys.current[e.key.toLowerCase()] = false;
    const hmm = (e: MouseEvent) => mousePos.current = { x: e.clientX, y: e.clientY };
    const hmd = (e: MouseEvent) => {
      if (e.button === 0) mouseDownRef.current = true;
      if (!stateRef.current.isGameOver) {
        if (throwModeRef.current) {
          if (e.button === 0) executeThrowTowardMouse();
          else if (e.button === 2) { throwModeRef.current = false; setThrowModeActive(false); }
          return;
        }
        const p = stateRef.current.players[localId];
        const wpType = p.inventory[p.selectedSlot]?.type;
        if (wpType === 'pistol' || wpType === 'assault_rifle' || wpType === 'shotgun') shoot(); else punch();
      }
    };
    const hmu = (e: MouseEvent) => { if (e.button === 0) mouseDownRef.current = false; };
    const hrmc = (e: MouseEvent) => { if (throwModeRef.current) e.preventDefault(); };
    window.addEventListener('keydown', hkd); window.addEventListener('keyup', hku);
    window.addEventListener('mousemove', hmm); window.addEventListener('mousedown', hmd);
    window.addEventListener('mouseup', hmu);
    window.addEventListener('contextmenu', hrmc);
    return () => {
      window.removeEventListener('keydown', hkd); window.removeEventListener('keyup', hku);
      window.removeEventListener('mousemove', hmm); window.removeEventListener('mousedown', hmd);
      window.removeEventListener('mouseup', hmu);
      window.removeEventListener('contextmenu', hrmc);
    };
  }, [shoot, punch, pickupItem, useMed, throwGrenade, executeThrowTowardMouse, localId, isHost]);

  const handleInventorySwap = useCallback((from: number, to: number) => {
    const s = stateRef.current;
    const p = s.players[localId];
    const temp = p.inventory[from];
    p.inventory[from] = p.inventory[to];
    p.inventory[to] = temp;
  }, [localId]);

  const handleInventoryDrop = useCallback((slot: number) => {
    const s = stateRef.current;
    const p = s.players[localId];
    const item = p.inventory[slot];
    if (item) {
      p.inventory[slot] = null;
      s.items.push({ ...item, x: p.x, y: p.y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5 });
      safeSend({ type: 'STATE_UPDATE', state: { items: s.items } });
    }
  }, [localId]);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;

    const render = () => {
      update();
      cv.width = window.innerWidth; cv.height = window.innerHeight;
      const s = stateRef.current;
      const p = s.players[s.localPlayerId];
      const shakeX = screenShakeRef.current > 0 ? (Math.random() - 0.5) * screenShakeRef.current : 0;
      const shakeY = screenShakeRef.current > 0 ? (Math.random() - 0.5) * screenShakeRef.current : 0;
      if (screenShakeRef.current > 0) screenShakeRef.current--;
      const specTarget = spectatingIdRef.current ? s.players[spectatingIdRef.current] : null;
      const camCenter = (specTarget && specTarget.health > 0) ? specTarget : p;
      const camX = camCenter.x - cv.width / 2 + shakeX, camY = camCenter.y - cv.height / 2 + shakeY;

      ctx.save(); ctx.translate(-camX, -camY);

      // Water — fills viewport; map floor drawn on top covers interior
      const waveOff1 = (frameCount.current * 0.4) % 80;
      const waveOff2 = (frameCount.current * 0.25) % 60;
      ctx.fillStyle = '#0a3d5c';
      ctx.fillRect(camX, camY, cv.width, cv.height);
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.06)';
      ctx.lineWidth = 1.5;
      for (let wx = Math.floor(camX / 80) * 80; wx < camX + cv.width + 80; wx += 80) {
        for (let wy = Math.floor(camY / 80) * 80; wy < camY + cv.height + 80; wy += 80) {
          if (wx > -10 && wx < worldSize + 10 && wy > -10 && wy < worldSize + 10) continue;
          ctx.beginPath();
          ctx.arc(wx + waveOff1, wy + waveOff2, 12, 0.15, Math.PI - 0.15);
          ctx.stroke();
        }
      }

      // Floor — varied dark green tiles
      const floorPalette = ['#064e3b', '#053d30', '#074f3c', '#055840', '#054538'];
      const tileSize = 200;
      for (let tx = 0; tx < worldSize; tx += tileSize) {
        for (let ty = 0; ty < worldSize; ty += tileSize) {
          if (tx + tileSize < camX || tx > camX + cv.width || ty + tileSize < camY || ty > camY + cv.height) continue;
          const idx = Math.floor(((tx / tileSize) * 3 + (ty / tileSize) * 7) % floorPalette.length);
          ctx.fillStyle = floorPalette[idx];
          ctx.fillRect(tx, ty, tileSize, tileSize);
        }
      }
      // Subtle grid
      ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 1;
      for (let x = 0; x <= worldSize; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, worldSize); ctx.stroke(); }
      for (let y = 0; y <= worldSize; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(worldSize, y); ctx.stroke(); }

      // Map edge shadow
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 24; ctx.strokeRect(0, 0, worldSize, worldSize);
      ctx.shadowBlur = 0; ctx.restore();

      // Building floors
      const bFloorColors: Record<Building['material'], string> = { wood:'#2d1604', stone:'#202330', brick:'#2a1008', metal:'#151c28' };
      s.buildings.forEach(bld => {
        ctx.fillStyle = bFloorColors[bld.material];
        ctx.fillRect(bld.x - bld.outerW/2, bld.y - bld.outerH/2, bld.outerW, bld.outerH);
        // Subtle floor planks/tiles
        ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
        const step = 32;
        for (let fx = bld.x - bld.outerW/2; fx < bld.x + bld.outerW/2; fx += step) {
          ctx.beginPath(); ctx.moveTo(fx, bld.y - bld.outerH/2); ctx.lineTo(fx, bld.y + bld.outerH/2); ctx.stroke();
        }
        for (let fy = bld.y - bld.outerH/2; fy < bld.y + bld.outerH/2; fy += step) {
          ctx.beginPath(); ctx.moveTo(bld.x - bld.outerW/2, fy); ctx.lineTo(bld.x + bld.outerW/2, fy); ctx.stroke();
        }
      });

      // Building walls (exterior + interior) — drawn before players
      const bWallFill: Record<Building['material'], string> = { wood:'#8b4513', stone:'#5a6272', brick:'#9b3a1a', metal:'#8a9ab0' };
      const bWallBorder: Record<Building['material'], string> = { wood:'#3d1e08', stone:'#2e3440', brick:'#6b2510', metal:'#3a4555' };
      s.buildings.forEach(bld => {
        const fill = bWallFill[bld.material], border = bWallBorder[bld.material];
        // Fill all wall rects first — corner overlaps are invisible since same colour
        bld.wallRects.forEach(wr => {
          const wx = bld.x + wr.x, wy = bld.y + wr.y;
          ctx.fillStyle = fill;
          ctx.fillRect(wx - wr.w/2, wy - wr.h/2, wr.w, wr.h);
        });
        // Single outer border — no seam lines at wall junctions
        ctx.strokeStyle = border; ctx.lineWidth = 3;
        ctx.strokeRect(bld.x - bld.outerW/2, bld.y - bld.outerH/2, bld.outerW, bld.outerH);
      });

      // Env Objects — walls and tree trunks (drawn under players)
      s.envObjects.forEach(o => {
        if (o.type === 'tree') {
          // Trunk
          ctx.fillStyle = '#2c1810'; ctx.beginPath(); ctx.arc(o.x, o.y + 4, 9, 0, Math.PI * 2); ctx.fill();
        } else if (o.type.includes('wall')) {
          ctx.save(); ctx.translate(o.x, o.y);

          // Long walls use explicit w/h; square walls use 60×60
          const wallW = o.w || 60;
          const wallH = o.h || 60;
          const hw = wallW / 2, hh = wallH / 2;

          const isStone  = o.type.includes('stone') && !o.type.includes('mossy');
          const isMetal  = o.type.includes('metal');
          const isBrick  = o.type.includes('brick');
          const isMossy  = o.type.includes('mossy');
          const isWood   = o.type.includes('wood');

          const wallFill  = isStone ? '#5a6272' : isMetal ? '#8a9ab0' : isBrick ? '#9b3a1a' : isMossy ? '#4a5e45' : '#8b4513';
          const mortarCol = isStone ? '#2e3440' : isMetal ? '#3a4555' : isBrick ? '#6b2510' : isMossy ? '#2a3a28' : '#3d1e08';

          ctx.fillStyle = wallFill; ctx.fillRect(-hw, -hh, wallW, wallH);
          ctx.strokeStyle = mortarCol; ctx.lineWidth = 2;

          // Brick pattern lines — adapt to wall dimensions
          const brickH = wallH / 3;
          for (let row = 1; row < 3; row++) {
            ctx.beginPath(); ctx.moveTo(-hw, -hh + row * brickH); ctx.lineTo(hw, -hh + row * brickH); ctx.stroke();
          }
          // Vertical dividers offset per row
          for (let row = 0; row < 3; row++) {
            const offX = row % 2 === 0 ? 0 : wallW / 4;
            for (let col = 1; col < 4; col++) {
              const vx = -hw + offX + col * (wallW / 4);
              if (vx > -hw && vx < hw) {
                ctx.beginPath();
                ctx.moveTo(vx, -hh + row * brickH);
                ctx.lineTo(vx, -hh + (row + 1) * brickH);
                ctx.stroke();
              }
            }
          }

          // Mossy tint
          if (isMossy) {
            ctx.fillStyle = 'rgba(80, 140, 60, 0.25)';
            ctx.fillRect(-hw, -hh, wallW, wallH);
          }

          // Outline
          ctx.strokeStyle = mortarCol; ctx.lineWidth = 3; ctx.strokeRect(-hw, -hh, wallW, wallH);
          ctx.restore();
        }
      });

      // Crates
      s.crates.forEach(c => {
        ctx.save(); ctx.translate(c.x, c.y);
        if (c.isSupplyDrop) {
          // Blue beam from above (draws attention from distance)
          const beamH = 300;
          const beamGrad = ctx.createLinearGradient(0, -beamH, 0, -28);
          beamGrad.addColorStop(0, 'rgba(59,130,246,0)');
          beamGrad.addColorStop(1, 'rgba(59,130,246,0.18)');
          ctx.fillStyle = beamGrad;
          ctx.fillRect(-12, -beamH, 24, beamH - 28);
          // Crate body — blue with gold star
          ctx.shadowBlur = 24; ctx.shadowColor = '#3b82f6';
          ctx.fillStyle = '#1e3a5f'; ctx.fillRect(-28, -28, 56, 56);
          ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 4; ctx.strokeRect(-28, -28, 56, 56);
          ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(-28,0); ctx.lineTo(28,0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,-28); ctx.lineTo(0,28); ctx.stroke();
          ctx.fillStyle = '#eab308'; ctx.font = 'bold 22px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', 0, 0);
          ctx.shadowBlur = 0;
          // HP bar
          const hp = c.health / c.maxHealth;
          ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-22, 32, 44, 6);
          ctx.fillStyle = '#3b82f6'; ctx.fillRect(-22, 32, 44 * hp, 6);
        } else if (c.isGold) {
          // Gold crate — yellow-brown body with gold trim and star
          ctx.fillStyle = '#92400e'; ctx.fillRect(-28, -28, 56, 56);
          ctx.strokeStyle = '#eab308'; ctx.lineWidth = 4; ctx.strokeRect(-28, -28, 56, 56);
          ctx.strokeStyle = '#ca8a04'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(28, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(0, 28); ctx.stroke();
          ctx.fillStyle = '#eab308'; ctx.font = 'bold 18px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', 0, 0);
        } else {
          ctx.fillStyle = '#78350f'; ctx.fillRect(-28, -28, 56, 56);
          ctx.strokeStyle = '#451a03'; ctx.lineWidth = 4; ctx.strokeRect(-28, -28, 56, 56);
          ctx.beginPath(); ctx.moveTo(-28, -28); ctx.lineTo(28, 28); ctx.stroke();
        }
        ctx.restore();
      });

      // Sandbag Barriers
      s.sandbagBarriers.forEach(barrier => {
        for (let i = 0; i < barrier.count; i++) {
          const offset = i - barrier.count / 2;
          const bx = barrier.x + Math.cos(barrier.angle) * offset * 22 + Math.sin(barrier.angle) * (i % 2) * 6;
          const by = barrier.y + Math.sin(barrier.angle) * offset * 22 - Math.cos(barrier.angle) * (i % 2) * 6;
          const bagAngle = barrier.angle + Math.PI / 2;
          ctx.save();
          ctx.shadowBlur = 6; ctx.shadowColor = 'rgba(0,0,0,0.35)';
          ctx.fillStyle = '#c4a060';
          ctx.beginPath(); ctx.ellipse(bx, by, 16, 10, bagAngle, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#8a6a30'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.strokeStyle = 'rgba(100,70,20,0.4)'; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bx + Math.cos(bagAngle) * 14, by + Math.sin(bagAngle) * 14);
          ctx.lineTo(bx - Math.cos(bagAngle) * 14, by - Math.sin(bagAngle) * 14);
          ctx.stroke();
          ctx.shadowBlur = 0; ctx.restore();
        }
      });

      // Explosive Barrels (top-down view)
      s.barrels.forEach(barrel => {
        const nearDeath = barrel.health <= 1;
        ctx.save(); ctx.translate(barrel.x, barrel.y);
        if (nearDeath) { ctx.shadowBlur = 22; ctx.shadowColor = 'rgba(255,100,0,0.9)'; }
        // Black outer ring
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
        // Red body
        ctx.fillStyle = nearDeath ? '#e03020' : '#c01a08';
        ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
        // Metal rim stroke
        ctx.strokeStyle = nearDeath ? '#ff7040' : '#6a0e02';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.stroke();
        // Inner detail ring
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.stroke();
        // Skull symbol
        ctx.shadowBlur = 0;
        ctx.fillStyle = nearDeath ? '#ffcc00' : '#ff4400';
        ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('☠', 0, 1);
        ctx.restore();
      });

      // Campfires
      s.campfires.forEach(cf => {
        const t = frameCount.current * 0.08;
        // Dotted range circle
        ctx.save();
        ctx.strokeStyle = 'rgba(255,140,40,0.2)'; ctx.lineWidth = 1.5;
        ctx.setLineDash([4,6]);
        ctx.beginPath(); ctx.arc(cf.x, cf.y, 68, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
        // Logs
        ctx.save(); ctx.translate(cf.x, cf.y);
        ctx.fillStyle = '#4a2c0a';
        ctx.save(); ctx.rotate(0.42); ctx.fillRect(-13,-3,26,6); ctx.restore();
        ctx.save(); ctx.rotate(-0.42); ctx.fillRect(-13,-3,26,6); ctx.restore();
        // Flame glow
        ctx.shadowBlur = 28; ctx.shadowColor = 'rgba(255,100,0,0.7)';
        // Outer flame
        ctx.fillStyle = `rgba(255,${Math.round(70+Math.sin(t)*20)},0,0.82)`;
        ctx.beginPath(); ctx.ellipse(Math.sin(t)*1.5, -7+Math.sin(t*0.8), 7+Math.sin(t)*1.5, 14+Math.sin(t*0.9)*2, Math.sin(t*0.3)*0.2, 0, Math.PI*2); ctx.fill();
        // Mid flame
        ctx.fillStyle = `rgba(255,${Math.round(150+Math.sin(t*1.2)*30)},0,0.9)`;
        ctx.beginPath(); ctx.ellipse(Math.sin(t*1.3), -10+Math.sin(t)*0.8, 5, 11+Math.sin(t*1.1)*1.5, Math.sin(t*0.5)*0.15, 0, Math.PI*2); ctx.fill();
        // Core
        ctx.fillStyle = 'rgba(255,240,160,1)';
        ctx.beginPath(); ctx.arc(0, -11, 2.5, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        // Usage bar
        const barW = 52, barH = 5;
        const fillFrac = cf.uses / cf.maxUses;
        const barCol = fillFrac > 0.6 ? '#22c55e' : fillFrac > 0.3 ? '#eab308' : '#ef4444';
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-barW/2-1, 16, barW+2, barH+2);
        ctx.fillStyle = barCol; ctx.fillRect(-barW/2, 17, barW * fillFrac, barH);
        ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '8px sans-serif';
        ctx.textAlign = 'center'; ctx.fillText(`${cf.uses}/${cf.maxUses}`, 0, 32);
        ctx.restore();
      });

      // Items
      s.items.forEach(i => {
        ctx.save(); ctx.translate(i.x, i.y);
        ctx.shadowBlur = 22; ctx.shadowColor = RARITY_COLORS[i.rarity];
        if (i.type === 'pistol' || i.type === 'assault_rifle' || i.type === 'shotgun' || i.type === 'grenade' || i.type === 'smoke_grenade') {
          const img = i.type === 'assault_rifle' ? arImgRef.current
            : i.type === 'shotgun' ? shotgunLogoImgRef.current
            : i.type === 'smoke_grenade' ? smokeLogoImgRef.current
            : grenadeLogoImgRef.current;
          if (img && img.complete && img.naturalWidth > 0) {
            const sz = i.type === 'assault_rifle' ? 50 : i.type === 'shotgun' ? 48 : 34;
            ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
          }
        } else {
          ctx.font = '32px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const em = i.type === 'armor' ? '🛡️'
            : i.type === 'ammo_crate' ? '📦'
            : i.type === 'medkit' ? '🎒'
            : i.type === 'heal_potion' ? '🧪'
            : i.type === 'heal_shot' ? '💉'
            : '🩹';
          ctx.fillText(em, 0, 0);
        }
        ctx.restore();
      });

      // Bullets
      s.bullets.forEach(b => {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        const bGrad = ctx.createLinearGradient(-13, 0, 5, 0);
        bGrad.addColorStop(0, 'rgba(255,180,0,0)');
        bGrad.addColorStop(0.55, 'rgba(255,220,80,0.75)');
        bGrad.addColorStop(1, 'rgba(255,255,210,1)');
        ctx.fillStyle = bGrad;
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath(); ctx.ellipse(3, 0, 3.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });

      // Players
      (Object.values(s.players) as Player[]).forEach(ply => {
        if (ply.health <= 0) return;
        ctx.save(); ctx.translate(ply.x, ply.y);

        if (ply.id === s.localPlayerId && !spectatingIdRef.current) {
          ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center'; ctx.fillText("YOU", 0, -35);
        } else if (spectatingIdRef.current === ply.id) {
          ctx.fillStyle = 'rgba(100,200,255,0.85)'; ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center'; ctx.fillText("SPECTATING", 0, -35);
        }

        ctx.rotate(ply.rotation);
        const skinColor = skinColors[ply.id] ?? (ply.id === localId ? '#ffe0bd' : '#ffdaad');
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;

        const wpType = ply.inventory[ply.selectedSlot]?.type;
        const isGunWpn = wpType === 'pistol' || wpType === 'assault_rifle' || wpType === 'shotgun';
        const isAR = wpType === 'assault_rifle';
        const isShotgun = wpType === 'shotgun';
        const kickbackMag = isGunWpn && ply.id === localId
          ? Math.max(0, 1 - (Date.now() - lastShootTime.current) / 120) * 5 : 0;

        // Gun geometry: shorter & wider so the sprite looks correct, grip starts inside body
        const gunLen = isAR ? 46 : isShotgun ? 40 : 30;
        const gunWid = isAR ? 30 : isShotgun ? 32 : 28;
        const gunCx = (isAR ? 31 : isShotgun ? 26 : 20) - kickbackMag;
        const gunCy = isAR ? 6 : 9;

        // 0. No-gun fist — drawn at the very bottom so body + head always cover it
        if (!isGunWpn) {
          ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
          ctx.fillStyle = skinColor;
          const pe = ply.isPunching ? 15 : 0;
          ctx.beginPath(); ctx.arc(12 + pe, 15, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }

        // 1. Gun image — lowest layer
        if (isGunWpn) {
          const img = isAR ? topDownARImgRef.current : isShotgun ? topDownShotgunImgRef.current : topDownPistolImgRef.current;
          ctx.save();
          ctx.translate(gunCx, gunCy);
          ctx.rotate(Math.PI / 2); // barrel (image top) → player forward (+x)
          if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, -gunWid / 2, -gunLen / 2, gunWid, gunLen);
          } else {
            ctx.fillStyle = isAR ? '#222' : isShotgun ? '#4a2a10' : '#333';
            ctx.fillRect(-gunWid / 2, -gunLen / 2, gunWid, gunLen);
          }
          ctx.restore();

          // Muzzle flash — only when a bullet actually fired
          if (ply.id === localId && muzzleFlashRef.current) {
            const bx = gunCx + gunLen / 2 + 2;
            ctx.save();
            ctx.shadowBlur = 26; ctx.shadowColor = '#ffe066';
            ctx.fillStyle = 'rgba(255,230,60,0.92)';
            ctx.beginPath(); ctx.arc(bx, gunCy, 7, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,220,1)';
            ctx.beginPath(); ctx.arc(bx, gunCy, 3, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0; ctx.restore();
          }
        }

        // 2. Gun hands — above gun, below body (only when holding a gun)
        if (isGunWpn) {
          ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
          ctx.fillStyle = skinColor;
          // Back hand near grip
          ctx.beginPath();
          ctx.arc(gunCx - gunLen * 0.22, gunCy + 5, 6, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
          // Front hand at mid-barrel
          ctx.beginPath();
          ctx.arc(gunCx + gunLen * 0.2, gunCy - 4, 5.5, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }

        // 3. Body — on top of hands
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        if (ply.id === localId && playerBeingHealedRef.current) {
          ctx.shadowBlur = 18; ctx.shadowColor = '#22c55e';
        }
        ctx.fillStyle = skinColor;
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;


        // 5. Eyes — topmost layer
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(10, -6, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(10, 6, 2.5, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
      });

      // Smoke Clouds - 5 seconds visible, 5 seconds fade
      s.smokeClouds.forEach(cloud => {
        if (cloud.radius <= 0) return;
        const fadeStartLife = 300;
        const alpha = (cloud.life > fadeStartLife ? 1 : cloud.life / fadeStartLife) * 0.7;
        const offsets = [{ x: -cloud.radius * 0.15, y: 0 }, { x: cloud.radius * 0.1, y: -cloud.radius * 0.1 }, { x: 0, y: 0 }];
        offsets.forEach((off, i) => {
          const r = cloud.radius * (0.7 + i * 0.15);
          ctx.fillStyle = `rgba(160,160,160,${(alpha * 0.38).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(cloud.x + off.x, cloud.y + off.y, r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.strokeStyle = `rgba(80,80,80,${(alpha * 0.2).toFixed(3)})`; ctx.lineWidth = cloud.radius * 0.4;
        ctx.beginPath(); ctx.arc(cloud.x, cloud.y, cloud.radius * 0.5, 0, Math.PI * 2); ctx.stroke();
      });

      // In-flight Grenades
      s.grenades.forEach(g => {
        ctx.save(); ctx.translate(g.x, g.y);
        if (g.isSmokeGrenade) {
          // Smoke grenade - grey
          ctx.fillStyle = '#5a5a5a';
          ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1.5; ctx.stroke();
          // Grey smoke wisps
          if (frameCount.current % 4 < 2) {
            ctx.fillStyle = 'rgba(180,180,180,0.6)';
            ctx.beginPath(); ctx.arc(3, -3, 4, 0, Math.PI * 2); ctx.fill();
          }
        } else {
          // Regular grenade - green with spark
          ctx.fillStyle = '#2d3520';
          ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#1a2010'; ctx.lineWidth = 1.5; ctx.stroke();
          if (frameCount.current % 4 < 2) {
            const sparkAlpha = 0.7 + Math.sin(g.fuseTimer * 0.3) * 0.3;
            ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(255,160,0,0.9)';
            ctx.fillStyle = `rgba(255,180,20,${sparkAlpha.toFixed(2)})`;
            ctx.beginPath(); ctx.arc(5, -5, 3, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
        ctx.restore();
      });

      // Throw mode targeting overlay
      if (throwModeRef.current) {
        const worldMouseX = mousePos.current.x + camX;
        const worldMouseY = mousePos.current.y + camY;
        const throwDist = Math.hypot(worldMouseX - p.x, worldMouseY - p.y);
        const inRange = throwDist <= THROW_RANGE;
        const tColor = inRange ? 'rgba(255,255,255,0.85)' : 'rgba(255,80,80,0.9)';
        ctx.save();
        // Range circle around player
        ctx.strokeStyle = inRange ? 'rgba(255,255,255,0.12)' : 'rgba(255,80,80,0.22)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 9]);
        ctx.beginPath(); ctx.arc(p.x, p.y, THROW_RANGE, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        // Dotted line from player to cursor
        ctx.strokeStyle = inRange ? 'rgba(255,255,255,0.28)' : 'rgba(255,80,80,0.38)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 7]);
        ctx.lineDashOffset = -(frameCount.current * 0.5 % 11);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(worldMouseX, worldMouseY); ctx.stroke();
        ctx.setLineDash([]);
        // Targeting circle at cursor
        ctx.shadowBlur = 14; ctx.shadowColor = tColor;
        ctx.strokeStyle = tColor; ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.lineDashOffset = -(frameCount.current * 0.4 % 11);
        ctx.beginPath(); ctx.arc(worldMouseX, worldMouseY, 22, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]); ctx.shadowBlur = 0;
        // OUT OF REACH text
        if (!inRange) {
          ctx.fillStyle = 'rgba(255,80,80,0.95)';
          ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('OUT OF REACH', worldMouseX, worldMouseY - 34);
        }
        ctx.restore();
      }

      // Building fog — covers interior only (exterior walls always visible)
      s.buildings.forEach(bld => {
        const ib = bld.interiorBounds;
        const intCX = bld.x + ib.x, intCY = bld.y + ib.y;
        const intHW = ib.w / 2, intHH = ib.h / 2;
        const isInside = camCenter.x >= intCX - intHW && camCenter.x <= intCX + intHW &&
                         camCenter.y >= intCY - intHH && camCenter.y <= intCY + intHH;
        const cur = fogAlphaRef.current[bld.id] ?? 1.0;
        const target = isInside ? 0 : 1.0;
        const next = cur + (target - cur) * 0.1;
        fogAlphaRef.current[bld.id] = next;
        if (next > 0.005) {
          ctx.fillStyle = `rgba(0,0,0,${next.toFixed(3)})`;
          ctx.fillRect(intCX - intHW, intCY - intHH, ib.w, ib.h);
        }
      });

      // Storm overlay (screen-space)
      const sX = s.storm.x - camX, sY = s.storm.y - camY, sR = s.storm.radius;
      const isActiveStorm = s.storm.phase === 'closing' || s.storm.phase === 'holding';
      const ps = isActiveStorm ? 0.2 + Math.sin(frameCount.current * 0.05) * 0.1 : 0.07;
      const stormColor = isActiveStorm ? `rgba(239, 68, 68, ${ps})` : `rgba(30, 80, 160, ${ps})`;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath(); ctx.rect(0, 0, cv.width, cv.height); ctx.arc(sX, sY, Math.max(0, sR), 0, Math.PI * 2, true);
      ctx.fillStyle = stormColor; ctx.fill();
      if (isActiveStorm && Math.sqrt((p.x - s.storm.x) ** 2 + (p.y - s.storm.y) ** 2) > sR) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.18)'; ctx.fillRect(0, 0, cv.width, cv.height);
      }
      ctx.restore();

      // Particles
      s.particles.forEach(pt => {
        ctx.fillStyle = pt.color; ctx.globalAlpha = pt.life / pt.maxLife;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0;
      });

      // Boulder clusters — drawn in foliage layer so they overlap players for depth
      const rockPalette = ['#5a5752', '#4a4742', '#6b6358', '#3d3c36', '#514e49'];
      s.envObjects.filter(o => o.type === 'rock').forEach(o => {
        const seed = o.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const boulderCount = 3 + (seed % 3);
        for (let i = 0; i < boulderCount; i++) {
          const angleI = (seed * 1.7 + i * 2.1) % (Math.PI * 2);
          const distI = o.size * 0.25 + (seed + i) % Math.max(1, Math.round(o.size * 0.3));
          const rx = o.x + Math.cos(angleI) * distI;
          const ry = o.y + Math.sin(angleI) * distI;
          const radiusI = o.size * 0.25 + (seed + i * 3) % Math.max(1, Math.round(o.size * 0.2));
          ctx.fillStyle = rockPalette[(seed + i) % 5];
          ctx.beginPath(); ctx.arc(rx, ry, radiusI, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath();
          ctx.arc(rx - radiusI * 0.2, ry - radiusI * 0.2, radiusI * 0.55, -2.2, -0.9);
          ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 2; ctx.stroke();
        }
      });

      // Foliage — drawn over players for depth
      const treeGreens = ['#1a3a1a', '#2d4a2d', '#1e4020', '#2a5c2a', '#1f4a1f', '#254d25'];
      const bushGreens = ['#1a3d1a', '#234a23', '#1e4a1e', '#2a502a', '#1d421d'];
      s.envObjects.filter(o => o.type === 'tree' || o.type === 'bush').forEach(o => {
        ctx.save(); ctx.translate(o.x, o.y);
        const seed = o.id.charCodeAt(o.id.length - 1);
        if (o.type === 'tree') {
          const g0 = treeGreens[seed % treeGreens.length];
          const g1 = treeGreens[(seed + 2) % treeGreens.length];
          const g2 = treeGreens[(seed + 4) % treeGreens.length];
          const r = o.size;
          ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(-r * 0.28, r * 0.1, r * 0.58, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(r * 0.28, r * 0.1, r * 0.58, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(0, -r * 0.12, r * 0.72, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = treeGreens[(seed + 1) % treeGreens.length]; ctx.beginPath(); ctx.arc(0, r * 0.18, r * 0.52, 0, Math.PI * 2); ctx.fill();
        } else {
          const r = o.size;
          ctx.fillStyle = bushGreens[seed % bushGreens.length]; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = bushGreens[(seed + 1) % bushGreens.length]; ctx.beginPath(); ctx.arc(-r * 0.38, r * 0.1, r * 0.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = bushGreens[(seed + 2) % bushGreens.length]; ctx.beginPath(); ctx.arc(r * 0.38, r * 0.1, r * 0.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = bushGreens[(seed + 3) % bushGreens.length]; ctx.beginPath(); ctx.arc(0, -r * 0.28, r * 0.35, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      });

      // Next safe-zone outline — dashed white during initial_wait and waiting
      if (s.storm.phase === 'initial_wait' || s.storm.phase === 'waiting') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 3;
        ctx.setLineDash([16, 10]);
        ctx.lineDashOffset = -(frameCount.current * 0.4 % 26);
        ctx.beginPath(); ctx.arc(s.storm.x, s.storm.y, s.storm.nextTargetRadius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Storm edge stroke
      const edgeColor = isActiveStorm ? 'rgba(239, 68, 68, 0.75)' : 'rgba(100, 150, 255, 0.35)';
      ctx.strokeStyle = edgeColor; ctx.lineWidth = isActiveStorm ? 8 : 4;
      ctx.beginPath(); ctx.arc(s.storm.x, s.storm.y, s.storm.radius, 0, Math.PI * 2); ctx.stroke();

      if (s.ammoAlert) {
        ctx.save(); ctx.translate(p.x, p.y - 45);
        ctx.fillStyle = s.ammoAlert.includes('+') ? 'yellow' : 'red';
        ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(s.ammoAlert, 0, 0); ctx.restore();
      }

      ctx.restore();
      // Keep game loop running even when tab is hidden (setTimeout not throttled like rAF)
      if (document.hidden) {
        requestRef.current = window.setTimeout(render, 16) as unknown as number;
      } else {
        requestRef.current = requestAnimationFrame(render);
      }
    };
    render();
    return () => {
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
        clearTimeout(requestRef.current);
      }
    };
  }, [update]);

  const localPlayer = uiState.players[localId];
  const killedByPlayerId = localPlayer?.killedBy;
  const isKillerAlive = !!(killedByPlayerId && allPlayerIds.includes(killedByPlayerId) && (uiState.players[killedByPlayerId]?.health ?? 0) > 0);
  const killedByName = isKillerAlive && !gameWinner && spectatingId === null
    ? (usernames[killedByPlayerId!] ?? `P${parseInt(killedByPlayerId!.replace('p', '')) + 1}`)
    : undefined;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />
      {nearbyItem && !uiState.isGameOver && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-24 bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-lg border border-white/20 animate-bounce pointer-events-none z-50">
          <span className="font-bold">Press <span className="bg-white text-black px-1 rounded">E</span> to pick up {nearbyItem.name}</span>
        </div>
      )}
      {/* Kill feed — top right, above stats */}
      {killFeed.length > 0 && (
        <div className="absolute top-36 right-6 flex flex-col items-end gap-1 pointer-events-none z-40">
          {killFeed.map(entry => (
            <div key={entry.id} className="bg-black/65 backdrop-blur-sm text-xs px-3 py-1 rounded-full border border-white/10 flex items-center gap-2 shadow-lg">
              <span className="font-black text-blue-300">{usernames[entry.killer] ?? `P${parseInt(entry.killer.replace('p', '')) + 1}`}</span>
              <span className="text-white/60">💀</span>
              <span className="font-black text-red-300">{usernames[entry.victim] ?? `P${parseInt(entry.victim.replace('p', '')) + 1}`}</span>
            </div>
          ))}
        </div>
      )}

      {/* Spectating overlay */}
      {spectatingId !== null && (
        <div className="absolute inset-x-0 bottom-0 z-50 flex flex-col items-center pb-8 pointer-events-auto select-none">
          <div className="bg-black/70 backdrop-blur-md rounded-2xl border border-white/10 px-8 py-4 flex items-center gap-6 shadow-2xl">
            <div className="flex flex-col items-center">
              <span className="text-white/40 text-[10px] font-black tracking-widest uppercase">Spectating</span>
              <span className="text-cyan-300 font-black text-xl tracking-wide">
                {usernames[spectatingId] ?? `P${parseInt(spectatingId.replace('p', '')) + 1}`}
              </span>
            </div>
            <button
              onClick={() => { spectatingIdRef.current = null; setSpectatingId(null); onExit(); }}
              className="px-6 py-3 bg-white text-black font-black rounded-xl hover:bg-red-400 hover:text-white transition-all text-sm tracking-widest uppercase"
            >
              EXIT TO LOBBY
            </button>
          </div>
        </div>
      )}

      {/* Winner found while dead/spectating overlay */}
      {gameWinner !== null && spectatingId === null && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center z-[100] pointer-events-auto">
          <div className="flex flex-col items-center gap-4">
            <h1 className="text-white text-8xl font-black tracking-tighter drop-shadow-2xl">GAME OVER</h1>
            <p className="text-white/60 text-2xl font-bold italic uppercase">You placed <span className="text-red-400">#{uiState.placement}</span></p>
            <p className="text-yellow-400 text-2xl font-black tracking-wider mt-2">{gameWinner} has won!</p>
            <button
              onClick={onExit}
              className="mt-6 px-12 py-5 bg-white text-black font-black text-xl rounded-full hover:scale-110 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.3)]"
            >
              EXIT TO LOBBY
            </button>
          </div>
        </div>
      )}

      <HUD
        player={uiState.players[uiState.localPlayerId]}
        storm={uiState.storm}
        remainingPlayers={uiState.remainingPlayers}
        ammoAlert={uiState.ammoAlert}
        isGameOver={uiState.isGameOver && spectatingId === null && gameWinner === null}
        placement={uiState.placement}
        onExit={onExit}
        supplyDrops={uiState.crates.filter(c => c.isSupplyDrop).map(c => ({ id: c.id, x: c.x, y: c.y }))}
        worldSize={worldSize}
        isThrowModeActive={throwModeActive}
        onInventorySwap={handleInventorySwap}
        onInventoryDrop={handleInventoryDrop}
        onSpectate={killedByName ? () => {
          if (killedByPlayerId) {
            spectatingIdRef.current = killedByPlayerId;
            setSpectatingId(killedByPlayerId);
          }
        } : undefined}
        killedByName={killedByName}
        winnerName={gameWinner ?? undefined}
      />
    </div>
  );
};

export default GameWorld;
