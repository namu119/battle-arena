const REWARDS = {
  1: { gold: 300, label: '1등' },
  2: { gold: 200, label: '2등' },
  3: { gold: 100, label: '3등' },
  4: { gold: 50, label: '4등' },
  5: { gold: 30, label: '5등' },
};

function calculateRewards(results) {
  return results.map(r => ({
    ...r,
    reward: REWARDS[r.rank] || { gold: 20, label: '참가' },
  }));
}

module.exports = { calculateRewards, REWARDS };
