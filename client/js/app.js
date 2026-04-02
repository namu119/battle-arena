// ─── Global Game Namespace ───
window.Game = {
  socket: io(),
  classData: {},
  equipData: {},
  dataLoaded: false,
  myName: '',
  currentRoomId: null,
  isHost: false,
  classColors: { '전사':'#e94560', '마법사':'#7b2ff7', '도적':'#2ecc71', '기사':'#3498db', '궁수':'#f39c12' },
  playbackSpeed: 1,
  SPEED_OPTIONS: [1, 2, 4],
  pvpStance: 'retaliate',
  signalColor: 'none', // passive / hostile / retaliate
  // battle state
  battleChars: [],
  animations: [],
  animFrameId: null,
  isBattleActive: false,
  deadAnimated: new Set(),
  deathAnims: new Map(),
  // survival state
  survivalChars: [],
  survivalAnimations: [],
  survivalAnimFrameId: null,
  isSurvivalActive: false,
  survivalPhase: 1,
  survivalActiveZones: [0,1,2,3],
  cameraX: 0,
  logFilter: 'all',
  logEntries: [],
  // survival death tracking
  survivalDeadAnimated: new Set(),
  survivalDeathAnims: new Map(),
  logFiltersInited: false,
};

var G = window.Game;

// HTML 이스케이프 (XSS 방지)
function esc(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ─── 서버에서 데이터 로드 (await 보장) ───
async function loadGameData() {
  try {
    var res = await fetch('/api/data');
    var data = await res.json();
    G.classData = data.classes;
    G.equipData = data.equipments;
    G.dataLoaded = true;
    document.getElementById('loading-overlay').classList.add('hidden');
    document.getElementById('lobby').classList.add('active');
    // 데이터 로드 후 방 목록 요청
    G.socket.emit('getRooms');
  } catch (e) {
    console.error('데이터 로드 실패', e);
    document.getElementById('loading-overlay').textContent = '데이터 로드 실패. 새로고침 해주세요.';
  }
}
loadGameData();

// ─── 화면 전환 ───
function showScreen(id) {
  document.querySelectorAll('#lobby,#room-screen,#workshop,#battle-screen,#result-screen,#survival-screen').forEach(function(el) { el.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

// ─── 이름 가져오기 ───
function getPlayerName() {
  return document.getElementById('playerName').value.trim() || ('전사' + Math.floor(Math.random()*999));
}

// ─── 로비: 빠른 시작 ───
function quickStart() {
  if (!G.dataLoaded) return;
  G.myName = getPlayerName();
  G.socket.emit('quickStart', G.myName);
}

// ─── 로비: 새 방 만들기 ───
function createNewRoom() {
  if (!G.dataLoaded) return;
  G.myName = getPlayerName();
  G.socket.emit('createRoom', G.myName);
}

// ─── 로비: 방 참가 ───
function joinRoom(roomId) {
  if (!G.dataLoaded) return;
  G.myName = getPlayerName();
  G.socket.emit('joinRoom', { roomId: roomId, playerName: G.myName });
}

// ─── 대기실: AI 추가 ───
function addAI() {
  if (!G.currentRoomId) return;
  G.socket.emit('addAI', G.currentRoomId);
}

// ─── 대기실: 게임 시작 ───
function startGame() {
  if (!G.currentRoomId) return;
  G.socket.emit('startGame');
}

// ─── 방 목록 수신 ───
G.socket.on('roomList', function(list) {
  var el = document.getElementById('roomList');
  if (list.length === 0) {
    el.innerHTML = '<p class="room-empty-msg">열린 방이 없습니다</p>';
    return;
  }
  el.innerHTML = list.map(function(r) {
    return '<div class="room-list-card" data-room-id="' + esc(r.id) + '">' +
      '<div class="room-list-name">' + esc(r.name) + '</div>' +
      '<div class="room-list-info">' + r.playerCount + '/4</div>' +
      '<button class="btn btn-secondary btn-sm">참가</button>' +
    '</div>';
  }).join('');
  el.querySelectorAll('.room-list-card').forEach(function(card) {
    card.querySelector('button').addEventListener('click', function() {
      joinRoom(card.dataset.roomId);
    });
  });
});

// ─── 방 참가 완료 ───
G.socket.on('joinedRoom', function(data) {
  G.currentRoomId = data.roomId;
  G.isHost = true;
  renderRoomSlots(data.slots);
  // quickStart인 경우 goToWorkshop이 바로 옴 → room-screen 안 보여도 됨
  // createRoom인 경우 대기실로
  if (!data.goToWorkshop) {
    showScreen('room-screen');
  }
});

// ─── 방 업데이트 (슬롯 변경) ───
G.socket.on('roomUpdate', function(data) {
  renderRoomSlots(data.slots);
});

// ─── 워크샵으로 이동 ───
G.socket.on('goToWorkshop', function(data) {
  G.currentRoomId = data.roomId;
  showScreen('workshop');
  initWorkshop();
  document.getElementById('submitBtn').style.display = '';
  document.getElementById('submitBtn').disabled = true;
  document.getElementById('submitBtn').textContent = '빌드 제출';
});

// ─── 대기실 슬롯 렌더링 ───
function renderRoomSlots(slots) {
  var container = document.getElementById('roomSlots');
  var allFilled = true;
  container.innerHTML = slots.map(function(s, i) {
    if (s.type === 'empty') {
      allFilled = false;
      return '<div class="slot-card slot-empty" onclick="addAI()">+ AI 추가</div>';
    } else if (s.type === 'ai') {
      return '<div class="slot-card slot-ai">AI ' + esc(s.name) + '</div>';
    } else {
      return '<div class="slot-card slot-player">P' + (i+1) + ' ' + esc(s.name) + '</div>';
    }
  }).join('');
  // 시작 버튼 활성화
  var startBtn = document.getElementById('startGameBtn');
  startBtn.disabled = !allFilled || !G.isHost;
}

// ─── 결과 후 로비로 ───
function backToLobby() {
  G.isBattleActive = false;
  G.isSurvivalActive = false;
  if (G.animFrameId) { cancelAnimationFrame(G.animFrameId); G.animFrameId = null; }
  if (G.survivalAnimFrameId) { cancelAnimationFrame(G.survivalAnimFrameId); G.survivalAnimFrameId = null; }
  G.animations = [];
  G.deathAnims.clear();
  G.deadAnimated.clear();
  G.survivalAnimations = [];
  G.logEntries = [];
  renderLog();
  G.currentRoomId = null;
  G.isHost = false;
  showScreen('lobby');
  G.socket.emit('getRooms');
}

// 게임 종료 → 로비로 자동 복귀
G.socket.on('gameOver', function() {
  var remaining = 10;
  var btn = document.querySelector('.result-lobby-btn');
  if (btn) btn.textContent = '로비로 돌아가기 (' + remaining + ')';
  var timer = setInterval(function() {
    remaining--;
    if (btn) btn.textContent = '로비로 돌아가기 (' + remaining + ')';
    if (remaining <= 0) {
      clearInterval(timer);
      backToLobby();
    }
  }, 1000);
});

G.socket.on('error', function(msg) { alert(msg); });

// ─── PvP 성향 전환 (3버튼) ───
function setPvpStance(stance) {
  G.pvpStance = stance;
  G.socket.emit('setPvpStance', stance);
  var ids = ['stancePassive', 'stanceRetaliate', 'stanceHostile'];
  var map = { passive: 'stancePassive', retaliate: 'stanceRetaliate', hostile: 'stanceHostile' };
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) el.classList.remove('active');
  }
  var active = document.getElementById(map[stance]);
  if (active) active.classList.add('active');
}

// Signal color (5s cooldown)
var _signalCooldown = false;
function setSignalColor(color) {
  if (_signalCooldown) return;
  G.socket.emit('setSignalColor', color);
}

G.socket.on('signalColorChanged', function(color) {
  G.signalColor = color;
  var btns = document.querySelectorAll('.signal-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.remove('active');
    if (btns[i].dataset.color === color) btns[i].classList.add('active');
  }
  // 쿨다운 UI
  _signalCooldown = true;
  var bar = document.querySelector('.signal-color-bar');
  if (bar) bar.classList.add('on-cooldown');
  var label = document.querySelector('.signal-label');
  var remaining = 5;
  if (label) label.textContent = '시그널 ' + remaining + 's';
  var cdTimer = setInterval(function() {
    remaining--;
    if (label) label.textContent = remaining > 0 ? '시그널 ' + remaining + 's' : '시그널:';
    if (remaining <= 0) {
      clearInterval(cdTimer);
      _signalCooldown = false;
      if (bar) bar.classList.remove('on-cooldown');
    }
  }, 1000);
});

G.socket.on('signalCooldown', function(sec) {
  var label = document.querySelector('.signal-label');
  if (label) label.textContent = '대기 ' + sec + 's';
});

// ─── 전투 후 통계 렌더링 ───
function renderBattleStats(results) {
  var el = document.getElementById('battleStats');
  if (!el) return;

  // stats가 없는 결과면 표시하지 않음
  var hasStats = results.some(function(r) { return r.stats; });
  if (!hasStats) { el.innerHTML = ''; return; }

  var maxDmg = 1;
  var maxRecv = 1;
  for (var i = 0; i < results.length; i++) {
    var s = results[i].stats;
    if (!s) continue;
    if (s.damageDealt > maxDmg) maxDmg = s.damageDealt;
    if (s.damageReceived > maxRecv) maxRecv = s.damageReceived;
  }

  // MVP: 최다 데미지 딜러
  var mvpIdx = 0;
  for (var j = 1; j < results.length; j++) {
    if (results[j].stats && results[j].stats.damageDealt > (results[mvpIdx].stats ? results[mvpIdx].stats.damageDealt : 0)) mvpIdx = j;
  }

  // Awards
  var tankIdx = 0, assassinIdx = 0, strategistIdx = 0;
  for (var k = 0; k < results.length; k++) {
    var st = results[k].stats;
    if (!st) continue;
    if (st.damageReceived > (results[tankIdx].stats ? results[tankIdx].stats.damageReceived : 0)) tankIdx = k;
    if (st.kills > (results[assassinIdx].stats ? results[assassinIdx].stats.kills : 0)) assassinIdx = k;
    if (st.skillsUsed > (results[strategistIdx].stats ? results[strategistIdx].stats.skillsUsed : 0)) strategistIdx = k;
  }

  var html = '<div class="stats-title">전투 통계</div>';

  // Awards row
  html += '<div class="stats-awards">';
  html += '<span class="award-badge mvp-badge">⭐ MVP ' + esc(results[mvpIdx].name) + '</span>';
  if (results[tankIdx].stats && results[tankIdx].stats.damageReceived > 0) {
    html += '<span class="award-badge tank-badge">🛡 탱커 ' + esc(results[tankIdx].name) + '</span>';
  }
  if (results[assassinIdx].stats && results[assassinIdx].stats.kills > 0) {
    html += '<span class="award-badge assassin-badge">🗡 암살자 ' + esc(results[assassinIdx].name) + '</span>';
  }
  if (results[strategistIdx].stats && results[strategistIdx].stats.skillsUsed > 0) {
    html += '<span class="award-badge strategist-badge">✨ 전략가 ' + esc(results[strategistIdx].name) + '</span>';
  }
  html += '</div>';

  // Per-character stats
  for (var m = 0; m < results.length; m++) {
    var r = results[m];
    var rs = r.stats;
    if (!rs) continue;
    var color = G.classColors[r.className] || '#e94560';
    var dmgPct = maxDmg > 0 ? (rs.damageDealt / maxDmg * 100) : 0;
    var recvPct = maxRecv > 0 ? (rs.damageReceived / maxRecv * 100) : 0;
    var isMvp = m === mvpIdx;

    html += '<div class="stat-card' + (isMvp ? ' stat-mvp' : '') + '">';
    html += '<div class="stat-name" style="color:' + color + '">' + (isMvp ? '⭐ ' : '') + esc(r.name) + ' (' + esc(r.className) + ')</div>';
    html += '<div class="stat-row"><span class="stat-label">데미지</span><div class="stat-bar-bg"><div class="stat-bar-fill stat-dmg" style="width:' + dmgPct + '%;background:' + color + '"></div></div><span class="stat-val">' + rs.damageDealt + '</span></div>';
    html += '<div class="stat-row"><span class="stat-label">피해량</span><div class="stat-bar-bg"><div class="stat-bar-fill stat-recv" style="width:' + recvPct + '%"></div></div><span class="stat-val">' + rs.damageReceived + '</span></div>';
    html += '<div class="stat-nums">킬: ' + rs.kills + ' | 스킬: ' + rs.skillsUsed + ' | 생존: ' + rs.survivedTicks + '틱</div>';
    html += '</div>';
  }

  el.innerHTML = html;
}
