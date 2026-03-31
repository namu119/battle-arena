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

    const myPower = (this.char.stats?.ATK || 0) + (this.char.stats?.DEF || 0);
    const myHpRatio = this.char.hp / (this.char.stats?.maxHP || 1);
    const myEnhance = this.char.enhancementLevels
      ? Object.values(this.char.enhancementLevels).reduce((a, b) => a + b, 0) : 0;

    const monsters = enemies.filter(e => e.isMonster && !e.isBoss);
    const bosses = enemies.filter(e => e.isBoss);
    const players = enemies.filter(e => !e.isMonster);

    // 안전한 몬스터: 전투력 2배 미만
    const safeMonsters = monsters.filter(e => {
      const ePower = (e.stats?.ATK || 0) + (e.stats?.DEF || 0);
      return ePower < myPower * 2;
    });

    // ─── 전략 판단: PvP 준비가 됐는가? ───
    // 강화 3레벨 이상 + HP 60% 이상이면 PvP 준비 완료
    const pvpReady = myEnhance >= 3 && myHpRatio > 0.6;
    // 강화 6레벨 이상이면 적극적 PvP
    const pvpAggressive = myEnhance >= 6 && myHpRatio > 0.4;

    // 플레이어 위협 평가
    const evaluatedPlayers = players.map(e => {
      const ePower = (e.stats?.ATK || 0) + (e.stats?.DEF || 0);
      const eHpRatio = (e.hp || 0) / (e.stats?.maxHP || 1);
      const eEnhance = e.enhancementLevels
        ? Object.values(e.enhancementLevels).reduce((a, b) => a + b, 0) : 0;
      const eChaos = e.chaos || 0;
      // 전투력 점수: 스탯 + 강화 + HP비율
      const myScore = myPower + myEnhance * 5 + myHpRatio * 20;
      const eScore = ePower + eEnhance * 5 + eHpRatio * 20;
      const winChance = myScore / (myScore + eScore + 1);
      return { ...e, winChance, eChaos, eScore };
    });

    // 싸울만한 플레이어: 승률 40% 이상
    const fightablePlayers = evaluatedPlayers.filter(e => e.winChance > 0.4);
    // 약한 플레이어: 승률 60% 이상 (확실한 킬)
    const weakPlayers = evaluatedPlayers.filter(e => e.winChance > 0.6);
    // 킬러 견제
    const killers = evaluatedPlayers.filter(e => e.eChaos >= 30);

    // ─── 행동 우선순위 ───
    const nearbyMonsters = safeMonsters.filter(e => this.getDistance(e) <= this.char.range * 3);
    let targetPool = null;
    let action = null;

    // 1) 근처 몬스터가 있으면 항상 파밍 (최우선)
    if (nearbyMonsters.length > 0) {
      targetPool = nearbyMonsters;
    }
    // 2) 보스 존재 → 보스 공격 (라스트히트)
    else if (bosses.length > 0) {
      targetPool = bosses;
    }
    // 3) PvP 미준비 + 먼 몬스터 있음 → 몬스터 찾아 이동
    else if (!pvpReady && safeMonsters.length > 0) {
      targetPool = safeMonsters;
    }
    // 4) PvP 미준비 + 몬스터 없음 → 후퇴 (스폰쪽으로 대기)
    else if (!pvpReady && players.length > 0) {
      action = { type: 'move', direction: 'retreat' };
    }
    // 5) PvP 준비됨 + 킬러 있음 → 견제 (70%)
    else if (pvpReady && killers.length > 0 && Math.random() < 0.7) {
      targetPool = killers;
    }
    // 6) PvP 적극적 + 약한 적 → 확실한 킬
    else if (pvpAggressive && weakPlayers.length > 0) {
      targetPool = weakPlayers;
    }
    // 7) PvP 준비됨 + 싸울만한 적 → 조심스럽게 교전
    else if (pvpReady && fightablePlayers.length > 0) {
      targetPool = fightablePlayers;
    }
    // 8) HP 낮으면 후퇴
    else if (myHpRatio < 0.3 && players.length > 0) {
      action = { type: 'move', direction: 'retreat' };
    }
    // 9) 아무것도 없으면 대기
    else {
      targetPool = enemies.length > 0 ? enemies : null;
    }

    if (action) return action;
    if (!targetPool || targetPool.length === 0) return null;

    const inRange = targetPool.filter(e => this.getDistance(e) <= this.char.range);
    if (inRange.length > 0) {
      const boss = inRange.find(e => e.isBoss);
      if (boss) return { type: 'attack', target: boss.id };
      const target = this.getWeakestEnemy(inRange);
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
