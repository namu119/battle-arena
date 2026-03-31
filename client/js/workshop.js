// ─── Random Life Workshop ───
var G = window.Game;

var selectedClass = null;
var stats = { ATK:0, DEF:0, INT:0, SPD:0 };
var equip = { helmet:null, armor:null, weapon:null, boots:null };
var selectedSkills = [];
var INITIAL_GOLD = 1000;
var rerollsLeft = 10;

var CLASS_ICONS = { '전사':'⚔️', '마법사':'🔮', '도적':'🗡️', '기사':'🛡️', '궁수':'🏹' };
var CLASS_COLORS_MAP = { '전사':'#e94560', '마법사':'#7b2ff7', '도적':'#2ecc71', '기사':'#3498db', '궁수':'#f39c12' };
var STAT_NAMES = { ATK: '공격', DEF: '방어', INT: '지능', SPD: '속도' };
var STAT_COLORS = { ATK: '#e94560', DEF: '#3498db', INT: '#7b2ff7', SPD: '#f39c12' };

function initWorkshop() {
  rerollsLeft = 10;
  randomizeClass();
  randomizeEquip();
  randomizeSkills();
  renderWorkshop();
}

function randomizeClass() {
  var classNames = Object.keys(G.classData);
  selectedClass = classNames[Math.floor(Math.random() * classNames.length)];
  // Random stat allocation (10 points)
  stats = { ATK:0, DEF:0, INT:0, SPD:0 };
  var keys = ['ATK','DEF','INT','SPD'];
  var remaining = 10;
  while (remaining > 0) {
    var k = keys[Math.floor(Math.random() * keys.length)];
    stats[k]++;
    remaining--;
  }
}

function randomizeEquip() {
  var slotCategory = { helmet:'helmets', armor:'armors', weapon:'weapons', boots:'boots' };
  equip = { helmet:null, armor:null, weapon:null, boots:null };
  var gold = INITIAL_GOLD;
  var slots = ['helmet','armor','weapon','boots'];
  // Shuffle slot order for variety
  for (var i = slots.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = slots[i]; slots[i] = slots[j]; slots[j] = tmp;
  }
  for (var si = 0; si < slots.length; si++) {
    var slot = slots[si];
    var cat = G.equipData[slotCategory[slot]];
    if (!cat) continue;
    var items = Object.entries(cat);
    var affordable = items.filter(function(e) { return e[1].cost <= gold; });
    if (affordable.length === 0) continue;
    var pick = affordable[Math.floor(Math.random() * affordable.length)];
    equip[slot] = pick[0];
    gold -= pick[1].cost;
  }
}

function randomizeSkills() {
  var slotCategory = { helmet:'helmets', armor:'armors', weapon:'weapons', boots:'boots' };
  var candidates = [];
  for (var slot in equip) {
    if (!equip[slot]) continue;
    var cat = G.equipData[slotCategory[slot]];
    if (cat && cat[equip[slot]]) candidates.push(cat[equip[slot]].skill.name);
  }
  // Shuffle and pick 3
  for (var i = candidates.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
  }
  selectedSkills = candidates.slice(0, 3);
}

function rerollSection(section) {
  if (rerollsLeft <= 0) return;
  rerollsLeft--;
  if (section === 'class') randomizeClass();
  else if (section === 'equip') { randomizeEquip(); randomizeSkills(); }
  else if (section === 'skill') randomizeSkills();
  renderWorkshop();
}

function renderWorkshop() {
  document.getElementById('rerollCount').textContent = rerollsLeft;
  // Disable reroll buttons when 0
  document.querySelectorAll('.reroll-btn').forEach(function(btn) {
    btn.disabled = rerollsLeft <= 0;
    btn.style.opacity = rerollsLeft <= 0 ? '0.4' : '1';
  });
  renderClassDisplay();
  renderEquipDisplay();
  renderSkillDisplay();
  renderStatRadar();
  updateGold();
  // Validate: all must be filled
  var valid = selectedClass && Object.values(equip).every(function(v) { return v; }) && selectedSkills.length >= 3;
  document.getElementById('submitBtn').disabled = !valid;
}

function renderClassDisplay() {
  var container = document.getElementById('classDisplay');
  if (!selectedClass || !G.classData[selectedClass]) {
    container.innerHTML = '<span style="color:#666">랜덤 선택 중...</span>';
    return;
  }
  var cls = G.classData[selectedClass];
  var icon = CLASS_ICONS[selectedClass] || '⚔️';
  var color = CLASS_COLORS_MAP[selectedClass] || '#e94560';

  var statBadges = Object.entries(stats).map(function(entry) {
    var k = entry[0], v = entry[1];
    if (v === 0) return '';
    return '<span class="random-stat-badge" style="background:' + (STAT_COLORS[k] || '#555') + '">' + (STAT_NAMES[k] || k) + ':' + v + '</span>';
  }).filter(Boolean).join(' ');

  container.innerHTML =
    '<div class="random-class-card" style="border-left:4px solid ' + color + '">' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="font-size:1.5em">' + icon + '</span>' +
        '<div>' +
          '<div style="font-weight:bold;color:#fff;font-size:1.05em">' + esc(selectedClass) + '</div>' +
          '<div style="color:#888;font-size:0.8em">HP:' + cls.baseHP + ' ATK:' + cls.baseATK + ' DEF:' + cls.baseDEF + ' SPD:' + cls.baseSPD + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="color:#7ec8e3;font-size:0.82em;margin-top:4px">패시브: ' + esc(cls.passive.name) + ' - ' + esc(cls.passive.description) + '</div>' +
      '<div style="margin-top:6px">' + statBadges + '</div>' +
    '</div>';
}

function renderEquipDisplay() {
  var container = document.getElementById('equipDisplay');
  var slotCategory = { helmet:'helmets', armor:'armors', weapon:'weapons', boots:'boots' };
  var slotNames = { helmet:'투구', armor:'갑옷', weapon:'무기', boots:'신발' };
  var slotIcons = { helmet:'🪖', armor:'🛡️', weapon:'⚔️', boots:'👢' };

  var html = '<div class="random-equip-row">';
  var slots = ['helmet','armor','weapon','boots'];
  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i];
    var name = equip[slot];
    if (!name) {
      html += '<div class="random-equip-card empty"><div class="equip-slot-label">' + slotIcons[slot] + ' ' + slotNames[slot] + '</div><div style="color:#666;font-size:0.8em">없음</div></div>';
      continue;
    }
    var cat = G.equipData[slotCategory[slot]];
    var item = cat ? cat[name] : null;
    if (!item) continue;
    var statsStr = Object.entries(item.stats).map(function(s) { return s[0] + '+' + s[1]; }).join(' ');
    html += '<div class="random-equip-card">' +
      '<div class="equip-slot-label">' + slotIcons[slot] + ' ' + slotNames[slot] + '</div>' +
      '<div style="font-weight:bold;color:#fff;font-size:0.88em">' + esc(name) + '</div>' +
      '<div style="color:#f0a500;font-size:0.75em">' + item.cost + 'G</div>' +
      '<div style="color:#888;font-size:0.75em">' + statsStr + '</div>' +
      '<div style="color:#7ec8e3;font-size:0.75em">' + esc(item.skill.name) + '</div>' +
    '</div>';
  }
  html += '</div>';
  container.innerHTML = html;
}

function renderSkillDisplay() {
  var container = document.getElementById('skillDisplay');
  if (selectedSkills.length === 0) {
    container.innerHTML = '<span style="color:#666">스킬 없음</span>';
    return;
  }
  container.innerHTML = '<div class="random-skill-row">' + selectedSkills.map(function(name) {
    return '<div class="random-skill-chip">🎯 ' + esc(name) + '</div>';
  }).join('') + '</div>';
}

function updateGold() {
  var cost = getTotalCost();
  var remaining = INITIAL_GOLD - cost;
  document.getElementById('goldDisplay').textContent = remaining;
  document.getElementById('goldDisplay').style.color = remaining < 0 ? '#e94560' : '#f0a500';
}

function getTotalCost() {
  var cost = 0;
  var slotCategory = { helmet:'helmets', armor:'armors', weapon:'weapons', boots:'boots' };
  for (var slot in equip) {
    var name = equip[slot];
    if (!name) continue;
    var cat = G.equipData[slotCategory[slot]];
    if (cat && cat[name]) cost += cat[name].cost;
  }
  return cost;
}

function submitBuild() {
  try {
    var build = makeBuild();
    if (!build) return;
    G.socket.emit('submitBuild', build);
    document.getElementById('submitBtn').disabled = true;
    document.getElementById('submitBtn').textContent = '제출 완료! 대기중...';
  } catch (e) {
    console.error('빌드 생성 실패', e);
    alert('빌드 생성 실패: ' + e.message);
  }
}

function makeBuild() {
  var cls = G.classData[selectedClass];
  if (!cls) throw new Error('병과를 선택하세요');
  var slotCategory = { helmet:'helmets', armor:'armors', weapon:'weapons', boots:'boots' };
  var STAT_WEIGHT = 3;

  var equipStats = { ATK:0, DEF:0, INT:0, SPD:0 };
  for (var slot in equip) {
    var name = equip[slot];
    if (!name) continue;
    var itemStats = G.equipData[slotCategory[slot]][name].stats;
    for (var k in itemStats) {
      if (equipStats[k] !== undefined) equipStats[k] += itemStats[k];
    }
  }

  return {
    className: selectedClass,
    passive: cls.passive,
    stats: {
      maxHP: cls.baseHP + stats.DEF * 15,
      ATK: cls.baseATK + stats.ATK + equipStats.ATK,
      DEF: cls.baseDEF + stats.DEF + equipStats.DEF,
      INT: stats.INT + (equipStats.INT || 0),
      SPD: cls.baseSPD + stats.SPD + (equipStats.SPD || 0),
    },
    range: cls.range,
    btWeights: {
      survive: cls.btWeights.survive + stats.DEF * STAT_WEIGHT,
      skill: cls.btWeights.skill + stats.INT * STAT_WEIGHT,
      attack: cls.btWeights.attack + stats.ATK * STAT_WEIGHT,
    },
    equip: { helmet: equip.helmet, armor: equip.armor, weapon: equip.weapon, boots: equip.boots },
    skills: selectedSkills.map(function(skillName) {
      for (var s in equip) {
        var itemName = equip[s];
        if (!itemName) continue;
        var item = G.equipData[slotCategory[s]][itemName];
        if (item.skill.name === skillName) return Object.assign({}, item.skill);
      }
      return null;
    }).filter(Boolean),
    cost: getTotalCost(),
    rerollsLeft: rerollsLeft,
  };
}

// ─── 6각형 스탯 레이더 차트 ───
function renderStatRadar() {
  var canvas = document.getElementById('statRadar');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var cx = W / 2, cy = H / 2;
  var radius = Math.min(W, H) * 0.38;

  ctx.clearRect(0, 0, W, H);

  // 6축: HP, ATK, DEF, INT, SPD, Range
  var labels = ['HP', 'ATK', 'DEF', 'INT', 'SPD', 'RNG'];
  var labelColors = ['#e94560', '#ff6644', '#3498db', '#7b2ff7', '#f39c12', '#2ecc71'];
  var axes = 6;
  var angleStep = (Math.PI * 2) / axes;

  // 현재 스탯 계산
  var cls = selectedClass ? G.classData[selectedClass] : null;
  var maxVals = [800, 30, 25, 15, 15, 250]; // 각 축 최대값
  var vals = [0, 0, 0, 0, 0, 0];
  if (cls) {
    // 장비 스탯 합산
    var eqStats = { ATK:0, DEF:0, INT:0, SPD:0 };
    var slotCat = { helmet:'helmets', armor:'armors', weapon:'weapons', boots:'boots' };
    for (var sl in equip) {
      if (!equip[sl]) continue;
      var cat = G.equipData[slotCat[sl]];
      if (cat && cat[equip[sl]]) {
        var es = cat[equip[sl]].stats;
        for (var sk in es) { if (eqStats[sk] !== undefined) eqStats[sk] += es[sk]; }
      }
    }
    vals = [
      cls.baseHP + (stats.DEF || 0) * 15,                    // HP
      cls.baseATK + (stats.ATK || 0) + eqStats.ATK,          // ATK
      cls.baseDEF + (stats.DEF || 0) + eqStats.DEF,          // DEF
      (stats.INT || 0) + (eqStats.INT || 0),                  // INT
      cls.baseSPD + (stats.SPD || 0) + (eqStats.SPD || 0),   // SPD
      cls.range,                                               // Range
    ];
  }

  // 배경 그리드 (3단계)
  for (var level = 3; level >= 1; level--) {
    var r = radius * (level / 3);
    ctx.beginPath();
    for (var i = 0; i < axes; i++) {
      var angle = angleStep * i - Math.PI / 2;
      var x = cx + Math.cos(angle) * r;
      var y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(126,200,227,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 축선
  for (var i = 0; i < axes; i++) {
    var angle = angleStep * i - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.strokeStyle = 'rgba(126,200,227,0.1)';
    ctx.stroke();
  }

  // 스탯 다각형
  if (cls) {
    ctx.beginPath();
    for (var i = 0; i < axes; i++) {
      var angle = angleStep * i - Math.PI / 2;
      var ratio = Math.min(1, vals[i] / maxVals[i]);
      var x = cx + Math.cos(angle) * radius * ratio;
      var y = cy + Math.sin(angle) * radius * ratio;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(233,69,96,0.25)';
    ctx.fill();
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 꼭짓점 점
    for (var i = 0; i < axes; i++) {
      var angle = angleStep * i - Math.PI / 2;
      var ratio = Math.min(1, vals[i] / maxVals[i]);
      var x = cx + Math.cos(angle) * radius * ratio;
      var y = cy + Math.sin(angle) * radius * ratio;
      ctx.fillStyle = labelColors[i];
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 라벨 + 수치
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (var i = 0; i < axes; i++) {
    var angle = angleStep * i - Math.PI / 2;
    var lx = cx + Math.cos(angle) * (radius + 18);
    var ly = cy + Math.sin(angle) * (radius + 18);
    ctx.fillStyle = labelColors[i];
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(labels[i], lx, ly - 6);
    ctx.fillStyle = '#fff';
    ctx.font = '9px sans-serif';
    ctx.fillText(cls ? vals[i] : '-', lx, ly + 6);
  }
}
