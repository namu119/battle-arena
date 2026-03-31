# 오토배틀 게임플레이 대규모 개선 — 설계 문서

> 목표: 기존 PvP Only 아레나를 **배틀로얄 + PvE/PvP 동시 진행** 방식으로 전환
> 범위: 설계만 (구현은 별도 진행)
> 작성일: 2026-03-30

---

## 1. 게임 개요

### 1.1 한 줄 요약
4~8인 배틀로얄. 오픈 필드에서 몹 파밍(PvE)과 플레이어 전투(PvP)가 동시에 진행되며, **최후 1인/1팀 생존** 시 승리. **매치 시간 5분 이내.**

### 1.2 핵심 루프
```
빌드 작성 → 필드 입장 → 몹 파밍(골드) → 장비 구매 / 스킬 업그레이드
                ↕                    ↕
          플레이어 PvP ←→ 보스 등장(드랍 경쟁)
                ↓
        자기장 축소 → 강제 조우 → 최후 생존자 승리
```

### 1.3 현재 시스템과의 차이

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 게임 모드 | PvP Only, 최대 5인 | 배틀로얄 PvE+PvP, 4~8인 |
| 맵 | 800×400 고정 아레나 | 확장 오픈 필드 + 자기장 |
| 몹 | 없음 | 일반몹 + 보스몹 |
| 승리 조건 | 최후 생존 or HP비율 (300틱) | 최후 생존 (5분 제한) |
| AI 행동 | 3분기(survive/skill/attack) | + 카이팅/위협도 판단 |
| 사거리 | 병과별 고정 | 스킬별 개별 사거리 + 최적거리 배율 |
| 성장 | 빌드 시 1000G 고정 | 빌드 + 인게임 골드 → 장비/스킬 성장 |
| 보상 | 순위별 고정 골드 | 몹 킬 골드 + 보스 드랍 |

---

## 2. 매치 구조

### 2.1 매치 흐름

```
[로비] → [빌드 작성] → [필드 입장] → [파밍+전투] → [결과]
         (기존 유지)     0:00          0:00~5:00     5:00
```

### 2.2 타임라인 (5분 = 300초 = 1500틱 @200ms)

| 시간 | 틱 | 이벤트 |
|------|-----|--------|
| 0:00 | 0 | 필드 입장, 플레이어 랜덤 스폰 |
| 0:00 | 0 | 일반몹 1차 웨이브 스폰 |
| 0:30 | 150 | 자기장 1차 축소 예고 |
| 1:00 | 300 | 자기장 1차 축소 시작 |
| 1:30 | 450 | 일반몹 2차 웨이브 + **보스 1차 등장** |
| 2:00 | 600 | 자기장 2차 축소 |
| 2:30 | 750 | 일반몹 3차 웨이브 |
| 3:00 | 900 | 자기장 3차 축소 + **보스 2차 등장** |
| 3:30 | 1050 | 자기장 4차 축소 (필드 매우 좁음) |
| 4:00 | 1200 | **최종 축소** — 극소 영역 강제 전투 |
| 5:00 | 1500 | 타임아웃 — 생존자 중 HP비율 최고자 승리 |

### 2.3 자기장 (Storm Zone)

```javascript
// 설계 파라미터
stormZone: {
  mapSize: { width: 1600, height: 800 },     // 현재 800×400의 2배
  initialSafeRadius: 700,                      // 초기 안전 반경
  shrinkPhases: [
    { startTick: 300,  endTick: 450,  targetRadius: 500 },
    { startTick: 600,  endTick: 750,  targetRadius: 350 },
    { startTick: 900,  endTick: 1050, targetRadius: 200 },
    { startTick: 1050, endTick: 1200, targetRadius: 80  },
  ],
  damagePerTick: 5,          // 자기장 밖 틱당 데미지
  center: "random"           // 매치마다 랜덤 중심점
}
```

---

## 3. PvE 시스템

### 3.1 몹 구조

#### 3.1.1 일반몹 (Normal Mobs)

```javascript
// 일반몹 타입 예시
normalMobs: [
  {
    id: "slime",
    hp: 80, atk: 5, def: 3, spd: 2,
    range: 30,
    goldReward: 30,
    behavior: "passive"       // 피격 시에만 반격
  },
  {
    id: "goblin",
    hp: 120, atk: 8, def: 5, spd: 4,
    range: 50,
    goldReward: 50,
    behavior: "aggressive"    // 범위 내 플레이어 공격
  },
  {
    id: "skeleton_archer",
    hp: 100, atk: 10, def: 3, spd: 3,
    range: 200,
    goldReward: 60,
    behavior: "aggressive"
  }
]
```

- **보상 규칙:** 가장 많은 데미지를 입힌 플레이어가 골드 획득
- **데미지 추적:** 몹별로 `damageMap: { playerId: totalDamage }` 관리
- **웨이브:** 30초마다 새 웨이브 스폰, 웨이브마다 몹 수/강도 증가

#### 3.1.2 보스몹 (Boss Mobs)

```javascript
boss: {
  id: "dragon",
  hp: 800, atk: 25, def: 15, spd: 3,
  range: 120,
  skills: [
    { name: "화염브레스", type: "attack", aoe: true, radius: 200, damage: 50, cooldown: 15 },
    { name: "꼬리치기", type: "attack", aoe: true, radius: 100, damage: 30, cooldown: 8 }
  ],
  drops: {
    gold: 200,
    equipment: "rare_random"     // 희귀 장비 드랍 가능
  },
  spawnAnnounce: true,           // 등장 시 전체 알림
  behavior: "boss"               // 가장 가까운 플레이어 공격 + 스킬 사용
}
```

- **드랍 규칙:** 라스트히트(마지막 타격)를 넣은 플레이어가 드랍 획득
- **라스트히트 추적:** `lastHitPlayerId` 기록
- **전략적 의미:** DPS가 높아도 막타를 뺏길 수 있음 → 타이밍 싸움

### 3.2 몹 AI (간단)

```
몹 BT:
├── idle: 범위 내 적 없으면 대기 (passive) 또는 순찰 (aggressive)
├── attack: 범위 내 가장 가까운 플레이어 공격
├── skill: 보스만 — 쿨다운 끝난 스킬 사용 (AoE 우선)
└── retreat: 없음 (몹은 도주하지 않음)
```

---

## 4. AI 행동 시스템 (BT 확장)

### 4.1 2레이어 아키텍처

```
Layer 1: 병과 성향 (Class Disposition)
  → 기본 행동 패턴 결정 (공격적/방어적/카이팅)

Layer 2: 위협도 판단 (Threat Assessment)
  → 실시간 상황에 따라 행동 수정
```

### 4.2 Layer 1 — 병과별 기본 행동

| 병과 | 기본 성향 | 이동 패턴 | 우선 타겟 |
|------|-----------|-----------|-----------|
| **전사** | 돌진 | 가장 가까운 적에게 직진 | 근접 범위 내 가장 약한 적 |
| **마법사** | 중거리 유지 | 최적 거리(150~200px) 유지 | AoE로 다수 타격 가능 위치 |
| **도적** | 기습 | 은밀 접근 → 약한 적 암살 | HP 가장 낮은 적 |
| **기사** | 전진 방어 | 아군 앞에서 탱킹 | 아군 위협하는 적 |
| **궁수** | 카이팅 | 최대 사거리 유지하며 후퇴 | 가장 가까운 적 (거리 유지) |

### 4.3 Layer 2 — 위협도 계산

```javascript
// 위협도 계산 공식
function calculateThreat(self, entity) {
  let threat = 0;

  // 거리 기반 (가까울수록 위협)
  const dist = distance(self, entity);
  const maxRange = self.classData.range;
  threat += Math.max(0, 1 - dist / (maxRange * 2)) * 30;

  // 상대 공격력 기반
  threat += (entity.atk / self.maxHP) * 20;

  // 상대 HP 기반 (체력 높을수록 위협)
  threat += (entity.hp / entity.maxHP) * 15;

  // 상대 병과 상성
  threat += getClassMatchup(self.classId, entity.classId) * 20;

  // 주변 적 밀집도
  const nearbyEnemies = countNearby(self, 200);
  threat += nearbyEnemies * 15;

  return threat;
}

// 병과 상성 보정 (-1.0 ~ +1.0)
classMatchup: {
  warrior_vs_archer: +0.5,    // 전사는 궁수에게 유리 (접근하면 강함)
  warrior_vs_mage: +0.3,      // 전사는 마법사에게 약간 유리
  archer_vs_mage: +0.3,       // 궁수는 마법사에게 약간 유리
  rogue_vs_mage: +0.7,        // 도적은 마법사에게 매우 유리
  knight_vs_rogue: +0.5,      // 기사는 도적에게 유리
  // ... 역방향은 부호 반전
}
```

### 4.4 위협도에 따른 행동 수정

```javascript
// 총 위협도 임계값
const totalThreat = sumThreats(nearbyEntities);

if (totalThreat > HIGH_THREAT) {
  // 고위협: 병과 성향 무시하고 회피 우선
  action = "retreat_to_safe_direction";
} else if (totalThreat > MEDIUM_THREAT) {
  // 중위협: 병과 성향 + 방어적 보정
  // 궁수/마법사: 카이팅 강화
  // 전사/기사: 방어 스킬 우선
  // 도적: 이탈 후 재진입 타이밍 대기
  action = applyDefensiveModifier(classDisposition);
} else {
  // 저위협: 병과 성향 그대로 실행
  action = classDisposition.defaultAction;
}
```

### 4.5 확장된 BT 구조

```
evaluate()
├── [1] survive (기존 유지 + 위협도 통합)
│   ├── HP < 30%: 후퇴 + 방어스킬
│   ├── 위협도 HIGH: 안전 방향 이동
│   └── 자기장 접근 시: 안전 영역으로 이동 ← NEW
│
├── [2] skill (기존 + 거리 최적화)
│   ├── AoE 스킬: 3+ 적 밀집 시 (마법사 우선)
│   ├── 단일 스킬: 최적 거리 내 가장 약한 적
│   └── 버프 스킬: 전투 진입 전
│
├── [3] attack (기존 + 타겟 우선순위 변경)
│   ├── 보스 막타 가능 시: 보스 공격 ← NEW
│   ├── 범위 내 적: 가장 약한 적 공격
│   └── 범위 밖: 병과 성향에 따라 이동
│
├── [4] farm (신규)  ← NEW
│   ├── 근처 몹 있으면: 몹 공격 (골드 파밍)
│   ├── 보스 스폰 시: 보스 방향 이동
│   └── 몹 없으면: 몹 스폰 지역으로 이동
│
└── [5] position (신규)  ← NEW
    ├── 카이팅: 최적 거리 유지 (병과별)
    ├── 자기장 회피: 안전 영역 이동
    └── 전략적 위치: 고지대/유리 위치 선점
```

---

## 5. 스킬 거리 시스템

### 5.1 스킬별 개별 사거리

현재 스킬에는 사거리가 없고 병과의 `range`를 사용합니다. 변경 후 **각 스킬에 독립적인 range와 optimalRange**를 부여합니다.

```javascript
// 스킬 데이터 확장 예시
skill: {
  name: "강타",
  type: "attack",
  damage: 40,
  cooldown: 8,
  // NEW 필드
  range: 80,              // 최대 사거리 (이 안에서만 사용 가능)
  optimalRange: 50,       // 최적 거리 (여기서 100% 데미지)
  falloffType: "linear"   // 거리에 따른 데미지 감소 방식
}
```

### 5.2 거리 데미지 배율

```javascript
function getRangeMultiplier(skill, actualDistance) {
  if (actualDistance > skill.range) return 0;  // 사거리 밖 = 사용 불가

  const deviation = Math.abs(actualDistance - skill.optimalRange);
  const maxDeviation = skill.range - skill.optimalRange;

  if (maxDeviation === 0) return 1.0;

  switch (skill.falloffType) {
    case "linear":
      // 최적거리에서 1.0, 최대거리에서 0.5
      return 1.0 - (deviation / maxDeviation) * 0.5;

    case "sharp":
      // 최적거리 근처에서만 높은 배율
      return 0.5 + 0.5 * Math.pow(1 - deviation / maxDeviation, 2);

    case "flat":
      // 사거리 내면 일정 배율
      return 0.85;

    default:
      return 1.0;
  }
}
```

### 5.3 병과별 스킬 사거리 설계 방향

| 병과 | 스킬 사거리 특성 | 최적 거리 | falloff |
|------|-----------------|-----------|---------|
| **전사** | 근접 (40~80px) | 50px | sharp — 붙어야 강함 |
| **마법사** | 중~원거리 (100~250px) + AoE | 150px | linear — 넓은 유효 범위 |
| **도적** | 초근접 (20~60px) | 30px | sharp — 밀착 시 폭발력 |
| **기사** | 근접 (40~100px) | 60px | flat — 안정적 |
| **궁수** | 원거리 (150~300px) | 250px | linear — 멀수록 강함 |

### 5.4 마법사 AoE 특화

```javascript
// 마법사 AoE 스킬 예시
mageSkills: [
  {
    name: "마력폭발",       // 기존 스킬 확장
    type: "attack",
    aoe: true,
    radius: 150,            // 기존 고정값 유지
    range: 250,
    optimalRange: 180,
    damage: 35,
    falloffType: "linear"
  },
  {
    name: "블리자드",       // 신규 스킬 예시
    type: "attack",
    aoe: true,
    radius: 200,            // 더 넓은 범위
    range: 300,
    optimalRange: 200,
    damage: 25,             // 넓은 대신 데미지 낮음
    cooldown: 15,
    falloffType: "flat",
    slow: { duration: 5, speedReduction: 0.5 }  // 이동속도 감소 효과
  }
]
```

**마법사 역할:**
- 일반몹 웨이브 정리 최적 (넓은 AoE)
- 보스전에서 잡몹 정리 담당
- PvP에서 밀집 지역 견제
- 자기장 축소 후반에 극강 (좁은 필드 + 넓은 AoE)

---

## 6. 인게임 성장 시스템

### 6.1 골드 경제

```javascript
economy: {
  // 초기 빌드
  initialGold: 1000,        // 기존 유지 — 빌드 시 장비 구매

  // 인게임 골드 획득
  normalMobKill: 30~60,     // 일반몹 (DPS 기반)
  bossKill: 200,            // 보스 (라스트히트)
  playerKill: 100,          // 플레이어 킬
  passiveIncome: 5,         // 30초마다 자동 지급

  // 사망 시 골드 드랍
  deathGoldDrop: 0.3        // 보유 골드의 30% 드랍 (킬러 획득)
}
```

### 6.2 인게임 상점

매치 중 언제든 상점 이용 가능 (UI 열면 캐릭터는 정지).

#### 6.2.1 장비 업그레이드

```javascript
// 인게임 장비 티어
equipmentTiers: {
  // 기존 장비 = Tier 1 (빌드 시 구매)
  tier1: { costRange: [100, 250] },   // 기존 가격

  // Tier 2 — 인게임에서 업그레이드
  tier2: {
    upgradeCost: 200,
    statMultiplier: 1.4,              // Tier 1 대비 스탯 40% 증가
    skillEnhanced: true               // 스킬 데미지/효과 강화
  },

  // Tier 3 — 후반 최종 장비
  tier3: {
    upgradeCost: 400,
    statMultiplier: 1.8,
    skillEnhanced: true,
    bonusEffect: true                 // 추가 특수효과 해금
  }
}
```

#### 6.2.2 스킬 업그레이드

```javascript
// 스킬 레벨업
skillUpgrade: {
  maxLevel: 3,
  costs: [0, 150, 300],              // Lv1 무료(기본), Lv2 150G, Lv3 300G

  // 레벨업 효과
  perLevel: {
    damageIncrease: 0.25,            // 레벨당 데미지 +25%
    cooldownReduction: 1,            // 레벨당 쿨다운 -1틱
    rangeIncrease: 0.1,              // 레벨당 사거리 +10%
    // AoE 스킬 추가
    radiusIncrease: 0.15             // 레벨당 AoE 반경 +15%
  }
}
```

### 6.3 성장 전략 예시

| 전략 | 골드 배분 | 장점 | 단점 |
|------|----------|------|------|
| 장비 올인 | 장비 Tier3 우선 | 기본 스탯 극대화 | 스킬 약함 |
| 스킬 올인 | 스킬 Lv3 우선 | 스킬 폭발력 | 기본 스탯 낮음 |
| 균형 배분 | 장비 Tier2 + 스킬 Lv2 | 안정적 | 특출난 게 없음 |
| 파밍 특화 | 최소 투자, 골드 축적 | 후반 폭발 성장 | 초중반 약함 |

---

## 7. 보스 시스템 상세

### 7.1 보스 스폰

```javascript
bossSpawn: {
  phases: [
    { tick: 450,  bossId: "stone_golem",  location: "map_center" },
    { tick: 900,  bossId: "dragon",       location: "map_center" },
  ],
  announceBeforeTicks: 50,   // 등장 5초 전 전체 알림
  spawnEffect: true          // 등장 시 주변 밀어내기
}
```

### 7.2 보스 목록

| 보스 | HP | ATK | DEF | 스킬 | 드랍 |
|------|-----|-----|-----|------|------|
| **스톤 골렘** (1차) | 500 | 15 | 20 | 지진(AoE), 돌던지기(원거리) | 200G + 랜덤 Tier2 장비 |
| **드래곤** (2차) | 800 | 25 | 15 | 화염브레스(AoE), 꼬리치기(근접) | 300G + 랜덤 Tier3 장비 |

### 7.3 라스트히트 시스템

```javascript
// 보스 데미지 추적
boss.damageLog = {
  // DPS 기여도 (일반몹 보상용으로도 사용)
  damageMap: { player1: 250, player2: 180, player3: 120 },

  // 라스트히트 추적 (보스 전용)
  lastHitPlayerId: null,

  onDamage(playerId, damage) {
    this.damageMap[playerId] = (this.damageMap[playerId] || 0) + damage;
    this.lastHitPlayerId = playerId;
  },

  onDeath() {
    // 보스: 라스트히트 플레이어가 드랍 획득
    return {
      dropReceiver: this.lastHitPlayerId,
      gold: this.drops.gold,
      equipment: this.drops.equipment
    };
  }
}
```

### 7.4 보스전 전략적 의미

- **DPS 딜러(전사/도적):** 보스에 데미지 누적 → 막타 타이밍 노림
- **마법사:** AoE로 보스 주변 일반몹 정리 + 보스 체력 깎기
- **궁수:** 안전 거리에서 지속 딜 → 막타 스틸 가능
- **기사:** 보스 어그로 유지 → 아군 보호
- **PvP 견제:** 보스전 중 다른 플레이어 공격하여 막타 방해 가능

---

## 8. 맵 시스템

### 8.1 맵 크기

```javascript
map: {
  width: 1600,
  height: 800,
  // 기존 800×400의 4배 면적
}
```

### 8.2 스폰 위치

```javascript
spawnPoints: {
  players: "edge_random",        // 맵 가장자리 랜덤 배치
  normalMobs: "scattered",       // 맵 전체에 분산 스폰
  boss: "center",                // 맵 중앙에 등장
  shop: "player_local"           // 플레이어 위치에서 UI로 접근
}
```

### 8.3 자기장 밖 처리

```javascript
stormDamage: {
  damagePerTick: 5,
  scaling: true,                 // 시간 경과에 따라 데미지 증가
  scaleFactor: [5, 8, 12, 20],  // 1~4차 축소별 틱당 데미지
}
```

---

## 9. 수정 대상 파일 목록

### 9.1 기존 파일 수정

| 파일 | 변경 내용 |
|------|-----------|
| `server/BattleEngine.js` | 맵 확장, 자기장, 몹 스폰/관리, 보스 시스템, 데미지 배율 |
| `shared/BehaviorTree.js` | 2레이어 AI (병과 성향 + 위협도), farm/position 분기 추가 |
| `shared/CharacterBuilder.js` | 인게임 성장 메서드 추가 (upgradeEquipment, upgradeSkill) |
| `data/classes.json` | 병과별 성향/위협도 파라미터 추가, 사거리 분리 |
| `data/equipments.json` | Tier 2/3 장비 추가, 스킬에 range/optimalRange 추가 |
| `server/index.js` | 매치 타이머, 인게임 상점 이벤트, 보스 알림 |
| `server/Reward.js` | 몹 킬 보상, 보스 드랍, 플레이어 킬 보상 |
| `client/index.html` | 맵 확장 렌더링, 자기장 UI, 인게임 상점 UI, 미니맵 |

### 9.2 신규 파일

| 파일 | 용도 |
|------|------|
| `data/mobs.json` | 일반몹 + 보스 데이터 |
| `data/skill_upgrades.json` | 스킬 레벨별 데이터 |
| `data/equipment_tiers.json` | 장비 티어별 업그레이드 데이터 |
| `server/MobManager.js` | 몹 스폰, AI, 데미지 추적, 보상 분배 |
| `server/StormZone.js` | 자기장 축소 로직 |
| `server/InGameShop.js` | 인게임 상점 로직 |
| `shared/ThreatSystem.js` | 위협도 계산 모듈 |
| `shared/RangeSystem.js` | 스킬 거리/배율 계산 모듈 |

---

## 10. 구현 우선순위 (권장)

```
Phase 1: 코어 전투 확장
  ├── 스킬 거리 시스템 (RangeSystem)
  ├── 맵 확장 + 자기장 (StormZone)
  └── BT 카이팅/위협도 (ThreatSystem)

Phase 2: PvE 시스템
  ├── 몹 데이터 + 스폰 (MobManager)
  ├── 일반몹 AI + DPS 보상
  └── 보스 시스템 + 라스트히트

Phase 3: 성장 시스템
  ├── 인게임 골드 경제
  ├── 장비 티어 업그레이드 (InGameShop)
  └── 스킬 레벨업

Phase 4: 통합 + 밸런싱
  ├── 매치 타임라인 통합
  ├── 클라이언트 UI 확장
  └── 수치 밸런싱 + 테스트
```

---

## 부록 A: 용어 정리

| 용어 | 설명 |
|------|------|
| BT | Behavior Tree — AI 의사결정 트리 |
| DPS | Damage Per Second — 초당 데미지 |
| AoE | Area of Effect — 범위 효과 |
| 라스트히트 | 마지막 타격 — 보스 드랍권 결정 기준 |
| 카이팅 | 거리를 유지하며 공격하는 기법 |
| 위협도 | 주변 위험 수준 종합 수치 |
| 자기장 | 배틀로얄 필드 축소 메커니즘 |
| 최적거리 | 스킬 데미지가 100%인 거리 |
| falloff | 최적거리에서 벗어날 때 데미지 감소 방식 |
