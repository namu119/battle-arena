const monstersData = require('../data/monsters.json');
const dropsData = require('../data/drops.json');

const ARENA_WIDTH = 800;

// Zone boundaries: zone 0=[0,200], 1=[200,400], 2=[400,600], 3=[600,800]
const ZONE_BOUNDS = {
  0: { minX: 0, maxX: 200 },
  1: { minX: 200, maxX: 400 },
  2: { minX: 400, maxX: 600 },
  3: { minX: 600, maxX: 800 },
};

// Monster pool by level
const MONSTER_POOL = {
  lv1: Object.values(monstersData).filter(m => m.level === 1),
  lv2: Object.values(monstersData).filter(m => m.level === 2),
  lv3: Object.values(monstersData).filter(m => m.level === 3),
  lv4: Object.values(monstersData).filter(m => m.level === 4),
};

class MonsterWaveManager {
  constructor() {
    this.monsterIdCounter = 0;
    this.scheduledWaves = this._buildSchedule();
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

  /** Check if any waves should spawn this tick, return monster charData[] */
  getSpawns(tick, activeZoneIds, boundsResolver) {
    const spawns = [];
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
