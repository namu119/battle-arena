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
    el.innerHTML = '<p style="color:#666;margin:10px 0">열린 방이 없습니다</p>';
    return;
  }
  el.innerHTML = list.map(function(r) {
    return '<div class="room-list-card" data-room-id="' + esc(r.id) + '">' +
      '<div class="room-list-name">' + esc(r.name) + '</div>' +
      '<div class="room-list-info">' + r.playerCount + '/4</div>' +
      '<button class="btn btn-secondary" style="padding:6px 14px;font-size:13px">참가</button>' +
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

G.socket.on('error', function(msg) { alert(msg); });
