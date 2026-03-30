const dropsData = require('../data/drops.json');

const SLOTS = ['helmet', 'armor', 'weapon', 'boots'];

// 슬롯별 스탯 친화도: 해당 스탯이 나올 확률 70%, 나머지 30%
const SLOT_STAT_AFFINITY = {
  helmet: 'DEF',
  armor: 'DEF',
  weapon: 'ATK',
  boots: 'SPD',
};

class DropSystem {
  constructor() {
    this.dropLog = []; // track drops for events
  }

  /** Process a monster death: roll drop and apply to killer */
  processMonsterDeath(monster, killerChar) {
    if (!monster.isMonster || !killerChar || killerChar.isMonster) return null;

    const level = monster.level || 1;
    const table = dropsData.dropTables[String(level)];
    if (!table) return null;

    // Random slot
    const slot = SLOTS[Math.floor(Math.random() * SLOTS.length)];
    const statBonus = table.statBonus.min + Math.floor(Math.random() * (table.statBonus.max - table.statBonus.min + 1));

    const currentLevel = killerChar.enhancementLevels[slot] || 0;

    if (currentLevel >= dropsData.enhancement.maxLevel) {
      // Overflow -> gold
      const goldGain = table.goldOnOverflow;
      killerChar.gold = (killerChar.gold || 0) + goldGain;
      const drop = { type: 'goldOverflow', slot, gold: goldGain, playerId: killerChar.id };
      this.dropLog.push(drop);
      return drop;
    }

    // Enhance equipment
    killerChar.enhancementLevels[slot] = currentLevel + 1;

    // Distribute stat bonus with slot affinity (70% primary, 30% random)
    const primaryStat = SLOT_STAT_AFFINITY[slot] || 'ATK';
    const statKeys = ['ATK', 'DEF', 'INT', 'SPD'];
    for (let i = 0; i < statBonus; i++) {
      const key = Math.random() < 0.7 ? primaryStat : statKeys[Math.floor(Math.random() * statKeys.length)];
      killerChar.equipmentBonuses[key] = (killerChar.equipmentBonuses[key] || 0) + 1;
    }

    DropSystem.recalcStats(killerChar);

    const drop = {
      type: 'enhancement',
      slot,
      level: killerChar.enhancementLevels[slot],
      statBonus,
      playerId: killerChar.id,
    };
    this.dropLog.push(drop);
    return drop;
  }

  /** Auto-enhance weakest slot when gold >= threshold */
  processGoldAutoEnhance(player) {
    const cost = dropsData.enhancement.goldAutoEnhanceCost;
    if ((player.gold || 0) < cost) return null;
    if (player.isMonster) return null;

    // Find weakest slot (lowest enhancement level, not maxed)
    let weakestSlot = null;
    let minLevel = Infinity;
    for (const slot of SLOTS) {
      const lvl = player.enhancementLevels[slot] || 0;
      if (lvl < dropsData.enhancement.maxLevel && lvl < minLevel) {
        minLevel = lvl;
        weakestSlot = slot;
      }
    }

    if (!weakestSlot) return null; // all slots maxed

    player.gold -= cost;
    player.enhancementLevels[weakestSlot] = minLevel + 1;

    const bonus = dropsData.enhancement.goldAutoEnhanceBonus;
    const statBonus = bonus.min + Math.floor(Math.random() * (bonus.max - bonus.min + 1));
    const statKeys = ['ATK', 'DEF', 'INT', 'SPD'];
    for (let i = 0; i < statBonus; i++) {
      const key = statKeys[Math.floor(Math.random() * statKeys.length)];
      player.equipmentBonuses[key] = (player.equipmentBonuses[key] || 0) + 1;
    }

    DropSystem.recalcStats(player);

    const drop = {
      type: 'goldEnhance',
      slot: weakestSlot,
      level: player.enhancementLevels[weakestSlot],
      statBonus,
      playerId: player.id,
    };
    this.dropLog.push(drop);
    return drop;
  }

  /** Process a player kill: killer gets gold + steal some stats */
  processPlayerKill(deadPlayer, killerChar) {
    if (!killerChar || killerChar.isMonster || !deadPlayer) return null;
    if (deadPlayer.isMonster) return null;

    // Gold reward: 100 base + 50% of dead player's gold
    const goldReward = 100 + Math.floor((deadPlayer.gold || 0) * 0.5);
    killerChar.gold = (killerChar.gold || 0) + goldReward;

    // Steal 1 enhancement level from dead player's highest slot
    let stolenSlot = null;
    let maxLevel = 0;
    for (const slot of SLOTS) {
      const lvl = deadPlayer.enhancementLevels?.[slot] || 0;
      if (lvl > maxLevel) { maxLevel = lvl; stolenSlot = slot; }
    }

    let stolenBonus = 0;
    if (stolenSlot && maxLevel > 0) {
      // Transfer 1 enhancement level
      const primaryStat = SLOT_STAT_AFFINITY[stolenSlot] || 'ATK';
      killerChar.equipmentBonuses[primaryStat] = (killerChar.equipmentBonuses[primaryStat] || 0) + 2;
      killerChar.enhancementLevels[stolenSlot] = Math.min(
        dropsData.enhancement.maxLevel,
        (killerChar.enhancementLevels[stolenSlot] || 0) + 1
      );
      DropSystem.recalcStats(killerChar);
      stolenBonus = 2;
    }

    const drop = {
      type: 'playerKill',
      gold: goldReward,
      stolenSlot,
      stolenBonus,
      playerId: killerChar.id,
      victimName: deadPlayer.name,
    };
    this.dropLog.push(drop);
    return drop;
  }

  /** Auto-enhance cooldown tracking (ticks since last auto-enhance) */
  canAutoEnhance(player) {
    const cooldown = 50; // 50 ticks = 10 seconds between auto-enhances
    const lastTick = player._lastAutoEnhanceTick || 0;
    return (player._currentTick || 0) - lastTick >= cooldown;
  }

  /** Flush and return pending drop events */
  flushDropLog() {
    const log = [...this.dropLog];
    this.dropLog = [];
    return log;
  }

  /** Recalculate effective stats from baseStats + equipmentBonuses */
  static recalcStats(player) {
    if (!player.baseStats) return;
    for (const key of ['ATK', 'DEF', 'INT', 'SPD']) {
      player.stats[key] = (player.baseStats[key] || 0) + (player.equipmentBonuses[key] || 0);
    }
    // maxHP scales with DEF bonus
    player.stats.maxHP = (player.baseStats.maxHP || 0) + (player.equipmentBonuses.DEF || 0) * 5;
  }
}

module.exports = { DropSystem };
