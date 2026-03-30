const { CharacterBuilder } = require('./shared/CharacterBuilder');
const { BattleEngine } = require('./server/BattleEngine');
const { calculateRewards } = require('./server/Reward');

// ─── 3명의 캐릭터 빌드 ───

// Player 1: 공격형 전사 (ATK 올인)
const warrior = new CharacterBuilder()
  .setClass('전사')
  .allocateStats({ ATK: 7, DEF: 3 })
  .equipItem('helmet', '화염투구')       // 150G
  .equipItem('armor', '가죽갑옷')        // 150G
  .equipItem('weapon', '대검')           // 200G
  .equipItem('boots', '질풍부츠')        // 200G → 700G
  .selectSkills(['화염방벽', '강타', '질풍돌진'])
  .build();
warrior.playerName = '공격전사';

// Player 2: 마법사 (INT 올인)
const mage = new CharacterBuilder()
  .setClass('마법사')
  .allocateStats({ INT: 7, DEF: 3 })
  .equipItem('helmet', '바람투구')       // 200G
  .equipItem('armor', '마법로브')        // 250G
  .equipItem('weapon', '지팡이')         // 250G
  .equipItem('boots', '경량부츠')        // 100G → 800G
  .selectSkills(['질풍회피', '마력폭발', '대시'])
  .build();
mage.playerName = '폭발마법사';

// Player 3: 암살 도적 (ATK + SPD)
const rogue = new CharacterBuilder()
  .setClass('도적')
  .allocateStats({ ATK: 5, SPD: 5 })
  .equipItem('helmet', '화염투구')       // 150G
  .equipItem('armor', '가죽갑옷')        // 150G
  .equipItem('weapon', '단검')           // 100G
  .equipItem('boots', '질풍부츠')        // 200G → 600G
  .selectSkills(['화염방벽', '연속찌르기', '질풍돌진'])
  .build();
rogue.playerName = '암살도적';

// ─── 빌드 정보 출력 ───
console.log('=== 빌드 정보 ===\n');
for (const build of [warrior, mage, rogue]) {
  console.log(`[${build.playerName}] ${build.className}`);
  console.log(`  스탯: HP=${build.stats.maxHP} ATK=${build.stats.ATK} DEF=${build.stats.DEF} INT=${build.stats.INT} SPD=${build.stats.SPD}`);
  console.log(`  패시브: ${build.passive.name} - ${build.passive.description}`);
  console.log(`  BT가중치: 생존=${build.btWeights.survive} 스킬=${build.btWeights.skill} 공격=${build.btWeights.attack}`);
  console.log(`  스킬: ${build.skills.map(s => s.name).join(', ')}`);
  console.log(`  비용: ${build.cost}G (잔여: ${build.gold}G)\n`);
}

// ─── 전투 실행 ───
console.log('=== 전투 시작 ===\n');
const engine = new BattleEngine([warrior, mage, rogue]);
const { log, results } = engine.run();

// 주요 틱 출력
const keyTicks = [1, 10, 25, 50, 75, 100];
for (const entry of log) {
  if (keyTicks.includes(entry.tick) || entry.tick === log.length) {
    console.log(`[틱 ${entry.tick}]`);
    for (const c of entry.state) {
      const bar = '█'.repeat(Math.round(c.hp / c.maxHP * 10)) + '░'.repeat(10 - Math.round(c.hp / c.maxHP * 10));
      console.log(`  ${c.name}: ${bar} HP=${c.hp}/${c.maxHP} ${c.alive ? '' : '💀'} x=${c.x}`);
    }
    console.log('');
  }
}

// ─── 결과 ───
console.log('=== 전투 결과 ===\n');
const rewarded = calculateRewards(results);
for (const r of rewarded) {
  console.log(`  ${r.reward.label}: ${r.name}(${r.className}) - HP=${r.hpRemaining} → +${r.reward.gold}G`);
}
console.log(`\n총 ${log.length}틱 (${(log.length * 0.2).toFixed(1)}초)`);
