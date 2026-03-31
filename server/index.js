const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');
const { SurvivalArena } = require('./SurvivalArena');
const { TICK_INTERVAL } = require('./BattleEngine');

const classes = require('../data/classes.json');
const equipments = require('../data/equipments.json');

const app = express();
const server = http.createServer(app);

// HTTPS 서버 (자체 서명 인증서)
let httpsServer = null;
const certPath = path.join(__dirname, '../certs');
try {
  if (fs.existsSync(path.join(certPath, 'key.pem'))) {
    httpsServer = https.createServer({
      key: fs.readFileSync(path.join(certPath, 'key.pem')),
      cert: fs.readFileSync(path.join(certPath, 'cert.pem')),
    }, app);
  }
} catch (e) {
  console.log('HTTPS 인증서 없음, HTTP만 실행');
}

const io = new Server(server, { cors: { origin: '*' } });
// HTTPS 서버에도 Socket.IO 붙이기
if (httpsServer) io.attach(httpsServer);

// ─── AI 빌드 랜덤 생성 ───
const AI_NAMES = ['철수봇', '영희봇', '민수봇', '지은봇', '현우봇', '수진봇'];
const SLOT_CATEGORIES = { helmet:'helmets', armor:'armors', weapon:'weapons', boots:'boots' };

function generateAIBuild(index) {
  const classNames = Object.keys(classes);
  const cls = classes[classNames[Math.floor(Math.random() * classNames.length)]];

  // 랜덤 스탯 배분 (10포인트)
  const statKeys = ['ATK', 'DEF', 'INT', 'SPD'];
  const alloc = { ATK: 0, DEF: 0, INT: 0, SPD: 0 };
  let remaining = 10;
  while (remaining > 0) {
    const key = statKeys[Math.floor(Math.random() * statKeys.length)];
    alloc[key]++;
    remaining--;
  }

  // 랜덤 장비 선택 (예산 내)
  const equip = {};
  let gold = 1000;
  for (const slot of ['helmet', 'armor', 'weapon', 'boots']) {
    const category = SLOT_CATEGORIES[slot];
    const items = Object.entries(equipments[category]);
    // 살 수 있는 것 중 랜덤
    const affordable = items.filter(([, item]) => item.cost <= gold);
    if (affordable.length === 0) break;
    const [name, item] = affordable[Math.floor(Math.random() * affordable.length)];
    equip[slot] = name;
    gold -= item.cost;
  }

  // 장비 스탯 합산
  const equipStats = { ATK: 0, DEF: 0, INT: 0, SPD: 0 };
  for (const [slot, name] of Object.entries(equip)) {
    const category = SLOT_CATEGORIES[slot];
    const item = equipments[category][name];
    for (const [stat, val] of Object.entries(item.stats)) {
      if (equipStats[stat] !== undefined) equipStats[stat] += val;
    }
  }

  // 스킬 후보에서 3개 선택
  const skillCandidates = [];
  for (const [slot, name] of Object.entries(equip)) {
    const category = SLOT_CATEGORIES[slot];
    skillCandidates.push({ ...equipments[category][name].skill });
  }
  // 셔플 후 3개
  for (let i = skillCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [skillCandidates[i], skillCandidates[j]] = [skillCandidates[j], skillCandidates[i]];
  }
  const skills = skillCandidates.slice(0, 3);

  return {
    playerName: AI_NAMES[index % AI_NAMES.length],
    className: cls.name,
    passive: cls.passive,
    stats: {
      maxHP: cls.baseHP + alloc.DEF * 15,
      ATK: cls.baseATK + alloc.ATK + equipStats.ATK,
      DEF: cls.baseDEF + alloc.DEF + equipStats.DEF,
      INT: alloc.INT + (equipStats.INT || 0),
      SPD: cls.baseSPD + alloc.SPD + (equipStats.SPD || 0),
    },
    range: cls.range,
    btWeights: {
      survive: cls.btWeights.survive + alloc.DEF * 3,
      skill: cls.btWeights.skill + alloc.INT * 3,
      attack: cls.btWeights.attack + alloc.ATK * 3,
    },
    equip,
    skills,
  };
}

app.use(express.static(path.join(__dirname, '../client')));

// 게임 데이터 API
app.get('/api/data', (req, res) => {
  res.json({ classes, equipments });
});

// ─── 방 관리 ───
const rooms = new Map();
let roomCounter = 0;

function createRoom(id, creatorSocketId, creatorName) {
  return {
    id,
    slots: [
      { type: 'player', socketId: creatorSocketId, name: creatorName, build: null },
      { type: 'empty' },
      { type: 'empty' },
      { type: 'empty' },
    ],
    state: 'waiting', // waiting | building | playing
    hostSocketId: creatorSocketId,
  };
}

function getRoomList() {
  const list = [];
  for (const [id, room] of rooms) {
    if (room.state === 'waiting') {
      const slotInfo = room.slots.map(s => ({ type: s.type, name: s.name || null }));
      const playerCount = room.slots.filter(s => s.type !== 'empty').length;
      const hostSlot = room.slots.find(s => s.socketId === room.hostSocketId);
      list.push({ id, name: hostSlot ? hostSlot.name + '의 방' : id, slots: slotInfo, playerCount });
    }
  }
  return list;
}

function getRoomSlotInfo(room) {
  return room.slots.map((s, i) => ({
    index: i,
    type: s.type,
    name: s.name || null,
  }));
}

function broadcastRoomList() {
  io.emit('roomList', getRoomList());
}

io.on('connection', (socket) => {
  console.log(`접속: ${socket.id}`);
  let currentRoomId = null;
  let activeInterval = null;

  // 접속 시 방 목록 전송
  socket.emit('roomList', getRoomList());

  // 방 목록 요청
  socket.on('getRooms', () => {
    socket.emit('roomList', getRoomList());
  });

  // 빠른 시작: 방 생성 + AI 3명 채우기 → 바로 워크샵
  socket.on('quickStart', (playerName) => {
    const roomId = `room_${++roomCounter}_${Date.now()}`;
    const room = createRoom(roomId, socket.id, playerName || 'Player');
    // AI 3명으로 빈 슬롯 채우기
    for (let i = 1; i <= 3; i++) {
      const aiBuild = generateAIBuild(i - 1);
      room.slots[i] = { type: 'ai', name: aiBuild.playerName, build: aiBuild };
    }
    rooms.set(roomId, room);
    currentRoomId = roomId;
    socket.join(roomId);
    // 빠른 시작은 바로 building 상태로
    room.state = 'building';
    socket.emit('joinedRoom', { roomId, slots: getRoomSlotInfo(room) });
    socket.emit('goToWorkshop', { roomId });
    broadcastRoomList();
    console.log(`빠른시작: ${roomId} by ${playerName}`);
  });

  // 방 만들기: 1 플레이어 + 3 빈 슬롯
  socket.on('createRoom', (playerName) => {
    const roomId = `room_${++roomCounter}_${Date.now()}`;
    const room = createRoom(roomId, socket.id, playerName || 'Player');
    rooms.set(roomId, room);
    currentRoomId = roomId;
    socket.join(roomId);
    socket.emit('joinedRoom', { roomId, slots: getRoomSlotInfo(room) });
    broadcastRoomList();
    console.log(`방 생성: ${roomId} by ${playerName}`);
  });

  // 방 참가
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    if (!room || room.state !== 'waiting') {
      socket.emit('error', '참가할 수 없는 방입니다');
      return;
    }
    const emptyIdx = room.slots.findIndex(s => s.type === 'empty');
    if (emptyIdx < 0) {
      socket.emit('error', '방이 꽉 찼습니다');
      return;
    }
    room.slots[emptyIdx] = { type: 'player', socketId: socket.id, name: playerName || 'Player', build: null };
    currentRoomId = roomId;
    socket.join(roomId);
    io.to(roomId).emit('roomUpdate', { slots: getRoomSlotInfo(room) });
    broadcastRoomList();
    console.log(`${playerName} → ${roomId}`);
  });

  // AI 추가
  socket.on('addAI', (roomId) => {
    const room = rooms.get(roomId);
    if (!room || room.state !== 'waiting') return;
    if (room.hostSocketId !== socket.id) return; // 호스트만 가능
    const emptyIdx = room.slots.findIndex(s => s.type === 'empty');
    if (emptyIdx < 0) return;
    const aiBuild = generateAIBuild(emptyIdx);
    room.slots[emptyIdx] = { type: 'ai', name: aiBuild.playerName, build: aiBuild };
    io.to(roomId).emit('roomUpdate', { slots: getRoomSlotInfo(room) });
    broadcastRoomList();
  });

  // 게임 시작 (호스트가 클릭)
  socket.on('startGame', () => {
    const room = rooms.get(currentRoomId);
    if (!room || room.state !== 'waiting') return;
    if (room.hostSocketId !== socket.id) return;
    // 4 슬롯 모두 채워져야 함
    const allFilled = room.slots.every(s => s.type !== 'empty');
    if (!allFilled) {
      socket.emit('error', '모든 슬롯을 채워주세요');
      return;
    }
    room.state = 'building';
    io.to(room.id).emit('goToWorkshop', { roomId: room.id });
    broadcastRoomList();
    console.log(`게임 시작 → 워크샵: ${room.id}`);
  });

  // 빌드 제출
  socket.on('submitBuild', (build) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.state !== 'building') return;
    // 해당 플레이어 슬롯 찾기
    const slot = room.slots.find(s => s.type === 'player' && s.socketId === socket.id);
    if (!slot) return;
    slot.build = build;
    slot.build.playerName = slot.name;

    io.to(room.id).emit('roomUpdate', { slots: getRoomSlotInfo(room) });

    // 모든 빌드 제출 완료 확인 (AI는 이미 빌드 있음)
    const allReady = room.slots.every(s => s.build !== null);
    if (allReady) {
      startSurvivalFromRoom(room);
    }
  });

  // 연결 해제
  socket.on('disconnect', () => {
    if (activeInterval) {
      clearInterval(activeInterval);
      activeInterval = null;
    }
    if (currentRoomId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        // 플레이어 슬롯 비우기
        const slotIdx = room.slots.findIndex(s => s.type === 'player' && s.socketId === socket.id);
        if (slotIdx >= 0) {
          room.slots[slotIdx] = { type: 'empty' };
        }
        // 남은 플레이어 확인
        const remainingPlayers = room.slots.filter(s => s.type === 'player');
        if (remainingPlayers.length === 0) {
          rooms.delete(currentRoomId);
        } else {
          // 호스트가 나갔으면 다른 플레이어를 호스트로
          if (room.hostSocketId === socket.id) {
            room.hostSocketId = remainingPlayers[0].socketId;
          }
          io.to(room.id).emit('roomUpdate', { slots: getRoomSlotInfo(room) });
        }
        broadcastRoomList();
      }
    }
    console.log(`퇴장: ${socket.id}`);
  });

  // ─── 서바이벌 실행 (방에서 트리거) ───
  // 보상 선택 소켓
  socket.on('selectReward', ({ rewardIndex }) => {
    if (!currentArena || !currentArena.pendingRewards) return;
    const playerId = 'p0'; // 인간 플레이어는 항상 p0
    currentArena.applyReward(playerId, rewardIndex);
    // AI도 자동 선택
    for (const char of currentArena.engine.characters) {
      if (char.isMonster || char.id === playerId || !char.alive) continue;
      const bestIdx = currentArena._aiBestReward(char);
      currentArena.applyReward(char.id, bestIdx);
    }
    currentArena.clearRewards();
    // 시뮬레이션 재개
    resumeSurvival();
  });

  let currentArena = null;
  let currentRoom = null;
  let rewardTimeout = null;

  function startSurvivalFromRoom(room) {
    try {
      room.state = 'playing';
      currentRoom = room;
      const allBuilds = room.slots.map(s => s.build);
      console.log(`서바이벌 시작: ${allBuilds.map(b => b.playerName + '(' + b.className + ')').join(', ')}`);

      currentArena = new SurvivalArena(allBuilds);
      currentTickMode = 'survival';

      const playerSockets = room.slots
        .filter(s => s.type === 'player' && s.socketId)
        .map(s => s.socketId);

      for (const sid of playerSockets) {
        const psock = io.sockets.sockets.get(sid);
        if (psock) psock.emit('survivalStart', { totalTicks: 1500, zones: [0,1,2,3], playerZone: 0 });
      }

      // 단계별 시뮬레이션 시작
      runSurvivalSegment();
    } catch (e) {
      console.error('서바이벌 에러:', e);
      socket.emit('error', '서바이벌 시작 실패: ' + e.message);
    }
  }

  function getPlayerSockets() {
    if (!currentRoom) return [];
    return currentRoom.slots
      .filter(s => s.type === 'player' && s.socketId)
      .map(s => s.socketId);
  }

  function emitToPlayers(event, data) {
    for (const sid of getPlayerSockets()) {
      const psock = io.sockets.sockets.get(sid);
      if (psock) psock.emit(event, data);
    }
  }

  function runSurvivalSegment() {
    if (!currentArena || currentArena.finished) return;

    // 100틱씩 실행 (보상 체크 포함)
    const result = currentArena.runUntilTick(currentArena.tick + 100);

    // 새 로그 틱을 스트리밍
    let tickIdx = 0;
    activeInterval = setInterval(() => {
      if (tickIdx >= result.newLog.length) {
        clearInterval(activeInterval);
        activeInterval = null;

        // 게임 종료?
        if (result.finished) {
          emitToPlayers('survivalEnd', { results: result.results });
          cleanupRoom();
          return;
        }

        // 보상 선택 대기?
        if (currentArena.pendingRewards) {
          emitToPlayers('rewardChoice', { rewards: currentArena.pendingRewards });
          // 8초 타임아웃: 미선택시 자동 선택
          rewardTimeout = setTimeout(() => {
            if (currentArena && currentArena.pendingRewards) {
              currentArena._autoSelectAllRewards();
              emitToPlayers('rewardAutoSelected', {});
              resumeSurvival();
            }
          }, 8000);
          return;
        }

        // 다음 세그먼트
        runSurvivalSegment();
        return;
      }
      emitToPlayers('survivalTick', result.newLog[tickIdx]);
      tickIdx++;
    }, TICK_INTERVAL / (Game_speed || 1));
  }

  let Game_speed = 1;
  // 배속 업데이트
  socket.on('setSpeed', (speed) => {
    const validSpeeds = [1, 2, 4];
    if (validSpeeds.includes(speed)) Game_speed = speed;
  });

  function resumeSurvival() {
    if (rewardTimeout) { clearTimeout(rewardTimeout); rewardTimeout = null; }
    runSurvivalSegment();
  }

  function cleanupRoom() {
    if (currentRoom) {
      currentRoom.state = 'waiting';
      for (const s of currentRoom.slots) {
        if (s.type === 'player') s.build = null;
      }
      broadcastRoomList();
    }
    currentArena = null;
    currentRoom = null;
  }
});

const PORT = process.env.PORT || 3456;
const HTTPS_PORT = process.env.HTTPS_PORT || 3457;

server.listen(PORT, () => {
  console.log(`Battle Arena 서버 시작: http://localhost:${PORT}`);
});

if (httpsServer) {
  httpsServer.listen(HTTPS_PORT, () => {
    console.log(`HTTPS 서버 시작: https://localhost:${HTTPS_PORT}`);
  });
}
