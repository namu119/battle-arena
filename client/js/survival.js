// ─── Survival Arena ───
var G = window.Game;

var survivalCanvas = document.getElementById('survival-canvas');
var sCtx = survivalCanvas ? survivalCanvas.getContext('2d') : null;
var ZONE_COLORS = ['#e94560','#7b2ff7','#2ecc71','#f39c12'];
var ZONE_LABELS = ['A','B','C','D'];
var CAMERA_SMOOTH = 0.1;
var MAP_WIDTH = 1600;
var GRID_COLS = 10;
var GRID_ROWS = 6;
var WALL_SERVER_X = [480, 1120];
var WALL_COLS = WALL_SERVER_X.map(function(wx) { return Math.round(wx / MAP_WIDTH * GRID_COLS); });

function resizeSurvivalCanvas() {
  if (!survivalCanvas) return;
  var container = survivalCanvas.parentElement;
  var style = getComputedStyle(container);
  var pad = parseFloat(style.paddingLeft || 0) + parseFloat(style.paddingRight || 0);
  var w = Math.min(800, container.clientWidth - Math.max(pad, 10));
  survivalCanvas.width = w;
  survivalCanvas.height = Math.round(w * 0.5);
}

var survivalSpeedBtn = document.getElementById('survivalSpeedBtn');
if (survivalSpeedBtn) {
  survivalSpeedBtn.addEventListener('click', function() {
    var idx = (G.SPEED_OPTIONS.indexOf(G.playbackSpeed) + 1) % G.SPEED_OPTIONS.length;
    G.playbackSpeed = G.SPEED_OPTIONS[idx];
    survivalSpeedBtn.textContent = G.playbackSpeed + 'x';
    var speedBtn = document.getElementById('speedBtn');
    if (speedBtn) speedBtn.textContent = G.playbackSpeed + 'x';
    G.socket.emit('setSpeed', G.playbackSpeed);
  });
}

if (survivalCanvas) {
  resizeSurvivalCanvas();
  window.addEventListener('resize', function() {
    resizeSurvivalCanvas();
    if (G.survivalChars.length > 0 && !G.isSurvivalActive) renderSurvivalFrame();
  });
}

// ─── 쿼터뷰 그리드 맵 시스템 ───
function getSurvivalDiamond(W, H) {
  return { cx: W/2, cy: H*0.55, dw: W*0.46, dh: H*0.40 };
}

function gridCellToIso(col, row, cx, cy, dw, dh, camShift) {
  var cellW = 2.0 / GRID_COLS;
  var cellH = 2.0 / GRID_ROWS;
  var x0 = col * cellW - 1;
  var y0 = row * cellH - 1;
  var corners = [
    [x0, y0], [x0 + cellW, y0],
    [x0 + cellW, y0 + cellH], [x0, y0 + cellH]
  ];
  return corners.map(function(c) {
    return {
      sx: cx + (c[0] - c[1]) * dw * 0.5 + (camShift || 0),
      sy: cy + (c[0] + c[1]) * dh * 0.5
    };
  });
}

function drawSurvivalField(W, H) {
  sCtx.fillStyle = '#0a0a1e';
  sCtx.fillRect(0, 0, W, H);

  var d = getSurvivalDiamond(W, H);
  var camOffsetNorm = ((G.cameraX - MAP_WIDTH/2) / (MAP_WIDTH/2));
  var camShiftGlobal = -camOffsetNorm * d.dw * 0.5;

  for (var r = 0; r < GRID_ROWS; r++) {
    for (var c = 0; c < GRID_COLS; c++) {
      var shifted = gridCellToIso(c, r, d.cx, d.cy, d.dw, d.dh, camShiftGlobal);
      var isWall = WALL_COLS.includes(c);

      sCtx.beginPath();
      sCtx.moveTo(shifted[0].sx, shifted[0].sy);
      for (var i = 1; i < 4; i++) sCtx.lineTo(shifted[i].sx, shifted[i].sy);
      sCtx.closePath();

      if (isWall) {
        sCtx.fillStyle = '#2a0a10';
        sCtx.fill();
        sCtx.strokeStyle = '#e94560';
        sCtx.lineWidth = 3;
        sCtx.stroke();
        sCtx.strokeStyle = 'rgba(233,69,96,0.5)';
        sCtx.lineWidth = 1.5;
        sCtx.beginPath();
        sCtx.moveTo(shifted[0].sx, shifted[0].sy);
        sCtx.lineTo(shifted[2].sx, shifted[2].sy);
        sCtx.moveTo(shifted[1].sx, shifted[1].sy);
        sCtx.lineTo(shifted[3].sx, shifted[3].sy);
        sCtx.stroke();
        var mx = (shifted[0].sx + shifted[2].sx) / 2;
        var my = (shifted[0].sy + shifted[2].sy) / 2;
        sCtx.fillStyle = '#e94560';
        sCtx.font = Math.round(W * 0.02) + 'px sans-serif';
        sCtx.textAlign = 'center';
        sCtx.fillText('\uD83E\uDDF1', mx, my + 3);
      } else {
        var zone = c < WALL_COLS[0] ? 0 : c < WALL_COLS[1] ? 1 : 2;
        var zoneColors = ['#0f2847', '#0d2040', '#0f2847'];
        sCtx.fillStyle = zoneColors[zone];
        sCtx.fill();
        sCtx.strokeStyle = '#1a3a5c';
        sCtx.lineWidth = 0.5;
        sCtx.stroke();
      }
    }
  }
}

function serverToSurvivalQV(serverX, charIdx, totalChars, W, H) {
  var d = getSurvivalDiamond(W, H);
  var camOffsetNorm = ((G.cameraX - MAP_WIDTH/2) / (MAP_WIDTH/2));
  var camShift = -camOffsetNorm * d.dw * 0.5;
  var normX = (serverX / MAP_WIDTH) * 2 - 1;
  var normY = totalChars > 1 ? ((charIdx / (totalChars - 1)) * 2 - 1) * 0.5 : 0;
  var qvX = d.cx + (normX - normY) * d.dw * 0.5 + camShift;
  var qvY = d.cy + (normX + normY) * d.dh * 0.5;
  return { qvX: qvX, qvY: qvY };
}

function renderSurvivalFrame() {
  if (!sCtx) return;
  var W = survivalCanvas.width;
  var H = survivalCanvas.height;
  var now = performance.now();
  var isMobile = W < 400;

  var playerChar = G.survivalChars.find(function(c) { return c.id === 'p0'; });
  if (playerChar) {
    var targetCam = Math.max(400, Math.min(MAP_WIDTH - 400, playerChar.x));
    G.cameraX += (targetCam - G.cameraX) * CAMERA_SMOOTH;
  }

  sCtx.clearRect(0, 0, W, H);
  drawSurvivalField(W, H);

  var chars = G.survivalChars.filter(function(c) { return c.alive || G.survivalDeathAnims.has(c.id); });
  var totalChars = chars.length;

  var toDraw = chars.map(function(c, idx) {
    var pos = serverToSurvivalQV(c.x, idx, totalChars, W, H);
    return { char: c, qvX: pos.qvX, qvY: pos.qvY };
  }).sort(function(a, b) { return a.qvY - b.qvY; });

  for (var i = 0; i < toDraw.length; i++) {
    var item = toDraw[i];
    var mobileScale = isMobile ? 0.7 : 1.0;
    var scale = (item.char.isMonster ? 0.6 : 0.8) * mobileScale;
    var deathProgress;
    var da = G.survivalDeathAnims.get(item.char.id);
    if (da) {
      var dt = (now - da.born) / da.duration;
      if (dt < 1) deathProgress = dt;
    }

    if (item.char.isMonster) {
      drawMonster(sCtx, item.char, item.qvX, item.qvY, scale, deathProgress);
    } else {
      drawCharacter(sCtx, item.char, item.qvX, item.qvY, scale, deathProgress);
    }
  }

  // Minimap
  var mmW = isMobile ? Math.min(W * 0.28, 90) : W * 0.2;
  var mmH = isMobile ? 20 : H * 0.12;
  var mmX = 6;
  var mmY = 6;
  sCtx.fillStyle = 'rgba(0,0,0,0.5)';
  sCtx.fillRect(mmX, mmY, mmW, mmH);
  sCtx.strokeStyle = 'rgba(255,255,255,0.3)';
  sCtx.lineWidth = 1;
  sCtx.strokeRect(mmX, mmY, mmW, mmH);
  for (var wi = 0; wi < WALL_SERVER_X.length; wi++) {
    var wallX = WALL_SERVER_X[wi];
    var wx = mmX + (wallX / MAP_WIDTH) * mmW;
    var ww = mmW / GRID_COLS;
    sCtx.fillStyle = 'rgba(233,69,96,0.4)';
    sCtx.fillRect(wx - ww/2, mmY, ww, mmH);
  }
  var vpLeft = mmX + ((G.cameraX - 400) / MAP_WIDTH) * mmW;
  var vpW = (800 / MAP_WIDTH) * mmW;
  sCtx.strokeStyle = 'rgba(255,255,255,0.5)';
  sCtx.strokeRect(Math.max(mmX, vpLeft), mmY, Math.min(vpW, mmW), mmH);
  for (var ci = 0; ci < G.survivalChars.length; ci++) {
    var mc = G.survivalChars[ci];
    if (!mc.alive) continue;
    var dotX = mmX + (mc.x / MAP_WIDTH) * mmW;
    var dotY = mmY + mmH * 0.5;
    sCtx.fillStyle = mc.isMonster ? (mc.isBoss ? '#ff0000' : '#ff8800') : (G.classColors[mc.className] || '#fff');
    var dotR = mc.isMonster ? (mc.isBoss ? 3 : 1.5) : 2.5;
    sCtx.beginPath();
    sCtx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
    sCtx.fill();
  }

  // Draw animations
  for (var ai = G.survivalAnimations.length - 1; ai >= 0; ai--) {
    var anim = G.survivalAnimations[ai];
    if (now - anim.born > anim.duration) {
      G.survivalAnimations.splice(ai, 1);
      continue;
    }
    drawEffect(sCtx, anim, now);
  }
}

function survivalAnimLoop() {
  renderSurvivalFrame();
  if (G.isSurvivalActive) {
    G.survivalAnimFrameId = requestAnimationFrame(survivalAnimLoop);
  }
}

// ─── Log System ───
function survivalLogAdd(text, charIds) {
  var ids = charIds || [];
  if (ids.length === 0 && G.survivalChars.length > 0) {
    for (var i = 0; i < G.survivalChars.length; i++) {
      var c = G.survivalChars[i];
      if (!c.isMonster && text.includes(c.name)) ids.push(c.id);
    }
  }
  G.logEntries.push({ text: text, charIds: ids });
  if (G.logEntries.length > 50) G.logEntries.shift();
  renderLog();
}

// 로그 필터: Set으로 관리 (빈 Set = 전체, charId 있으면 해당 캐릭터 포함)
G.logFilterSet = new Set();

function renderLog() {
  var el = document.getElementById('survivalLog');
  if (!el) return;
  el.innerHTML = '';
  var filtered = G.logFilterSet.size === 0
    ? G.logEntries
    : G.logEntries.filter(function(e) {
        // 시스템 로그(charIds 없음)는 항상 표시
        if (e.charIds.length === 0) return true;
        // 선택된 캐릭터 중 하나라도 관련되면 표시
        for (var j = 0; j < e.charIds.length; j++) {
          if (G.logFilterSet.has(e.charIds[j])) return true;
        }
        return false;
      });
  var entries = filtered.slice(-30);
  for (var i = 0; i < entries.length; i++) {
    var entry = document.createElement('div');
    entry.className = 'survival-log-entry';
    entry.textContent = entries[i].text;
    el.appendChild(entry);
  }
  el.scrollTop = el.scrollHeight;
}

function toggleLogFilter(charId) {
  if (G.logFilterSet.has(charId)) {
    G.logFilterSet.delete(charId);
  } else {
    G.logFilterSet.add(charId);
  }
  renderLog();
  // HP카드 시각 업데이트는 다음 틱에서 자동 반영
}

function survivalNotify(text, color) {
  survivalLogAdd(text);
}

// ─── HP카드 탭 → 로그 필터 ───
var hpBarsEl = document.getElementById('survivalHpBars');
if (hpBarsEl) {
  hpBarsEl.addEventListener('click', function(e) {
    var card = e.target.closest('.survival-hp-card');
    if (!card) return;
    var charId = card.dataset.charId;
    if (!charId) return;
    toggleLogFilter(charId);
  });
}

// ─── Survival Socket Events ───
G.socket.on('survivalStart', function(data) {
  showScreen('survival-screen');
  resizeSurvivalCanvas();
  G.survivalChars = [];
  G.survivalAnimations = [];
  G.survivalDeathAnims.clear();
  G.survivalDeadAnimated.clear();
  G.survivalPhase = 1;
  G.survivalActiveZones = [0,1,2,3];
  G.isSurvivalActive = true;
  var sti = document.getElementById('survivalTickInfo');
  if (sti) sti.textContent = '총 ' + data.totalTicks + '틱';
  G.logEntries = [];
  G.logFilter = 'all';
  G.logFilterSet = new Set();
  renderLog();
  G.survivalAnimFrameId = requestAnimationFrame(survivalAnimLoop);
});

G.socket.on('survivalTick', function(data) {
  G.survivalChars = data.state;
  // 로그 필터는 HP카드 탭으로 직접 토글
  G.survivalPhase = data.phase || 1;
  G.survivalActiveZones = data.activeZones || [0,1,2,3];

  // Update HUD
  var player = G.survivalChars.find(function(c) { return c.id === 'p0'; });
  if (player) {
    document.getElementById('survivalGold').textContent = '\uD83D\uDCB0 ' + (player.gold || 0) + 'G';
    var enh = player.enhancementLevels;
    if (enh) {
      var slots = { helmet:'투구', armor:'갑옷', weapon:'무기', boots:'신발' };
      for (var k in slots) {
        var el = document.getElementById('enh-' + k);
        if (el) { el.textContent = slots[k] + (enh[k]||0); el.style.borderColor = enh[k] >= 3 ? '#e94560' : enh[k] >= 2 ? '#f0a500' : enh[k] >= 1 ? '#7ec8e3' : '#444'; }
      }
    }
  }

  var elapsed = (data.tick || 0) * 0.2;
  var remaining = Math.max(0, 300 - elapsed);
  var min = Math.floor(remaining / 60);
  var sec = Math.floor(remaining % 60);
  document.getElementById('survivalTimer').textContent = min + ':' + sec.toString().padStart(2,'0');

  var phaseLabels = { 1: 'Phase 1 - PvE', 2: 'Phase 2 - 합류', 3: 'Phase 3 - FFA' };
  document.getElementById('survivalPhase').textContent = phaseLabels[G.survivalPhase] || '';

  if (data.tick) { var sti2 = document.getElementById('survivalTickInfo'); if (sti2) sti2.textContent = '틱: ' + data.tick; }

  // HP bars
  var players = G.survivalChars.filter(function(c) { return !c.isMonster; });
  var hpEl = document.getElementById('survivalHpBars');
  hpEl.innerHTML = players.map(function(c) {
    var pct = Math.max(0, c.hp / c.maxHP * 100);
    var color = c.alive ? (G.classColors[c.className] || '#e94560') : '#555';
    var lives = c.livesRemaining != null ? c.livesRemaining : '?';
    var chaos = (c.chaos || 0) > 0 ? '<span style="color:#ff4444;font-size:0.8em"> \uD83D\uDD25' + c.chaos + '</span>' : '';
    var isMe = c.id === 'p0';
    var border = isMe ? 'border:1px solid #e94560' : '';
    var filterCls = G.logFilterSet.has(c.id) ? 'filter-active' : '';
    return '<div class="survival-hp-card ' + (c.alive ? '' : 'dead') + ' ' + filterCls + '" data-char-id="' + c.id + '" style="' + border + '">' +
      '<div class="hp-name" style="color:' + color + '">' + esc(c.name) + chaos + '</div>' +
      '<div class="hp-bar-outer"><div class="hp-bar-inner" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<div class="hp-info">' + c.hp + '/' + c.maxHP + ' | \u2665' + lives + '</div>' +
    '</div>';
  }).join('');

  // Process events
  var events = data.events || [];
  for (var ei = 0; ei < events.length; ei++) {
    var evt = events[ei];
    if (evt.type === 'damage' && evt.amount > 0) {
      var aliveChars = G.survivalChars.filter(function(c) { return c.alive || G.survivalDeathAnims.has(c.id); });
      var targetIdx = aliveChars.findIndex(function(c) { return c.id === evt.to; });
      var target = aliveChars[targetIdx];
      var attacker = G.survivalChars.find(function(c) { return c.id === evt.from; });
      if (target && targetIdx >= 0) {
        var pos = serverToSurvivalQV(target.x, targetIdx, aliveChars.length, survivalCanvas.width, survivalCanvas.height);
        G.survivalAnimations.push({ type:'damage', x:pos.qvX, y:pos.qvY-15, startY:pos.qvY-15, amount:evt.amount, isSkill:!!evt.skill, isCrit:!!evt.crit, born:performance.now(), duration:evt.crit?1200:1000 });
      }
      if (evt.amount >= 5 || evt.skill || evt.crit) {
        var aName = attacker ? attacker.name : '?';
        var tName = target ? target.name : '?';
        var extra = evt.crit ? ' \uD83D\uDCA5크릿!' : evt.skill ? ' [' + evt.skill + ']' : '';
        survivalLogAdd(aName + ' \u2192 ' + tName + ' ' + evt.amount + 'dmg' + extra);
      }
    }
    if (evt.type === 'death' && !G.survivalDeadAnimated.has(evt.target)) {
      G.survivalDeadAnimated.add(evt.target);
      var aliveChars2 = G.survivalChars.filter(function(c) { return c.alive || G.survivalDeathAnims.has(c.id); });
      var cIdx = aliveChars2.findIndex(function(ch) { return ch.id === evt.target; });
      var dc = aliveChars2[cIdx];
      if (dc && cIdx >= 0) {
        var dpos = serverToSurvivalQV(dc.x, cIdx, aliveChars2.length, survivalCanvas.width, survivalCanvas.height);
        G.survivalDeathAnims.set(evt.target, { born:performance.now(), duration:800 });
        var killer = evt.killedBy ? G.survivalChars.find(function(ch) { return ch.id === evt.killedBy; }) : null;
        if (dc.isMonster) {
          survivalLogAdd('\u2620 ' + dc.name + ' 처치' + (killer ? ' by '+killer.name : ''));
        }
        if (!dc.isMonster) survivalNotify(dc.name + ' 사망!', '#e94560');
      }
    }
    if (evt.type === 'drop') {
      var slotNames = { helmet:'투구', armor:'갑옷', weapon:'무기', boots:'신발' };
      if (evt.dropType === 'enhancement') {
        survivalNotify('\uD83D\uDD28 ' + (slotNames[evt.slot]||evt.slot) + ' +' + evt.level + ' 강화!', '#f0a500');
      } else if (evt.dropType === 'goldOverflow') {
        survivalNotify('\uD83D\uDCB0 +' + evt.gold + 'G (' + (slotNames[evt.slot]) + ' MAX)', '#f0a500');
      } else if (evt.dropType === 'goldEnhance') {
        survivalNotify('\uD83D\uDCB0 골드 강화: ' + (slotNames[evt.slot]) + ' +' + evt.level, '#7ec8e3');
      } else if (evt.dropType === 'playerKill') {
        survivalNotify('\u2694 ' + evt.victimName + ' 처치! +' + evt.gold + 'G' + (evt.stolenSlot ? ' +' + (slotNames[evt.stolenSlot]||evt.stolenSlot) + ' 탈취' : ''), '#ff4444');
      }
    }
    if (evt.type === 'skill') {
      var caster = G.survivalChars.find(function(c) { return c.id === evt.caster; });
      if (caster && !caster.isMonster) {
        survivalLogAdd('\u2728 ' + caster.name + ' [' + evt.skillName + '] 사용');
      }
    }
    if (evt.type === 'waveSpawn') {
      survivalNotify('\u2694 Wave 몬스터 출현!', '#ff6644');
      survivalLogAdd('\u2694 몬스터 웨이브 출현! (' + evt.count + '마리)');
    }
    if (evt.type === 'zoneMerge') {
      survivalNotify('\uD83D\uDD25 존 합류! Phase ' + evt.phase, '#e94560');
    }
    if (evt.type === 'bossSpawn') {
      survivalNotify('\uD83D\uDC09 최종보스 ' + evt.name + ' 출현! HP:' + evt.hp, '#ff0000');
      survivalLogAdd('\uD83D\uDC09 최종보스 ' + evt.name + ' 출현!');
    }
    if (evt.type === 'bossKill') {
      survivalNotify('\uD83D\uDC51 ' + evt.killerName + '이(가) 보스를 처치! 승리!', '#ffd700');
      survivalLogAdd('\uD83D\uDC51 ' + evt.killerName + ' 보스 처치! 승리!');
    }
    if (evt.type === 'respawnQueued') {
      survivalNotify('\uD83D\uDC80 ' + evt.playerName + ' 사망! ' + evt.respawnIn + '초 후 부활 (\u2665' + evt.livesRemaining + ')', '#ff8800');
      survivalLogAdd('\uD83D\uDC80 ' + evt.playerName + ' 사망 (\u2665' + evt.livesRemaining + ')');
    }
    if (evt.type === 'respawn') {
      survivalNotify('\u2728 ' + evt.playerName + ' 부활! (\u2665' + evt.livesRemaining + ')', '#2ecc71');
      survivalLogAdd('\u2728 ' + evt.playerName + ' 부활');
    }
    if (evt.type === 'wallBreak') {
      survivalNotify('\uD83E\uDDF1 ' + evt.label + ' 붕괴! 새로운 영역 개방!', '#e94560');
      survivalLogAdd('\uD83E\uDDF1 ' + evt.label + ' 붕괴!');
    }
  }
});

G.socket.on('survivalEnd', function(data) {
  G.isSurvivalActive = false;
  if (G.survivalAnimFrameId) { cancelAnimationFrame(G.survivalAnimFrameId); G.survivalAnimFrameId = null; }
  G.survivalAnimations = [];
  G.survivalDeathAnims.clear();
  G.survivalDeadAnimated.clear();
  G.logEntries = [];
  renderLog();

  showScreen('result-screen');
  var el = document.getElementById('resultCards');
  el.innerHTML = data.results.map(function(r) {
    var rankClass = r.rank <= 3 ? 'rank-' + r.rank : '';
    var enh = r.enhancementLevels || {};
    var enhTotal = Object.values(enh).reduce(function(a,b){return a+b;}, 0);
    var bossTag = r.bossKiller ? '<div style="color:#ffd700;font-weight:bold">\uD83D\uDC51 보스 처치자!</div>' : '';
    return '<div class="result-card">' +
      '<div class="rank ' + rankClass + '">' + r.rank + '등</div>' +
      '<div>' +
        '<div style="font-weight:bold">' + esc(r.name) + ' (' + esc(r.className) + ')</div>' +
        bossTag +
        '<div style="color:#aaa">HP: ' + r.hpRemaining + ' | 킬: ' + (r.monstersKilled || 0) + '마리 | 목숨: ' + (r.livesRemaining != null ? r.livesRemaining : '?') + '</div>' +
        '<div style="color:#f0a500">강화 Lv' + enhTotal + ' (' + (enh.helmet||0) + '/' + (enh.armor||0) + '/' + (enh.weapon||0) + '/' + (enh.boots||0) + ')</div>' +
        '<div style="color:#f0a500">+' + (r.gold || 0) + 'G</div>' +
      '</div>' +
    '</div>';
  }).join('');
});

// ─── 보상 선택 시스템 ───
var rewardTimer = null;

G.socket.on('rewardChoice', function(data) {
  var rewards = data.rewards;
  showRewardUI(rewards);
});

G.socket.on('rewardAutoSelected', function() {
  hideRewardUI();
  survivalLogAdd('⏰ 시간 초과! 보상 자동 선택됨');
});

function showRewardUI(rewards) {
  var overlay = document.getElementById('rewardOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'rewardOverlay';
    overlay.className = 'reward-overlay';
    document.getElementById('survival-screen').appendChild(overlay);
  }

  var html = '<div class="reward-title">⭐ 웨이브 클리어! 보상을 선택하세요</div>';
  html += '<div class="reward-timer" id="rewardTimerText">8</div>';
  html += '<div class="reward-cards">';
  rewards.forEach(function(r, idx) {
    html += '<div class="reward-card" data-idx="' + idx + '">';
    html += '<div class="reward-icon">' + r.icon + '</div>';
    html += '<div class="reward-name">' + esc(r.name) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  overlay.innerHTML = html;
  overlay.style.display = 'flex';

  // 클릭 핸들러
  overlay.querySelectorAll('.reward-card').forEach(function(card) {
    card.addEventListener('click', function() {
      var idx = parseInt(card.dataset.idx);
      G.socket.emit('selectReward', { rewardIndex: idx });
      survivalLogAdd('🎁 보상 선택: ' + rewards[idx].icon + ' ' + rewards[idx].name);
      hideRewardUI();
    });
  });

  // 타이머
  var remaining = 8;
  if (rewardTimer) clearInterval(rewardTimer);
  rewardTimer = setInterval(function() {
    remaining--;
    var timerEl = document.getElementById('rewardTimerText');
    if (timerEl) timerEl.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(rewardTimer);
      rewardTimer = null;
    }
  }, 1000);
}

function hideRewardUI() {
  if (rewardTimer) { clearInterval(rewardTimer); rewardTimer = null; }
  var overlay = document.getElementById('rewardOverlay');
  if (overlay) overlay.style.display = 'none';
}
