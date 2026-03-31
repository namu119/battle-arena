const monstersData = require('../data/monsters.json');
const dropsData = require('../data/drops.json');

const ARENA_WIDTH = 1600;

// Zone boundaries on wider map: 4 zones spread across 1600px
const ZONE_BOUNDS = {
  0: { minX: 0, maxX: 400 },
  1: { minX: 0, maxX: 400 },
  2: { minX: 1200, maxX: 1600 },
  3: { minX: 1200, maxX: 1600 },
};

// Wall positions
const WALLS = dropsData.walls || [];

// Monster pool by level
const MONSTER_POOL = {
  lv1: Object.values(monstersData).filter(m => m.level === 1),
  lv2: Object.values(monstersData).filter(m => m.level === 2),
  lv3: Object.values(monstersData).filter(m => m.level === 3),
  lv4: Object.values(monstersData).filter(m => m.level === 4),
  lv5: Object.values(monstersData).filter(m => m.level === 5),
};

class MonsterWaveManager {
  constructor() {
    this.monsterIdCounter = 0;
    this.scheduledWaves = this._buildSchedule();
    this.gatekeeperSchedule = this._buildGatekeeperSchedule();
    this.spawnedWaves = new Set();
  }

  _buildSchedule() {
    const schedule = [];
    const allWaves = [
      ...dropsData.waveSchedule.phase1,
      ...dropsData.waveSchedule.phase2,
      ...dropsData.waveSchedule.phase3,
    ];
    for (const wave of allWaves) {
      schedule.push({ wave: wave.wave, tick: wave.tick, monstersPerZone: wave.monstersPerZone });
    }
    return schedule;
  }

  _buildGatekeeperSchedule() {
    return (dropsData.waveSchedule.gatekeepers || []).map((g, i) => ({
      tick: g.tick,
      wallIndex: g.wallIndex,
      monsters: g.monsters,
      id: `gk_${i}`,
    }));
  }

  /** Check if any waves should spawn this tick, return monster charData[] */
  getSpawns(tick, activeZoneIds, boundsResolver) {
    const spawns = [];

    // Regular waves
    for (const wave of this.scheduledWaves) {
      if (wave.tick === tick && !this.spawnedWaves.has(wave.wave)) {
        this.spawnedWaves.add(wave.wave);
        for (const zoneId of activeZoneIds) {
          const bounds = boundsResolver ? boundsResolver(zoneId) : this._getZoneBounds(zoneId);
          const monsters = this._createWaveMonsters(wave, zoneId, bounds);
          spawns.push(...monsters);
        }
      }
    }

    // Gatekeeper spawns (at wall positions)
    for (const gk of this.gatekeeperSchedule) {
      if (gk.tick === tick && !this.spawnedWaves.has(gk.id)) {
        this.spawnedWaves.add(gk.id);
        const wall = WALLS[gk.wallIndex];
        if (!wall) continue;
        for (const group of gk.monsters) {
          const pool = MONSTER_POOL[group.type];
          if (!pool || pool.length === 0) continue;
          for (let i = 0; i < group.count; i++) {
            const template = pool[Math.floor(Math.random() * pool.length)];
            const id = `gk_${gk.wallIndex}_${this.monsterIdCounter++}`;
            // Spawn at wall X position (both sides)
            const side = i % 2 === 0 ? -30 : 30;
            spawns.push({
              id,
              name: `⚔${template.name}`,
              team: -1,
              className: `가디언Lv${template.level}`,
              passive: null,
              stats: { maxHP: template.hp, ATK: template.atk, DEF: template.def, INT: 0, SPD: template.spd },
              hp: template.hp,
              range: template.range,
              btWeights: { ...template.btWeights },
              skills: template.skills.map(s => ({ ...s })),
              x: wall.x + side,
              y: 200,
              zoneId: null,
              buffs: [],
              alive: true,
              isMonster: true,
              isGatekeeper: true,
              level: template.level,
            });
          }
        }
      }
    }

    return spawns;
  }

  _createWaveMonsters(wave, zoneId, bounds) {
    const monsters = [];
    if (!bounds) bounds = this._getZoneBounds(zoneId);

    for (const group of wave.monstersPerZone) {
      const pool = MONSTER_POOL[group.type];
      if (!pool || pool.length === 0) continue;

      for (let i = 0; i < group.count; i++) {
        const template = pool[Math.floor(Math.random() * pool.length)];
        const id = `m_${wave.wave}_${this.monsterIdCounter++}`;
        const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);

        monsters.push({
          id,
          name: template.name,
          team: -1,
          className: `몬스터Lv${template.level}`,
          passive: null,
          stats: {
            maxHP: template.hp,
            ATK: template.atk,
            DEF: template.def,
            INT: 0,
            SPD: template.spd,
          },
          hp: template.hp,
          range: template.range,
          btWeights: { ...template.btWeights },
          skills: template.skills.map(s => ({ ...s })),
          x: Math.round(x),
          y: 200,
          zoneId,
          buffs: [],
          alive: true,
          isMonster: true,
          level: template.level,
        });
      }
    }
    return monsters;
  }

  _getZoneBounds(zoneId) {
    // After merges, zones expand
    if (ZONE_BOUNDS[zoneId]) return ZONE_BOUNDS[zoneId];
    return { minX: 0, maxX: ARENA_WIDTH };
  }
}

module.exports = { MonsterWaveManager, ZONE_BOUNDS };
