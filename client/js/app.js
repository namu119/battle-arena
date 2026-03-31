// ─── Global Game Namespace ───
window.Game = {
  socket: io(),
  classData: {},
  equipData: {},
  dataLoaded: false,
  myName: '',
  soloPlay: false,
  survivalPlay: false,
  classColors: { '전사':'#e94560', '마법사':'#7b2ff7', '도적':'#2ecc71', '기사':'#3498db', '궁수':'#f39c12' },
  playbackSpeed: 1,
  SPEED_OPTIONS: [1, 2, 4],
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
  } catch (e) {
    console.error('데이터 로드 실패', e);
    document.getElementById('loading-overlay').textContent = '데이터 로드 실패. 새로고침 해주세요.';
  }
}
loadGameData();

// ─── 화면 전환 ───
function showScreen(id) {
  document.querySelectorAll('#lobby,#workshop,#battle-screen,#result-screen,#survival-screen').forEach(function(el) { el.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

// ─── 로비 ───
function createRoom() {
  if (!G.dataLoaded) return;
  G.myName = document.getElementById('playerName').value.trim() || ('전사' + Math.floor(Math.random()*999));
  G.socket.emit('createRoom', G.myName);
}

function refreshRooms() {
  G.socket.emit('getRooms');
}

function joinRoom(roomId) {
  if (!G.dataLoaded) return;
  G.myName = document.getElementById('playerName').value.trim() || ('전사' + Math.floor(Math.random()*999));
  G.socket.emit('joinRoom', { roomId: roomId, playerName: G.myName });
}

G.socket.on('roomList', function(list) {
  var el = document.getElementById('roomList');
  if (list.length === 0) { el.innerHTML = '<p style="color:#aaa">열린 방 없음</p>'; return; }
  el.innerHTML = list.map(function(r) {
    return '<div style="margin:5px"><button class="btn btn-secondary" data-room-id="' + esc(r.id) + '">' + esc(r.id.slice(-6)) + ' (' + Number(r.players) + '/' + Number(r.max) + ')</button></div>';
  }).join('');
  el.querySelectorAll('[data-room-id]').forEach(function(btn) {
    btn.addEventListener('click', function() { joinRoom(btn.dataset.roomId); });
  });
});

function soloMode() {
  if (!G.dataLoaded) return;
  G.myName = document.getElementById('playerName').value.trim() || ('전사' + Math.floor(Math.random()*999));
  G.soloPlay = true;
  G.survivalPlay = false;
  showScreen('workshop');
  initWorkshop();
  document.getElementById('submitBtn').style.display = 'none';
  document.getElementById('aiBtn').style.display = '';
  document.getElementById('survivalBtn').style.display = 'none';
  document.getElementById('playerList').innerHTML = '<b>솔로 모드</b><div class="player-entry player-ready">vs AI 3명</div>';
}

function survivalMode() {
  if (!G.dataLoaded) return;
  G.myName = document.getElementById('playerName').value.trim() || ('전사' + Math.floor(Math.random()*999));
  G.soloPlay = false;
  G.survivalPlay = true;
  showScreen('workshop');
  initWorkshop();
  document.getElementById('submitBtn').style.display = 'none';
  document.getElementById('aiBtn').style.display = 'none';
  document.getElementById('survivalBtn').style.display = '';
  document.getElementById('playerList').innerHTML = '<b>서바이벌 아레나</b><div class="player-entry player-ready">PvE → PvP (5분)</div>';
}

function startSurvival() {
  try {
    var build = makeBuild();
    if (!build) return;
    build.playerName = G.myName;
    G.socket.emit('startSurvival', build);
    document.getElementById('survivalBtn').disabled = true;
    document.getElementById('survivalBtn').textContent = '매칭중...';
  } catch (e) {
    alert('빌드 생성 실패: ' + e.message);
  }
}

G.socket.on('joinedRoom', function(data) {
  G.soloPlay = false;
  showScreen('workshop');
  initWorkshop();
  document.getElementById('submitBtn').style.display = '';
  document.getElementById('aiBtn').style.display = 'none';
  updatePlayerList(data.players);
});

G.socket.on('playerJoined', function(data) { updatePlayerList(data.players); });
G.socket.on('playerLeft', function(data) { updatePlayerList(data.players); });
G.socket.on('playerReady', function(data) { updatePlayerList(data.players); });

function updatePlayerList(players) {
  var el = document.getElementById('playerList');
  el.innerHTML = '<b>참가자</b>' + players.map(function(p) {
    return '<div class="player-entry ' + (p.ready ? 'player-ready' : 'player-waiting') + '">' + esc(p.name) + ' ' + (p.ready ? '✔' : '⏳') + '</div>';
  }).join('');
}

function backToWorkshop() {
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
  showScreen((G.soloPlay || G.survivalPlay) ? 'lobby' : 'workshop');
  if (!G.soloPlay && !G.survivalPlay) initWorkshop();
}

G.socket.on('error', function(msg) { alert(msg); });
