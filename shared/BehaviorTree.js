/**
 * BehaviorTree - 가중치 기반 행동 결정
 *
 * 매 틱마다:
 *  1. 각 행동 브랜치의 가중치 + 상황 보정 계산
 *  2. 가중치 높은 순으로 실행 시도
 *  3. 조건 충족 시 해당 행동 실행
 */

class BehaviorTree {
  constructor(character, battleState) {
    this.char = character;
    this.state = battleState;
  }

  /** 매 틱 호출 - 행동 결정 */
  evaluate() {
    const branches = this.scoreBranches();

    // 가중치 높은 순 정렬
    branches.sort((a, b) => b.score - a.score);

    // 순서대로 실행 시도
    for (const branch of branches) {
      const action = branch.execute();
      if (action) return action;
    }

    // 폴백: 적 없으면 제자리 대기 (구석 박힘/중앙 몰림 방지)
    return { type: 'idle' };
  }

  /** 각 브랜치 점수 계산 */
  scoreBranches() {
    const w = this.char.btWeights;
    const hpRatio = this.char.hp / this.char.stats.maxHP;
    const enemies = this.getEnemies();
    const nearbyEnemies = this.getNearbyEnemies(150);

    return [
      {
        name: 'survive',
        score: this.scoreSurvive(w.survive, hpRatio),
        execute: () => this.executeSurvive(hpRatio),
      },
      {
        name: 'skill',
        score: this.scoreSkill(w.skill, hpRatio, nearbyEnemies),
        execute: () => this.executeSkill(enemies, nearbyEnemies),
      },
      {
        name: 'attack',
        score: this.scoreAttack(w.attack, hpRatio, enemies),
        execute: () => this.executeAttack(enemies),
      },
    ];
  }

  // ─── 생존 브랜치 ───

  scoreSurvive(base, hpRatio) {
    // HP 낮을수록 생존 가중치 급상승
    if (hpRatio < 0.3) return base * 3;
    if (hpRatio < 0.5) return base * 1.5;
    return base * 0.5;
  }

  executeSurvive(hpRatio) {
    // 방어 스킬 있으면 사용
    if (hpRatio < 0.5) {
      const defSkill = this.findReadySkill('defense');
      if (defSkill) {
        return { type: 'skill', skill: defSkill, target: this.char.id };
      }
    }

    // HP 30% 이하면 후퇴
    if (hpRatio < 0.3) {
      return { type: 'move', direction: 'retreat' };
    }

    return null; // 생존 행동 불필요
  }

  // ─── 스킬 브랜치 ───

  scoreSkill(base, hpRatio, nearbyEnemies) {
    let score = base;
    // 적이 밀집해 있으면 범위 스킬 가산
    if (nearbyEnemies.length >= 3) score *= 1.5;
    // HP 너무 낮으면 스킬보다 생존
    if (hpRatio < 0.2) score *= 0.3;
    return score;
  }

  executeSkill(enemies, nearbyEnemies) {
    // 범위 스킬: 적 3명 이상 모여있을 때
    if (nearbyEnemies.length >= 3) {
      const aoeSkill = this.findReadySkill('attack', true);
      if (aoeSkill) {
        return { type: 'skill', skill: aoeSkill, target: nearbyEnemies[0].id };
      }
    }

    // 단일 스킬: 가장 약한 적
    const attackSkill = this.findReadySkill('attack', false);
    if (attackSkill && enemies.length > 0) {
      const weakest = this.getWeakestEnemy(enemies);
      return { type: 'skill', skill: attackSkill, target: weakest.id };
    }

    // 버프 스킬
    const buffSkill = this.findReadySkill('buff');
    if (buffSkill) {
      return { type: 'skill', skill: buffSkill, target: this.char.id };
    }

    return null;
  }

  // ─── 공격 브랜치 ───

  scoreAttack(base, hpRatio, enemies) {
    let score = base;
    // 적이 사거리 안에 있으면 가산
    const inRange = enemies.filter(e => this.getDistance(e) <= this.char.range);
    if (inRange.length > 0) score *= 1.3;
    return score;
  }

  executeAttack(enemies) {
    if (enemies.length === 0) return null;

    const inRange = enemies.filter(e => this.getDistance(e) <= this.char.range);

    if (inRange.length > 0) {
      // 사거리 안 가장 약한 적 기본공격
      const target = this.getWeakestEnemy(inRange);
      return { type: 'attack', target: target.id };
    }

    // 사거리 밖이면 가장 가까운 적에게 이동
    const nearest = this.getNearestEnemy(enemies);
    return { type: 'move', direction: 'toward', target: nearest.id };
  }

  // ─── 유틸리티 ───

  getEnemies() {
    return this.state.characters.filter(
      c => c.team !== this.char.team && c.alive
        && (this.char.zoneId == null || c.zoneId == null || c.zoneId === this.char.zoneId)
    );
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
