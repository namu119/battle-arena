// ─── Workshop: 랜덤 인생 위저드 ───
var G = window.Game;

var selectedClass = null;
var stats = { ATK:0, DEF:0, INT:0, SPD:0 };
var equip = { helmet:null, armor:null, weapon:null, boots:null };
var selectedSkills = [];
var INITIAL_GOLD = 1000;
var rerollsLeft = 10;
var wizardStep = 0; // 0=class, 1=equip, 2=skill
var wizardTimerId = null;
var wizardTimeLeft = 0;

var CLASS_ICONS = { '전사':'⚔️', '마법사':'🔮', '도적':'🗡️', '기사':'🛡️', '궁수':'🏹' };
var CLASS_COLORS_MAP = { '전사':'#e94560', '마법사':'#7b2ff7', '도적':'#2ecc71', '기사':'#3498db', '궁수':'#f39c12' };
var STAT_NAMES = { ATK:'공격', DEF:'방어', INT:'지능', SPD:'속도' };
var slotCategory = { helmet:'helmets', armor:'armors', weapon:'weapons', boots:'boots' };
var SLOT_NAMES = { helmet:'투구', armor:'갑옷', weapon:'무기', boots:'신발' };

function initWorkshop() {
  rerollsLeft = 10;
  wizardStep = 0;
  randomizeClass();
  randomizeEquip();
  randomizeSkills();
  startWizardStep();
}

// ─── 랜덤 생성 ───
function randomizeClass() {
  var classNames = Object.keys(G.classData);
  selectedClass = classNames[Math.floor(Math.random() * classNames.length)];
  stats = { ATK:0, DEF:0, INT:0, SPD:0 };
  var keys = ['ATK','DEF','INT','SPD'];
  var remaining = 10;
  while (remaining > 0) {
    keys[Math.floor(Math.random() * keys.length)];
    stats[keys[Math.floor(Math.random() * keys.length)]]++;
    remaining--;
  }
}

function randomizeEquip() {
  equip = { helmet:null, armor:null, weapon:null, boots:null };
  var gold = INITIAL_GOLD;
  var slots = ['helmet','armor','weapon','boots'];
  for (var i = slots.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = slots[i]; slots[i] = slots[j]; slots[j] = tmp;
  }
  for (var si = 0; si < slots.length; si++) {
    var slot = slots[si];
    var cat = G.equipData[slotCategory[slot]];
    if (!cat) continue;
    var affordable = Object.entries(cat).filter(function(e) { return e[1].cost <= gold; });
    if (affordable.length === 0) continue;
    var pick = affordable[Math.floor(Math.random() * affordable.length)];
    equip[slot] = pick[0];
    gold -= pick[1].cost;
  }
}

function randomizeSkills() {
  var candidates = [];
  for (var slot in equip) {
    if (!equip[slot]) continue;
    var cat = G.equipData[slotCategory[slot]];
    if (cat && cat[equip[slot]]) candidates.push(cat[equip[slot]].skill.name);
  }
  candidates.sort(function() { return Math.random() - 0.5; });
  selectedSkills = candidates.slice(0, 3);
}

// ─── 위저드 단계 관리 ───
function startWizardStep() {
  updateRerollDisplay();
  if (wizardTimerId) { clearInterval(wizardTimerId); wizardTimerId = null; }

  var content = document.getElementById('wizardContent');
  var actions = document.getElementById('wizardActions');
  var radarSec = document.getElementById('radarSection');
  var ctaDiv = document.getElementById('workshopCta');

  if (wizardStep === 0) {
    // STEP 1: 병과 + 스탯
    content.innerHTML = renderClassCard();
    actions.style.display = 'flex';
    radarSec.style.display = 'block';
    ctaDiv.style.display = 'none';
    renderStatRadar();
    startTimer(5);
  } else if (wizardStep === 1) {
    // STEP 2: 장비
    content.innerHTML = renderEquipCards();
    actions.style.display = 'flex';
    radarSec.style.display = 'block';
    renderStatRadar();
    startTimer(5);
  } else if (wizardStep === 2) {
    // STEP 3: 스킬 선택 (4개 중 3개)
    allSkillCandidates = getSkillCandidates();
    selectedSkills = [];
    content.innerHTML = renderSkillSelection();
    actions.style.display = 'none';
    radarSec.style.display = 'block';
    ctaDiv.style.display = '';
    document.getElementById('submitBtn').disabled = true;
    renderStatRadar();
    if (wizardTimerId) { clearInterval(wizardTimerId); wizardTimerId = null; }
    document.getElementById('wizardTimer').textContent = '스킬 3개를 선택하세요';
  }
}

function startTimer(seconds) {
  wizardTimeLeft = seconds;
  updateTimerDisplay();
  if (wizardTimerId) clearInterval(wizardTimerId);
  wizardTimerId = setInterval(function() {
    wizardTimeLeft--;
    updateTimerDisplay();
    if (wizardTimeLeft <= 0) {
      clearInterval(wizardTimerId);
      wizardTimerId = null;
      wizardConfirm(); // 자동 확정
    }
  }, 1000);
}

function updateTimerDisplay() {
  var el = document.getElementById('wizardTimer');
  if (el) el.textContent = wizardTimeLeft > 0 ? wizardTimeLeft + '초' : '';
}

function updateRerollDisplay() {
  var el = document.getElementById('rerollCount');
  if (el) el.textContent = rerollsLeft;
  var btn = document.getElementById('rerollBtn');
  if (btn) {
    btn.disabled = rerollsLeft <= 0;
    btn.style.opacity = rerollsLeft <= 0 ? '0.4' : '1';
    btn.textContent = rerollsLeft > 0 ? '🔄 리롤 (' + rerollsLeft + ')' : '🔄 소진';
  }
}

// ─── 리롤 / 확정 ───
function wizardReroll() {
  if (rerollsLeft <= 0) return;
  rerollsLeft--;
  if (wizardStep === 0) randomizeClass();
  else if (wizardStep === 1) { randomizeEquip(); randomizeSkills(); }
  startWizardStep(); // 타이머 5초 재시작
}

function wizardConfirm() {
  if (wizardTimerId) { clearInterval(wizardTimerId); wizardTimerId = null; }
  wizardStep++;
  if (wizardStep <= 2) {
    startWizardStep();
  }
}

// ─── 렌더링 ───
function renderClassCard() {
  if (!selectedClass || !G.classData[selectedClass]) return '<div style="color:#666">로딩중...</div>';
  var cls = G.classData[selectedClass];
  var icon = CLASS_ICONS[selectedClass] || '⚔️';
  var color = CLASS_COLORS_MAP[selectedClass] || '#e94560';
  var statBadges = Object.entries(stats).map(function(e) {
    return e[1] > 0 ? '<span style="background:' + color + ';color:#fff;border-radius:4px;padding:2px 6px;font-size:0.8em;margin:2px">' + STAT_NAMES[e[0]] + ' ' + e[1] + '</span>' : '';
  }).join('');

  return '<div style="text-align:center">' +
    '<div style="font-size:1.1em;color:#888;margin-bottom:4px">STEP 1/3 — 병과 + 스탯</div>' +
    '<div style="font-size:2.5em;margin:8px 0">' + icon + '</div>' +
    '<div style="font-size:1.4em;font-weight:bold;color:' + color + '">' + selectedClass + '</div>' +
    '<div style="color:#aaa;font-size:0.85em;margin:4px 0">HP:' + cls.baseHP + ' ATK:' + cls.baseATK + ' DEF:' + cls.baseDEF + ' SPD:' + cls.baseSPD + '</div>' +
    '<div style="color:#7ec8e3;font-size:0.85em">패시브: ' + cls.passive.name + '</div>' +
    '<div style="margin:8px 0">' + statBadges + '</div>' +
  '</div>';
}

function renderEquipCards() {
  var html = '<div style="text-align:center;color:#888;font-size:1.1em;margin-bottom:8px">STEP 2/3 — 장비 4종</div>';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">';
  var slots = ['helmet','armor','weapon','boots'];
  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i];
    var name = equip[slot];
    if (!name) {
      html += '<div class="item-card" style="min-width:120px;text-align:center;opacity:0.4"><div class="item-name">' + SLOT_NAMES[slot] + '</div><div style="color:#666">없음</div></div>';
      continue;
    }
    var cat = G.equipData[slotCategory[slot]];
    var item = cat[name];
    var statsStr = Object.entries(item.stats).map(function(e) { return e[0] + '+' + e[1]; }).join(' ');
    html += '<div class="item-card" style="min-width:120px;text-align:center;border-color:#7ec8e3">' +
      '<div style="font-size:0.7em;color:#888">' + SLOT_NAMES[slot] + '</div>' +
      '<div class="item-name">' + name + '</div>' +
      '<div class="item-cost">' + item.cost + 'G</div>' +
      '<div class="item-stats">' + statsStr + '</div>' +
      '<div style="color:#7ec8e3;font-size:0.75em">' + item.skill.name + '</div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

var allSkillCandidates = [];

function getSkillCandidates() {
  var candidates = [];
  for (var slot in equip) {
    if (!equip[slot]) continue;
    var cat = G.equipData[slotCategory[slot]];
    if (cat && cat[equip[slot]]) {
      var skill = cat[equip[slot]].skill;
      candidates.push({ name: skill.name, type: skill.type, slot: slot, description: skill.description || '' });
    }
  }
  return candidates;
}

function renderSkillSelection() {
  var html = '<div style="text-align:center;color:#888;font-size:1.1em;margin-bottom:8px">STEP 3/3 — 스킬 선택 (3개)</div>';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">';
  for (var i = 0; i < allSkillCandidates.length; i++) {
    var sk = allSkillCandidates[i];
    var isSelected = selectedSkills.indexOf(sk.name) >= 0;
    var typeIcon = sk.type === 'attack' ? '⚔️' : sk.type === 'defense' ? '🛡️' : sk.type === 'buff' ? '✨' : '🔄';
    html += '<div class="skill-chip ' + (isSelected ? 'selected' : '') + '" data-skill="' + sk.name + '" onclick="toggleSkillSelect(\'' + sk.name + '\')" style="cursor:pointer;min-width:100px;text-align:center">' +
      '<div>' + typeIcon + ' ' + sk.name + '</div>' +
      '<div style="font-size:0.7em;color:#aaa">' + SLOT_NAMES[sk.slot] + ' · ' + sk.description + '</div>' +
    '</div>';
  }
  html += '</div>';
  html += '<div style="text-align:center;margin-top:6px;color:#7ec8e3;font-size:0.9em">선택: ' + selectedSkills.length + '/3</div>';
  return html;
}

function toggleSkillSelect(skillName) {
  var idx = selectedSkills.indexOf(skillName);
  if (idx >= 0) {
    selectedSkills.splice(idx, 1);
  } else if (selectedSkills.length < 3) {
    selectedSkills.push(skillName);
  }
  // Re-render skill chips
  var content = document.getElementById('wizardContent');
  if (content) content.innerHTML = renderSkillSelection();
  // Enable submit when 3 selected
  var btn = document.getElementById('submitBtn');
  if (btn) btn.disabled = selectedSkills.length !== 3;
}

// ─── 골드 계산 ───
function getTotalCost() {
  var cost = 0;
  for (var slot in equip) {
    if (!equip[slot]) continue;
    var cat = G.equipData[slotCategory[slot]];
    if (cat && cat[slot]) cost += cat[slot].cost;
    if (cat && cat[equip[slot]]) cost += cat[equip[slot]].cost;
  }
  return cost;
}

function updateGold() {
  var cost = 0;
  for (var slot in equip) {
    if (!equip[slot]) continue;
    var cat = G.equipData[slotCategory[slot]];
    if (cat && cat[equip[slot]]) cost += cat[equip[slot]].cost;
  }
  var el = document.getElementById('goldDisplay');
  if (el) {
    el.textContent = INITIAL_GOLD - cost;
    el.style.color = (INITIAL_GOLD - cost) < 0 ? '#e94560' : '#f0a500';
  }
}

// ─── 빌드 제출 ───
function submitBuild() {
  try {
    var build = makeBuild();
    if (!build) return;
    build.playerName = G.myName;
    G.socket.emit('submitBuild', build);
    document.getElementById('submitBtn').disabled = true;
    document.getElementById('submitBtn').textContent = '대기중...';
  } catch (e) {
    alert('빌드 오류: ' + e.message);
  }
}

function makeBuild() {
  var cls = G.classData[selectedClass];
  if (!cls) throw new Error('병과 없음');
  var equipStats = { ATK:0, DEF:0, INT:0, SPD:0 };
  for (var slot in equip) {
    if (!equip[slot]) continue;
    var cat = G.equipData[slotCategory[slot]];
    if (!cat || !cat[equip[slot]]) continue;
    var es = cat[equip[slot]].stats;
    for (var k in es) { if (equipStats[k] !== undefined) equipStats[k] += es[k]; }
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
      survive: cls.btWeights.survive + stats.DEF * 3,
      skill: cls.btWeights.skill + stats.INT * 3,
      attack: cls.btWeights.attack + stats.ATK * 3,
    },
    equip: Object.assign({}, equip),
    skills: selectedSkills.map(function(skillName) {
      for (var slot in equip) {
        if (!equip[slot]) continue;
        var cat = G.equipData[slotCategory[slot]];
        if (!cat || !cat[equip[slot]]) continue;
        if (cat[equip[slot]].skill.name === skillName) return Object.assign({}, cat[equip[slot]].skill);
      }
      return null;
    }).filter(Boolean),
    cost: getTotalCost(),
    rerollsLeft: rerollsLeft,
  };
}

// ─── 6각형 레이더 차트 ───
function renderStatRadar() {
  var canvas = document.getElementById('statRadar');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var cx = W / 2, cy = H / 2;
  var radius = Math.min(W, H) * 0.36;
  ctx.clearRect(0, 0, W, H);

  var labels = ['HP', 'ATK', 'DEF', 'INT', 'SPD', 'RNG'];
  var labelColors = ['#e94560', '#ff6644', '#3498db', '#7b2ff7', '#f39c12', '#2ecc71'];
  var axes = 6;
  var angleStep = (Math.PI * 2) / axes;
  var maxVals = [800, 30, 25, 15, 15, 250];
  var vals = [0, 0, 0, 0, 0, 0];

  var cls = selectedClass ? G.classData[selectedClass] : null;
  if (cls) {
    var eqS = { ATK:0, DEF:0, INT:0, SPD:0 };
    for (var sl in equip) {
      if (!equip[sl]) continue;
      var cat = G.equipData[slotCategory[sl]];
      if (cat && cat[equip[sl]]) {
        var es = cat[equip[sl]].stats;
        for (var k in es) { if (eqS[k] !== undefined) eqS[k] += es[k]; }
      }
    }
    vals = [
      cls.baseHP + (stats.DEF || 0) * 15,
      cls.baseATK + (stats.ATK || 0) + eqS.ATK,
      cls.baseDEF + (stats.DEF || 0) + eqS.DEF,
      (stats.INT || 0) + (eqS.INT || 0),
      cls.baseSPD + (stats.SPD || 0) + (eqS.SPD || 0),
      cls.range,
    ];
  }

  // 배경 그리드
  for (var lv = 3; lv >= 1; lv--) {
    var r = radius * (lv / 3);
    ctx.beginPath();
    for (var i = 0; i < axes; i++) {
      var a = angleStep * i - Math.PI / 2;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(126,200,227,0.15)';
    ctx.stroke();
  }
  // 축선
  for (var i = 0; i < axes; i++) {
    var a = angleStep * i - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.strokeStyle = 'rgba(126,200,227,0.1)'; ctx.stroke();
  }
  // 스탯 다각형
  if (cls) {
    ctx.beginPath();
    for (var i = 0; i < axes; i++) {
      var a = angleStep * i - Math.PI / 2;
      var ratio = Math.min(1, vals[i] / maxVals[i]);
      var x = cx + Math.cos(a) * radius * ratio, y = cy + Math.sin(a) * radius * ratio;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(233,69,96,0.25)'; ctx.fill();
    ctx.strokeStyle = '#e94560'; ctx.lineWidth = 2; ctx.stroke();
    // 꼭짓점
    for (var i = 0; i < axes; i++) {
      var a = angleStep * i - Math.PI / 2;
      var ratio = Math.min(1, vals[i] / maxVals[i]);
      ctx.fillStyle = labelColors[i];
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * radius * ratio, cy + Math.sin(a) * radius * ratio, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 라벨
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (var i = 0; i < axes; i++) {
    var a = angleStep * i - Math.PI / 2;
    var lx = cx + Math.cos(a) * (radius + 20), ly = cy + Math.sin(a) * (radius + 20);
    ctx.fillStyle = labelColors[i]; ctx.font = 'bold 10px sans-serif';
    ctx.fillText(labels[i], lx, ly - 6);
    ctx.fillStyle = '#fff'; ctx.font = '9px sans-serif';
    ctx.fillText(cls ? vals[i] : '-', lx, ly + 6);
  }
}
