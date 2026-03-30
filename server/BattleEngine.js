const { BehaviorTree } = require('../shared/BehaviorTree');

const TICK_INTERVAL = 200; // ms
const ARENA_WIDTH = 800;
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
        team: build.team != null ? build.team : i, // FFA (개인전) or custom team
        className: build.className,
        passive: build.passive,
        stats,
        baseStats: { ...stats }, // snapshot for recalcStats
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
        alive: true,
        gold: 0,
      };
    });
  }

  /** 전투 전체 실행 (서버 시뮬레이션) */
  /** 중간에 캐릭터 추가 (다음 틱 시작 시 반영) */
  addCharacter(charData) {
    this.pendingCharacters.push({
      ...charData,
      buffs: charData.buffs || [],
      alive: true,
      baseStats: charData.baseStats || { ...charData.stats },
      equipmentBonuses: charData.equipmentBonuses || { ATK: 0, DEF: 0, INT: 0, SPD: 0 },
      enhancementLevels: charData.enhancementLevels || { helmet: 0, armor: 0, weapon: 0, boots: 0 },
      gold: charData.gold || 0,
      skills: (charData.skills || []).map(s => ({ ...s, currentCooldown: s.currentCooldown || 0 })),
    });
  }

  run() {
    while (!this.finished && this.tick < this.maxTicks) {
      this.processTick();
    }

    if (!this.finished) {
      // 시간 초과 - 남은 HP 비율로 순위
      this.finishByHP();
    }

    return { log: this.log, results: this.results };
  }

  /** 한 틱 처리 */
  processTick() {
    this.tick++;
    this.tickEvents = [];

    // Flush pending characters (added via addCharacter)
    if (this.pendingCharacters.length > 0) {
      this.characters.push(...this.pendingCharacters);
      this.pendingCharacters = [];
    }

    const aliveChars = this.characters.filter(c => c.alive);

    // 속도 순으로 행동
    const ordered = [...aliveChars].sort((a, b) => b.stats.SPD - a.stats.SPD);

    for (const char of ordered) {
      if (!char.alive) continue;

      const bt = new BehaviorTree(char, { characters: this.characters });
      const action = bt.evaluate();

      this.executeAction(char, action);
      this.updateCooldowns(char);
      this.updateBuffs(char);
    }

    // 생존자 체크 (external 모드에서는 스킵 - 오케스트레이터가 관리)
    if (this.finishCondition === 'lastStanding') {
      const alive = this.characters.filter(c => c.alive);
      if (alive.length <= 1) {
        this.finishBattle(alive);
      }
    }

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
      })),
      events: this.tickEvents,
    });
  }

  /** 행동 실행 */
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
        // 적 없으면 대기 (이동 안 함)
        break;
    }
  }

  /** 기본 공격 */
  doAttack(attacker, targetId) {
    const target = this.characters.find(c => c.id === targetId);
    if (!target || !target.alive) return;

    // 데미지 공식: ATK^2 / (ATK + DEF) * 감쇄계수
    let damage = Math.max(1, (attacker.stats.ATK * attacker.stats.ATK) / (attacker.stats.ATK + target.stats.DEF) * DAMAGE_SCALE);

    // 패시브: 투지 (전사)
    if (attacker.passive?.trigger === 'hp_below') {
      const ratio = attacker.hp / attacker.stats.maxHP;
      if (ratio < attacker.passive.threshold) {
        damage *= attacker.passive.effect.atkMul;
      }
    }

    // 패시브: 급소공격 (도적)
    if (attacker.passive?.trigger === 'on_attack' && attacker.passive.effect.critMul) {
      if (Math.random() < attacker.passive.chance) {
        damage *= attacker.passive.effect.critMul;
      }
    }

    // 패시브: 명사수 (궁수)
    if (attacker.passive?.trigger === 'on_attack' && attacker.passive.effect.distanceAtkBonus) {
      const dist = this.getDistance(attacker, target);
      const maxRange = attacker.passive.effect.maxRange;
      const bonus = 1 + (dist / maxRange) * attacker.passive.effect.distanceAtkBonus;
      damage *= bonus;
    }

    // 패시브: 철벽의지 (기사) - 방어 측
    if (target.passive?.trigger === 'on_damaged') {
      damage *= (1 - target.passive.effect.damageReduction);
    }

    damage = Math.round(damage);
    this.applyDamage(target, damage, attacker.id, null, this.tickEvents);
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

    switch (skillData.type) {
      case 'attack': {
        if (skillData.aoe) {
          // 범위 공격 (존 필터 포함)
          const nearby = this.characters.filter(
            c => c.team !== caster.team && c.alive && this.getDistance(caster, c) <= 150
              && (caster.zoneId == null || c.zoneId == null || c.zoneId === caster.zoneId)
          );
          const dmg = (skillData.damage + caster.stats.INT * 2) * DAMAGE_SCALE;
          for (const t of nearby) {
            this.applyDamage(t, Math.round(dmg), caster.id, skillData.name, this.tickEvents);
          }
        } else {
          // 단일 공격
          const target = this.characters.find(c => c.id === targetId);
          if (target && target.alive) {
            const hits = skillData.hits || 1;
            const dmgPerHit = Math.round((skillData.damage + caster.stats.ATK) * DAMAGE_SCALE / hits);
            for (let i = 0; i < hits; i++) {
              if (target.alive) this.applyDamage(target, dmgPerHit, caster.id, skillData.name, this.tickEvents);
            }
          }
        }
        break;
      }
      case 'defense': {
        const target = this.characters.find(c => c.id === targetId) || caster;
        if (skillData.shield) {
          target.buffs.push({
            type: 'shield',
            value: skillData.shield,
            duration: 5,
          });
        }
        break;
      }
      case 'buff': {
        caster.buffs.push({
          type: 'buff',
          name: skillData.name,
          duration: skillData.duration || 5,
        });
        break;
      }
      case 'movement': {
        // 대시 등
        caster.buffs.push({
          type: 'speedBoost',
          duration: 3,
        });
        break;
      }
    }
  }

  /** 이동 */
  doMove(char, action) {
    const speed = char.stats.SPD * 2;
    const hasSpeedBoost = char.buffs.some(b => b.type === 'speedBoost');
    const moveSpeed = hasSpeedBoost ? speed * 1.5 : speed;

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
    }

    // 맵 경계
    char.x = Math.max(0, Math.min(ARENA_WIDTH, char.x));
    char.y = Math.max(0, Math.min(ARENA_HEIGHT, char.y));
  }

  /** 데미지 적용 */
  applyDamage(target, damage, attackerId, skillName, tickEvents) {
    // 쉴드 먼저 소모
    const shield = target.buffs.find(b => b.type === 'shield');
    if (shield) {
      if (shield.value >= damage) {
        shield.value -= damage;
        if (tickEvents) tickEvents.push({ type: 'damage', from: attackerId, to: target.id, amount: 0, skill: skillName || null });
        return;
      }
      damage -= shield.value;
      target.buffs = target.buffs.filter(b => b !== shield);
    }

    const actualDamageDealt = Math.min(damage, target.hp);
    target.hp = Math.max(0, target.hp - damage);
    if (tickEvents) tickEvents.push({ type: 'damage', from: attackerId, to: target.id, amount: actualDamageDealt, skill: skillName || null });
    if (target.hp <= 0 && target.alive) {
      target.alive = false;
      target.deathTick = this.tick;
      target.killedBy = attackerId;
      if (tickEvents) tickEvents.push({ type: 'death', target: target.id, killedBy: attackerId });
    }
  }

  /** 쿨다운 감소 */
  updateCooldowns(char) {
    for (const skill of char.skills) {
      if (skill.currentCooldown > 0) skill.currentCooldown--;
    }
  }

  /** 버프 지속시간 감소 */
  updateBuffs(char) {
    char.buffs = char.buffs.filter(b => {
      b.duration--;
      return b.duration > 0;
    });
  }

  /** 전투 종료 */
  finishBattle(alive) {
    this.finished = true;
    const dead = this.characters
      .filter(c => !c.alive)
      .sort((a, b) => b.deathTick - a.deathTick); // 늦게 죽은 순

    const ranking = [...alive, ...dead];
    this.results = ranking.map((c, i) => ({
      rank: i + 1,
      id: c.id,
      name: c.name,
      className: c.className,
      alive: c.alive,
      hpRemaining: c.hp,
    }));
  }

  /** 시간 초과 시 HP 비율로 순위 */
  finishByHP() {
    this.finished = true;
    const sorted = [...this.characters].sort((a, b) => {
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
    }));
  }

  getDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

module.exports = { BattleEngine, TICK_INTERVAL };
