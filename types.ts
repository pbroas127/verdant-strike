
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ItemType = 'pistol' | 'band_aid' | 'medkit' | 'heal_potion' | 'heal_shot' | 'golden_wrap' | 'armor' | 'ammo_crate';

export type EnvObjectType = 'tree' | 'bush' | 'stone_wall' | 'wood_wall' | 'metal_wall';

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
}

export interface EnvObject {
  id: string;
  x: number;
  y: number;
  type: EnvObjectType;
  size: number;
  leafTimer: number;
}

export interface StormState {
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  phase: 'waiting' | 'shrinking' | 'holding';
  timer: number;
  phaseTime: number;
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
}

export interface GameState {
  players: Record<string, Player>;
  localPlayerId: string;
  bullets: Bullet[];
  items: Item[];
  crates: Crate[];
  envObjects: EnvObject[];
  particles: Particle[];
  storm: StormState;
  remainingPlayers: number;
  ammoAlert: string | null;
  isGameOver: boolean;
  placement: number;
  lobbyCode: string | null;
  isHost: boolean;
}

export type NetworkMessage = 
  | { type: 'START_GAME'; worldData: { crates: Crate[], envObjects: EnvObject[], items: Item[] } }
  | { type: 'STATE_UPDATE'; state: Partial<GameState> }
  | { type: 'PLAYER_SYNC'; player: Player }
  | { type: 'BULLET_SPAWN'; bullet: Bullet }
  | { type: 'CRATE_HIT'; crateId: string };

export const WORLD_SIZE = 3000;

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9ca3af',
  uncommon: '#22c55e',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#eab308'
};
