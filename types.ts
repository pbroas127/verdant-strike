
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ItemType = 'pistol' | 'assault_rifle' | 'shotgun' | 'grenade' | 'smoke_grenade' | 'band_aid' | 'medkit' | 'heal_potion' | 'heal_shot' | 'golden_wrap' | 'armor' | 'ammo_crate';

export type EnvObjectType = 'tree' | 'bush' | 'rock' | 'stone_wall' | 'wood_wall' | 'metal_wall' | 'brick_wall' | 'mossy_stone_wall' | 'long_stone_wall' | 'long_wood_wall' | 'long_brick_wall' | 'long_mossy_wall';

export interface Item {
  id: string;
  type: ItemType;
  name: string;
  x: number;
  y: number;
  rarity: Rarity;
  ammo?: number;
  armorHealth?: number;
  count?: number;
  maxCount?: number;
  vx?: number;
  vy?: number;
}

export interface Bullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  ownerId: string;
  life?: number;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface Crate {
  id: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  isGold?: boolean;
  isSupplyDrop?: boolean;
}

export interface BuildingWallRect {
  x: number; y: number; // center relative to building center
  w: number; h: number;
}

export interface Building {
  id: string;
  x: number; y: number;       // world-space center
  outerW: number; outerH: number;
  material: 'wood' | 'stone' | 'brick' | 'metal';
  wallRects: BuildingWallRect[];
  interiorBounds: { x: number; y: number; w: number; h: number }; // relative to building center
}

export interface Campfire {
  id: string;
  x: number; y: number;
  uses: number;
  maxUses: number;
  regenTimer: number; // ticks toward 600 (10 sec per regen)
  healTimer: number;  // ticks toward 60 (1 sec per heal)
}

export interface EnvObject {
  id: string;
  x: number;
  y: number;
  type: EnvObjectType;
  size: number;
  leafTimer: number;
  w?: number;
  h?: number;
}

export interface WaterBody {
  id: string;
  type: 'pond' | 'stream';
  x: number;
  y: number;
  rx: number;
  ry: number;
  points?: { x: number; y: number }[];
  streamWidth?: number;
}

export interface StormState {
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  nextTargetRadius: number;
  startRadius: number;
  phase: 'initial_wait' | 'closing' | 'holding' | 'waiting';
  timer: number;
  phaseTime: number;
}

export interface Grenade {
  id: string;
  x: number; y: number;
  vx: number; vy: number;
  fuseTimer: number;   // ticks down from 120 (~2s at 60fps)
  ownerId: string;
  isSmokeGrenade?: boolean;
}

export interface SmokeCloud {
  id: string;
  x: number; y: number;
  radius: number;      // grows from 0 to maxRadius
  maxRadius: number;   // 200px
  life: number;        // ticks down from 480 (~8s)
}

export interface Barrel {
  id: string;
  x: number; y: number;
  health: number;
  maxHealth: number;   // always 3
}

export interface SandbagBarrier {
  id: string;
  x: number; y: number;
  angle: number;       // arc orientation in radians
  count: number;       // 4-6 bags
}

export interface Player {
  id: string;
  x: number;
  y: number;
  rotation: number;
  health: number;
  maxHealth: number;
  armorHealth: number;
  maxArmorHealth: number;
  currentArmor: Item | null;
  kills: number;
  inventory: (Item | null)[];
  selectedSlot: number;
  isPunching: boolean;
  punchCooldown: number;
  killedBy?: string;
  damageDealt?: number;
  damageTaken?: number;
  shotsFired?: number;
  shotsHit?: number;
  aliveFrom?: number;
}

export interface GameState {
  players: Record<string, Player>;
  localPlayerId: string;
  bullets: Bullet[];
  items: Item[];
  crates: Crate[];
  envObjects: EnvObject[];
  waterBodies: WaterBody[];
  particles: Particle[];
  storm: StormState;
  remainingPlayers: number;
  ammoAlert: string | null;
  isGameOver: boolean;
  placement: number;
  lobbyCode: string | null;
  isHost: boolean;
  buildings: Building[];
  campfires: Campfire[];
  stormCircle: number;
  grenades: Grenade[];
  smokeClouds: SmokeCloud[];
  barrels: Barrel[];
  sandbagBarriers: SandbagBarrier[];
}

export type NetworkMessage =
  | { type: 'START_GAME'; worldData: { crates: Crate[], envObjects: EnvObject[], items: Item[], waterBodies?: WaterBody[], buildings?: Building[], campfires?: Campfire[], barrels?: Barrel[], sandbagBarriers?: SandbagBarrier[], usernames?: Record<string, string>, skinColors?: Record<string, string>, worldSize?: number, spawnPoints?: Array<{x: number, y: number}> } }
  | { type: 'STATE_UPDATE'; state: Partial<GameState>; particleEvents?: { x: number; y: number; color: string; count: number }[] }
  | { type: 'PLAYER_SYNC'; player: Player }
  | { type: 'BULLET_SPAWN'; bullet: Bullet }
  | { type: 'CRATE_HIT'; crateId: string }
  | { type: 'GRENADE_SPAWN'; grenade: Grenade }
  | { type: 'BARREL_HIT'; barrelId: string }
  | { type: 'PLAYER_HIT'; targetId: string; damage: number; attackerId: string }
  | { type: 'KILL_CREDIT'; killerId: string; victimId: string }
  | { type: 'PLAYER_INFO'; username: string; skinColor?: string };

export const WORLD_SIZE = 9000;

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9ca3af',
  uncommon: '#22c55e',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#eab308'
};
