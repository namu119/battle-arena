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
    // Clamp gatekeepers to their wall position (don't wander away)
    this._clampGatekeepers = true;
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
    this._lastMonsterCount = 0;
    this.pendingRewards = null;
  }

  _assignZones(builds) {
    // Wider map (1600px): players outside wall columns
    // Wall 1: col3 = x480-640 (center=560), Wall 2: col7 = x1120-1280 (center=1200)
    const zonePositions = [
      { x: 100, zoneId: 0 },    // zone 0: far left
      { x: 380, zoneId: 1 },    // zone 1: left (before wall 1 at 480)
      { x: 1380, zoneId: 2 },   // zone 2: right (after wall 2 at 1280)
      { x: 1500, zoneId: 3 },   // zone 3: far right
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

  /** 전체 실행 (테스트용, AI 전용) */
  run() {
    while (!this.finished && this.tick < MAX_SURVIVAL_TICKS) {
      this.processTick();
      // 보상 시점이면 AI 자동선택
      if (this.pendingRewards) {
        this._autoSelectAllRewards();
      }
    }
    if (!this.finished) this._finishByHP();
    return { log: this.log, results: this.results };
  }

  /** 특정 틱까지 실행 (인터랙티브 모드) */
  runUntilTick(targetTick) {
    const startLog = this.log.length;
    while (!this.finished && this.tick < targetTick && this.tick < MAX_SURVIVAL_TICKS) {
      this.processTick();
      // 보상 시점 체크: 웨이브 클리어 직후
      if (this._checkRewardPoint()) {
        break; // 보상 선택 대기
      }
    }
    if (!this.finished && this.tick >= MAX_SURVIVAL_TICKS) this._finishByHP();
    return { newLog: this.log.slice(startLog), finished: this.finished, results: this.results };
  }

  /** 보상 시점 체크: 웨이브 몬스터 전멸 시 */
  _checkRewardPoint() {
    // 웨이브 스폰된 후 해당 웨이브 몬스터가 전멸하면 보상
    const aliveMonsters = this.engine.characters.filter(c => c.isMonster && c.alive && !c.isBoss && !c.isGatekeeper);
    const waveJustCleared = this._lastMonsterCount > 0 && aliveMonsters.length === 0;
    this._lastMonsterCount = aliveMonsters.length;

    if (waveJustCleared && !this.pendingRewards) {
      this.pendingRewards = this._generateRewards();
      this.metaEvents.push({ type: 'rewardChoice', rewards: this.pendingRewards });
      return true;
    }
    return false;
  }

  /** 보상 3개 생성 (스탯 + 스킬모듈 혼합) */
  _generateRewards() {
    // 스탯 보상 풀
    const statCards = [
      { id: 'atk1', icon: '🗡️', name: 'ATK +4', effect: { ATK: 4 } },
      { id: 'atk2', icon: '⚔️', name: 'ATK +2, SPD +2', effect: { ATK: 2, SPD: 2 } },
      { id: 'crit', icon: '💥', name: '크리티컬 +10%', effect: { critBonus: 0.1 } },
      { id: 'def1', icon: '🛡️', name: 'DEF +4', effect: { DEF: 4 } },
      { id: 'hp1', icon: '❤️', name: 'HP +80', effect: { maxHP: 80 } },
      { id: 'def2', icon: '🏰', name: 'DEF +2, HP +40', effect: { DEF: 2, maxHP: 40 } },
      { id: 'spd1', icon: '⚡', name: 'SPD +3', effect: { SPD: 3 } },
      { id: 'int1', icon: '🔮', name: 'INT +4', effect: { INT: 4 } },
      { id: 'heal', icon: '💚', name: 'HP 50% 회복', effect: { healPercent: 0.5 } },
      { id: 'gold', icon: '💰', name: '+150G', effect: { gold: 150 } },
      { id: 'cool', icon: '🔄', name: '쿨다운 초기화', effect: { resetCooldowns: true } },
      { id: 'shield', icon: '🔷', name: '실드 +50', effect: { shield: 50 } },
    ];

    // 스킬 모듈 강화 카드 풀
    const skillModCards = [
      // 존(zone) 강화
      { id: 'zone_dmg', icon: '🔥', name: '장판 데미지 +3', effect: { skillMod: { target: 'zone', field: 'zone.tickDamage', add: 3 } } },
      { id: 'zone_dur', icon: '⏳', name: '장판 지속 +3틱', effect: { skillMod: { target: 'zone', field: 'zone.duration', add: 3 } } },
      { id: 'zone_rad', icon: '🔴', name: '장판 범위 +30', effect: { skillMod: { target: 'zone', field: 'zone.radius', add: 30 } } },
      { id: 'zone_slow', icon: '🧊', name: '장판 슬로우 +15%', effect: { skillMod: { target: 'zone', field: 'zone.slow', add: 0.15 } } },
      // DOT 강화
      { id: 'dot_dmg', icon: '🩸', name: 'DOT 데미지 +2', effect: { skillMod: { target: 'dot', field: 'dot.tickDamage', add: 2 } } },
      { id: 'dot_dur', icon: '☠️', name: 'DOT 지속 +2틱', effect: { skillMod: { target: 'dot', field: 'dot.duration', add: 2 } } },
      // 공격스킬 강화
      { id: 'sk_dmg', icon: '💢', name: '스킬 데미지 +8', effect: { skillMod: { target: 'attack', field: 'damage', add: 8 } } },
      { id: 'sk_kb', icon: '🔨', name: '넉백 +25', effect: { skillMod: { target: 'attack', field: 'knockback', add: 25 } } },
      { id: 'sk_stun', icon: '💫', name: '기절 +1틱', effect: { skillMod: { target: 'attack', field: 'stun', add: 1 } } },
      { id: 'sk_hits', icon: '🌀', name: '타격 횟수 +1', effect: { skillMod: { target: 'attack', field: 'hits', add: 1 } } },
      // 방어스킬 강화
      { id: 'sk_shield', icon: '🛡️', name: '쉴드량 +15', effect: { skillMod: { target: 'defense', field: 'shield', add: 15 } } },
      { id: 'sk_thorns', icon: '🌵', name: '가시 반사 +3', effect: { skillMod: { target: 'defense', field: 'thorns', add: 3 } } },
      // 쿨다운 감소
      { id: 'sk_cool', icon: '⏬', name: '스킬 쿨다운 -1', effect: { skillMod: { target: 'all', field: 'cooldown', add: -1, min: 2 } } },
      // 이동스킬 강화
      { id: 'sk_dash', icon: '💨', name: '대시 거리 +30', effect: { skillMod: { target: 'movement', field: 'dashDistance', add: 30 } } },
      { id: 'sk_tp', icon: '👻', name: '도약 거리 +40', effect: { skillMod: { target: 'movement', field: 'teleportDistance', add: 40 } } },
    ];

    // 항상 1개 스탯 + 1개 스킬모듈 + 1개 랜덤
    const all = [...statCards, ...skillModCards];
    const pick = (pool) => pool.splice(Math.floor(Math.random() * pool.length), 1)[0];

    const statPool = [...statCards];
    const skillPool = [...skillModCards];
    const result = [];

    result.push(pick(statPool));
    result.push(pick(skillPool));
    // 3번째는 전체에서 (이미 뽑힌 것 제외)
    const remaining = all.filter(c => !result.find(r => r.id === c.id));
    result.push(remaining[Math.floor(Math.random() * remaining.length)]);

    return result;
  }

  /** 보상 리롤 (최대 2회) */
  rerollRewards() {
    if (!this.pendingRewards) return null;
    if ((this._rerollCount || 0) >= 2) return null;
    this._rerollCount = (this._rerollCount || 0) + 1;
    this.pendingRewards = this._generateRewards();
    return this.pendingRewards;
  }

  /** 보상 적용 (플레이어 ID + 선택 인덱스) */
  applyReward(playerId, rewardIndex) {
    if (!this.pendingRewards) return;
    const reward = this.pendingRewards[rewardIndex] || this.pendingRewards[0];
    const char = this.engine.characters.find(c => c.id === playerId);
    if (!char || char.isMonster) return;
    this._applyEffect(char, reward.effect);
    this.metaEvents.push({ type: 'rewardApplied', playerId, playerName: char.name, reward: reward.name, icon: reward.icon });
  }

  /** AI 전체 자동선택 */
  _autoSelectAllRewards() {
    if (!this.pendingRewards) return;
    for (const char of this.engine.characters) {
      if (char.isMonster || !char.alive) continue;
      // AI: 자기 빌드에 맞는 보상 선택
      const bestIdx = this._aiBestReward(char);
      this._applyEffect(char, this.pendingRewards[bestIdx].effect);
    }
    this.pendingRewards = null;
  }

  /** 보상 선택 완료 (인터랙티브 모드) */
  clearRewards() {
    this.pendingRewards = null;
    this._lastMonsterCount = this.engine.characters.filter(c => c.isMonster && c.alive && !c.isBoss && !c.isGatekeeper).length;
  }

  /** AI 최적 보상 선택 */
  _aiBestReward(char) {
    if (!this.pendingRewards) return 0;
    const atk = char.stats?.ATK || 0;
    const def = char.stats?.DEF || 0;
    const hpRatio = char.hp / (char.stats?.maxHP || 1);

    let bestIdx = 0;
    let bestScore = -1;

    for (let i = 0; i < this.pendingRewards.length; i++) {
      const r = this.pendingRewards[i];
      const e = r.effect;
      let score = Math.random() * 5; // 약간의 랜덤성

      // 스탯 카드 평가
      if (e.ATK) score += atk > def ? 15 : 8;
      if (e.DEF) score += def > atk ? 15 : 8;
      if (e.maxHP) score += hpRatio < 0.5 ? 20 : 10;
      if (e.healPercent) score += (1 - hpRatio) * 25;
      if (e.SPD) score += 10;
      if (e.critBonus) score += atk > def ? 12 : 5;
      if (e.shield) score += hpRatio < 0.6 ? 15 : 5;

      // 스킬모듈 카드 평가: 자기 스킬에 해당하는 강화면 가산
      if (e.skillMod) {
        const mod = e.skillMod;
        const hasMatch = char.skills.some(s => {
          if (mod.target === 'all') return true;
          if (mod.target === s.type) return true;
          if (mod.target === 'dot' && s.dot) return true;
          if (mod.target === 'zone' && s.zone) return true;
          return false;
        });
        score += hasMatch ? 14 : 2;
        // 공격형은 공격스킬 강화 선호
        if (mod.target === 'attack' && atk > def) score += 5;
        if (mod.target === 'defense' && def > atk) score += 5;
      }

      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    return bestIdx;
  }

  /** 효과 적용 */
  _applyEffect(char, effect) {
    if (effect.ATK) { char.stats.ATK += effect.ATK; char.baseStats.ATK += effect.ATK; }
    if (effect.DEF) { char.stats.DEF += effect.DEF; char.baseStats.DEF += effect.DEF; }
    if (effect.INT) { char.stats.INT += effect.INT; char.baseStats.INT += effect.INT; }
    if (effect.SPD) { char.stats.SPD += effect.SPD; char.baseStats.SPD += effect.SPD; }
    if (effect.maxHP) {
      char.stats.maxHP += effect.maxHP;
      char.baseStats.maxHP += effect.maxHP;
      char.hp += effect.maxHP;
    }
    if (effect.healPercent) {
      char.hp = Math.min(char.stats.maxHP, char.hp + Math.floor(char.stats.maxHP * effect.healPercent));
    }
    if (effect.gold) { char.gold = (char.gold || 0) + effect.gold; }
    if (effect.shield) {
      char.buffs.push({ type: 'shield', value: effect.shield, duration: 999 });
    }
    if (effect.resetCooldowns) {
      for (const s of char.skills) s.currentCooldown = 0;
    }
    if (effect.critBonus) {
      char._critBonus = (char._critBonus || 0) + effect.critBonus;
    }
    // 스킬 모듈 강화
    if (effect.skillMod) {
      this._applySkillMod(char, effect.skillMod);
    }
  }

  /** 스킬 모듈 강화 적용 */
  _applySkillMod(char, mod) {
    for (const skill of char.skills) {
      // 타겟 필터: 'all' / 'attack' / 'defense' / 'zone' / 'movement' / 'dot'
      const matchesTarget =
        mod.target === 'all' ||
        mod.target === skill.type ||
        (mod.target === 'dot' && skill.dot) ||
        (mod.target === 'zone' && skill.zone);

      if (!matchesTarget) continue;

      // 중첩 필드 처리 (e.g. 'zone.tickDamage', 'dot.duration')
      const parts = mod.field.split('.');
      let obj = skill;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      const key = parts[parts.length - 1];
      const current = obj[key] || 0;
      const newVal = current + mod.add;
      obj[key] = mod.min != null ? Math.max(mod.min, newVal) : Math.max(0, newVal);
    }
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
        isDecoy: !!c.isDecoy,
        signalColor: c.signalColor || "none",
        level: c.level || 0,
        gold: c.gold || 0,
        enhancementLevels: c.enhancementLevels || null,
        livesRemaining: this.respawnLives.get(c.id) || 0,
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

    // Clamp gatekeepers near their wall (don't wander too far)
    const colWidth = 1600 / 10;
    for (const char of this.engine.characters) {
      if (char.isGatekeeper && char.alive) {
        // Find nearest wall
        let nearestWall = null;
        let nearestDist = Infinity;
        for (const w of this.walls) {
          const dist = Math.abs(char.x - (w.x + colWidth / 2));
          if (dist < nearestDist) { nearestDist = dist; nearestWall = w; }
        }
        if (nearestWall) {
          // Keep within wall column ± 30px
          const wallCenter = nearestWall.x + colWidth / 2;
          if (char.x < wallCenter - 80) char.x = wallCenter - 80;
          if (char.x > wallCenter + 80) char.x = wallCenter + 80;
        }
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
