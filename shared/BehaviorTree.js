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

    // 위협 평가 + PvE 우선
    const myPower = (this.char.stats?.ATK || 0) + (this.char.stats?.DEF || 0);
    const monsters = enemies.filter(e => e.isMonster && !e.isBoss);
    const bosses = enemies.filter(e => e.isBoss);
    const players = enemies.filter(e => !e.isMonster);

    // 안전한 적: 전투력 2배 미만
    const safeMonsters = monsters.filter(e => {
      const ePower = (e.stats?.ATK || 0) + (e.stats?.DEF || 0);
      return ePower < myPower * 2;
    });
    const dangerousMonsters = monsters.filter(e => {
      const ePower = (e.stats?.ATK || 0) + (e.stats?.DEF || 0);
      return ePower >= myPower * 2;
    });

    // 카오스 기반 PvP 판단
    const myChaos = this.char.chaos || 0;
    const myHpRatio = this.char.hp / (this.char.stats?.maxHP || 1);

    // 플레이어 필터: 강한 적 회피, 약한 적 공격
    const filteredPlayers = players.filter(e => {
      const ePower = (e.stats?.ATK || 0) + (e.stats?.DEF || 0);
      const eHpRatio = (e.hp || 0) / (e.stats?.maxHP || 1);
      // 상대가 훨씬 강하면 70% 확률로 회피
      if (ePower > myPower * 1.5 && Math.random() < 0.7) return false;
      // 내 HP 낮고 상대 HP 높으면 60% 확률로 회피
      if (eHpRatio > 0.7 && myHpRatio < 0.4 && Math.random() < 0.6) return false;
      return true;
    });

    // 킬러 견제: 카오스 30+ = 1킬러, 60+ = 학살자
    const killers = filteredPlayers.filter(e => (e.chaos || 0) >= 30);

    // 우선순위: 몬스터 파밍 → 보스 → 킬러 견제 → 먼 몬스터 → 약한 플레이어
    const nearbyMonsters = safeMonsters.filter(e => this.getDistance(e) <= this.char.range * 3);
    let targetPool;
    if (nearbyMonsters.length > 0) {
      targetPool = nearbyMonsters;
    } else if (bosses.length > 0) {
      targetPool = bosses;
    } else if (killers.length > 0 && Math.random() < 0.6) {
      targetPool = killers; // 60% 확률로 킬러 집중 공격
    } else if (safeMonsters.length > 0) {
      targetPool = safeMonsters;
    } else if (filteredPlayers.length > 0) {
      targetPool = filteredPlayers;
    } else {
      targetPool = enemies.length > 0 ? enemies : [];
    }

    if (targetPool.length === 0) return null;

    const inRange = targetPool.filter(e => this.getDistance(e) <= this.char.range);
    if (inRange.length > 0) {
      const boss = inRange.find(e => e.isBoss);
      if (boss) return { type: 'attack', target: boss.id };
      const killer = inRange.find(e => (e.chaos || 0) >= 30);
      const target = killer || this.getWeakestEnemy(inRange);
      return { type: 'attack', target: target.id };
    }

    const nearest = this.getNearestEnemy(targetPool);
    return { type: 'move', direction: 'toward', target: nearest.id };
  }

  // ─── 유틸리티 ───

  getEnemies() {
    return this.state.characters.filter(c => {
      if (c.team === this.char.team || !c.alive) return false;
      // 벽 차단: 활성 벽 사이에 있는 적은 타겟 불가
      if (this.char._wallSide && c._wallSide) {
        for (let wi = 0; wi < this.char._wallSide.length; wi++) {
          // 벽이 활성화 상태이고 서로 다른 쪽에 있으면 제외
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
