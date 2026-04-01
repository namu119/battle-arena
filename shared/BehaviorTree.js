/**
 * BehaviorTree v3 — 서바이벌 아레나 전용
 *
 * 6개 행동 브랜치:
 *  survive  — 위급 시 방어스킬/후퇴
 *  skill    — 스킬 사용 (사거리 체크, 버프 타이밍)
 *  farm     — PvE 파밍 (몬스터/가디언/보스)
 *  kite     — 원거리 거리 유지 (카이팅)
 *  pvp      — PvP 교전 (강화도 기반 판단)
 *  position — 접근/적정거리 이동
 */

const MELEE_THRESHOLD = 80;
const KITE_RATIO = 0.6;

class BehaviorTree {
  constructor(character, battleState) {
    this.char = character;
    this.state = battleState;
    this.isRanged = character.range > MELEE_THRESHOLD;
  }

  evaluate() {
    const enemies = this.getEnemies();
    if (enemies.length === 0) return { type: 'idle' };

    const w = this.char.btWeights;
    const hpRatio = this.char.hp / this.char.stats.maxHP;
    const nearest = this.getNearestEnemy(enemies);
    const nearestDist = nearest ? this.getDistance(nearest) : Infinity;

    // 분류
    const monsters = enemies.filter(e => e.isMonster && !e.isBoss && !e.isGatekeeper);
    const gatekeepers = enemies.filter(e => e.isGatekeeper);
    const bosses = enemies.filter(e => e.isBoss);
    const players = enemies.filter(e => !e.isMonster);
    const nearbyEnemies = enemies.filter(e => this.getDistance(e) <= 150);

    const branches = [
      {
        name: 'survive',
        score: this._scoreSurvive(w.survive, hpRatio, nearestDist),
        execute: () => this._execSurvive(hpRatio, enemies),
      },
      {
        name: 'skill',
        score: this._scoreSkill(w.skill, hpRatio, nearbyEnemies),
        execute: () => this._execSkill(enemies, nearbyEnemies),
      },
      {
        name: 'farm',
        score: this._scoreFarm(w, monsters, gatekeepers, bosses),
        execute: () => this._execFarm(monsters, gatekeepers, bosses),
      },
      {
        name: 'kite',
        score: this._scoreKite(w, hpRatio, nearestDist, nearest),
        execute: () => this._execKite(enemies, nearest, nearestDist),
      },
      {
        name: 'pvp',
        score: this._scorePvP(w, players, hpRatio),
        execute: () => this._execPvP(players),
      },
      {
        name: 'position',
        score: this._scorePosition(w, nearestDist, enemies),
        execute: () => this._execPosition(enemies, nearest, nearestDist),
      },
    ];

    branches.sort((a, b) => b.score - a.score);
    for (const b of branches) {
      const action = b.execute();
      if (action) return action;
    }
    return { type: 'idle' };
  }

  // ═══════════════════════════════════════
  //  SURVIVE — 위급 상황 처리
  // ═══════════════════════════════════════

  _scoreSurvive(base, hpRatio, nearestDist) {
    if (hpRatio < 0.2) return base * 4;
    if (hpRatio < 0.3) return base * 3;
    if (hpRatio < 0.5) return base * 1.5;
    if (this.isRanged && nearestDist < MELEE_THRESHOLD) return base * 2;
    return base * 0.3;
  }

  _execSurvive(hpRatio, enemies) {
    // 방어 스킬
    if (hpRatio < 0.5) {
      const defSkill = this.findReadySkill('defense');
      if (defSkill) return { type: 'skill', skill: defSkill, target: this.char.id };
    }
    // 이동 스킬로 도주
    if (hpRatio < 0.3) {
      const moveSkill = this.findReadySkill('movement');
      if (moveSkill) return { type: 'skill', skill: moveSkill, target: this.char.id };
    }
    // 적 반대 방향으로 후퇴
    if (hpRatio < 0.3 && enemies.length > 0) {
      const nearest = this.getNearestEnemy(enemies);
      return { type: 'move', direction: 'away', target: nearest.id };
    }
    return null;
  }

  // ═══════════════════════════════════════
  //  SKILL — 스킬 사용 (사거리 체크 포함)
  // ═══════════════════════════════════════

  _scoreSkill(base, hpRatio, nearbyEnemies) {
    let score = base;
    if (nearbyEnemies.length >= 2) score *= 1.4;
    if (nearbyEnemies.length >= 3) score *= 1.3;
    const ready = this._findAnyReadySkill();
    if (ready) score *= 1.2;
    else score *= 0.1;
    if (hpRatio < 0.2) score *= 0.3;
    return score;
  }

  _execSkill(enemies, nearbyEnemies) {
    // 1) 버프 (없을 때만)
    if (!this.char.buffs.some(b => b.type === 'buff')) {
      const buffSkill = this.findReadySkill('buff');
      if (buffSkill) return { type: 'skill', skill: buffSkill, target: this.char.id };
    }

    // 2) AOE: 적 2+ 밀집
    if (nearbyEnemies.length >= 2) {
      const aoe = this.findReadySkill('attack', true);
      if (aoe) {
        const range = this._skillRange(aoe);
        const inRange = nearbyEnemies.filter(e => this.getDistance(e) <= range);
        if (inRange.length >= 2) {
          return { type: 'skill', skill: aoe, target: inRange[0].id };
        }
      }
    }

    // 3) 단일 공격 스킬 (사거리 내)
    const atkSkill = this.findReadySkill('attack', false);
    if (atkSkill && enemies.length > 0) {
      const range = this._skillRange(atkSkill);
      const inRange = enemies.filter(e => this.getDistance(e) <= range);
      if (inRange.length > 0) {
        // 보스 우선
        const boss = inRange.find(e => e.isBoss);
        if (boss) return { type: 'skill', skill: atkSkill, target: boss.id };
        return { type: 'skill', skill: atkSkill, target: this.getWeakestEnemy(inRange).id };
      }
    }

    // 4) 존(장판) 스킬 - 적 2+ 밀집 시
    if (nearbyEnemies.length >= 2) {
      const zoneSkill = this.findReadySkill('zone');
      if (zoneSkill) return { type: 'skill', skill: zoneSkill, target: this.char.id };
    }

    // 5) 방어 스킬 (HP 70% 이하)
    if (this.char.hp / this.char.stats.maxHP < 0.7) {
      const def = this.findReadySkill('defense');
      if (def) return { type: 'skill', skill: def, target: this.char.id };
    }

    return null;
  }

  // ═══════════════════════════════════════
  //  FARM — PvE 파밍 (몬스터 > 가디언 > 보스)
  // ═══════════════════════════════════════

  _scoreFarm(w, monsters, gatekeepers, bosses) {
    let score = 0;
    const myPower = (this.char.stats?.ATK || 0) + (this.char.stats?.DEF || 0);

    // 근처 몬스터가 있으면 파밍 우선
    const nearbyMobs = monsters.filter(e => this.getDistance(e) <= this.char.range * 3);
    if (nearbyMobs.length > 0) score = (w.attack + w.skill) * 0.7;

    // 가디언 = 벽 돌파 기회 → 높은 가산
    if (gatekeepers.length > 0) {
      const myEnhance = this._getEnhanceTotal();
      if (myEnhance >= 2) score = Math.max(score, (w.attack + w.skill) * 0.9);
    }

    // 보스 존재 → 최우선 (라스트히트 경쟁)
    if (bosses.length > 0) score = Math.max(score, (w.attack + w.skill) * 1.2);

    // 몬스터 없으면 0
    if (monsters.length === 0 && gatekeepers.length === 0 && bosses.length === 0) score = 0;

    return score;
  }

  _execFarm(monsters, gatekeepers, bosses) {
    const myPower = (this.char.stats?.ATK || 0) + (this.char.stats?.DEF || 0);

    // 1) 보스 최우선 (라스트히트)
    if (bosses.length > 0) {
      const boss = bosses[0];
      if (this.getDistance(boss) <= this.char.range) {
        return { type: 'attack', target: boss.id };
      }
      return { type: 'move', direction: 'toward', target: boss.id };
    }

    // 2) 가디언 (벽 돌파) — 강화 2+ 이상일 때
    if (gatekeepers.length > 0 && this._getEnhanceTotal() >= 2) {
      const gk = this.getNearestEnemy(gatekeepers);
      if (this.getDistance(gk) <= this.char.range) {
        return { type: 'attack', target: gk.id };
      }
      return { type: 'move', direction: 'toward', target: gk.id };
    }

    // 3) 안전한 몬스터 파밍
    const safeMobs = monsters.filter(e => {
      const ePower = (e.stats?.ATK || 0) + (e.stats?.DEF || 0);
      return ePower < myPower * 2;
    });

    if (safeMobs.length > 0) {
      const nearest = this.getNearestEnemy(safeMobs);
      if (this.getDistance(nearest) <= this.char.range) {
        return { type: 'attack', target: nearest.id };
      }
      return { type: 'move', direction: 'toward', target: nearest.id };
    }

    // 위험한 몬스터밖에 없으면 null → 다른 브랜치로
    return null;
  }

  // ═══════════════════════════════════════
  //  KITE — 원거리 거리 유지
  // ═══════════════════════════════════════

  _scoreKite(w, hpRatio, nearestDist, nearest) {
    if (!this.isRanged || !nearest) return 0;

    const idealDist = this.char.range * KITE_RATIO;
    let score = 0;

    // 적이 너무 가까우면 카이팅 급상승
    if (nearestDist < idealDist) {
      const urgency = 1 - (nearestDist / idealDist);
      score = (w.survive + w.attack) * 0.8 * (1 + urgency);
    }

    // 카이팅 대상이 플레이어면 더 적극적
    if (nearest && !nearest.isMonster && nearestDist < idealDist) score *= 1.3;
    if (hpRatio < 0.5) score *= 1.5;

    return score;
  }

  _execKite(enemies, nearest, nearestDist) {
    if (!nearest) return null;

    const idealDist = this.char.range * KITE_RATIO;
    if (nearestDist >= idealDist) return null;

    // 사거리 안이면 공격하면서 후퇴
    if (nearestDist <= this.char.range) {
      // 스킬 쓸 수 있으면 스킬
      const atkSkill = this.findReadySkill('attack', false);
      if (atkSkill) {
        const range = this._skillRange(atkSkill);
        const targets = enemies.filter(e => this.getDistance(e) <= range);
        if (targets.length > 0) {
          return { type: 'skill', skill: atkSkill, target: this.getWeakestEnemy(targets).id };
        }
      }
      // 기본 공격
      const inRange = enemies.filter(e => this.getDistance(e) <= this.char.range);
      if (inRange.length > 0) {
        return { type: 'attack', target: this.getWeakestEnemy(inRange).id };
      }
    }

    // 후퇴
    return { type: 'move', direction: 'away', target: nearest.id };
  }

  // ═══════════════════════════════════════
  //  PVP — 플레이어 교전 판단
  // ═══════════════════════════════════════

  _scorePvP(w, players, hpRatio) {
    if (players.length === 0) return 0;

    const stance = this.char.pvpStance || 'retaliate'; // 기본: 반격

    // 협력 모드: PvP 안 함 (공격당해도 플레이어 무시)
    if (stance === 'passive') return 0;

    // 반격 모드: 공격받은 적만 대상
    if (stance === 'retaliate') {
      const attackers = players.filter(e => this.char._attackedBy && this.char._attackedBy.has(e.id));
      if (attackers.length === 0) return 0;
      return w.attack * 0.8;
    }

    // 적대 모드: 기존 로직
    const myEnhance = this._getEnhanceTotal();
    const pvpReady = myEnhance >= 3 && hpRatio > 0.6;
    const pvpAggressive = myEnhance >= 6 && hpRatio > 0.4;

    let score = 0;
    if (pvpAggressive) score = w.attack * 1.0;
    else if (pvpReady) score = w.attack * 0.6;
    else score = w.attack * 0.1;

    const killers = players.filter(e => (e.chaos || 0) >= 30);
    if (killers.length > 0 && pvpReady) score *= 1.3;

    return score;
  }

  _execPvP(players) {
    if (players.length === 0) return null;

    const stance = this.char.pvpStance || 'retaliate';
    if (stance === 'passive') return null;

    const myPower = (this.char.stats?.ATK || 0) + (this.char.stats?.DEF || 0);
    const myHpRatio = this.char.hp / (this.char.stats?.maxHP || 1);
    const myEnhance = this._getEnhanceTotal();

    // 반격 모드: 공격해온 플레이어만 타겟
    if (stance === 'retaliate') {
      const attackers = players.filter(e => this.char._attackedBy && this.char._attackedBy.has(e.id));
      if (attackers.length === 0) return null;
      return this._attackTarget(attackers);
    }

    // 적대 모드: 기존 로직
    const pvpReady = myEnhance >= 3 && myHpRatio > 0.6;
    const pvpAggressive = myEnhance >= 6 && myHpRatio > 0.4;

    if (!pvpReady) {
      const nearest = this.getNearestEnemy(players);
      if (nearest && this.getDistance(nearest) < this.char.range * 2) {
        return { type: 'move', direction: 'away', target: nearest.id };
      }
      return null;
    }

    const evaluated = players.map(e => {
      const ePower = (e.stats?.ATK || 0) + (e.stats?.DEF || 0);
      const eHpRatio = (e.hp || 0) / (e.stats?.maxHP || 1);
      const eEnhance = e.enhancementLevels
        ? Object.values(e.enhancementLevels).reduce((a, b) => a + b, 0) : 0;
      const myScore = myPower + myEnhance * 5 + myHpRatio * 20;
      const eScore = ePower + eEnhance * 5 + eHpRatio * 20;
      return { ...e, winChance: myScore / (myScore + eScore + 1), eChaos: e.chaos || 0 };
    });

    const killers = evaluated.filter(e => e.eChaos >= 30);
    if (killers.length > 0 && Math.random() < 0.7) return this._attackTarget(killers);

    const weak = evaluated.filter(e => e.winChance > 0.6);
    if (pvpAggressive && weak.length > 0) return this._attackTarget(weak);

    const fightable = evaluated.filter(e => e.winChance > 0.4);
    if (fightable.length > 0) return this._attackTarget(fightable);

    return null;
  }

  // ═══════════════════════════════════════
  //  POSITION — 이동/적정거리 유지
  // ═══════════════════════════════════════

  _scorePosition(w, nearestDist, enemies) {
    if (enemies.length === 0) return 0;

    if (this.isRanged) {
      const idealDist = this.char.range * KITE_RATIO;
      const diff = Math.abs(nearestDist - idealDist);
      return (w.survive * 0.3 + w.attack * 0.3) * (diff / (idealDist || 1));
    }
    // 근접: 사거리 밖이면 접근 필요
    if (nearestDist > this.char.range) return w.attack * 0.8;
    return 0;
  }

  _execPosition(enemies, nearest, nearestDist) {
    if (!nearest) return null;

    if (this.isRanged) {
      const idealDist = this.char.range * KITE_RATIO;
      if (nearestDist < idealDist * 0.5) {
        return { type: 'move', direction: 'away', target: nearest.id };
      }
      if (nearestDist > this.char.range * 0.9) {
        return { type: 'move', direction: 'toward', target: nearest.id };
      }
    } else {
      if (nearestDist > this.char.range) {
        return { type: 'move', direction: 'toward', target: nearest.id };
      }
    }
    return null;
  }

  // ═══════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════

  /** 사거리 내 타겟풀에서 공격/접근 */
  _attackTarget(pool) {
    const inRange = pool.filter(e => this.getDistance(e) <= this.char.range);
    if (inRange.length > 0) {
      const boss = inRange.find(e => e.isBoss);
      if (boss) return { type: 'attack', target: boss.id };
      return { type: 'attack', target: this.getWeakestEnemy(inRange).id };
    }
    const nearest = this.getNearestEnemy(pool);
    return { type: 'move', direction: 'toward', target: nearest.id };
  }

  /** 스킬 사거리 계산 */
  _skillRange(skill) {
    if (skill.type === 'defense' || skill.type === 'buff' || skill.type === 'movement') return Infinity;
    if (skill.aoe) return 150;
    return Math.max(120, this.char.range);
  }

  /** 총 강화 레벨 */
  _getEnhanceTotal() {
    if (!this.char.enhancementLevels) return 0;
    return Object.values(this.char.enhancementLevels).reduce((a, b) => a + b, 0);
  }

  _findAnyReadySkill() {
    return this.char.skills.find(s => s.currentCooldown <= 0);
  }

  // ─── 기본 유틸리티 ───

  getEnemies() {
    const mySig = this.char.signalColor || 'none';
    return this.state.characters.filter(c => {
      if (c.team === this.char.team || !c.alive) return false;
      // 같은 시그널 색상 플레이어는 적으로 안 봄 (몬스터 제외)
      if (mySig !== 'none' && !c.isMonster && c.signalColor === mySig) return false;
      if (this.char._wallSide && c._wallSide) {
        for (let wi = 0; wi < this.char._wallSide.length; wi++) {
          const wallActive = this.state.wallBarriers && this.state.wallBarriers[wi]?.active;
          if (wallActive && this.char._wallSide[wi] !== c._wallSide[wi]) return false;
        }
      }
      return true;
    });
  }

  getNearbyEnemies(radius) {
    return this.getEnemies().filter(e => this.getDistance(e) <= radius);
  }

  getDistance(target) {
    const dx = this.char.x - target.x;
    const dy = this.char.y - target.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  getWeakestEnemy(enemies) {
    return enemies.reduce((min, e) => (e.hp < min.hp ? e : min), enemies[0]);
  }

  getNearestEnemy(enemies) {
    if (enemies.length === 0) return null;
    // 도발(taunt) 대상 우선
    const taunters = enemies.filter(e => e.buffs && e.buffs.some(b => b.type === 'taunt'));
    if (taunters.length > 0) {
      return taunters.reduce(
        (min, e) => (this.getDistance(e) < this.getDistance(min) ? e : min),
        taunters[0]
      );
    }
    return enemies.reduce(
      (min, e) => (this.getDistance(e) < this.getDistance(min) ? e : min),
      enemies[0]
    );
  }

  findReadySkill(type, aoe = null) {
    return this.char.skills.find(s => {
      if (s.currentCooldown > 0) return false;
      if (type && s.type !== type) return false;
      if (aoe !== null && !!s.aoe !== aoe) return false;
      return true;
    });
  }
}

module.exports = { BehaviorTree };
