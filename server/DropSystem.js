const dropsData = require('../data/drops.json');

const SLOTS = ['helmet', 'armor', 'weapon', 'boots'];

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

    // Distribute stat bonus to random stats
    const statKeys = ['ATK', 'DEF', 'INT', 'SPD'];
    for (let i = 0; i < statBonus; i++) {
      const key = statKeys[Math.floor(Math.random() * statKeys.length)];
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
