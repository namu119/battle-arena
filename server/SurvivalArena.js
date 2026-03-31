const { BattleEngine, TICK_INTERVAL } = require('./BattleEngine');
const { MonsterWaveManager, ZONE_BOUNDS } = require('./MonsterWaveManager');
const { DropSystem } = require('./DropSystem');

const ARENA_WIDTH = 1600;
const ARENA_HEIGHT = 400;
const MAX_SURVIVAL_TICKS = 1500; // 5분
const monstersData = require('../data/monsters.json');

// Zone merge schedule
const ZONE_MERGES = [
  { tick: 300, merges: [[1, 0], [3, 2]] },  // Phase 2: 4->2 zones
  { tick: 600, merges: [[2, 0]] },           // Phase 3: 2->1 zone
];

class SurvivalArena {
  constructor(builds) {
    // Init BEFORE _assignZones and engine
    this.respawnLives = new Map();
    this.respawnQueue = [];
    this.walls = (require('../data/drops.json').walls || []).map(w => ({ ...w, active: true }));

    this.engine = new BattleEngine(this._assignZones(builds), {
      maxTicks: MAX_SURVIVAL_TICKS,
      finishCondition: 'external',
    });
    // Set wall barriers on engine for movement blocking
    this.engine.wallBarriers = this.walls.map(w => ({ x: w.x, active: true }));
    // Assign wall sides to each player character
    for (const char of this.engine.characters) {
      char._wallSide = this.walls.map(w => char.x < w.x ? 'left' : 'right');
    }
    this.waveManager = new MonsterWaveManager();
    this.dropSystem = new DropSystem();
    this.tick = 0;
    this.phase = 1;
    this.activeZones = new Set([0, 1, 2, 3]);
    this.finished = false;
    this.results = null;
    this.log = [];
    this.metaEvents = []; // zone merges, wave spawns, drops
    this.bossSpawned = false;
    this.bossKiller = null;
    this._charWallSides = new Map();
  }

  _assignZones(builds) {
    // Wider map (1600px): players at 4 corners, walls at 550/1050
    const zonePositions = [
      { x: 80, zoneId: 0 },     // zone 0: far left
      { x: 450, zoneId: 1 },    // zone 1: left-center (near wall 1)
      { x: 1150, zoneId: 2 },   // zone 2: right-center (near wall 2)
      { x: 1520, zoneId: 3 },   // zone 3: far right
    ];

    return builds.map((build, i) => {
      this.respawnLives.set(`p${i}`, 3); // 3회 부활
      return {
        ...build,
        x: zonePositions[i].x,
        y: ARENA_HEIGHT / 2,
        zoneId: zonePositions[i].zoneId,
        team: i,
        spawnX: zonePositions[i].x, // 리스폰 위치 기억
        livesRemaining: 3,
      };
    });
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

    // 1. Spawn monster waves (pass expanded bounds resolver)
    const spawns = this.waveManager.getSpawns(this.tick, [...this.activeZones], (zoneId) => this._getExpandedBounds(zoneId));
    for (const monster of spawns) {
      this.engine.addCharacter(monster);
    }
    if (spawns.length > 0) {
      this.metaEvents.push({ type: 'waveSpawn', tick: this.tick, count: spawns.length });
    }

    // 2. Advance battle engine
    this.engine.processTick();

    // 3. Process drops + respawn queue
    this._processDrops();
    this._processRespawns();

    // 4. Gold auto-enhance check (with cooldown: 50 ticks = 10s)
    for (const char of this.engine.characters) {
      if (char.alive && !char.isMonster) {
        char._currentTick = this.tick;
        if (this.dropSystem.canAutoEnhance(char)) {
          const goldDrop = this.dropSystem.processGoldAutoEnhance(char);
          if (goldDrop) {
            char._lastAutoEnhanceTick = this.tick;
            this.metaEvents.push({ type: 'drop', dropType: goldDrop.type, slot: goldDrop.slot, level: goldDrop.level, statBonus: goldDrop.statBonus, gold: goldDrop.gold, playerId: goldDrop.playerId });
          }
        }
      }
    }

    // 5. Enforce walls + check gatekeeper deaths
    this._enforceWalls();

    // 6. Check zone merges + boss spawn
    this._checkZoneMerges();
    this._checkBossSpawn();

    // 6. Check end conditions
    // A) Boss killed → last-hitter wins
    if (this.bossKiller) {
      this._finishByBossKill();
      return;
    }
    // B) Only 1 player alive AND no pending respawns
    const alivePlayers = this.engine.characters.filter(c => c.alive && !c.isMonster);
    const pendingRespawns = this.respawnQueue.length;
    const playersWithLives = this.engine.characters.filter(
      c => !c.isMonster && (c.alive || (this.respawnLives.get(c.id) || 0) > 0 || this.respawnQueue.some(r => r.charId === c.id))
    );
    if (playersWithLives.length <= 1 && pendingRespawns === 0) {
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
        if (deadChar && killer) {
          if (deadChar.isBoss) {
            // Boss killed! Last-hitter wins
            this.bossKiller = killer.id;
            this.metaEvents.push({ type: 'bossKill', killerId: killer.id, killerName: killer.name, bossName: deadChar.name });
            // Boss also drops loot
            const drop = this.dropSystem.processMonsterDeath(deadChar, killer);
            if (drop) {
              this.metaEvents.push({ type: 'drop', dropType: drop.type, slot: drop.slot, level: drop.level, statBonus: drop.statBonus, gold: drop.gold, playerId: drop.playerId });
            }
          } else if (deadChar.isMonster) {
            // Monster kill → equipment drop
            const drop = this.dropSystem.processMonsterDeath(deadChar, killer);
            if (drop) {
              this.metaEvents.push({ type: 'drop', dropType: drop.type, slot: drop.slot, level: drop.level, statBonus: drop.statBonus, gold: drop.gold, playerId: drop.playerId });
            }
          } else if (!deadChar.isMonster && !killer.isMonster) {
            // Player kill → gold + steal
            const drop = this.dropSystem.processPlayerKill(deadChar, killer);
            if (drop) {
              this.metaEvents.push({ type: 'drop', dropType: 'playerKill', gold: drop.gold, stolenSlot: drop.stolenSlot, playerId: drop.playerId, victimName: drop.victimName });
            }
          }
        }
      }
    }
  }

  _checkZoneMerges() {
    for (const merge of ZONE_MERGES) {
      if (this.tick === merge.tick) {
        // Phase 1: delete all merging zones first
        for (const [from] of merge.merges) {
          this.activeZones.delete(from);
        }

        // Update phase after all deletes
        if (this.activeZones.size <= 2) this.phase = 2;
        if (this.activeZones.size <= 1) this.phase = 3;

        // Phase 2: reassign zoneIds and reposition - spread evenly for PvP engagement
        for (const [from, to] of merge.merges) {
          const toBounds = this._getExpandedBounds(to);
          const charsToMove = this.engine.characters.filter(c => c.zoneId === from && c.alive);
          const existingChars = this.engine.characters.filter(c => c.zoneId === to && c.alive && !c.isMonster);

          for (const char of this.engine.characters) {
            if (char.zoneId === from) {
              char.zoneId = to;
            }
          }

          // Spread ALL alive non-monster chars in merged zone evenly
          const allPlayers = this.engine.characters.filter(c => c.zoneId === to && c.alive && !c.isMonster);
          const spacing = (toBounds.maxX - toBounds.minX) / (allPlayers.length + 1);
          allPlayers.forEach((p, i) => {
            p.x = toBounds.minX + spacing * (i + 1);
          });

          // Spread monsters randomly in merged zone
          const monsters = this.engine.characters.filter(c => c.zoneId === to && c.alive && c.isMonster);
          for (const m of monsters) {
            m.x = toBounds.minX + Math.random() * (toBounds.maxX - toBounds.minX);
          }
        }

        this.metaEvents.push({
          type: 'zoneMerge',
          tick: this.tick,
          activeZones: [...this.activeZones],
          phase: this.phase,
        });
      }
    }
  }

  _getExpandedBounds(zoneId) {
    // After merges, zones expand to cover merged area (1600px map)
    if (this.activeZones.size <= 1) {
      return { minX: 0, maxX: ARENA_WIDTH };
    }
    if (this.activeZones.size <= 2) {
      if (zoneId === 0) return { minX: 0, maxX: 800 };
      if (zoneId === 2) return { minX: 800, maxX: 1600 };
    }
    return ZONE_BOUNDS[zoneId] || { minX: 0, maxX: ARENA_WIDTH };
  }

  _processRespawns() {
    // Queue player deaths for respawn
    const events = this.engine.tickEvents || [];
    for (const evt of events) {
      if (evt.type === 'death') {
        const deadChar = this.engine.characters.find(c => c.id === evt.target);
        if (deadChar && !deadChar.isMonster) {
          const lives = this.respawnLives.get(deadChar.id) || 0;
          if (lives > 0) {
            this.respawnLives.set(deadChar.id, lives - 1);
            this.respawnQueue.push({
              charId: deadChar.id,
              respawnAtTick: this.tick + 25, // 5초 후 부활
              spawnX: deadChar.spawnX || deadChar.x,
            });
            deadChar.livesRemaining = lives - 1;
            this.metaEvents.push({
              type: 'respawnQueued',
              playerId: deadChar.id,
              playerName: deadChar.name,
              livesRemaining: lives - 1,
              respawnIn: 5,
            });
          }
        }
      }
    }

    // Process respawn queue
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const rsp = this.respawnQueue[i];
      if (this.tick >= rsp.respawnAtTick) {
        const char = this.engine.characters.find(c => c.id === rsp.charId);
        if (char) {
          // Revive with 50% HP
          char.alive = true;
          char.hp = Math.floor(char.stats.maxHP * 0.5);
          char.x = rsp.spawnX;
          char.y = ARENA_HEIGHT / 2;
          char.buffs = [];
          char.killedBy = null;
          // Reset skill cooldowns
          for (const s of char.skills) s.currentCooldown = 0;
          this.metaEvents.push({
            type: 'respawn',
            playerId: char.id,
            playerName: char.name,
            livesRemaining: char.livesRemaining,
          });
        }
        this.respawnQueue.splice(i, 1);
      }
    }
  }

  _enforceWalls() {
    // Check if gatekeepers at each wall are dead → deactivate wall
    for (let wi = 0; wi < this.walls.length; wi++) {
      const wall = this.walls[wi];
      if (!wall.active) continue;
      // Gatekeeper must be within 200px of wall (they wander)
      const gkAlive = this.engine.characters.some(
        c => c.isGatekeeper && c.alive && Math.abs(c.x - wall.x) < 200
      );
      if (!gkAlive) {
        wall.active = false;
        // Sync to engine barriers
        if (this.engine.wallBarriers[wi]) this.engine.wallBarriers[wi].active = false;
        this.metaEvents.push({ type: 'wallBreak', wallX: wall.x, label: wall.label, stage: wall.stage });
      }
    }

    // Assign wall sides to any new characters (monsters spawned mid-game)
    for (const char of this.engine.characters) {
      if (!char._wallSide) {
        char._wallSide = this.walls.map(w => char.x < w.x ? 'left' : 'right');
      }
    }

    // Update chaos levels on characters (playerKills → chaos)
    for (const char of this.engine.characters) {
      if (char.isMonster) continue;
      const kills = this.engine.characters.filter(c => !c.isMonster && !c.alive && c.killedBy === char.id).length;
      char.chaos = kills * 30;
    }
  }

  _checkBossSpawn() {
    if (this.bossSpawned) return;
    // Spawn boss when: all walls broken OR tick >= 600
    const allWallsBroken = this.walls.every(w => !w.active);
    if (allWallsBroken || this.tick >= 600) {
      this.bossSpawned = true;
      const bossTemplate = monstersData.boss_ancient_dragon;
      if (!bossTemplate) return;
      const boss = {
        id: 'boss_0',
        name: '🐉 ' + bossTemplate.name,
        team: -1,
        className: '최종보스',
        passive: null,
        stats: { maxHP: bossTemplate.hp, ATK: bossTemplate.atk, DEF: bossTemplate.def, INT: 0, SPD: bossTemplate.spd },
        hp: bossTemplate.hp,
        range: bossTemplate.range,
        btWeights: { ...bossTemplate.btWeights },
        skills: bossTemplate.skills.map(s => ({ ...s })),
        x: ARENA_WIDTH / 2,
        y: ARENA_HEIGHT / 2,
        zoneId: null,
        buffs: [],
        alive: true,
        isMonster: true,
        isBoss: true,
        level: bossTemplate.level,
      };
      this.engine.addCharacter(boss);
      this.metaEvents.push({ type: 'bossSpawn', name: bossTemplate.name, hp: bossTemplate.hp });
    }
  }

  _finishByBossKill() {
    this.finished = true;
    const players = this.engine.characters.filter(c => !c.isMonster);
    const killer = players.find(c => c.id === this.bossKiller);

    // Boss killer gets rank 1, rest ranked by alive > HP ratio
    const others = players.filter(c => c.id !== this.bossKiller);
    const sorted = [...others].sort((a, b) => {
      if (a.alive !== b.alive) return b.alive - a.alive;
      return (b.hp / b.stats.maxHP) - (a.hp / a.stats.maxHP);
    });

    const ranking = killer ? [killer, ...sorted] : sorted;
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
      livesRemaining: this.respawnLives.get(c.id) || 0,
      bossKiller: c.id === this.bossKiller,
    }));
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
      livesRemaining: this.respawnLives.get(c.id) || 0,
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
      livesRemaining: this.respawnLives.get(c.id) || 0,
    }));
  }
}

module.exports = { SurvivalArena, TICK_INTERVAL };
