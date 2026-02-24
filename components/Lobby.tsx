
import React, { useState, useEffect, useRef } from 'react';
import { Barrel, Building, Campfire, Crate, EnvObject, Item, SandbagBarrier, WaterBody, WORLD_SIZE } from '../types';

// ─── Building templates ───────────────────────────────────────────────────────
// All coordinates relative to building center. Wall thickness = 14px.
interface BTemplate {
  outerW: number; outerH: number;
  material: Building['material'];
  wallRects: Building['wallRects'];
  interiorBounds: Building['interiorBounds'];
  crateSpawns: Array<{ x: number; y: number }>;
}
const BUILDING_TEMPLATES: BTemplate[] = [
  // 0: Small Cottage (220×160, wood) — south door, 1 interior partition (wider gap)
  { outerW:220, outerH:160, material:'wood',
    wallRects:[
      {x:0,y:-73,w:220,h:14},{x:-70,y:73,w:80,h:14},{x:70,y:73,w:80,h:14},
      {x:-103,y:0,w:14,h:160},{x:103,y:0,w:14,h:160},
      {x:35,y:-52,w:12,h:52},{x:35,y:52,w:12,h:52},
    ],
    interiorBounds:{x:0,y:0,w:192,h:132},
    crateSpawns:[{x:-72,y:-52},{x:-72,y:52},{x:72,y:-52},{x:72,y:52}],
  },
  // 1: Warehouse (360×240, metal) — 2 large doors (N+S), 4 interior pillars (wider gaps)
  { outerW:360, outerH:240, material:'metal',
    wallRects:[
      {x:-112.5,y:-113,w:135,h:14},{x:112.5,y:-113,w:135,h:14},
      {x:-112.5,y:113,w:135,h:14},{x:112.5,y:113,w:135,h:14},
      {x:-173,y:0,w:14,h:240},{x:173,y:0,w:14,h:240},
      {x:-95,y:-65,w:24,h:24},{x:95,y:-65,w:24,h:24},
      {x:-95,y:65,w:24,h:24},{x:95,y:65,w:24,h:24},
    ],
    interiorBounds:{x:0,y:0,w:332,h:212},
    crateSpawns:[{x:-148,y:95},{x:148,y:95},{x:-148,y:-95},{x:148,y:-95},{x:0,y:95},{x:0,y:-95}],
  },
  // 2: Bunker (280×200, stone) — west door only, 2 partitions with wider gaps
  { outerW:280, outerH:200, material:'stone',
    wallRects:[
      {x:0,y:-93,w:280,h:14},{x:0,y:93,w:280,h:14},
      {x:-133,y:-55,w:14,h:80},{x:-133,y:55,w:14,h:80},
      {x:133,y:0,w:14,h:200},
      {x:-45,y:-55,w:12,h:70},{x:-45,y:55,w:12,h:70},
      {x:45,y:-60,w:12,h:50},{x:45,y:45,w:12,h:80},
    ],
    interiorBounds:{x:0,y:0,w:252,h:172},
    crateSpawns:[{x:-100,y:-60},{x:-100,y:60},{x:0,y:-70},{x:0,y:70},{x:100,y:-60},{x:100,y:60}],
  },
  // 3: Barracks (340×120, wood) — east+west doors, 2 partitions creating 3 bays (wider gaps)
  { outerW:340, outerH:120, material:'wood',
    wallRects:[
      {x:0,y:-53,w:340,h:14},{x:0,y:53,w:340,h:14},
      {x:-163,y:-42,w:14,h:42},{x:-163,y:42,w:14,h:42},
      {x:163,y:-42,w:14,h:42},{x:163,y:42,w:14,h:42},
      {x:-118,y:-38,w:12,h:38},{x:-118,y:38,w:12,h:38},
      {x:118,y:-38,w:12,h:38},{x:118,y:38,w:12,h:38},
    ],
    interiorBounds:{x:0,y:0,w:312,h:92},
    crateSpawns:[{x:-152,y:-32},{x:-152,y:32},{x:0,y:-32},{x:0,y:32},{x:152,y:-32},{x:152,y:32}],
  },
  // 4: Guard Post (130×130, stone) — south door, no interior walls
  { outerW:130, outerH:130, material:'stone',
    wallRects:[
      {x:0,y:-58,w:130,h:14},{x:-40,y:58,w:40,h:14},{x:40,y:58,w:40,h:14},
      {x:-58,y:0,w:14,h:130},{x:58,y:0,w:14,h:130},
    ],
    interiorBounds:{x:0,y:0,w:102,h:102},
    crateSpawns:[{x:-40,y:-40},{x:40,y:-40},{x:-40,y:40},{x:40,y:40}],
  },
  // 5: Open-Front Shop (220×140, brick) — large north opening, back room partition (wider gap)
  { outerW:220, outerH:140, material:'brick',
    wallRects:[
      {x:-96,y:-63,w:28,h:14},{x:96,y:-63,w:28,h:14},
      {x:0,y:63,w:220,h:14},{x:-103,y:0,w:14,h:140},{x:103,y:0,w:14,h:140},
      {x:-65,y:20,w:90,h:12},{x:65,y:20,w:90,h:12},
    ],
    interiorBounds:{x:0,y:0,w:192,h:112},
    crateSpawns:[{x:-80,y:45},{x:0,y:45},{x:80,y:45},{x:-80,y:-25},{x:80,y:-25}],
  },
  // 6: Medical Station (200×170, metal) — north door, horizontal partition (wider gap)
  { outerW:200, outerH:170, material:'metal',
    wallRects:[
      {x:-64,y:-78,w:72,h:14},{x:64,y:-78,w:72,h:14},
      {x:0,y:78,w:200,h:14},{x:-93,y:0,w:14,h:170},{x:93,y:0,w:14,h:170},
      {x:-58,y:18,w:85,h:12},{x:58,y:18,w:85,h:12},
    ],
    interiorBounds:{x:0,y:0,w:172,h:142},
    crateSpawns:[{x:-72,y:-50},{x:72,y:-50},{x:-72,y:50},{x:72,y:50},{x:0,y:-50}],
  },
  // 7: Watchtower (150×150, stone) — south door, 4 corner pillars
  { outerW:150, outerH:150, material:'stone',
    wallRects:[
      {x:0,y:-68,w:150,h:14},{x:-51,y:68,w:51,h:14},{x:51,y:68,w:51,h:14},
      {x:-68,y:0,w:14,h:150},{x:68,y:0,w:14,h:150},
      {x:-42,y:-42,w:18,h:18},{x:42,y:-42,w:18,h:18},
      {x:-42,y:42,w:18,h:18},{x:42,y:42,w:18,h:18},
    ],
    interiorBounds:{x:0,y:0,w:122,h:122},
    crateSpawns:[{x:0,y:-30},{x:0,y:30},{x:-48,y:-30},{x:48,y:-30}],
  },
];

const SKIN_TONES = [
  '#fddccc', '#f5c5a3', '#e8a87c', '#d4845a',
  '#c06840', '#a05228', '#8d5524', '#5c2e0e',
  '#ffb3c6', '#b5e48c', '#90e0ef', '#c9b1ff',
];

declare const Peer: any;

interface LobbyProps {
  onLaunch: (code: string, isHost: boolean, peer: any, conn: any, worldData?: any, playerId?: string) => void;
  username: string;
  onLogout: () => void;
}

const Lobby: React.FC<LobbyProps> = ({ onLaunch, username, onLogout }) => {
  const [menuState, setMenuState] = useState<'main' | 'create' | 'join' | 'waiting' | 'customize' | 'pass' | 'tutorial'>('main');
  const [passPage, setPassPage] = useState(0);
  const [lobbyCode, setLobbyCode] = useState('');
  const [enteredCode, setEnteredCode] = useState('');
  const [playerCount, setPlayerCount] = useState(1);
  const [isHost, setIsHost] = useState(false);
  const [status, setStatus] = useState('');

  const peerRef = useRef<any>(null);
  const connsRef = useRef<any[]>([]);
  const clientConnRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isLaunchingRef = useRef(false);
  const clientUsernamesRef = useRef<Record<string, string>>({});
  const clientSkinColorsRef = useRef<Record<string, string>>({});
  const [selectedSkin, setSelectedSkin] = useState<string>(() => localStorage.getItem('skinColor') || '#ffe0bd');

  const cleanupPeer = () => {
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    connsRef.current.forEach(c => c?.close());
    connsRef.current = [];
    if (clientConnRef.current) { clientConnRef.current.close(); clientConnRef.current = null; }
  };

  const generateBuildings = (WS: number = WORLD_SIZE): { buildings: Building[]; buildingCrates: Crate[] } => {
    const buildings: Building[] = [];
    const buildingCrates: Crate[] = [];
    // Scale building count with world size (fewer on small maps, similar or slightly more on big maps)
    const BASE_TARGET = 22;
    const SIZE_FACTOR = WS / 7000;
    const TARGET = Math.max(12, Math.round(BASE_TARGET * SIZE_FACTOR));
    const MIN_DIST = 600;
    const EDGE = 600;
    const SCALE = 2;
    const CRATE_HALF = 28;
    const CRATE_MARGIN = CRATE_HALF + 8;
    let attempts = 0;

    while (buildings.length < TARGET && attempts < 2000) {
      attempts++;
      const x = EDGE + Math.random() * (WS - 2 * EDGE);
      const y = EDGE + Math.random() * (WS - 2 * EDGE);

      const tmpl = BUILDING_TEMPLATES[Math.floor(Math.random() * BUILDING_TEMPLATES.length)];
      const halfW = (tmpl.outerW * SCALE) / 2;
      const halfH = (tmpl.outerH * SCALE) / 2;

      // Prevent buildings from overlapping by checking expanded bounding boxes
      const tooClose = buildings.some(b => {
        const minDx = halfW + b.outerW / 2 + 80;
        const minDy = halfH + b.outerH / 2 + 80;
        return Math.abs(b.x - x) < minDx && Math.abs(b.y - y) < minDy;
      });
      if (tooClose) continue;

      const building: Building = {
        id: `bld-${buildings.length}`,
        x, y,
        outerW: tmpl.outerW * SCALE, outerH: tmpl.outerH * SCALE,
        material: tmpl.material,
        wallRects: tmpl.wallRects.map(wr => ({
          x: wr.x * SCALE, y: wr.y * SCALE,
          w: wr.w * SCALE, h: wr.h * SCALE,
        })),
        interiorBounds: {
          x: tmpl.interiorBounds.x * SCALE,
          y: tmpl.interiorBounds.y * SCALE,
          w: tmpl.interiorBounds.w * SCALE,
          h: tmpl.interiorBounds.h * SCALE,
        },
      };
      buildings.push(building);

      // Crates clamped flush inside the interior — no overlap with walls
      const intCX = x + building.interiorBounds.x;
      const intCY = y + building.interiorBounds.y;
      const clampHW = building.interiorBounds.w / 2 - CRATE_MARGIN;
      const clampHH = building.interiorBounds.h / 2 - CRATE_MARGIN;
      tmpl.crateSpawns.forEach((sp, i) => {
        if (Math.random() < 0.75) {
          const rawX = x + sp.x * SCALE;
          const rawY = y + sp.y * SCALE;
          buildingCrates.push({
            id: `bld-crate-${buildings.length}-${i}`,
            x: Math.max(intCX - clampHW, Math.min(intCX + clampHW, rawX)),
            y: Math.max(intCY - clampHH, Math.min(intCY + clampHH, rawY)),
            health: 3,
            maxHealth: 3,
          });
        }
      });
    }
    return { buildings, buildingCrates };
  };

  const generateCampfires = (buildings: Building[], WS: number = WORLD_SIZE): Campfire[] => {
    const campfires: Campfire[] = [];
    const TARGET = 7;
    const MIN_DIST_CF = 600;
    const EDGE = 500;
    let attempts = 0;

    while (campfires.length < TARGET && attempts < 300) {
      attempts++;
      const x = EDGE + Math.random() * (WS - 2 * EDGE);
      const y = EDGE + Math.random() * (WS - 2 * EDGE);

      const nearBuilding = buildings.some(b =>
        Math.hypot(b.x - x, b.y - y) < Math.max(b.outerW, b.outerH) / 2 + 180
      );
      const nearOther = campfires.some(c => Math.hypot(c.x - x, c.y - y) < MIN_DIST_CF);
      if (nearBuilding || nearOther) continue;

      campfires.push({ id: `cf-${campfires.length}`, x, y, uses: 10, maxUses: 10, regenTimer: 0, healTimer: 0 });
    }
    return campfires;
  };

  const generateWorldData = (playerCount = 10) => {
    // Dynamic world size: ~500px per player, min 5000, max 9000
    // eslint-disable-next-line @typescript-eslint/no-shadow
    const WORLD_SIZE = Math.max(5000, Math.min(9000, Math.round(4000 + playerCount * 500)));
    const crates: Crate[] = [];
    const envObjects: EnvObject[] = [];
    const waterBodies: WaterBody[] = [];
    const sandbagBarriers: SandbagBarrier[] = [];
    const barrels: Barrel[] = [];

    const goldPositions = [
      { x: WORLD_SIZE * 0.50, y: WORLD_SIZE * 0.50 },
      { x: WORLD_SIZE * 0.25, y: WORLD_SIZE * 0.75 },
      { x: WORLD_SIZE * 0.75, y: WORLD_SIZE * 0.25 },
    ];
    goldPositions.forEach((pos, i) => {
      crates.push({
        id: `gold-crate-${i}`,
        x: pos.x + (Math.random() - 0.5) * 600,
        y: pos.y + (Math.random() - 0.5) * 600,
        health: 3,
        maxHealth: 3,
      });
    });

    for (let i = 0; i < 75; i++) {
      let cx = 0, cy = 0, cAttempts = 0;
      do {
        cx = Math.random() * (WORLD_SIZE - 400) + 200;
        cy = Math.random() * (WORLD_SIZE - 400) + 200;
        cAttempts++;
      } while (cAttempts < 25 && crates.some(c => Math.hypot(c.x - cx, c.y - cy) < 90));
      crates.push({ id: `crate-${i}`, x: cx, y: cy, health: 3, maxHealth: 3 });
    }

    const wallTypes = ['stone_wall', 'wood_wall', 'metal_wall', 'brick_wall', 'mossy_stone_wall'];
    const longWallTypes = ['long_stone_wall', 'long_wood_wall', 'long_brick_wall', 'long_mossy_wall'];

    // Scale trees/rocks/walls/bushes with world size:
    // keep current density on smaller maps, add more on larger maps.
    const ENV_BASE = 320;
    const envScale = Math.min(1.6, WORLD_SIZE / 5000);
    const ENV_COUNT = Math.round(ENV_BASE * envScale);

    for (let i = 0; i < ENV_COUNT; i++) {
      const typeRoll = Math.random();
      let type: any = 'tree';
      let objW: number | undefined, objH: number | undefined;

      if (typeRoll < 0.05) {
        type = longWallTypes[Math.floor(Math.random() * longWallTypes.length)];
        const isHoriz = Math.random() > 0.5;
        objW = isHoriz ? 120 : 30;
        objH = isHoriz ? 30 : 120;
      } else if (typeRoll < 0.15) {
        type = wallTypes[Math.floor(Math.random() * wallTypes.length)];
      } else if (typeRoll < 0.35) {
        type = 'bush';
      }

      let x: number, y: number;
      do {
        x = 350 + Math.random() * (WORLD_SIZE - 700);
        y = 350 + Math.random() * (WORLD_SIZE - 700);
      } while (
        (x < 650 && y < 650) ||
        (x > WORLD_SIZE - 650 && y > WORLD_SIZE - 650)
      );

      const obj: EnvObject = {
        id: `env-${i}`,
        x, y, type,
        size: type.includes('wall') ? 30 : type === 'bush' ? 75 + Math.random() * 45 : 90 + Math.random() * 60,
        leafTimer: 300
      };
      if (objW !== undefined) obj.w = objW;
      if (objH !== undefined) obj.h = objH;
      envObjects.push(obj);
    }

    const borderInset = 130;
    const borderSpacing = 110;
    for (let bx = borderInset; bx <= WORLD_SIZE - borderInset; bx += borderSpacing) {
      const jx = (Math.random() - 0.5) * 18, jy = (Math.random() - 0.5) * 18;
      envObjects.push({ id: `border-t-${bx}`, x: bx + jx, y: borderInset + jy, type: 'stone_wall', size: 30, leafTimer: 0 });
      envObjects.push({ id: `border-b-${bx}`, x: bx + jx, y: WORLD_SIZE - borderInset + jy, type: 'stone_wall', size: 30, leafTimer: 0 });
    }
    for (let by = borderInset + borderSpacing; by <= WORLD_SIZE - borderInset - borderSpacing; by += borderSpacing) {
      const jx = (Math.random() - 0.5) * 18, jy = (Math.random() - 0.5) * 18;
      envObjects.push({ id: `border-l-${by}`, x: borderInset + jx, y: by + jy, type: 'stone_wall', size: 30, leafTimer: 0 });
      envObjects.push({ id: `border-r-${by}`, x: WORLD_SIZE - borderInset + jx, y: by + jy, type: 'stone_wall', size: 30, leafTimer: 0 });
    }

    // Boulder clusters (22) — rendered as rock EnvObjects
    {
      let attempts = 0;
      const rockClusters: EnvObject[] = [];
      while (rockClusters.length < 35 && attempts < 800) {
        attempts++;
        const x = 400 + Math.random() * (WORLD_SIZE - 800);
        const y = 400 + Math.random() * (WORLD_SIZE - 800);
        const tooClose = rockClusters.some(r => Math.hypot(r.x - x, r.y - y) < 350);
        if (tooClose) continue;
        rockClusters.push({
          id: `rock-${rockClusters.length}`,
          x, y,
          type: 'rock',
          size: 35 + Math.random() * 30,
          leafTimer: 0,
        });
      }
      rockClusters.forEach(r => envObjects.push(r));
    }

    // Sandbag barriers (28)
    {
      let attempts = 0;
      while (sandbagBarriers.length < 28 && attempts < 800) {
        attempts++;
        const x = 300 + Math.random() * (WORLD_SIZE - 600);
        const y = 300 + Math.random() * (WORLD_SIZE - 600);
        const tooClose = sandbagBarriers.some(sb => Math.hypot(sb.x - x, sb.y - y) < 200);
        if (tooClose) continue;
        sandbagBarriers.push({
          id: `sandbag-${sandbagBarriers.length}`,
          x, y,
          angle: Math.random() * Math.PI * 2,
          count: 4 + Math.floor(Math.random() * 3), // 4-6
        });
      }
    }

    // Explosive barrels (scattered)
    {
      let attempts = 0;
      while (barrels.length < 8 && attempts < 400) {
        attempts++;
        const x = 200 + Math.random() * (WORLD_SIZE - 400);
        const y = 200 + Math.random() * (WORLD_SIZE - 400);
        const tooClose = barrels.some(b => Math.hypot(b.x - x, b.y - y) < 300);
        if (tooClose) continue;
        barrels.push({ id: `barrel-${barrels.length}`, x, y, health: 3, maxHealth: 3 });
      }
    }

    const { buildings, buildingCrates } = generateBuildings(WORLD_SIZE);
    const campfires = generateCampfires(buildings, WORLD_SIZE);
    buildingCrates.forEach(c => crates.push(c));

    // ── Detect door openings on each building's exterior walls ───────────────
    const doorZones: Array<{ x: number; y: number }> = [];
    const WALL_THICK = 20;   // tolerance to identify wall rects on an exterior edge
    const MIN_DOOR_GAP = 30; // minimum gap width to count as a door
    buildings.forEach(bld => {
      const hw = bld.outerW / 2;
      const hh = bld.outerH / 2;
      const edges: Array<{
        axis: 'h' | 'v';
        edgePos: number;
        span: number;
        toWorld: (t: number) => { x: number; y: number };
      }> = [
        { axis: 'h', edgePos: -hh, span: hw, toWorld: t => ({ x: bld.x + t, y: bld.y - hh }) },
        { axis: 'h', edgePos:  hh, span: hw, toWorld: t => ({ x: bld.x + t, y: bld.y + hh }) },
        { axis: 'v', edgePos: -hw, span: hh, toWorld: t => ({ x: bld.x - hw, y: bld.y + t }) },
        { axis: 'v', edgePos:  hw, span: hh, toWorld: t => ({ x: bld.x + hw, y: bld.y + t }) },
      ];
      edges.forEach(edge => {
        const segs: Array<[number, number]> = [];
        bld.wallRects.forEach(wr => {
          if (edge.axis === 'h') {
            if (Math.abs(wr.y - edge.edgePos) < WALL_THICK) segs.push([wr.x - wr.w / 2, wr.x + wr.w / 2]);
          } else {
            if (Math.abs(wr.x - edge.edgePos) < WALL_THICK) segs.push([wr.y - wr.h / 2, wr.y + wr.h / 2]);
          }
        });
        if (segs.length === 0) return;
        segs.sort((a, b) => a[0] - b[0]);
        let prevEnd = -edge.span;
        for (const [s, e] of segs) {
          if (s > prevEnd + MIN_DOOR_GAP) doorZones.push(edge.toWorld((prevEnd + s) / 2));
          prevEnd = Math.max(prevEnd, e);
        }
        if (prevEnd < edge.span - MIN_DOOR_GAP) doorZones.push(edge.toWorld((prevEnd + edge.span) / 2));
      });
    });

    // Detect interior door gaps (spaces between interior wall segments)
    const interiorDoorZones: Array<{ x: number; y: number }> = [];
    const INT_WALL_THICK = 20;
    const INT_MIN_DOOR_GAP = 55;
    buildings.forEach(bld => {
      bld.wallRects.forEach((wr1, i) => {
        bld.wallRects.forEach((wr2, j) => {
          if (i >= j) return;
          const dx = Math.abs((bld.x + wr1.x) - (bld.x + wr2.x));
          const dy = Math.abs((bld.y + wr1.y) - (bld.y + wr2.y));
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 40 && dist < 120) {
            const midX = (bld.x + wr1.x + bld.x + wr2.x) / 2;
            const midY = (bld.y + wr1.y + bld.y + wr2.y) / 2;
            const inInterior = Math.abs(midX - bld.x) < bld.interiorBounds.w / 2 && 
                               Math.abs(midY - bld.y) < bld.interiorBounds.h / 2;
            if (inInterior) {
              interiorDoorZones.push({ x: midX, y: midY });
            }
          }
        });
      });
    });

    const DOOR_CLEAR = 110;
    const INT_DOOR_CLEAR = 55;
    const nearDoor = (x: number, y: number) => doorZones.some(dz => Math.hypot(dz.x - x, dz.y - y) < DOOR_CLEAR);
    const nearInteriorDoor = (x: number, y: number) => interiorDoorZones.some(dz => Math.hypot(dz.x - x, dz.y - y) < INT_DOOR_CLEAR);

    // Helper: true if point (x,y) with given radius overlaps any building (outer footprint + radius)
    const overlapsBuilding = (x: number, y: number, radius: number) =>
      buildings.some(bld =>
        Math.abs(x - bld.x) < bld.outerW / 2 + radius &&
        Math.abs(y - bld.y) < bld.outerH / 2 + radius
      );

    const getEnvObjRadius = (o: EnvObject) => {
      if (o.w && o.h) return Math.max(o.w, o.h) / 2;
      if (o.type === 'tree') return o.size * 0.38;
      if (o.type === 'rock') return o.size * 0.6;
      if (o.type.includes('wall')) return 30;
      return 50; // bush, etc.
    };

    // Separate border walls from other env objects
    const borderWalls: EnvObject[] = [];
    const otherEnvObjects: EnvObject[] = [];
    envObjects.forEach(obj => {
      if (obj.id.startsWith('border-')) borderWalls.push(obj);
      else otherEnvObjects.push(obj);
    });

    // Filter border walls: check against buildings, doors, and other env objects (not other border walls)
    const filteredBorderWalls = borderWalls.filter(bw => {
      const r = getEnvObjRadius(bw);
      return !overlapsBuilding(bw.x, bw.y, r) && !nearDoor(bw.x, bw.y) && !otherEnvObjects.some(e => Math.hypot(bw.x - e.x, bw.y - e.y) < r + getEnvObjRadius(e) + 20);
    });

    // Filter env objects: check against buildings and doors
    const filteredEnv = otherEnvObjects.filter(obj => {
      const r = getEnvObjRadius(obj);
      return !overlapsBuilding(obj.x, obj.y, r) && !nearDoor(obj.x, obj.y);
    });

    // Rebuild envObjects with filtered items
    envObjects.length = 0;
    filteredBorderWalls.forEach(o => envObjects.push(o));
    filteredEnv.forEach(o => envObjects.push(o));

    // Filter barrels: check against buildings, doors, and env objects
    const filteredBarrels = barrels.filter(b =>
      !overlapsBuilding(b.x, b.y, 25) && !buildings.some(bld =>
        bld.wallRects.some(wr => {
          const wx = bld.x + wr.x, wy = bld.y + wr.y;
          return Math.abs(b.x - wx) < wr.w / 2 + 22 && Math.abs(b.y - wy) < wr.h / 2 + 22;
        })
      ) && !nearDoor(b.x, b.y) && !envObjects.some(e => Math.hypot(b.x - e.x, b.y - e.y) < 60)
    );
    barrels.length = 0;
    filteredBarrels.forEach(b => barrels.push(b));

    // Filter sandbags: check against buildings, doors, and env objects
    const filteredSandbags = sandbagBarriers.filter(sb =>
      !overlapsBuilding(sb.x, sb.y, 35) && !nearDoor(sb.x, sb.y) && !envObjects.some(e => Math.hypot(sb.x - e.x, sb.y - e.y) < 70)
    );
    sandbagBarriers.length = 0;
    filteredSandbags.forEach(sb => sandbagBarriers.push(sb));

    // Remove crates: outdoor crates can't block doors, indoor crates can't block interior doors
    const clearCrates = crates.filter(c => {
      if (c.id.startsWith('bld-crate-')) {
        return !nearInteriorDoor(c.x, c.y);
      }
      return !overlapsBuilding(c.x, c.y, 50) && !nearDoor(c.x, c.y);
    });
    crates.length = 0;
    clearCrates.forEach(c => crates.push(c));

    // 0-2 extra barrels outside each building (guaranteed clear of walls and doors)
    buildings.forEach((bld, bi) => {
      const nearCount = Math.floor(Math.random() * 3);
      const minDist = Math.max(bld.outerW, bld.outerH) / 2 + 40;
      let placed = 0, attempts = 0;
      while (placed < nearCount && attempts < 40) {
        attempts++;
        const ang = Math.random() * Math.PI * 2;
        const dist = minDist + Math.random() * 80;
        const bx = bld.x + Math.cos(ang) * dist;
        const by = bld.y + Math.sin(ang) * dist;
        if (nearDoor(bx, by)) continue;
        barrels.push({ id: `barrel-bld-${bi}-${placed}`, x: bx, y: by, health: 3, maxHealth: 3 });
        placed++;
      }
    });

    // ── Gold crate selection: global cap across indoor + outdoor crates, biased toward buildings
    const GOLD_BASE =
      WORLD_SIZE <= 6000 ? 3 :
      WORLD_SIZE <= 8000 ? 4 : 5;
    const goldTarget = Math.min(GOLD_BASE, crates.length);
    if (goldTarget > 0) {
      const indoor: Array<{ idx: number }> = [];
      const outdoor: Array<{ idx: number }> = [];
      crates.forEach((c, idx) => {
        if (c.id.startsWith('bld-crate-')) indoor.push({ idx });
        else outdoor.push({ idx });
      });

      const weighted: Array<{ idx: number; weight: number }> = [];
      indoor.forEach(({ idx }) => weighted.push({ idx, weight: 3 }));
      outdoor.forEach(({ idx }) => weighted.push({ idx, weight: 1 }));

      const chosen = new Set<number>();
      let attempts = 0;
      while (chosen.size < goldTarget && attempts < 1000 && weighted.length > 0) {
        attempts++;
        const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
        let r = Math.random() * totalWeight;
        let pickedIdx = weighted[0].idx;
        for (const w of weighted) {
          if (r < w.weight) { pickedIdx = w.idx; break; }
          r -= w.weight;
        }
        if (!chosen.has(pickedIdx)) {
          chosen.add(pickedIdx);
          // remove from weighted so we don't pick it again
          const removeAt = weighted.findIndex(w => w.idx === pickedIdx);
          if (removeAt >= 0) weighted.splice(removeAt, 1);
        }
      }

      crates.forEach((c, idx) => {
        if (chosen.has(idx)) {
          c.isGold = true;
          c.health = 6;
          c.maxHealth = 6;
        } else if (c.isGold) {
          // Ensure any non-selected crate is normal if previously marked gold for some reason
          c.isGold = false;
          c.health = 3;
          c.maxHealth = 3;
        }
      });
    }

    // ── Spawn points: open space only, clear of crates, env objects, buildings, sandbags, barrels, water, campfires
    const SPAWN_CLEAR = 100; // min distance from player center to any obstacle
    const isInWater = (px: number, py: number) => waterBodies.some(wb => {
      if (wb.type === 'pond') {
        const dx = (px - wb.x) / wb.rx, dy = (py - wb.y) / wb.ry;
        return dx * dx + dy * dy <= 1;
      }
      if (wb.points && wb.points.length >= 1) {
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
      }
      return false;
    });
    const isPositionClear = (px: number, py: number) => {
      if (px < SPAWN_CLEAR || py < SPAWN_CLEAR || px > WORLD_SIZE - SPAWN_CLEAR || py > WORLD_SIZE - SPAWN_CLEAR) return false;
      if (isInWater(px, py)) return false;
      if (crates.some(c => Math.hypot(c.x - px, c.y - py) < 45 + SPAWN_CLEAR)) return false;
      if (envObjects.some(o => {
        const r = o.w && o.h ? Math.max(o.w, o.h) / 2 : (o.type === 'tree' ? o.size * 0.38 : o.type === 'rock' ? o.size * 0.6 : o.type.includes('wall') ? 30 : 45);
        return Math.hypot(o.x - px, o.y - py) < r + SPAWN_CLEAR;
      })) return false;
      if (buildings.some(b => Math.abs(px - b.x) < b.outerW / 2 + SPAWN_CLEAR && Math.abs(py - b.y) < b.outerH / 2 + SPAWN_CLEAR)) return false;
      if (campfires.some(cf => Math.hypot(cf.x - px, cf.y - py) < 50 + SPAWN_CLEAR)) return false;
      if (barrels.some(b => Math.hypot(b.x - px, b.y - py) < 18 + SPAWN_CLEAR)) return false;
      if (sandbagBarriers.some(sb => Math.hypot(sb.x - px, sb.y - py) < 30 + SPAWN_CLEAR)) return false;
      return true;
    };

    const spawnPoints: Array<{ x: number; y: number }> = [];
    const baseR = WORLD_SIZE * 0.35;
    const edgeInset = 250;
    const SPAWN_MIN_DIST = 150; // min distance between spawn points
    for (let i = 0; i < playerCount; i++) {
      const baseAngle = (i / Math.max(1, playerCount)) * Math.PI * 2 - Math.PI / 2;
      let x = Math.round(WORLD_SIZE / 2 + Math.cos(baseAngle) * baseR);
      let y = Math.round(WORLD_SIZE / 2 + Math.sin(baseAngle) * baseR);
      let attempts = 0;
      while ((!isPositionClear(x, y) || spawnPoints.some(sp => Math.hypot(sp.x - x, sp.y - y) < SPAWN_MIN_DIST)) && attempts < 600) {
        attempts++;
        x = Math.round(edgeInset + Math.random() * (WORLD_SIZE - 2 * edgeInset));
        y = Math.round(edgeInset + Math.random() * (WORLD_SIZE - 2 * edgeInset));
      }
      if (isPositionClear(x, y) && (spawnPoints.length === 0 || spawnPoints.every(sp => Math.hypot(sp.x - x, sp.y - y) >= SPAWN_MIN_DIST))) {
        spawnPoints.push({ x, y });
      } else {
        spawnPoints.push({ x: Math.round(WORLD_SIZE / 2 + Math.cos(baseAngle) * baseR), y: Math.round(WORLD_SIZE / 2 + Math.sin(baseAngle) * baseR) });
      }
    }

    return { crates, envObjects, items: [] as Item[], waterBodies, buildings, campfires, barrels, sandbagBarriers, worldSize: WORLD_SIZE, spawnPoints };
  };

  // Central PeerJS connection options so host and join use the same server
  const PEER_CONFIG: any = {
    host: 'server-gyw4.onrender.com',
    port: 443,
    path: '/peerjs',
    secure: true,
    config: {
      iceServers: [
        {
          urls: 'stun:stun.relay.metered.ca:80',
        },
        {
          urls: 'turn:global.relay.metered.ca:80',
          username: 'bee1fd0a69fc2a6e3f31766d',
          credential: 'eVt9G9UJYqNLOW5q',
        },
        {
          urls: 'turn:global.relay.metered.ca:80?transport=tcp',
          username: 'bee1fd0a69fc2a6e3f31766d',
          credential: 'eVt9G9UJYqNLOW5q',
        },
        {
          urls: 'turn:global.relay.metered.ca:443',
          username: 'bee1fd0a69fc2a6e3f31766d',
          credential: 'eVt9G9UJYqNLOW5q',
        },
        {
          urls: 'turns:global.relay.metered.ca:443?transport=tcp',
          username: 'bee1fd0a69fc2a6e3f31766d',
          credential: 'eVt9G9UJYqNLOW5q',
        },
      ],
    },
    key: 'verdant-strike',
  };

  const initHost = () => {
    cleanupPeer();
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    setLobbyCode(code);
    setIsHost(true);
    setStatus('Connecting to signaling server...');

    const peer = new Peer(`verdant-strike-${code}`, PEER_CONFIG);
    peerRef.current = peer;

    peer.on('open', () => {
      setStatus('Waiting for opponent...');
    });

    peer.on('connection', (conn: any) => {
      if (connsRef.current.length >= 9) { conn.close(); return; }
      connsRef.current.push(conn);
      const count = connsRef.current.length + 1;
      setPlayerCount(count);
      setStatus(`${connsRef.current.length} player${connsRef.current.length > 1 ? 's' : ''} connected`);

      conn.on('data', (data: any) => {
        if (data.type === 'PLAYER_INFO') {
          const connIndex = connsRef.current.indexOf(conn);
          if (connIndex >= 0) {
            clientUsernamesRef.current[`p${connIndex + 1}`] = data.username;
            if (data.skinColor) clientSkinColorsRef.current[`p${connIndex + 1}`] = data.skinColor;
          }
        }
      });

      conn.on('close', () => {
        connsRef.current = connsRef.current.filter(c => c !== conn);
        setPlayerCount(connsRef.current.length + 1);
        setStatus(connsRef.current.length === 0 ? 'Waiting for players...' : `${connsRef.current.length} player${connsRef.current.length > 1 ? 's' : ''} connected`);
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

    const peer = new Peer(PEER_CONFIG);
    peerRef.current = peer;

    peer.on('open', () => {
      const conn = peer.connect(`verdant-strike-${code}`);
      clientConnRef.current = conn;
      conn.on('open', () => {
        setMenuState('waiting');
        setStatus('Connected to host!');
        conn.send({ type: 'PLAYER_INFO', username, skinColor: localStorage.getItem('skinColor') || '#ffe0bd' });
      });

      conn.on('data', (data: any) => {
        if (data.type === 'START_GAME') {
          isLaunchingRef.current = true;
          onLaunch(code, false, peer, conn, data.worldData, data.playerId);
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
    if (isHost && connsRef.current.length > 0) {
      const playerIds = ['p0', ...connsRef.current.map((_, i) => `p${i + 1}`)];
      const worldData = generateWorldData(playerIds.length);
      const usernames: Record<string, string> = { p0: username, ...clientUsernamesRef.current };
      const skinColors: Record<string, string> = { p0: localStorage.getItem('skinColor') || '#ffe0bd', ...clientSkinColorsRef.current };
      connsRef.current.forEach((c, i) => {
        if (c?.open) c.send({ type: 'START_GAME', worldData: { ...worldData, playerIds, usernames, skinColors }, playerId: `p${i + 1}` });
      });
      isLaunchingRef.current = true;
      onLaunch(lobbyCode, true, peerRef.current, connsRef.current, { ...worldData, playerIds, usernames, skinColors }, 'p0');
    }
  };

  useEffect(() => {
    if (menuState === 'create') initHost();
    return () => {
      if (!isLaunchingRef.current) cleanupPeer();
    };
  }, [menuState === 'create']);

  // Animated battle scene background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W; canvas.height = H;
    };
    window.addEventListener('resize', onResize);

    const S = Math.min(W, H) / 700;

    // Static map elements (fractional positions)
    const trees: { fx: number; fy: number; r: number; seed: number }[] = [
      { fx: 0.08, fy: 0.12, r: 48 * S, seed: 0 }, { fx: 0.92, fy: 0.10, r: 52 * S, seed: 1 },
      { fx: 0.18, fy: 0.78, r: 44 * S, seed: 2 }, { fx: 0.80, fy: 0.82, r: 50 * S, seed: 3 },
      { fx: 0.50, fy: 0.08, r: 40 * S, seed: 4 }, { fx: 0.12, fy: 0.50, r: 46 * S, seed: 5 },
      { fx: 0.88, fy: 0.55, r: 48 * S, seed: 6 }, { fx: 0.38, fy: 0.88, r: 42 * S, seed: 7 },
      { fx: 0.62, fy: 0.25, r: 45 * S, seed: 8 }, { fx: 0.32, fy: 0.38, r: 40 * S, seed: 9 },
      { fx: 0.72, fy: 0.60, r: 43 * S, seed: 10 }, { fx: 0.55, fy: 0.70, r: 38 * S, seed: 11 },
      { fx: 0.20, fy: 0.22, r: 41 * S, seed: 12 }, { fx: 0.78, fy: 0.20, r: 44 * S, seed: 13 },
    ];

    const sceneCrates: { fx: number; fy: number; isGold: boolean }[] = [
      { fx: 0.30, fy: 0.30, isGold: false }, { fx: 0.70, fy: 0.28, isGold: false },
      { fx: 0.50, fy: 0.50, isGold: true  }, { fx: 0.28, fy: 0.68, isGold: false },
      { fx: 0.72, fy: 0.70, isGold: false }, { fx: 0.18, fy: 0.48, isGold: false },
      { fx: 0.82, fy: 0.45, isGold: false }, { fx: 0.48, fy: 0.20, isGold: false },
    ];

    // Demo players — team 0 (left side) vs team 1 (right side)
    const makePl = (fx: number, fy: number, team: number) => ({
      x: fx * W, y: fy * H,
      rot: team === 0 ? 0.3 : Math.PI - 0.3,
      targetX: Math.random() * W, targetY: Math.random() * H,
      team,
      shootTimer: Math.floor(Math.random() * 80),
      color: team === 0 ? '#ffe0bd' : '#c8a87a',
    });

    const demoPlayers = [
      makePl(0.18, 0.32, 0), makePl(0.12, 0.58, 0), makePl(0.25, 0.48, 0),
      makePl(0.82, 0.30, 1), makePl(0.88, 0.62, 1), makePl(0.75, 0.46, 1),
    ];

    type Bullet = { x: number; y: number; vx: number; vy: number; life: number };
    type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number };

    let bullets: Bullet[] = [];
    let particles: Particle[] = [];

    const spawnHit = (x: number, y: number, color: string) => {
      for (let i = 0; i < 8; i++) {
        particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6,
          life: 25 + Math.random() * 15, maxLife: 40,
          color, size: 2 + Math.random() * 3,
        });
      }
    };

    const treeGreens = ['#1a3a1a', '#2d4a2d', '#1e4020', '#2a5c2a', '#1f4a1f', '#254d25'];
    let rafId: number;

    const loop = () => {
      ctx.clearRect(0, 0, W, H);

      // Floor tiles
      const floorPalette = ['#064e3b', '#053d30', '#074f3c', '#055840', '#054538'];
      const tileSize = 180;
      for (let tx = 0; tx < W; tx += tileSize) {
        for (let ty = 0; ty < H; ty += tileSize) {
          const idx = Math.floor(((tx / tileSize) * 3 + (ty / tileSize) * 7) % floorPalette.length);
          ctx.fillStyle = floorPalette[idx];
          ctx.fillRect(tx, ty, tileSize, tileSize);
        }
      }
      // Subtle grid
      ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += tileSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += tileSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // Crates
      const crateS = 22 * S;
      sceneCrates.forEach(c => {
        const cx = c.fx * W, cy = c.fy * H;
        ctx.save(); ctx.translate(cx, cy);
        ctx.fillStyle = c.isGold ? '#92400e' : '#78350f';
        ctx.strokeStyle = c.isGold ? '#eab308' : '#451a03'; ctx.lineWidth = 2;
        ctx.fillRect(-crateS, -crateS, crateS * 2, crateS * 2);
        ctx.strokeRect(-crateS, -crateS, crateS * 2, crateS * 2);
        if (c.isGold) {
          ctx.fillStyle = '#eab308'; ctx.font = `bold ${Math.round(13 * S)}px sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', 0, 0);
        } else {
          ctx.beginPath(); ctx.moveTo(-crateS, -crateS); ctx.lineTo(crateS, crateS); ctx.stroke();
        }
        ctx.restore();
      });

      // Tree trunks
      trees.forEach(t => {
        ctx.fillStyle = '#2c1810';
        ctx.beginPath(); ctx.arc(t.fx * W, t.fy * H + 4 * S, 9 * S, 0, Math.PI * 2); ctx.fill();
      });

      // Update and draw demo players
      demoPlayers.forEach(pl => {
        const dx = pl.targetX - pl.x, dy = pl.targetY - pl.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
          pl.x += (dx / dist) * 1.6;
          pl.y += (dy / dist) * 1.6;
          // Keep inside screen
          pl.x = Math.max(40, Math.min(W - 40, pl.x));
          pl.y = Math.max(40, Math.min(H - 40, pl.y));
        } else {
          pl.targetX = W * (0.05 + Math.random() * 0.9);
          pl.targetY = H * (0.05 + Math.random() * 0.9);
        }

        // Aim at nearest enemy
        const enemy = demoPlayers.find(p2 => p2.team !== pl.team);
        if (enemy) {
          const targetAngle = Math.atan2(enemy.y - pl.y, enemy.x - pl.x);
          // Smooth rotation
          let diff = targetAngle - pl.rot;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          pl.rot += diff * 0.06;
        }

        // Shoot
        pl.shootTimer--;
        if (pl.shootTimer <= 0 && enemy) {
          pl.shootTimer = 65 + Math.floor(Math.random() * 70);
          const angle = pl.rot + (Math.random() - 0.5) * 0.28;
          const spd = 10;
          bullets.push({
            x: pl.x + Math.cos(angle) * 22 * S,
            y: pl.y + Math.sin(angle) * 22 * S,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            life: 55 + Math.floor(Math.random() * 20),
          });
        }

        // Draw player
        ctx.save(); ctx.translate(pl.x, pl.y); ctx.rotate(pl.rot);
        ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.5;
        // Gun
        ctx.fillStyle = '#2a2a2a'; ctx.fillRect(10 * S, 2 * S, 22 * S, 7 * S);
        // Body
        ctx.fillStyle = pl.color;
        ctx.beginPath(); ctx.arc(0, 0, 16 * S, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Head
        ctx.fillStyle = pl.color;
        ctx.beginPath(); ctx.arc(10 * S, -13 * S, 6 * S, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Eyes
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(9 * S, -5 * S, 2 * S, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(9 * S, 4 * S, 2 * S, 0, Math.PI * 2); ctx.fill();
        // Hand
        ctx.fillStyle = pl.color; ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(14 * S, 6 * S, 5 * S, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      });

      // Update and draw bullets
      bullets = bullets.filter(b => {
        b.x += b.vx; b.y += b.vy; b.life--;
        if (b.life <= 0 || b.x < 0 || b.x > W || b.y < 0 || b.y > H) return false;

        let hit = false;
        demoPlayers.forEach(pl => {
          if (Math.sqrt((pl.x - b.x) ** 2 + (pl.y - b.y) ** 2) < 16 * S) {
            spawnHit(b.x, b.y, '#ef4444');
            hit = true;
          }
        });
        if (hit) return false;

        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
        const g = ctx.createLinearGradient(-11, 0, 4, 0);
        g.addColorStop(0, 'rgba(255,180,0,0)');
        g.addColorStop(0.6, 'rgba(255,220,80,0.75)');
        g.addColorStop(1, 'rgba(255,255,200,1)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 0, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.ellipse(2, 0, 2.5, 1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        return true;
      });

      // Update and draw particles
      particles = particles.filter(pt => {
        pt.x += pt.vx; pt.y += pt.vy;
        pt.vx *= 0.9; pt.vy *= 0.9; pt.life--;
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillStyle = pt.color;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        return pt.life > 0;
      });

      // Tree foliage — drawn over players for depth
      trees.forEach(t => {
        const tx = t.fx * W, ty = t.fy * H;
        ctx.save(); ctx.translate(tx, ty);
        const g0 = treeGreens[t.seed % treeGreens.length];
        const g1 = treeGreens[(t.seed + 2) % treeGreens.length];
        const g2 = treeGreens[(t.seed + 4) % treeGreens.length];
        const r = t.r;
        ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(-r * 0.28, r * 0.1, r * 0.58, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(r * 0.28, r * 0.1, r * 0.58, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(0, -r * 0.12, r * 0.72, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });

      // Dark vignette around edges
      const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.min(W, H) * 0.78);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.72)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      rafId = requestAnimationFrame(loop);
    };

    loop();
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div className="relative w-full h-full flex items-center justify-center font-sans overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {/* Customize Screen */}
      {menuState === 'customize' && (
        <div className="absolute inset-0 z-20 flex pointer-events-auto select-none" style={{ backdropFilter: 'blur(8px)' }}>
          {/* Left sidebar */}
          <div className="w-72 flex flex-col" style={{ background: 'rgba(0,0,0,0.88)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-5 border-b border-white/8">
              <button
                onClick={() => setMenuState('main')}
                className="text-white/40 hover:text-white font-black text-sm tracking-widest uppercase transition-colors"
              >← BACK</button>
              <span className="text-white font-black text-lg tracking-widest uppercase ml-2">CUSTOMIZE</span>
            </div>
            {/* Tabs */}
            <div className="flex border-b border-white/8">
              <button className="px-6 py-3 font-black text-xs tracking-widest uppercase text-white border-b-2 border-green-400">SKIN</button>
              <button className="px-6 py-3 font-black text-xs tracking-widest uppercase text-white/20 cursor-not-allowed">HAT</button>
              <button className="px-6 py-3 font-black text-xs tracking-widest uppercase text-white/20 cursor-not-allowed">MORE</button>
            </div>
            {/* Color patches */}
            <div className="p-5 flex-1">
              <p className="text-white/30 text-[10px] font-black tracking-widest uppercase mb-4">Choose Skin Tone</p>
              <div className="grid grid-cols-3 gap-3">
                {SKIN_TONES.map(color => (
                  <button
                    key={color}
                    onClick={() => setSelectedSkin(color)}
                    className="h-11 rounded-xl transition-all duration-150 hover:scale-105 active:scale-95"
                    style={{
                      backgroundColor: color,
                      boxShadow: selectedSkin === color ? `0 0 0 3px white, 0 0 16px ${color}` : '0 0 0 1px rgba(255,255,255,0.12)',
                      transform: selectedSkin === color ? 'scale(1.08)' : 'scale(1)',
                    }}
                  />
                ))}
              </div>
            </div>
            {/* Save button */}
            <div className="p-5 border-t border-white/8">
              <button
                onClick={() => { localStorage.setItem('skinColor', selectedSkin); setMenuState('main'); }}
                className="w-full py-4 bg-green-500 text-white font-black text-lg rounded-2xl hover:bg-green-400 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_24px_rgba(34,197,94,0.3)]"
              >
                SAVE &amp; APPLY
              </button>
            </div>
          </div>

          {/* Right - player preview */}
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            {/* Glow backdrop */}
            <div style={{ position: 'relative', width: 200, height: 200 }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: selectedSkin, filter: 'blur(50px)', opacity: 0.45, transform: 'scale(1.3)',
              }} />
              <svg width="200" height="200" viewBox="-50 -50 100 100" style={{ position: 'relative' }}>
                {/* Gun */}
                <rect x="18" y="-4" width="28" height="10" rx="2" fill="#2a2a2a" />
                {/* Body */}
                <circle cx="0" cy="0" r="18" fill={selectedSkin} stroke="#333" strokeWidth="2" />
                {/* Eyes */}
                <circle cx="10" cy="-6" r="2.5" fill="#000" />
                <circle cx="10" cy="6" r="2.5" fill="#000" />
                {/* Hand */}
                <circle cx="14" cy="6" r="5" fill={selectedSkin} stroke="#2a2a2a" strokeWidth="1.5" />
              </svg>
            </div>
            <p className="text-white font-black text-2xl tracking-widest uppercase drop-shadow-[0_0_16px_rgba(255,255,255,0.2)]">{username}</p>
            <p className="text-white/30 text-sm font-bold tracking-wider">Pick a color from the sidebar</p>
           </div>
        </div>
      )}

      {/* Verdant Pass Screen */}
      {menuState === 'pass' && (
      <div className="absolute inset-0 z-30 flex pointer-events-auto select-none" style={{ backdropFilter: 'blur(12px)', background: 'rgba(0,0,0,0.85)' }}>
        <div className="absolute top-6 left-6">
          <button
            onClick={() => { setPassPage(0); setMenuState('main'); }}
            className="text-white/50 hover:text-white font-black text-sm tracking-widest uppercase transition-colors"
          >
            ← BACK TO MAIN MENU
          </button>
        </div>

        {/* Pass Title */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2">
          <h2 className="text-white text-4xl font-black italic tracking-wider drop-shadow-[0_0_20px_rgba(34,197,94,0.5)]">
            VERDANT PASS
          </h2>
        </div>

        {/* Level Grid */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2">
            {/* Left Arrow */}
            {passPage > 0 && (
              <button
                onClick={() => setPassPage(passPage - 1)}
                className="w-12 h-12 rounded-full bg-white/10 border border-white/20 text-white font-black text-xl hover:bg-white/20 hover:scale-110 transition-all flex items-center justify-center mr-4"
              >
                ←
              </button>
            )}

            {/* 5 Cards horizontally connected */}
            <div className="flex items-center gap-0">
              {[0,1,2,3,4].map((i) => {
                const levelNum = passPage * 5 + i + 1;
                const isLevel50 = levelNum === 50;
                const isMilestone = levelNum % 10 === 0 && levelNum < 50;
                
                let cardClass = "w-28 h-40 rounded-xl border-2 bg-gradient-to-b from-white/10 to-white/5 flex flex-col items-center justify-center gap-2 relative overflow-hidden shadow-lg transition-all duration-200 cursor-pointer";
                
                if (isLevel50) {
                  cardClass += " border-yellow-600/60 shadow-[0_0_20px_rgba(234,179,8,0.3)] hover:border-yellow-300 hover:shadow-[0_0_35px_rgba(234,179,8,0.6)] hover:scale-110";
                } else if (isMilestone) {
                  cardClass += " border-blue-900/60 shadow-[0_0_15px_rgba(30,58,138,0.4)] hover:border-blue-400 hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] hover:scale-110";
                } else {
                  cardClass += " border-white/25 hover:border-white hover:shadow-[0_0_25px_rgba(255,255,255,0.3)] hover:scale-110";
                }
                
                return (
                  <div key={levelNum} className="flex items-center">
                    {/* Card */}
                    <div className={cardClass}>
                      <div className="text-white/60 font-black text-5xl italic">{levelNum}</div>
                      <svg className="w-8 h-8 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    {/* Connector Line */}
                    {i < 4 && (
                      <div className="w-8 h-1 bg-white/20" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right Arrow */}
            {passPage < 9 && (
              <button
                onClick={() => setPassPage(passPage + 1)}
                className="w-12 h-12 rounded-full bg-white/10 border border-white/20 text-white font-black text-xl hover:bg-white/20 hover:scale-110 transition-all flex items-center justify-center ml-4"
              >
                →
              </button>
            )}
          </div>
        </div>

        {/* Coming Soon */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <button
            className="px-8 py-3 bg-white/5 text-white/30 font-black text-lg rounded-xl border border-white/10 cursor-not-allowed"
          >
            COMING SOON
          </button>
        </div>
      </div>
      )}

      {/* Tutorial Screen */}
      {menuState === 'tutorial' && (
        <div className="absolute inset-0 z-30 flex pointer-events-auto select-none" style={{ backdropFilter: 'blur(12px)', background: 'rgba(0,0,0,0.85)' }}>
          <div className="absolute top-6 left-6">
            <button
              onClick={() => setMenuState('main')}
              className="text-white/50 hover:text-white font-black text-sm tracking-widest uppercase transition-colors"
            >
              ← BACK TO MAIN MENU
            </button>
          </div>

          {/* Title */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2">
            <h2 className="text-white text-4xl font-black italic tracking-wider drop-shadow-[0_0_20px_rgba(34,197,94,0.5)]">
              TUTORIAL
            </h2>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="bg-white rounded-3xl w-[900px] h-[500px] flex flex-col p-8 shadow-2xl">
              
              {/* 3 Cards */}
              <div className="flex-1 flex gap-6">
                {/* Card 1 - Loot */}
                <div className="flex-1 bg-gradient-to-b from-gray-100 to-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-3">
                  <div className="flex flex-col items-center gap-1">
                    {/* Supply Crate */}
                    <div className="w-14 h-14 bg-blue-500 rounded-lg flex items-center justify-center shadow-lg">
                      <span className="text-white text-xs font-bold">SUPPLY</span>
                    </div>
                    {/* Normal + Golden */}
                    <div className="flex gap-1">
                      <div className="w-12 h-12 bg-amber-700 rounded-lg flex items-center justify-center shadow-md">
                        <span className="text-white text-xs font-bold">NORM</span>
                      </div>
                      <div className="w-12 h-12 bg-yellow-500 rounded-lg flex items-center justify-center shadow-md border-2 border-yellow-300">
                        <span className="text-white text-xs font-bold">GOLD</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-black font-bold text-lg">LOOT</div>
                  <div className="text-gray-600 text-sm text-center px-2">
                    Destroy crates to earn loot, some better than others.
                  </div>
                </div>

                {/* Card 2 - Storm */}
                <div className="flex-1 bg-gradient-to-b from-gray-100 to-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-3">
                  <div className="text-6xl">⛈️</div>
                  <div className="text-black font-bold text-lg">STORM</div>
                  <div className="text-gray-600 text-sm text-center px-2">
                    2 minutes to loot, 1 minute off and on storms getting smaller everytime.
                  </div>
                </div>

                {/* Card 3 - Win */}
                <div className="flex-1 bg-gradient-to-b from-gray-100 to-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-3">
                  <div className="text-6xl">🏆</div>
                  <div className="text-black font-bold text-lg">WIN</div>
                  <div className="text-gray-600 text-sm text-center px-2">
                    Kill all players and be last standing to win.
                  </div>
                </div>
              </div>

              {/* Back Button */}
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setMenuState('main')}
                  className="px-8 py-3 bg-gray-800 text-white font-black text-lg rounded-xl hover:bg-gray-700 hover:scale-105 transition-all"
                >
                  BACK TO MAIN MENU
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Centered UI */}
      <div className="relative z-10 flex flex-col items-center gap-3 pointer-events-auto select-none">

        {/* Title */}
        <div className="flex flex-col items-center mb-1">
          <h1 className="text-white text-8xl font-black italic tracking-tighter drop-shadow-[0_0_60px_rgba(255,255,255,0.22)] select-none leading-none">
            VERDANT STRIKE
          </h1>
          <span className="text-white/25 text-xs font-black tracking-[0.55em] uppercase mt-2">
            Battle Royale
          </span>
        </div>

        {/* Menu panel */}
        <div className="bg-black/55 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-[0_32px_80px_rgba(0,0,0,0.6)] w-[440px] overflow-hidden">

          {menuState === 'main' && (
            <div className="p-3 flex flex-col gap-2">
              <div className="relative">
                <button
                  onClick={() => { setPassPage(0); setMenuState('pass'); }}
                  className="w-full px-8 py-4 bg-gradient-to-r from-green-600 to-green-500 text-white font-black text-xl rounded-2xl hover:from-green-500 hover:to-green-400 hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 shadow-[0_0_30px_rgba(34,197,94,0.4)] animate-pulse"
                >
                  VERDANT PASS
                </button>
                <div className="absolute -right-36 top-1/2 -translate-y-1/2">
                  <div className="relative">
                    <div className="bg-white text-black text-xs font-bold px-3 py-2 rounded-2xl rounded-tl-none shadow-lg whitespace-nowrap">
                      Season 1 Pass Coming Soon!
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setMenuState('create')}
                className="w-full px-8 py-4 bg-white text-black font-black text-lg rounded-2xl hover:bg-green-400 hover:text-white hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 shadow-lg"
              >
                CREATE GAME
              </button>
              <button
                onClick={() => setMenuState('join')}
                className="w-full px-8 py-4 bg-white/8 text-white font-black text-lg rounded-2xl border border-white/12 hover:bg-white hover:text-black hover:scale-[1.02] active:scale-[0.98] transition-all duration-150"
              >
                JOIN GAME
              </button>
              <button
                onClick={() => setMenuState('tutorial')}
                className="w-full px-8 py-4 bg-white/4 text-white/60 font-black text-lg rounded-2xl border border-white/8 hover:bg-white/10 hover:text-white hover:scale-[1.02] active:scale-[0.98] transition-all duration-150"
              >
                TUTORIAL
              </button>
              <button
                onClick={() => setMenuState('customize')}
                className="w-full px-8 py-4 bg-white/4 text-white/60 font-black text-lg rounded-2xl border border-white/8 hover:bg-white/10 hover:text-white hover:scale-[1.02] active:scale-[0.98] transition-all duration-150"
              >
                CUSTOMIZE
              </button>
            </div>
          )}

          {menuState === 'create' && (
            <div className="p-7 flex flex-col gap-5 animate-in slide-in-from-bottom duration-300">
              <div>
                <span className="text-white/40 text-[10px] font-black tracking-[0.4em] uppercase">Your Lobby Code</span>
                <div className="text-white text-6xl font-black tracking-widest mt-1 font-mono drop-shadow-[0_0_20px_rgba(255,255,255,0.15)]">
                  {lobbyCode}
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white/6 rounded-xl px-4 py-3 border border-white/8">
                <div className={`w-2.5 h-2.5 ${playerCount >= 2 ? 'bg-green-400' : 'bg-yellow-400'} rounded-full animate-pulse flex-shrink-0`}></div>
                <span className="text-white/70 font-bold text-sm">{playerCount} / 10 Players</span>
                <span className="text-white/30 text-xs ml-auto">{status}</span>
              </div>
              {playerCount >= 2 ? (
                <button
                  onClick={startGame}
                  className="w-full px-8 py-4 bg-green-500 text-white font-black text-xl rounded-2xl hover:scale-[1.03] hover:bg-green-400 active:scale-[0.97] transition-all shadow-[0_0_30px_rgba(34,197,94,0.35)]"
                >
                  START GAME ({playerCount} Players)
                </button>
              ) : (
                <div className="bg-white/5 px-6 py-4 rounded-2xl text-white/35 font-black italic text-center text-sm border border-white/8">
                  WAITING FOR PLAYERS... (min 2)
                </div>
              )}
              <button
                onClick={() => setMenuState('main')}
                className="text-white/35 font-bold hover:text-white/80 transition-colors text-sm tracking-[0.3em] uppercase text-center"
              >
                ← Leave Lobby
              </button>
            </div>
          )}

          {menuState === 'join' && (
            <div className="p-7 flex flex-col gap-5 animate-in slide-in-from-bottom duration-300">
              <div>
                <span className="text-white/40 text-[10px] font-black tracking-[0.4em] uppercase">Enter Lobby Code</span>
                <input
                  type="text"
                  maxLength={4}
                  value={enteredCode}
                  onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
                  placeholder="----"
                  className="block bg-transparent text-white text-6xl font-black tracking-widest mt-1 font-mono outline-none border-b-4 border-white/20 focus:border-green-400 transition-colors w-full placeholder-white/15"
                />
                {status && (
                  <div className="text-red-400 text-xs mt-2 uppercase font-bold tracking-wider">{status}</div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => enteredCode.length === 4 && initJoin(enteredCode)}
                  disabled={enteredCode.length < 4}
                  className="flex-1 px-8 py-4 bg-white text-black font-black text-lg rounded-2xl hover:bg-green-400 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                >
                  JOIN
                </button>
                <button
                  onClick={() => { setStatus(''); setMenuState('main'); }}
                  className="px-8 py-4 bg-white/8 text-white font-black text-lg rounded-2xl border border-white/12 hover:bg-white hover:text-black transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  BACK
                </button>
              </div>
            </div>
          )}

          {menuState === 'waiting' && (
            <div className="p-7 flex flex-col gap-5 animate-in slide-in-from-bottom duration-300">
              <div>
                <span className="text-white/40 text-[10px] font-black tracking-[0.4em] uppercase">Connected to Lobby</span>
                <div className="text-white text-6xl font-black tracking-widest mt-1 font-mono">{enteredCode}</div>
              </div>
              <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                <div className="w-4 h-4 border-2 border-green-400/50 border-t-green-400 rounded-full animate-spin flex-shrink-0"></div>
                <span className="text-green-400 font-black text-sm tracking-wider">WAITING FOR HOST TO START...</span>
              </div>
              <button
                onClick={() => { cleanupPeer(); setMenuState('main'); setPlayerCount(1); setStatus(''); }}
                className="text-white/35 font-bold hover:text-white/80 transition-colors text-sm tracking-[0.3em] uppercase text-center"
              >
                ← Leave Lobby
              </button>
            </div>
          )}
        </div>

        {/* Version + user info */}
        <div className="flex items-center gap-4 mt-1">
          <span className="text-white/12 text-[10px] font-bold tracking-widest uppercase">v0.1 alpha</span>
          <span className="text-white/25 text-[10px]">|</span>
          <span className="text-white/35 text-[10px] font-bold tracking-widest uppercase">{username}</span>
          <button
            onClick={onLogout}
            className="text-white/20 text-[10px] font-bold tracking-widest uppercase hover:text-white/60 transition-colors"
          >
            LOGOUT
          </button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
