const classes = require('../data/classes.json');
const equipments = require('../data/equipments.json');

const INITIAL_GOLD = 1000;
const STAT_POINTS = 10;
const STAT_WEIGHT = 3; // 스탯 1포인트당 BT 가중치 변동량

const SLOT_MAP = {
  helmet: 'helmets',
  armor: 'armors',
  weapon: 'weapons',
  boots: 'boots',
};

class CharacterBuilder {
  constructor() {
    this.reset();
  }

  reset() {
    this.className = null;
    this.statAlloc = { ATK: 0, DEF: 0, INT: 0, SPD: 0 };
    this.equip = { helmet: null, armor: null, weapon: null, boots: null };
    this.selectedSkills = [];
  }

  /** 병과 선택 */
  setClass(name) {
    if (!classes[name]) throw new Error(`존재하지 않는 병과: ${name}`);
    this.className = name;
    return this;
  }

  /** 스탯 포인트 배분 */
  allocateStats(alloc) {
    const total = Object.values(alloc).reduce((a, b) => a + b, 0);
    if (total > STAT_POINTS) throw new Error(`스탯 포인트 초과: ${total}/${STAT_POINTS}`);
    for (const key of Object.keys(alloc)) {
      if (!['ATK', 'DEF', 'INT', 'SPD'].includes(key)) throw new Error(`잘못된 스탯: ${key}`);
      if (alloc[key] < 0) throw new Error(`음수 스탯 불가: ${key}`);
    }
    this.statAlloc = { ATK: 0, DEF: 0, INT: 0, SPD: 0, ...alloc };
    return this;
  }

  /** 장비 장착 */
  equipItem(slot, itemName) {
    const category = SLOT_MAP[slot];
    if (!category) throw new Error(`잘못된 슬롯: ${slot}`);
    const item = equipments[category][itemName];
    if (!item) throw new Error(`존재하지 않는 장비: ${itemName}`);
    this.equip[slot] = itemName;
    return this;
  }

  /** 총 비용 계산 */
  getTotalCost() {
    let cost = 0;
    for (const [slot, itemName] of Object.entries(this.equip)) {
      if (!itemName) continue;
      const category = SLOT_MAP[slot];
      cost += equipments[category][itemName].cost;
    }
    return cost;
  }

  /** 장비에서 스킬 후보 4개 추출 */
  getSkillCandidates() {
    const candidates = [];
    for (const [slot, itemName] of Object.entries(this.equip)) {
      if (!itemName) continue;
      const category = SLOT_MAP[slot];
      const item = equipments[category][itemName];
      candidates.push({ slot, itemName, skill: item.skill });
    }
    return candidates;
  }

  /** 스킬 3종 선택 (4개 후보 중) */
  selectSkills(skillNames) {
    if (skillNames.length !== 3) throw new Error('스킬은 정확히 3개를 선택해야 합니다');
    const candidates = this.getSkillCandidates().map(c => c.skill.name);
    for (const name of skillNames) {
      if (!candidates.includes(name)) throw new Error(`선택 불가능한 스킬: ${name}`);
    }
    this.selectedSkills = skillNames;
    return this;
  }

  /** 최종 캐릭터 빌드 */
  build() {
    if (!this.className) throw new Error('병과를 선택하세요');
    const emptySlots = Object.entries(this.equip).filter(([, v]) => !v);
    if (emptySlots.length > 0) throw new Error(`장비 미장착: ${emptySlots.map(([k]) => k).join(', ')}`);
    if (this.selectedSkills.length !== 3) throw new Error('스킬 3종을 선택하세요');

    const cost = this.getTotalCost();
    if (cost > INITIAL_GOLD) throw new Error(`골드 부족: ${cost}/${INITIAL_GOLD}G`);

    const cls = classes[this.className];

    // 장비 스탯 합산
    const equipStats = { ATK: 0, DEF: 0, INT: 0, SPD: 0 };
    for (const [slot, itemName] of Object.entries(this.equip)) {
      const category = SLOT_MAP[slot];
      const item = equipments[category][itemName];
      for (const [stat, val] of Object.entries(item.stats)) {
        if (equipStats[stat] !== undefined) equipStats[stat] += val;
      }
    }

    // 최종 스탯
    const finalStats = {
      maxHP: cls.baseHP + this.statAlloc.DEF * 15,
      ATK: cls.baseATK + this.statAlloc.ATK + equipStats.ATK,
      DEF: cls.baseDEF + this.statAlloc.DEF + equipStats.DEF,
      INT: (this.statAlloc.INT || 0) + (equipStats.INT || 0),
      SPD: cls.baseSPD + this.statAlloc.SPD + (equipStats.SPD || 0),
    };

    // BT 가중치 계산: 병과 기본 + 스탯 배분 반영
    const btWeights = {
      survive: cls.btWeights.survive + this.statAlloc.DEF * STAT_WEIGHT,
      skill: cls.btWeights.skill + (this.statAlloc.INT || 0) * STAT_WEIGHT,
      attack: cls.btWeights.attack + this.statAlloc.ATK * STAT_WEIGHT,
    };

    // 스킬 상세 정보
    const skills = this.selectedSkills.map(name => {
      for (const [slot, itemName] of Object.entries(this.equip)) {
        const category = SLOT_MAP[slot];
        const item = equipments[category][itemName];
        if (item.skill.name === name) return { ...item.skill };
      }
      return null;
    });

    return {
      className: this.className,
      passive: cls.passive,
      stats: finalStats,
      range: cls.range,
      btWeights,
      equip: { ...this.equip },
      skills,
      cost,
      gold: INITIAL_GOLD - cost,
    };
  }
}

module.exports = { CharacterBuilder, INITIAL_GOLD, STAT_POINTS };
