const { BehaviorTree } = require('../shared/BehaviorTree');

const TICK_INTERVAL = 200; // ms
const ARENA_WIDTH = 1600;
const ARENA_HEIGHT = 400;
const MAX_TICKS = 300; // 60초 제한
const DAMAGE_SCALE = 0.35; // 글로벌 데미지 감쇄

class BattleEngine {
  constructor(players, options = {}) {
    this.tick = 0;
    this.characters = [];
    this.log = [];
    this.finished = false;
    this.results = null;
    this.maxTicks = options.maxTicks || MAX_TICKS;
    this.finishCondition = options.finishCondition || 'lastStanding';
    this.pendingCharacters = [];
    this.wallBarriers = []; // [{x, active}] - set by orchestrator
    this.zones = []; // 지속 영역 효과 [{x, y, radius, tickDamage, slow, duration, ownerId, ownerTeam, visual}]

    this.initCharacters(players);
  }

  /** 플레이어 빌드를 전투 캐릭터로 변환 */
  initCharacters(players) {
    const spacing = ARENA_WIDTH / (players.length + 1);

    this.characters = players.map((build, i) => {
      const stats = { ...build.stats };
      return {
        id: build.id || `p${i}`,
        name: build.playerName || `Player${i + 1}`,
        team: build.team != null ? build.team : i,
        className: build.className,
        passive: build.passive,
        stats,
        baseStats: { ...stats },
        equipmentBonuses: { ATK: 0, DEF: 0, INT: 0, SPD: 0 },
        enhancementLevels: { helmet: 0, armor: 0, weapon: 0, boots: 0 },
        hp: stats.maxHP,
        range: build.range,
        btWeights: { ...build.btWeights },
        skills: (build.skills || []).map(s => ({ ...s, currentCooldown: 0 })),
        x: build.x != null ? build.x : spacing * (i + 1),
        y: build.y != null ? build.y : ARENA_HEIGHT / 2,
        zoneId: build.zoneId != null ? build.zoneId : null,
        buffs: [],
        dots: [], // DOT 효과 [{name, tickDamage, duration, sourceId}]
        alive: true,
        gold: 0,
        stunTicks: 0, // 스턴 남은 틱
        signalColor: build.signalColor || 'none',
      };
    });
  }

  /** 중간에 캐릭터 추가 */
  addCharacter(charData) {
    this.pendingCharacters.push({
      ...charData,
      buffs: charData.buffs || [],
      dots: charData.dots || [],
      alive: true,
      baseStats: charData.baseStats || { ...charData.stats },
      equipmentBonuses: charData.equipmentBonuses || { ATK: 0, DEF: 0, INT: 0, SPD: 0 },
      enhancementLevels: charData.enhancementLevels || { helmet: 0, armor: 0, weapon: 0, boots: 0 },
      gold: charData.gold || 0,
      stunTicks: charData.stunTicks || 0,
      signalColor: charData.signalColor || 'none',
      skills: (charData.skills || []).map(s => ({ ...s, currentCooldown: s.currentCooldown || 0 })),
    });
  }

  /** 전투 전체 실행 */
  run() {
    while (!this.finished && this.tick < this.maxTicks) {
      this.processTick();
    }
    if (!this.finished) this.finishByHP();
    return { log: this.log, results: this.results };
  }

  /** 한 틱 처리 */
  processTick() {
    this.tick++;
    this.tickEvents = [];

    // Flush pending characters
    if (this.pendingCharacters.length > 0) {
      this.characters.push(...this.pendingCharacters);
      this.pendingCharacters = [];
    }

    // 1. 존 효과 처리 (지속 영역 데미지/슬로우)
    this.processZones();

    // 2. DOT 처리
    this.processDots();

    // 3. 캐릭터 행동 (속도 순)
    const aliveChars = this.characters.filter(c => c.alive);
    const ordered = [...aliveChars].sort((a, b) => b.stats.SPD - a.stats.SPD);

    for (const char of ordered) {
      if (!char.alive) continue;

      // 스턴 중이면 행동 불가
      if (char.stunTicks > 0) {
        char.stunTicks--;
        continue;
      }

      const bt = new BehaviorTree(char, { characters: this.characters, wallBarriers: this.wallBarriers });
      const action = bt.evaluate();

      this.executeAction(char, action);
      this.updateCooldowns(char);
      this.updateBuffs(char);
    }

    // 4. 존 지속시간 감소
    this.zones = this.zones.filter(z => {
      z.duration--;
      return z.duration > 0;
    });

    // 5. 생존자 체크
    if (this.finishCondition === 'lastStanding') {
      const alive = this.characters.filter(c => c.alive);
      if (alive.length <= 1) this.finishBattle(alive);
    }

    // 6. 로그
    this.log.push({
      tick: this.tick,
      state: this.characters.map(c => ({
        id: c.id,
        name: c.name,
        className: c.className,
        hp: c.hp,
        maxHP: c.stats.maxHP,
        x: Math.round(c.x),
        y: Math.round(c.y),
        alive: c.alive,
        isDecoy: !!c.isDecoy,
      })),
      zones: this.zones.map(z => ({
        x: Math.round(z.x), y: Math.round(z.y),
        radius: z.radius, visual: z.visual, duration: z.duration,
      })),
      events: this.tickEvents,
    });
  }

  // ═══════════════════════════════════════
  //  존 효과 시스템
  // ═══════════════════════════════════════

  /** 지속 영역 데미지/슬로우 처리 */
  processZones() {
    for (const zone of this.zones) {
      for (const char of this.characters) {
        if (!char.alive || char.team === zone.ownerTeam) continue;
        const dist = Math.sqrt((char.x - zone.x) ** 2 + (char.y - zone.y) ** 2);
        if (dist > zone.radius) continue;

        // 틱 데미지
        if (zone.tickDamage > 0) {
          this.applyDamage(char, Math.round(zone.tickDamage * DAMAGE_SCALE), zone.ownerId, zone.visual + '장판', this.tickEvents);
        }
        // 슬로우
        if (zone.slow && !char.buffs.some(b => b.type === 'slow')) {
          char.buffs.push({ type: 'slow', value: zone.slow, duration: 2 });
        }
      }
    }
  }

  // ═══════════════════════════════════════
  //  DOT 시스템
  // ═══════════════════════════════════════

  /** DOT(지속 데미지) 처리 */
  processDots() {
    for (const char of this.characters) {
      if (!char.alive || !char.dots) continue;
      char.dots = char.dots.filter(dot => {
        this.applyDamage(char, Math.round(dot.tickDamage * DAMAGE_SCALE), dot.sourceId, dot.name, this.tickEvents);
        dot.duration--;
        return dot.duration > 0 && char.alive;
      });
    }
  }

  // ═══════════════════════════════════════
  //  행동 실행
  // ═══════════════════════════════════════

  executeAction(char, action) {
    switch (action.type) {
      case 'attack':
        this.doAttack(char, action.target);
        break;
      case 'skill':
        this.doSkill(char, action.skill, action.target);
        break;
      case 'move':
        this.doMove(char, action);
        break;
      case 'idle':
        break;
    }
  }

  /** 기본 공격 */
  doAttack(attacker, targetId) {
    const target = this.characters.find(c => c.id === targetId);
    if (!target || !target.alive) return;

    let damage = Math.max(1, (attacker.stats.ATK * attacker.stats.ATK) / (attacker.stats.ATK + target.stats.DEF) * DAMAGE_SCALE);

    // 패시브: 투지 (전사)
    if (attacker.passive?.trigger === 'hp_below') {
      const ratio = attacker.hp / attacker.stats.maxHP;
      if (ratio < attacker.passive.threshold) damage *= attacker.passive.effect.atkMul;
    }

    // 패시브: 급소공격 (도적)
    let isCrit = false;
    if (attacker.passive?.trigger === 'on_attack' && attacker.passive.effect.critMul) {
      const critChance = (attacker.passive.chance || 0) + (attacker._critBonus || 0);
      if (Math.random() < critChance) {
        damage *= attacker.passive.effect.critMul;
        isCrit = true;
      }
    }

    // 패시브: 명사수 (궁수)
    if (attacker.passive?.trigger === 'on_attack' && attacker.passive.effect.distanceAtkBonus) {
      const dist = this.getDistance(attacker, target);
      const maxRange = attacker.passive.effect.maxRange;
      damage *= 1 + (dist / maxRange) * attacker.passive.effect.distanceAtkBonus;
    }

    // 패시브: 철벽의지 (기사) - 방어 측
    if (target.passive?.trigger === 'on_damaged') {
      damage *= (1 - target.passive.effect.damageReduction);
    }

    // 가시(thorns) 반사
    const thorns = target.buffs.find(b => b.type === 'thorns');
    if (thorns) {
      this.applyDamage(attacker, thorns.value, target.id, '가시반사', this.tickEvents);
    }

    // 회피(dodge) 체크
    const dodgeBuff = target.buffs.find(b => b.type === 'dodge');
    if (dodgeBuff && Math.random() < dodgeBuff.value) {
      this.tickEvents.push({ type: 'dodge', target: target.id, from: attacker.id });
      return;
    }

    damage = Math.round(damage);
    this.applyDamage(target, damage, attacker.id, null, this.tickEvents, isCrit);
  }

  /** 스킬 사용 */
  doSkill(caster, skill, targetId) {
    const skillData = caster.skills.find(s => s.name === skill.name);
    if (!skillData || skillData.currentCooldown > 0) return;

    skillData.currentCooldown = skillData.cooldown;

    this.tickEvents.push({ type: 'skill', caster: caster.id, skillName: skillData.name, skillType: skillData.type, aoe: !!skillData.aoe });

    // 패시브: 마력순환 (마법사)
    if (caster.passive?.trigger === 'on_skill_use') {
      for (const s of caster.skills) {
        if (s !== skillData && s.currentCooldown > 0) {
          s.currentCooldown = Math.floor(s.currentCooldown * (1 - caster.passive.effect.cooldownReduction));
        }
      }
    }

    // 마력증폭 버프 (nextSkillOnly)
    let buffMultiplier = 1.0;
    const ampBuff = caster.buffs.find(b => b.type === 'buff' && b.nextSkillOnly);
    if (ampBuff) {
      buffMultiplier = ampBuff.skillDamageMul || 2.0;
      caster.buffs = caster.buffs.filter(b => b !== ampBuff);
    } else if (caster.buffs.some(b => b.type === 'buff')) {
      buffMultiplier = 1.5;
    }

    switch (skillData.type) {
      case 'attack':
        this._doAttackSkill(caster, skillData, targetId, buffMultiplier);
        break;
      case 'defense':
        this._doDefenseSkill(caster, skillData, targetId);
        break;
      case 'buff':
        this._doBuffSkill(caster, skillData);
        break;
      case 'movement':
        this._doMovementSkill(caster, skillData, targetId);
        break;
      case 'zone':
        this._doZoneSkill(caster, skillData);
        break;
    }
  }

  /** 공격 스킬 */
  _doAttackSkill(caster, skillData, targetId, buffMul) {
    const targets = [];

    if (skillData.aoe) {
      const nearby = this.characters.filter(
        c => c.team !== caster.team && c.alive && this.getDistance(caster, c) <= 150
      );
      const dmg = Math.round((skillData.damage + caster.stats.INT * 2) * DAMAGE_SCALE * buffMul);
      for (const t of nearby) {
        this.applyDamage(t, dmg, caster.id, skillData.name, this.tickEvents);
        targets.push(t);
      }
    } else {
      const target = this.characters.find(c => c.id === targetId);
      if (target && target.alive) {
        const hits = skillData.hits || 1;
        const dmgPerHit = Math.round((skillData.damage + caster.stats.ATK) * DAMAGE_SCALE * buffMul / hits);
        for (let i = 0; i < hits; i++) {
          if (target.alive) this.applyDamage(target, dmgPerHit, caster.id, skillData.name, this.tickEvents);
        }
        targets.push(target);
      }
    }

    // 넉백
    if (skillData.knockback) {
      for (const t of targets) {
        if (!t.alive) continue;
        const dx = t.x - caster.x;
        const dist = Math.abs(dx) || 1;
        t.x += (dx / dist) * skillData.knockback;
        t.x = Math.max(0, Math.min(ARENA_WIDTH, t.x));
        this.tickEvents.push({ type: 'knockback', target: t.id, distance: skillData.knockback });
      }
    }

    // DOT 적용
    if (skillData.dot) {
      for (const t of targets) {
        if (!t.alive) continue;
        if (!t.dots) t.dots = [];
        t.dots.push({
          name: skillData.dot.name,
          tickDamage: skillData.dot.tickDamage,
          duration: skillData.dot.duration,
          sourceId: caster.id,
        });
        this.tickEvents.push({ type: 'dotApply', target: t.id, name: skillData.dot.name, duration: skillData.dot.duration });
      }
    }

    // 스턴 적용
    if (skillData.stun) {
      for (const t of targets) {
        if (!t.alive) continue;
        t.stunTicks = Math.max(t.stunTicks || 0, skillData.stun);
        this.tickEvents.push({ type: 'stun', target: t.id, duration: skillData.stun });
      }
    }
  }

  /** 방어 스킬 */
  _doDefenseSkill(caster, skillData, targetId) {
    const target = this.characters.find(c => c.id === targetId) || caster;
    if (skillData.shield) {
      target.buffs.push({ type: 'shield', value: skillData.shield, duration: 8 });
    }
    // 가시 반사
    if (skillData.thorns) {
      target.buffs.push({ type: 'thorns', value: skillData.thorns, duration: skillData.thornsDuration || 5 });
      this.tickEvents.push({ type: 'thornsApply', target: target.id, value: skillData.thorns });
    }
  }

  /** 버프 스킬 */
  _doBuffSkill(caster, skillData) {
    const buff = {
      type: 'buff',
      name: skillData.name,
      duration: skillData.duration || 5,
    };
    // 마력증폭 (다음 스킬 1회)
    if (skillData.nextSkillOnly) {
      buff.nextSkillOnly = true;
      buff.skillDamageMul = skillData.skillDamageMul || 2.0;
    }
    // 회피 버프
    if (skillData.dodge) {
      caster.buffs.push({ type: 'dodge', value: skillData.dodge, duration: skillData.duration || 5 });
    }
    caster.buffs.push(buff);

    // 바람 잔상 (trail → zone 생성)
    if (skillData.trail) {
      this.zones.push({
        x: caster.x,
        y: caster.y,
        radius: skillData.trail.radius || 40,
        tickDamage: 0,
        slow: skillData.trail.slow || 0.3,
        duration: skillData.trail.duration || 4,
        ownerId: caster.id,
        ownerTeam: caster.team,
        visual: skillData.trail.visual || 'wind',
      });
      this.tickEvents.push({ type: 'zoneCreate', x: Math.round(caster.x), y: Math.round(caster.y), visual: 'wind' });
    }
  }

  /** 이동 스킬 */
  _doMovementSkill(caster, skillData, targetId) {
    // 그림자 도약 (텔레포트 + 잔상)
    if (skillData.teleportDistance) {
      const enemies = this.characters.filter(c => c.team !== caster.team && c.alive);
      const nearest = enemies.length > 0 ? enemies.reduce((min, e) =>
        this.getDistance(caster, e) < this.getDistance(caster, min) ? e : min, enemies[0]) : null;

      const oldX = caster.x;
      if (nearest && skillData.direction === 'away') {
        const dx = caster.x - nearest.x;
        caster.x += (dx > 0 ? 1 : -1) * skillData.teleportDistance;
      } else {
        caster.x += skillData.teleportDistance;
      }
      caster.x = Math.max(0, Math.min(ARENA_WIDTH, caster.x));
      this.tickEvents.push({ type: 'teleport', id: caster.id, fromX: Math.round(oldX), toX: Math.round(caster.x) });

      // 잔상(미끼) 생성
      if (skillData.decoy) {
        this.addCharacter({
          id: `decoy_${caster.id}_${this.tick}`,
          name: '잔상',
          team: caster.team,
          className: caster.className,
          passive: null,
          stats: { maxHP: skillData.decoy.hp, ATK: 0, DEF: 0, INT: 0, SPD: 0 },
          hp: skillData.decoy.hp,
          range: 0,
          btWeights: { survive: 0, skill: 0, attack: 0 },
          skills: [],
          x: oldX,
          y: caster.y,
          isDecoy: true,
        });
        this.tickEvents.push({ type: 'decoyCreate', x: Math.round(oldX) });
      }
    }
    // 대시 (돌진 + 경로 데미지)
    else if (skillData.dashDistance) {
      const target = this.characters.find(c => c.id === targetId);
      const oldX = caster.x;
      if (target && skillData.direction === 'toward') {
        const dx = target.x - caster.x;
        caster.x += (dx > 0 ? 1 : -1) * skillData.dashDistance;
      } else {
        caster.x += skillData.dashDistance;
      }
      caster.x = Math.max(0, Math.min(ARENA_WIDTH, caster.x));

      // 경로상 적에게 데미지
      if (skillData.dashDamage) {
        const minX = Math.min(oldX, caster.x);
        const maxX = Math.max(oldX, caster.x);
        for (const c of this.characters) {
          if (c.team === caster.team || !c.alive) continue;
          if (c.x >= minX && c.x <= maxX && Math.abs(c.y - caster.y) < 50) {
            this.applyDamage(c, Math.round(skillData.dashDamage * DAMAGE_SCALE), caster.id, skillData.name, this.tickEvents);
          }
        }
      }
      this.tickEvents.push({ type: 'dash', id: caster.id, fromX: Math.round(oldX), toX: Math.round(caster.x) });
    }
    // 기본 이동스킬
    else {
      caster.buffs.push({ type: 'speedBoost', duration: 3 });
    }
  }

  /** 존 스킬 (화염방벽, 빙결장판 등) */
  _doZoneSkill(caster, skillData) {
    const zoneData = skillData.zone;
    if (!zoneData) return;

    this.zones.push({
      x: caster.x,
      y: caster.y,
      radius: zoneData.radius || 80,
      tickDamage: zoneData.tickDamage || 0,
      slow: zoneData.slow || 0,
      duration: zoneData.duration || 8,
      ownerId: caster.id,
      ownerTeam: caster.team,
      visual: zoneData.visual || 'fire',
    });
    this.tickEvents.push({
      type: 'zoneCreate',
      x: Math.round(caster.x), y: Math.round(caster.y),
      radius: zoneData.radius, visual: zoneData.visual, duration: zoneData.duration,
    });

    // 존 스킬에 쉴드도 있으면 (빙결장판)
    if (skillData.shield) {
      caster.buffs.push({ type: 'shield', value: skillData.shield, duration: zoneData.duration });
    }
  }

  // ═══════════════════════════════════════
  //  이동
  // ═══════════════════════════════════════

  doMove(char, action) {
    const baseSpeed = char.stats.SPD * 2;
    const hasSpeedBoost = char.buffs.some(b => b.type === 'speedBoost');
    const hasSlow = char.buffs.find(b => b.type === 'slow');
    let moveSpeed = hasSpeedBoost ? baseSpeed * 1.5 : baseSpeed;
    if (hasSlow) moveSpeed *= (1 - hasSlow.value);

    switch (action.direction) {
      case 'forward':
        char.x += moveSpeed;
        break;
      case 'retreat':
        char.x -= moveSpeed;
        break;
      case 'toward': {
        const target = this.characters.find(c => c.id === action.target);
        if (target) {
          const dx = target.x - char.x;
          const dy = target.y - char.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          char.x += (dx / dist) * moveSpeed;
          char.y += (dy / dist) * moveSpeed;
        }
        break;
      }
      case 'away': {
        const fleeTarget = this.characters.find(c => c.id === action.target);
        if (fleeTarget) {
          const dx = char.x - fleeTarget.x;
          const dy = char.y - fleeTarget.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          char.x += (dx / dist) * moveSpeed;
          char.y += (dy / dist) * moveSpeed;
        }
        break;
      }
    }

    // 맵 경계
    char.x = Math.max(0, Math.min(ARENA_WIDTH, char.x));
    char.y = Math.max(0, Math.min(ARENA_HEIGHT, char.y));

    // 벽 차단
    if (this.wallBarriers.length > 0 && char._wallSide) {
      const colWidth = ARENA_WIDTH / 10;
      for (let wi = 0; wi < this.wallBarriers.length; wi++) {
        const wb = this.wallBarriers[wi];
        if (!wb.active) continue;
        const wallCenter = wb.x + colWidth / 2;
        const side = char._wallSide[wi];
        if (side === 'left' && char.x > wallCenter) char.x = wallCenter;
        else if (side === 'right' && char.x < wallCenter) char.x = wallCenter;
      }
    }
  }

  // ═══════════════════════════════════════
  //  데미지/쿨다운/버프
  // ═══════════════════════════════════════

  applyDamage(target, damage, attackerId, skillName, tickEvents, isCrit) {
    const shield = target.buffs.find(b => b.type === 'shield');
    if (shield) {
      if (shield.value >= damage) {
        shield.value -= damage;
        if (tickEvents) tickEvents.push({ type: 'damage', from: attackerId, to: target.id, amount: 0, skill: skillName || null, shielded: true });
        return;
      }
      damage -= shield.value;
      target.buffs = target.buffs.filter(b => b !== shield);
    }

    const actual = Math.min(damage, target.hp);
    target.hp = Math.max(0, target.hp - damage);

    // 반격용: 누가 나를 공격했는지 추적
    if (attackerId && attackerId !== target.id) {
      if (!target._attackedBy) target._attackedBy = new Set();
      target._attackedBy.add(attackerId);
    }

    if (tickEvents) tickEvents.push({ type: 'damage', from: attackerId, to: target.id, amount: actual, skill: skillName || null, crit: !!isCrit });
    if (target.hp <= 0 && target.alive) {
      target.alive = false;
      target.deathTick = this.tick;
      target.killedBy = attackerId;
      if (tickEvents) tickEvents.push({ type: 'death', target: target.id, killedBy: attackerId });
    }
  }

  updateCooldowns(char) {
    for (const skill of char.skills) {
      if (skill.currentCooldown > 0) skill.currentCooldown--;
    }
  }

  updateBuffs(char) {
    char.buffs = char.buffs.filter(b => {
      b.duration--;
      return b.duration > 0;
    });
  }

  // ═══════════════════════════════════════
  //  종료
  // ═══════════════════════════════════════

  finishBattle(alive) {
    this.finished = true;
    const dead = this.characters.filter(c => !c.alive).sort((a, b) => b.deathTick - a.deathTick);
    const ranking = [...alive, ...dead];
    this.results = ranking.map((c, i) => ({
      rank: i + 1, id: c.id, name: c.name, className: c.className,
      alive: c.alive, hpRemaining: c.hp,
    }));
  }

  finishByHP() {
    this.finished = true;
    const sorted = [...this.characters].sort((a, b) => {
      if (a.alive !== b.alive) return b.alive - a.alive;
      return (b.hp / b.stats.maxHP) - (a.hp / a.stats.maxHP);
    });
    this.results = sorted.map((c, i) => ({
      rank: i + 1, id: c.id, name: c.name, className: c.className,
      alive: c.alive, hpRemaining: c.hp,
    }));
  }

  getDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

module.exports = { BattleEngine, TICK_INTERVAL };
