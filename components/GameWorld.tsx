
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Player, Item, Bullet, GameState, WORLD_SIZE, Crate, EnvObject, Particle, ItemType, Rarity, RARITY_COLORS, StormState, NetworkMessage } from '../types';
import HUD from './HUD';

const PLAYER_SPEED = 4.5;
const PUNCH_COOLDOWN = 12;
const BULLET_SPEED = 16;
const PICKUP_RANGE = 70;
const SHOOT_COOLDOWN = 150;
const STORM_DAMAGE = 5;
const PLAYER_RADIUS = 20;

interface GameWorldProps {
  lobbyCode: string;
  isHost: boolean;
  peer: any;
  conn: any;
  initialWorldData?: { crates: Crate[], envObjects: EnvObject[], items: Item[] };
  onExit: () => void;
}

const GameWorld: React.FC<GameWorldProps> = ({ lobbyCode, isHost, peer, conn, initialWorldData, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const mousePos = useRef({ x: 0, y: 0 });
  const lastShootTime = useRef(0);
  const lastStormTick = useRef(0);
  const frameCount = useRef(0);
  const lastUpdateTime = useRef(performance.now());

  // Core immutable local IDs
  const localId = isHost ? 'host' : 'client';
  const remoteId = isHost ? 'client' : 'host';

  // Core mutable state for physics/logic
  const stateRef = useRef<GameState>({
    players: {
      [localId]: {
        id: localId, 
        x: isHost ? 500 : WORLD_SIZE - 500, 
        y: isHost ? 500 : WORLD_SIZE - 500, 
        rotation: 0, health: 100, maxHealth: 100,
        armorHealth: 0, maxArmorHealth: 0, currentArmor: null, kills: 0,
        inventory: [null, null, null, null, null], selectedSlot: 0, isPunching: false, punchCooldown: 0,
      },
      [remoteId]: {
        id: remoteId, 
        x: isHost ? WORLD_SIZE - 500 : 500, 
        y: isHost ? WORLD_SIZE - 500 : 500, 
        rotation: 0, health: 100, maxHealth: 100,
        armorHealth: 0, maxArmorHealth: 0, currentArmor: null, kills: 0,
        inventory: [null, null, null, null, null], selectedSlot: 0, isPunching: false, punchCooldown: 0,
      }
    },
    localPlayerId: localId,
    bullets: [], 
    items: initialWorldData?.items || [], 
    crates: initialWorldData?.crates || [], 
    envObjects: initialWorldData?.envObjects || [], 
    particles: [],
    storm: { 
      x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, radius: WORLD_SIZE * 0.9, 
      targetRadius: WORLD_SIZE * 0.7, phase: 'waiting', timer: 3600, phaseTime: 3600 
    },
    remainingPlayers: 2, ammoAlert: null, isGameOver: false, placement: 0, lobbyCode, isHost
  });

  const [uiState, setUiState] = useState<GameState>(stateRef.current);
  const [nearbyItem, setNearbyItem] = useState<Item | null>(null);

  const safeSend = (data: any) => {
    if (conn && conn.open) {
      conn.send(data);
    }
  };

  const spawnParticles = (x: number, y: number, color: string, count: number, type: 'wood' | 'leaf' | 'stone' | 'metal' | 'blood') => {
    for(let i=0; i<count; i++) {
      stateRef.current.particles.push({ 
        id: Math.random().toString(), 
        x, y, 
        vx: (Math.random() - 0.5) * 6, 
        vy: (Math.random() - 0.5) * 6, 
        life: 20 + Math.random() * 20, 
        maxLife: 40, 
        color, 
        size: type === 'leaf' ? 6 + Math.random() * 4 : 2 + Math.random() * 3 
      });
    }
  };

  const handleCrateHit = useCallback((crateId: string) => {
    if (!isHost) {
      safeSend({ type: 'CRATE_HIT', crateId });
      return;
    }

    const s = stateRef.current;
    const crateIndex = s.crates.findIndex(c => c.id === crateId);
    if (crateIndex === -1) return;
    
    const crate = s.crates[crateIndex];
    crate.health -= 1;
    spawnParticles(crate.x, crate.y, '#78350f', 5, 'wood');

    if (crate.health <= 0) {
      s.crates.splice(crateIndex, 1);
      const dropCount = Math.floor(Math.random() * 2) + 1;
      for(let i=0; i<dropCount; i++) {
        const roll = Math.random();
        let type: ItemType = 'pistol'; 
        let rarity: Rarity = 'common'; 

        if (roll > 0.92) { 
          type = 'ammo_crate'; 
          rarity = Math.random() > 0.7 ? 'legendary' : 'epic'; 
        } else if (roll > 0.75) { 
          type = 'armor'; 
          const rr = Math.random(); 
          rarity = rr > 0.95 ? 'legendary' : rr > 0.8 ? 'epic' : rr > 0.5 ? 'rare' : rr > 0.2 ? 'uncommon' : 'common'; 
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
        }
        
        s.items.push({ 
          id: `drop-${Math.random()}`, 
          type, 
          name: type.replace('_', ' '), 
          x: crate.x + (Math.random()-0.5)*20, 
          y: crate.y + (Math.random()-0.5)*20, 
          rarity, 
          ammo: type === 'pistol' ? 30 : undefined, 
          count: 1, 
          vx: (Math.random() - 0.5) * 8, 
          vy: (Math.random() - 0.5) * 8 
        });
      }
    }
    // Always broadcast update on hit to keep health in sync or remove destroyed crates
    safeSend({ type: 'STATE_UPDATE', state: { crates: s.crates, items: s.items } });
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
    if (now - lastShootTime.current < SHOOT_COOLDOWN) return;
    lastShootTime.current = now;

    const s = stateRef.current;
    const p = s.players[s.localPlayerId];
    const item = p.inventory[p.selectedSlot];
    if (!item || item.type !== 'pistol' || s.isGameOver || p.health <= 0) return;
    
    if ((item.ammo || 0) <= 0) {
      s.ammoAlert = 'OUT OF AMMO!';
      setTimeout(() => stateRef.current.ammoAlert = null, 1000);
      return;
    }

    const dmgMap: Record<Rarity, number> = { common: 15, uncommon: 18, rare: 21, epic: 24, legendary: 27 };
    const angle = p.rotation;
    const ox = 18 * Math.cos(angle) - 10 * Math.sin(angle);
    const oy = 18 * Math.sin(angle) + 10 * Math.cos(angle);
    
    const b: Bullet = { 
      id: Math.random().toString(), 
      x: p.x + ox + Math.cos(angle) * 30, 
      y: p.y + oy + Math.sin(angle) * 30, 
      vx: Math.cos(angle) * BULLET_SPEED, 
      vy: Math.sin(angle) * BULLET_SPEED, 
      damage: dmgMap[item.rarity], 
      ownerId: p.id 
    };
    
    s.bullets.push(b);
    item.ammo = (item.ammo || 0) - 1;
    safeSend({ type: 'BULLET_SPAWN', bullet: b });
  }, []);

  const punch = useCallback(() => {
    const s = stateRef.current;
    const p = s.players[s.localPlayerId];
    if (p.punchCooldown > 0 || s.isGameOver || p.health <= 0) return;
    
    const angle = p.rotation; 
    const hx = p.x + Math.cos(angle) * 45; 
    const hy = p.y + Math.sin(angle) * 45;
    // Increased detection radius for punching crates
    const hc = s.crates.find(c => Math.sqrt((c.x - hx)**2 + (c.y - hy)**2) < 55);
    
    if (hc) handleCrateHit(hc.id);
    
    p.isPunching = true;
    p.punchCooldown = PUNCH_COOLDOWN;
  }, [handleCrateHit]);

  const pickupItem = useCallback((item: Item) => {
    const s = stateRef.current;
    const p = s.players[s.localPlayerId];
    if (s.isGameOver || p.health <= 0) return;

    if (item.type === 'ammo_crate') {
      const cur = p.inventory[p.selectedSlot];
      if (!cur || cur.type !== 'pistol') {
        s.ammoAlert = 'SELECT PISTOL FIRST!';
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
      p.currentArmor = item;
      p.armorHealth = max;
      p.maxArmorHealth = max;
      s.items = s.items.filter(i => i.id !== item.id);
      safeSend({ type: 'STATE_UPDATE', state: { items: s.items } });
      return;
    }

    const empty = p.inventory.findIndex(slot => slot === null);
    if (empty !== -1) { 
      p.inventory[empty] = item; 
      s.items = s.items.filter(i => i.id !== item.id);
    } else {
      const old = p.inventory[p.selectedSlot]; 
      p.inventory[p.selectedSlot] = item;
      s.items = s.items.filter(i => i.id !== item.id);
      if (old) s.items.push({ ...old, x: p.x, y: p.y, vx: (Math.random()-0.5)*5, vy: (Math.random()-0.5)*5 });
    }
    safeSend({ type: 'STATE_UPDATE', state: { items: s.items } });
  }, []);

  useEffect(() => {
    if (!conn) return;

    const handleData = (msg: NetworkMessage) => {
      const s = stateRef.current;
      if (msg.type === 'STATE_UPDATE') {
        if (msg.state.crates) s.crates = msg.state.crates;
        if (msg.state.items) s.items = msg.state.items;
        if (msg.state.storm) s.storm = msg.state.storm;
        if (msg.state.remainingPlayers !== undefined) s.remainingPlayers = msg.state.remainingPlayers;
      } else if (msg.type === 'PLAYER_SYNC') {
        if (msg.player.id === remoteId) {
          s.players[remoteId] = msg.player;
        }
      } else if (msg.type === 'BULLET_SPAWN') {
        s.bullets.push(msg.bullet);
      } else if (msg.type === 'CRATE_HIT' && isHost) {
        handleCrateHit(msg.crateId);
      }
    };

    conn.on('data', handleData);
    // PeerJS connections can sometimes lose the data event if we don't ensure it's re-attached
    return () => {
      conn.off('data', handleData);
    };
  }, [conn, isHost, handleCrateHit, remoteId]);

  const update = useCallback(() => {
    const s = stateRef.current;
    const p = s.players[s.localPlayerId];

    if (s.isGameOver) {
      s.particles.forEach(pt => { pt.x += pt.vx; pt.y += pt.vy; pt.vx *= 0.95; pt.vy *= 0.95; pt.life--; });
      s.particles = s.particles.filter(pt => pt.life > 0);
      setUiState({ ...s });
      return;
    }

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
        [...s.crates, ...s.envObjects.filter(o => !o.type.includes('bush'))].forEach(obj => {
          const br = ('type' in obj ? (obj.type === 'tree' ? 35 : obj.type.includes('wall') ? 30 : 45) : 45) + PLAYER_RADIUS;
          if (Math.sqrt((obj.x - nx)**2 + (obj.y - p.y)**2) < br) cx = false;
          if (Math.sqrt((obj.x - p.x)**2 + (obj.y - ny)**2) < br) cy = false;
        });
        if (cx) p.x = Math.max(20, Math.min(WORLD_SIZE - 20, nx));
        if (cy) p.y = Math.max(20, Math.min(WORLD_SIZE - 20, ny));
      }
      
      p.rotation = Math.atan2(mousePos.current.y - window.innerHeight / 2, mousePos.current.x - window.innerWidth / 2);
    }
    
    if (p.punchCooldown > 0) p.punchCooldown--; else p.isPunching = false;

    // Frequent sync
    if (frameCount.current % 2 === 0) {
      safeSend({ type: 'PLAYER_SYNC', player: p });
    }

    // Timer logic: use real elapsed time so it runs even when tab is hidden
    storm.timer -= deltaTicks;

    // Host authoritative logic
    if (isHost) {
      if (storm.timer <= 0) {
        if (storm.phase === 'waiting') { storm.phase = 'shrinking'; storm.timer = 600; }
        else if (storm.phase === 'shrinking') { storm.phase = 'holding'; storm.timer = 3000; }
        else {
          storm.phase = 'waiting'; storm.timer = 3600;
          const nt = storm.targetRadius * 0.6; 
          const range = storm.radius - nt;
          storm.x = Math.max(nt, Math.min(WORLD_SIZE - nt, storm.x + (Math.random()-0.5)*range));
          storm.y = Math.max(nt, Math.min(WORLD_SIZE - nt, storm.y + (Math.random()-0.5)*range));
          storm.targetRadius = nt;
        }
      }
      if (storm.phase === 'shrinking' && storm.radius > storm.targetRadius) {
        storm.radius = Math.max(storm.targetRadius, storm.radius - 0.5 * deltaTicks);
      }
      
      const alivePlayers = (Object.values(s.players) as Player[]).filter(pl => pl.health > 0);
      s.remainingPlayers = alivePlayers.length;

      // Check for victory
      if (s.remainingPlayers === 1 && alivePlayers[0].id === s.localPlayerId && !s.isGameOver) {
        s.isGameOver = true;
        s.placement = 1;
      }
      
      // Frequent state updates for storm and crates
      if (frameCount.current % 20 === 0) {
        safeSend({ type: 'STATE_UPDATE', state: { crates: s.crates, items: s.items, storm, remainingPlayers: s.remainingPlayers } });
      }
    }

    // Storm Damage
    if (p.health > 0 && Math.sqrt((p.x - storm.x)**2 + (p.y - storm.y)**2) > storm.radius) { 
      if (Date.now() - lastStormTick.current > 1000) { 
        lastStormTick.current = Date.now(); 
        p.health = Math.max(0, p.health - STORM_DAMAGE); 
      } 
    }

    // Bullet Physics
    s.bullets = s.bullets.filter(b => {
      const nx = b.x + b.vx, ny = b.y + b.vy; 
      let hit = false;
      
      // Bullet vs Local Player
      if (p.health > 0 && b.ownerId !== p.id && Math.sqrt((p.x - nx)**2 + (p.y - ny)**2) < 25) {
        hit = true;
        let finalDmg = b.damage;
        if (p.armorHealth > 0) {
            const armorAbsorb = Math.min(p.armorHealth, finalDmg * 0.7);
            p.armorHealth -= armorAbsorb;
            finalDmg -= armorAbsorb;
        }
        p.health = Math.max(0, p.health - finalDmg);
        spawnParticles(nx, ny, '#ef4444', 8, 'blood');
      }

      // Bullet vs Environment
      s.crates.forEach(c => { 
        if (!hit && Math.sqrt((c.x - nx)**2 + (c.y - ny)**2) < 45) { 
          hit = true; 
          if (isHost) handleCrateHit(c.id); 
        } 
      });
      
      s.envObjects.filter(o => o.type.includes('wall')).forEach(w => { 
        if (!hit && Math.sqrt((w.x - nx)**2 + (w.y - ny)**2) < 30) { 
          hit = true; 
          spawnParticles(nx, ny, w.type.includes('stone') ? '#94a3b8' : w.type.includes('metal') ? '#cbd5e1' : '#78350f', 5, 'stone'); 
        } 
      });
      
      b.x = nx; b.y = ny;
      return !hit && nx > 0 && nx < WORLD_SIZE && ny > 0 && ny < WORLD_SIZE;
    });

    // Item Proximity
    const dists = s.items.map(i => Math.sqrt((i.x - p.x)**2 + (i.y - p.y)**2));
    const closeIdx = dists.findIndex(d => d < PICKUP_RANGE);
    setNearbyItem(closeIdx !== -1 ? s.items[closeIdx] : null);
    
    if (p.health <= 0 && !s.isGameOver) {
      p.inventory.forEach(i => { if (i) s.items.push({ ...i, x: p.x, y: p.y, vx: (Math.random()-0.5)*20, vy: (Math.random()-0.5)*20 }); });
      if (p.currentArmor) s.items.push({ ...p.currentArmor, x: p.x, y: p.y, vx: (Math.random()-0.5)*20, vy: (Math.random()-0.5)*20 });
      p.inventory = [null, null, null, null, null];
      p.currentArmor = null;

      s.isGameOver = true;
      s.placement = s.remainingPlayers;
      safeSend({ type: 'STATE_UPDATE', state: { items: s.items } });
    }

    // Visual updates
    s.particles.forEach(pt => { pt.x += pt.vx; pt.y += pt.vy; pt.vx *= 0.95; pt.vy *= 0.95; pt.life--; });
    s.particles = s.particles.filter(pt => pt.life > 0);
    s.items.forEach(i => { 
      i.x += (i.vx || 0); i.y += (i.vy || 0); 
      i.vx = (i.vx || 0) * 0.85; i.vy = (i.vy || 0) * 0.85; 
      i.x = Math.max(50, Math.min(WORLD_SIZE-50, i.x));
      i.y = Math.max(50, Math.min(WORLD_SIZE-50, i.y));
    });
    
    setUiState({ ...s });
    frameCount.current++;
  }, [isHost, handleCrateHit]);

  useEffect(() => {
    const hkd = (e: KeyboardEvent) => { 
      keys.current[e.key.toLowerCase()] = true; 
      if (['1','2','3','4','5'].includes(e.key)) {
        stateRef.current.players[localId].selectedSlot = parseInt(e.key) - 1;
      }
      if (e.key === 'e') { if (nearbyItem) pickupItem(nearbyItem); else useMed(); } 
      if (e.key === 'q') {
        const p = stateRef.current.players[localId];
        const item = p.inventory[p.selectedSlot];
        if (item) {
          p.inventory[p.selectedSlot] = null;
          stateRef.current.items.push({ ...item, x: p.x, y: p.y, vx: (Math.random()-0.5)*5, vy: (Math.random()-0.5)*5 });
          safeSend({ type: 'STATE_UPDATE', state: { items: stateRef.current.items } });
        }
      } 
    };
    const hku = (e: KeyboardEvent) => keys.current[e.key.toLowerCase()] = false;
    const hmm = (e: MouseEvent) => mousePos.current = { x: e.clientX, y: e.clientY };
    const hmd = () => { 
      if (!stateRef.current.isGameOver) { 
        const p = stateRef.current.players[localId]; 
        if (p.inventory[p.selectedSlot]?.type === 'pistol') shoot(); else punch(); 
      } 
    };
    window.addEventListener('keydown', hkd); window.addEventListener('keyup', hku); 
    window.addEventListener('mousemove', hmm); window.addEventListener('mousedown', hmd);
    return () => { 
      window.removeEventListener('keydown', hkd); window.removeEventListener('keyup', hku); 
      window.removeEventListener('mousemove', hmm); window.removeEventListener('mousedown', hmd); 
    };
  }, [nearbyItem, shoot, punch, pickupItem, useMed, localId, isHost]);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return; 
    const ctx = cv.getContext('2d'); if (!ctx) return;
    
    const render = () => {
      update(); 
      cv.width = window.innerWidth; cv.height = window.innerHeight;
      const s = stateRef.current;
      const p = s.players[s.localPlayerId];
      const camX = p.x - cv.width / 2, camY = p.y - cv.height / 2;
      
      ctx.save(); ctx.translate(-camX, -camY);

      // Floor
      ctx.fillStyle = '#064e3b'; ctx.fillRect(0,0, WORLD_SIZE, WORLD_SIZE);
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
      for(let x=0; x<=WORLD_SIZE; x+=100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_SIZE); ctx.stroke(); }
      for(let y=0; y<=WORLD_SIZE; y+=100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_SIZE, y); ctx.stroke(); }

      // Env Objects
      s.envObjects.forEach(o => { 
        if (o.type === 'tree') { 
          ctx.fillStyle = '#451a03'; ctx.beginPath(); ctx.arc(o.x, o.y, 25, 0, Math.PI*2); ctx.fill(); 
        } else if (o.type.includes('wall')) { 
          ctx.fillStyle = o.type.includes('stone') ? '#4b5563' : o.type.includes('metal') ? '#94a3b8' : '#78350f'; 
          ctx.fillRect(o.x-30, o.y-30, 60, 60); 
          ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.strokeRect(o.x-30, o.y-30, 60, 60); 
        } 
      });

      // Crates
      s.crates.forEach(c => { 
        ctx.save(); ctx.translate(c.x, c.y); 
        ctx.fillStyle = '#78350f'; ctx.fillRect(-35, -35, 70, 70); 
        ctx.strokeStyle = '#451a03'; ctx.lineWidth = 4; ctx.strokeRect(-35, -35, 70, 70); 
        ctx.beginPath(); ctx.moveTo(-35,-35); ctx.lineTo(35,35); ctx.stroke(); ctx.restore(); 
      });

      // Items
      s.items.forEach(i => { 
        ctx.save(); ctx.translate(i.x, i.y); 
        ctx.shadowBlur = 20; ctx.shadowColor = RARITY_COLORS[i.rarity]; 
        ctx.font = '32px serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; 
        const em = i.type === 'pistol' ? '🔫' : i.type === 'armor' ? '🛡️' : i.type === 'ammo_crate' ? '📦' : '🩹'; 
        ctx.fillText(em, 0, 0); ctx.restore(); 
      });

      // Bullets
      s.bullets.forEach(b => { 
        ctx.fillStyle = '#ffde59'; ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI*2); ctx.fill(); 
      });

      // Players
      (Object.values(s.players) as Player[]).forEach(ply => {
        if (ply.health <= 0) return;
        ctx.save(); ctx.translate(ply.x, ply.y); 
        
        if (ply.id === s.localPlayerId) {
          ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 12px sans-serif'; 
          ctx.textAlign = 'center'; ctx.fillText("YOU", 0, -35);
        }

        ctx.rotate(ply.rotation);
        const skinColor = ply.id === 'host' ? '#ffe0bd' : '#ffc9c9';
        const shirtColor = ply.id === 'host' ? '#3b82f6' : '#ef4444';
        
        ctx.fillStyle = skinColor; ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(12, -15, 7, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        
        if (ply.inventory[ply.selectedSlot]?.type === 'pistol') { 
          ctx.fillStyle = '#333'; ctx.fillRect(15, 6, 25, 8); 
          ctx.fillStyle = skinColor; ctx.beginPath(); ctx.arc(18, 10, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke(); 
        } else { 
          const pe = ply.isPunching ? 15 : 0; 
          ctx.beginPath(); ctx.arc(12 + pe, 15, 7, 0, Math.PI*2); ctx.fill(); ctx.stroke(); 
        }
        
        ctx.fillStyle = shirtColor; 
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = skinColor;
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000'; 
        ctx.beginPath(); ctx.arc(10, -6, 2.5, 0, Math.PI*2); ctx.fill(); 
        ctx.beginPath(); ctx.arc(10, 6, 2.5, 0, Math.PI*2); ctx.fill(); 
        ctx.restore();
      });

      // Storm effect
      const sX = s.storm.x - camX, sY = s.storm.y - camY, sR = s.storm.radius;
      const ps = 0.2 + Math.sin(frameCount.current * 0.05) * 0.1;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath(); ctx.rect(0, 0, cv.width, cv.height); ctx.arc(sX, sY, Math.max(0, sR), 0, Math.PI * 2, true);
      ctx.fillStyle = `rgba(239, 68, 68, ${ps})`; ctx.fill();
      if (Math.sqrt((p.x - s.storm.x)**2 + (p.y - s.storm.y)**2) > sR) { 
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)'; ctx.fillRect(0,0, cv.width, cv.height); 
      }
      ctx.restore();

      // Particles
      s.particles.forEach(pt => { 
        ctx.fillStyle = pt.color; ctx.globalAlpha = pt.life / pt.maxLife; 
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1.0; 
      });

      // Foliage
      s.envObjects.filter(o => o.type === 'tree' || o.type === 'bush').forEach(o => { 
        ctx.save(); ctx.translate(o.x, o.y); 
        ctx.fillStyle = o.type === 'tree' ? '#166534' : '#064e3b'; 
        ctx.beginPath(); ctx.arc(0, 0, o.size, 0, Math.PI*2); ctx.fill(); ctx.restore(); 
      });
      
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)'; ctx.lineWidth = 8; 
      ctx.beginPath(); ctx.arc(s.storm.x, s.storm.y, s.storm.radius, 0, Math.PI*2); ctx.stroke();
      
      if (s.ammoAlert) { 
        ctx.save(); ctx.translate(p.x, p.y - 45); 
        ctx.fillStyle = s.ammoAlert.includes('+') ? 'yellow' : 'red'; 
        ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; 
        ctx.fillText(s.ammoAlert, 0, 0); ctx.restore(); 
      }

      ctx.restore(); requestRef.current = requestAnimationFrame(render);
    };
    render();
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [update]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />
      {nearbyItem && !uiState.isGameOver && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-24 bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-lg border border-white/20 animate-bounce pointer-events-none z-50">
          <span className="font-bold">Press <span className="bg-white text-black px-1 rounded">E</span> to pick up {nearbyItem.name}</span>
        </div>
      )}
      <HUD 
        player={uiState.players[uiState.localPlayerId]} 
        storm={uiState.storm} 
        remainingPlayers={uiState.remainingPlayers} 
        ammoAlert={uiState.ammoAlert}
        isGameOver={uiState.isGameOver}
        placement={uiState.placement}
        onExit={onExit}
      />
    </div>
  );
};

export default GameWorld;
