// ─── Character Workshop ───
var G = window.Game;

var selectedClass = null;
var stats = { ATK:0, DEF:0, INT:0, SPD:0 };
var equip = { helmet:null, armor:null, weapon:null, boots:null };
var selectedSkills = [];
var INITIAL_GOLD = 1000;
var STAT_POINTS = 10;

var CLASS_ICONS = { '전사':'⚔️', '마법사':'🔮', '도적':'🗡️', '기사':'🛡️', '궁수':'🏹' };
var CLASS_COLORS_MAP = { '전사':'#e94560', '마법사':'#7b2ff7', '도적':'#2ecc71', '기사':'#3498db', '궁수':'#f39c12' };

function initWorkshop() {
  selectedClass = null;
  stats = { ATK:0, DEF:0, INT:0, SPD:0 };
  equip = { helmet:null, armor:null, weapon:null, boots:null };
  selectedSkills = [];

  renderClasses();
  renderStats();
  renderEquipments();
  renderSkills();
  updateGold();
  validate();
}

function renderClasses() {
  var grid = document.getElementById('classGrid');
  grid.innerHTML = Object.entries(G.classData).map(function(entry) {
    var name = entry[0], cls = entry[1];
    var icon = CLASS_ICONS[name] || '⚔️';
    var color = CLASS_COLORS_MAP[name] || '#e94560';
    return '<div class="item-card class-card" id="class-' + name + '" onclick="selectClass(\'' + name + '\')" style="border-left:3px solid ' + color + '">' +
      '<div class="item-name"><span style="font-size:1.3em;margin-right:4px">' + icon + '</span>' + name + '</div>' +
      '<div class="item-stats">HP:' + cls.baseHP + ' ATK:' + cls.baseATK + ' DEF:' + cls.baseDEF + ' SPD:' + cls.baseSPD + '</div>' +
      '<div class="item-skill">패시브: ' + cls.passive.name + '</div>' +
      '<div class="item-stats passive-desc">' + cls.passive.description + '</div>' +
    '</div>';
  }).join('');
}

function selectClass(name) {
  selectedClass = name;
  document.querySelectorAll('#classGrid .item-card').forEach(function(el) { el.classList.remove('selected'); });
  document.getElementById('class-' + name).classList.add('selected');
  validate();
}

function renderStats() {
  var container = document.getElementById('statSliders');
  var statNames = { ATK: '공격', DEF: '방어', INT: '지능', SPD: '속도' };
  container.innerHTML = Object.entries(statNames).map(function(entry) {
    var key = entry[0], label = entry[1];
    return '<div class="stat-row">' +
      '<label>' + label + '</label>' +
      '<input type="range" min="0" max="10" value="0" id="stat-' + key + '" oninput="updateStat(\'' + key + '\', this.value)">' +
      '<span class="stat-val-badge" id="stat-val-' + key + '">0</span>' +
    '</div>';
  }).join('');
}

function updateStat(key, val) {
  val = parseInt(val);
  var others = Object.entries(stats).filter(function(e) { return e[0] !== key; }).reduce(function(a, e) { return a + e[1]; }, 0);
  if (others + val > STAT_POINTS) {
    val = STAT_POINTS - others;
    document.getElementById('stat-' + key).value = val;
  }
  stats[key] = val;
  document.getElementById('stat-val-' + key).textContent = val;
  document.getElementById('pointsDisplay').textContent = STAT_POINTS - Object.values(stats).reduce(function(a, b) { return a + b; }, 0);
  validate();
}

function renderEquipments() {
  var slotMap = { helmet:'helmetGrid', armor:'armorGrid', weapon:'weaponGrid', boots:'bootsGrid' };
  for (var slot in slotMap) {
    var gridId = slotMap[slot];
    var category = slot === 'helmet' ? 'helmets' : slot === 'armor' ? 'armors' : slot === 'weapon' ? 'weapons' : 'boots';
    var grid = document.getElementById(gridId);
    var items = G.equipData[category];
    if (!items) { grid.innerHTML = '<span style="color:#666">로딩중...</span>'; continue; }
    grid.innerHTML = Object.entries(items).map(function(entry) {
      var name = entry[0], item = entry[1];
      var statsStr = Object.entries(item.stats).map(function(s) { return s[0] + '+' + s[1]; }).join(' ');
      return '<div class="item-card" id="equip-' + name + '" onclick="selectEquip(\'' + slot + '\',\'' + name + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div class="item-name">' + name + '</div>' +
          '<div class="item-cost">' + item.cost + 'G</div>' +
        '</div>' +
        '<div class="item-stats">' + statsStr + ' · <span style="color:#7ec8e3">' + item.skill.name + '</span></div>' +
      '</div>';
    }).join('');
  }
}

function selectEquip(slot, name) {
  var gridId = slot === 'helmet' ? 'helmetGrid' : slot === 'armor' ? 'armorGrid' : slot === 'weapon' ? 'weaponGrid' : 'bootsGrid';
  document.querySelectorAll('#' + gridId + ' .item-card').forEach(function(el) { el.classList.remove('selected'); });
  document.getElementById('equip-' + name).classList.add('selected');

  equip[slot] = name;
  updateGold();
  renderSkills();
  validate();
}

function updateGold() {
  var cost = 0;
  var slotCategory = { helmet:'helmets', armor:'armors', weapon:'weapons', boots:'boots' };
  for (var slot in equip) {
    var name = equip[slot];
    if (!name) continue;
    var cat = G.equipData[slotCategory[slot]];
    if (cat && cat[name]) cost += cat[name].cost;
  }
  var remaining = INITIAL_GOLD - cost;
  document.getElementById('goldDisplay').textContent = remaining;
  document.getElementById('goldDisplay').style.color = remaining < 0 ? '#e94560' : '#f0a500';
}

function renderSkills() {
  var container = document.getElementById('skillSelect');
  var candidates = [];
  var slotCategory = { helmet:'helmets', armor:'armors', weapon:'weapons', boots:'boots' };

  for (var slot in equip) {
    var name = equip[slot];
    if (!name) continue;
    var cat = G.equipData[slotCategory[slot]];
    if (cat && cat[name]) candidates.push(cat[name].skill.name);
  }

  if (candidates.length === 0) {
    container.innerHTML = '<span style="color:#666">장비를 먼저 선택하세요</span>';
    return;
  }

  selectedSkills = selectedSkills.filter(function(s) { return candidates.includes(s); });

  container.innerHTML = candidates.map(function(name) {
    var isSelected = selectedSkills.includes(name);
    var isFull = selectedSkills.length >= 3 && !isSelected;
    return '<div class="skill-chip ' + (isSelected ? 'selected' : '') + ' ' + (isFull ? 'disabled' : '') + '"' +
              ' data-skill="' + esc(name) + '">' + esc(name) + '</div>';
  }).join('');
  container.querySelectorAll('.skill-chip:not(.disabled)').forEach(function(chip) {
    chip.addEventListener('click', function() { toggleSkill(chip.dataset.skill); });
  });
  validate();
}

function toggleSkill(name) {
  var idx = selectedSkills.indexOf(name);
  if (idx >= 0) {
    selectedSkills.splice(idx, 1);
  } else if (selectedSkills.length < 3) {
    selectedSkills.push(name);
  }
  renderSkills();
}

function validate() {
  var cost = getTotalCost();
  var valid = selectedClass
    && Object.values(equip).every(function(v) { return v; })
    && selectedSkills.length === 3
    && cost <= INITIAL_GOLD;
  document.getElementById('submitBtn').disabled = !valid;
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
  };
}
