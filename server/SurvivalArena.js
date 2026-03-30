const { BattleEngine, TICK_INTERVAL } = require('./BattleEngine');
const { MonsterWaveManager, ZONE_BOUNDS } = require('./MonsterWaveManager');
const { DropSystem } = require('./DropSystem');

const ARENA_WIDTH = 800;
const ARENA_HEIGHT = 400;
const MAX_SURVIVAL_TICKS = 1500; // 5분

// Zone merge schedule
const ZONE_MERGES = [
  { tick: 300, merges: [[1, 0], [3, 2]] },  // Phase 2: 4->2 zones
  { tick: 600, merges: [[2, 0]] },           // Phase 3: 2->1 zone
];

class SurvivalArena {
  constructor(builds) {
    this.engine = new BattleEngine(this._assignZones(builds), {
      maxTicks: MAX_SURVIVAL_TICKS,
      finishCondition: 'external',
    });
    this.waveManager = new MonsterWaveManager();
    this.dropSystem = new DropSystem();
    this.tick = 0;
    this.phase = 1;
    this.activeZones = new Set([0, 1, 2, 3]);
    this.finished = false;
    this.results = null;
    this.log = [];
    this.metaEvents = []; // zone merges, wave spawns, drops
  }

  _assignZones(builds) {
    // Zone starting positions: center of each zone quadrant
    const zonePositions = [
      { x: 100, zoneId: 0 },  // zone 0: x 0-200
      { x: 300, zoneId: 1 },  // zone 1: x 200-400
      { x: 500, zoneId: 2 },  // zone 2: x 400-600
      { x: 700, zoneId: 3 },  // zone 3: x 600-800
    ];

    return builds.map((build, i) => ({
      ...build,
      x: zonePositions[i].x,
      y: ARENA_HEIGHT / 2,
      zoneId: zonePositions[i].zoneId,
      team: i, // each player is their own team (FFA)
    }));
  }

  run() {
    while (!this.finished && this.tick < MAX_SURVIVAL_TICKS) {
      this.processTick();
    }

    if (!this.finished) {
      this._finishByHP();
    }

    return { log: this.log, results: this.results };
  }

  processTick() {
    this.tick++;
    this.metaEvents = [];

    // 1. Spawn monster waves
    const spawns = this.waveManager.getSpawns(this.tick, [...this.activeZones]);
    for (const monster of spawns) {
      this.engine.addCharacter(monster);
    }
    if (spawns.length > 0) {
      this.metaEvents.push({ type: 'waveSpawn', tick: this.tick, count: spawns.length });
    }

    // 2. Advance battle engine
    this.engine.processTick();

    // 3. Process drops from monster deaths
    const dropEvents = this._processDrops();

    // 4. Gold auto-enhance check
    for (const char of this.engine.characters) {
      if (char.alive && !char.isMonster) {
        const goldDrop = this.dropSystem.processGoldAutoEnhance(char);
        if (goldDrop) {
          this.metaEvents.push({ type: 'drop', ...goldDrop });
        }
      }
    }

    // 5. Check zone merges
    this._checkZoneMerges();

    // 6. Check end condition: only 1 player alive (ignore monsters)
    const alivePlayers = this.engine.characters.filter(c => c.alive && !c.isMonster);
    if (alivePlayers.length <= 1) {
      this._finishBattle();
    }

    // 7. Build tick log
    this.log.push({
      tick: this.tick,
      phase: this.phase,
      activeZones: [...this.activeZones],
      state: this.engine.characters.map(c => ({
        id: c.id,
        name: c.name,
        className: c.className,
        hp: c.hp,
        maxHP: c.stats.maxHP,
        x: Math.round(c.x),
        y: Math.round(c.y),
        alive: c.alive,
        zoneId: c.zoneId,
        isMonster: !!c.isMonster,
        level: c.level || 0,
        gold: c.gold || 0,
        enhancementLevels: c.enhancementLevels || null,
      })),
      events: [...(this.engine.tickEvents || []), ...this.metaEvents],
    });
  }

  _processDrops() {
    const events = this.engine.tickEvents || [];
    for (const evt of events) {
      if (evt.type === 'death' && evt.killedBy) {
        const deadChar = this.engine.characters.find(c => c.id === evt.target);
        const killer = this.engine.characters.find(c => c.id === evt.killedBy);
        if (deadChar && deadChar.isMonster && killer) {
          const drop = this.dropSystem.processMonsterDeath(deadChar, killer);
          if (drop) {
            this.metaEvents.push({ type: 'drop', dropType: drop.type, slot: drop.slot, level: drop.level, statBonus: drop.statBonus, gold: drop.gold, playerId: drop.playerId });
          }
        }
      }
    }
  }

  _checkZoneMerges() {
    for (const merge of ZONE_MERGES) {
      if (this.tick === merge.tick) {
        for (const [from, to] of merge.merges) {
          if (this.activeZones.has(from)) {
            this._mergeZone(from, to);
          }
        }
        // Update phase
        if (this.activeZones.size <= 2) this.phase = 2;
        if (this.activeZones.size <= 1) this.phase = 3;

        this.metaEvents.push({
          type: 'zoneMerge',
          tick: this.tick,
          activeZones: [...this.activeZones],
          phase: this.phase,
        });
      }
    }
  }

  _mergeZone(fromZone, toZone) {
    this.activeZones.delete(fromZone);
    const toBounds = this._getExpandedBounds(toZone);

    // Update all characters in the merging zone
    for (const char of this.engine.characters) {
      if (char.zoneId === fromZone) {
        char.zoneId = toZone;
        // Reposition within new zone bounds
        char.x = toBounds.minX + Math.random() * (toBounds.maxX - toBounds.minX);
      }
    }
  }

  _getExpandedBounds(zoneId) {
    // After merges, zones expand to cover merged area
    if (this.activeZones.size <= 1) {
      return { minX: 0, maxX: ARENA_WIDTH };
    }
    if (this.activeZones.size <= 2) {
      // zone 0 covers [0,400], zone 2 covers [400,800]
      if (zoneId === 0) return { minX: 0, maxX: 400 };
      if (zoneId === 2) return { minX: 400, maxX: 800 };
    }
    return ZONE_BOUNDS[zoneId] || { minX: 0, maxX: ARENA_WIDTH };
  }

  _finishBattle() {
    this.finished = true;
    const players = this.engine.characters.filter(c => !c.isMonster);
    const dead = players.filter(c => !c.alive).sort((a, b) => b.deathTick - a.deathTick);
    const alive = players.filter(c => c.alive);
    const ranking = [...alive, ...dead];

    this.results = ranking.map((c, i) => ({
      rank: i + 1,
      id: c.id,
      name: c.name,
      className: c.className,
      alive: c.alive,
      hpRemaining: c.hp,
      gold: c.gold || 0,
      enhancementLevels: c.enhancementLevels || {},
      monstersKilled: this.engine.characters.filter(m => m.isMonster && !m.alive && m.killedBy === c.id).length,
    }));
  }

  _finishByHP() {
    this.finished = true;
    const players = this.engine.characters.filter(c => !c.isMonster);
    const sorted = [...players].sort((a, b) => {
      if (a.alive !== b.alive) return b.alive - a.alive;
      return (b.hp / b.stats.maxHP) - (a.hp / a.stats.maxHP);
    });

    this.results = sorted.map((c, i) => ({
      rank: i + 1,
      id: c.id,
      name: c.name,
      className: c.className,
      alive: c.alive,
      hpRemaining: c.hp,
      gold: c.gold || 0,
      enhancementLevels: c.enhancementLevels || {},
      monstersKilled: this.engine.characters.filter(m => m.isMonster && !m.alive && m.killedBy === c.id).length,
    }));
  }
}

module.exports = { SurvivalArena, TICK_INTERVAL };
