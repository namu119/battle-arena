/**
 * Survival Arena 통합 테스트
 * node test-survival.js
 */
const { SurvivalArena } = require('./server/SurvivalArena');
const { BattleEngine } = require('./server/BattleEngine');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

// ─── Test Builds ───
function makeBuilds() {
  const classes = [
    { name:'전사', hp:500, atk:15, def:10, spd:5, range:60, btW:{survive:20,skill:30,attack:50}, passive:{trigger:'hp_below',threshold:0.3,effect:{atkMul:1.25}} },
    { name:'마법사', hp:320, atk:9, def:6, spd:4, range:200, btW:{survive:30,skill:60,attack:10}, passive:{trigger:'on_skill_use',effect:{cooldownReduction:0.2}} },
    { name:'도적', hp:380, atk:13, def:7, spd:9, range:50, btW:{survive:10,skill:40,attack:50}, passive:{trigger:'on_attack',chance:0.2,effect:{critMul:1.5}} },
    { name:'기사', hp:600, atk:10, def:14, spd:3, range:60, btW:{survive:50,skill:20,attack:30}, passive:{trigger:'on_damaged',effect:{damageReduction:0.1}} },
  ];
  return classes.map((c, i) => ({
    playerName: 'P' + (i + 1), className: c.name, passive: c.passive,
    stats: { maxHP: c.hp, ATK: c.atk, DEF: c.def, INT: 2, SPD: c.spd },
    range: c.range, btWeights: c.btW,
    skills: [
      { name: '강타', type: 'attack', damage: 25, cooldown: 5 },
      { name: '방어막', type: 'defense', shield: 30, cooldown: 8 },
    ],
  }));
}

// ─── Test 1: PvP Backward Compatibility ───
console.log('\n[Test 1] PvP 하위 호환');
{
  const builds = makeBuilds().slice(0, 2);
  const engine = new BattleEngine(builds);
  assert(engine.maxTicks === 300, 'maxTicks 기본값 300');
  assert(engine.finishCondition === 'lastStanding', 'finishCondition 기본값 lastStanding');
  const { log, results } = engine.run();
  assert(log.length > 0, '전투 로그 생성됨');
  assert(results.length === 2, '결과 2명');
  assert(results[0].rank === 1, '1등 존재');
  assert(engine.characters[0].baseStats !== undefined, 'baseStats 존재');
  assert(engine.characters[0].equipmentBonuses !== undefined, 'equipmentBonuses 존재');
  assert(engine.characters[0].zoneId === null, 'zoneId null (PvP)');
  // killedBy check
  const dead = engine.characters.find(c => !c.alive);
  assert(dead && dead.killedBy !== undefined, 'killedBy 필드 존재');
}

// ─── Test 2: Survival Arena Full Match ───
console.log('\n[Test 2] 서바이벌 아레나 풀 매치');
{
  const arena = new SurvivalArena(makeBuilds());
  const { log, results } = arena.run();
  assert(log.length > 0, `매치 완료: ${log.length}틱`);
  assert(log.length <= 1500, '1500틱 이내 종료');
  assert(results.length === 4, '4명 결과');
  assert(results[0].rank === 1, '1등 존재');
  assert(results.filter(r => r.alive).length >= 1, '최소 1명 생존');
}

// ─── Test 3: Game Flow (Open PvP) ───
console.log('\n[Test 3] 오픈 PvP 게임 흐름');
{
  let totalTicks = 0;
  const runs = 10;
  for (let i = 0; i < runs; i++) {
    const arena = new SurvivalArena(makeBuilds());
    const { log } = arena.run();
    totalTicks += log.length;
  }
  const avgTicks = totalTicks / runs;
  assert(avgTicks > 50, `평균 ${avgTicks.toFixed(0)}틱 (최소 50틱 = 10초 이상)`);
  assert(avgTicks < 1500, `평균 ${avgTicks.toFixed(0)}틱 (1500틱 내 종료)`);
}

// ─── Test 4: Monster Waves ───
console.log('\n[Test 4] 몬스터 웨이브');
{
  const arena = new SurvivalArena(makeBuilds());
  const { log } = arena.run();
  const waveEvents = log.flatMap(l => (l.events || []).filter(e => e.type === 'waveSpawn'));
  assert(waveEvents.length >= 2, `웨이브 ${waveEvents.length}회 스폰`);
  const monsters = arena.engine.characters.filter(c => c.isMonster);
  assert(monsters.length >= 12, `몬스터 ${monsters.length}마리 생성`);
  const deadMonsters = monsters.filter(c => !c.alive);
  assert(deadMonsters.length > 0, `몬스터 ${deadMonsters.length}마리 처치됨`);
}

// ─── Test 5: Drop System ───
console.log('\n[Test 5] 드랍 시스템');
{
  const arena = new SurvivalArena(makeBuilds());
  const { log, results } = arena.run();
  const dropEvents = log.flatMap(l => (l.events || []).filter(e => e.type === 'drop'));
  assert(dropEvents.length > 0, `드랍 ${dropEvents.length}회 발생`);
  const totalEnh = results.reduce((sum, r) => sum + Object.values(r.enhancementLevels).reduce((a, b) => a + b, 0), 0);
  assert(totalEnh > 0, `총 강화 ${totalEnh}레벨`);
  assert(totalEnh <= 40, '강화 합리적 범위 (최대 40)');
}

// ─── Test 6: Enhancement Level Range ───
console.log('\n[Test 6] 강화 레벨 범위');
{
  let totalMaxEnh = 0;
  const runs = 5;
  for (let i = 0; i < runs; i++) {
    const arena = new SurvivalArena(makeBuilds());
    const { results } = arena.run();
    const maxEnh = Math.max(...results.map(r => Object.values(r.enhancementLevels).reduce((a, b) => a + b, 0)));
    totalMaxEnh += maxEnh;
  }
  const avgMax = totalMaxEnh / runs;
  assert(avgMax >= 2 && avgMax <= 20, `평균 최대 강화: ${avgMax.toFixed(1)} (범위 2-20)`);
}

// ─── Test 7: Open PvP Targeting (no zone restriction) ───
console.log('\n[Test 7] 오픈 PvP 타겟팅');
{
  const { BehaviorTree } = require('./shared/BehaviorTree');
  const char = { id: 'p0', team: 0, zoneId: 0, alive: true, hp: 100, stats: { maxHP: 100, ATK: 10, DEF: 5, SPD: 5, INT: 0 }, btWeights: { survive: 20, skill: 30, attack: 50 }, skills: [], buffs: [], x: 100, y: 200, range: 60 };
  const enemy1 = { id: 'p1', team: 1, zoneId: 0, alive: true, hp: 100, x: 150 };
  const enemy2 = { id: 'p2', team: 2, zoneId: 1, alive: true, hp: 100, x: 300 };
  const monster = { id: 'm0', team: -1, zoneId: 0, alive: true, hp: 50, x: 120 };
  const bt = new BehaviorTree(char, { characters: [char, enemy1, enemy2, monster] });
  const enemies = bt.getEnemies();
  assert(enemies.length === 3, `모든 적 3명 타겟 가능 (found ${enemies.length})`);
  assert(enemies.some(e => e.id === 'p1'), 'p1 타겟 가능');
  assert(enemies.some(e => e.id === 'p2'), 'p2 (다른 존) 타겟 가능 (오픈 PvP)');
  assert(enemies.some(e => e.id === 'm0'), '몬스터 타겟 가능');
}

// ─── Test 8: PvP No Zone (backward compat) ───
console.log('\n[Test 8] PvP 존 없음 호환');
{
  const { BehaviorTree } = require('./shared/BehaviorTree');
  const char = { id: 'p0', team: 0, zoneId: null, alive: true, hp: 100, stats: { maxHP: 100, ATK: 10, DEF: 5, SPD: 5, INT: 0 }, btWeights: { survive: 20, skill: 30, attack: 50 }, skills: [], buffs: [], x: 100, y: 200, range: 60 };
  const enemy = { id: 'p1', team: 1, zoneId: null, alive: true, hp: 100, x: 150 };
  const bt = new BehaviorTree(char, { characters: [char, enemy] });
  const enemies = bt.getEnemies();
  assert(enemies.length === 1, 'PvP: zoneId null 시 모든 적 보임');
}

// ─── Summary ───
console.log(`\n${'═'.repeat(40)}`);
console.log(`결과: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('모든 테스트 통과! ✓');
