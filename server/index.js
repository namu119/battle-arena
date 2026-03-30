const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { BattleEngine, TICK_INTERVAL } = require('./BattleEngine');
const { calculateRewards } = require('./Reward');

const classes = require('../data/classes.json');
const equipments = require('../data/equipments.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

function createRoom(id) {
  return {
    id,
    players: new Map(), // socketId → { name, build }
    state: 'waiting',   // waiting | building | battle | result
    minPlayers: 2,
    maxPlayers: 5,
  };
}

io.on('connection', (socket) => {
  console.log(`접속: ${socket.id}`);
  let currentRoom = null;

  // 방 목록
  socket.on('getRooms', () => {
    const list = [];
    for (const [id, room] of rooms) {
      if (room.state === 'waiting') {
        list.push({ id, players: room.players.size, max: room.maxPlayers });
      }
    }
    socket.emit('roomList', list);
  });

  // 방 생성
  socket.on('createRoom', (playerName) => {
    const roomId = `room_${Date.now()}`;
    const room = createRoom(roomId);
    room.players.set(socket.id, { name: playerName, build: null });
    rooms.set(roomId, room);
    currentRoom = room;
    socket.join(roomId);
    socket.emit('joinedRoom', { roomId, players: getPlayerList(room) });
    console.log(`방 생성: ${roomId} by ${playerName}`);
  });

  // 방 참가
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    if (!room || room.state !== 'waiting' || room.players.size >= room.maxPlayers) {
      socket.emit('error', '참가할 수 없는 방입니다');
      return;
    }
    room.players.set(socket.id, { name: playerName, build: null });
    currentRoom = room;
    socket.join(roomId);
    io.to(roomId).emit('playerJoined', { players: getPlayerList(room) });
    console.log(`${playerName} → ${roomId} (${room.players.size}명)`);
  });

  // 빌드 제출
  socket.on('submitBuild', (build) => {
    if (!currentRoom) return;
    const player = currentRoom.players.get(socket.id);
    if (!player) return;
    player.build = build;
    player.build.playerName = player.name;

    io.to(currentRoom.id).emit('playerReady', {
      players: getPlayerList(currentRoom),
    });

    // 모두 빌드 제출 완료 + 최소 인원 충족
    const allReady = [...currentRoom.players.values()].every(p => p.build);
    if (allReady && currentRoom.players.size >= currentRoom.minPlayers) {
      startBattle(currentRoom);
    }
  });

  // AI와 전투 (솔로)
  socket.on('fightAI', (build) => {
    try {
      const playerName = build.playerName || 'Player';
      build.playerName = playerName;

      // AI 3명 생성
      const aiBots = [generateAIBuild(0), generateAIBuild(1), generateAIBuild(2)];
      const allBuilds = [build, ...aiBots];

      console.log(`AI전투 시작: ${playerName} vs ${aiBots.map(b => b.playerName + '(' + b.className + ')').join(', ')}`);

      const engine = new BattleEngine(allBuilds);
      const { log, results } = engine.run();
      const rewarded = calculateRewards(results);

      socket.emit('battleStart', { totalTicks: log.length });

      let tickIndex = 0;
      const interval = setInterval(() => {
        if (tickIndex >= log.length) {
          clearInterval(interval);
          socket.emit('battleEnd', { results: rewarded });
          return;
        }
        socket.emit('battleTick', log[tickIndex]);
        tickIndex++;
      }, TICK_INTERVAL);
    } catch (e) {
      console.error('AI전투 에러:', e);
      socket.emit('error', '전투 시작 실패: ' + e.message);
    }
  });

  // 연결 해제
  socket.on('disconnect', () => {
    if (currentRoom) {
      currentRoom.players.delete(socket.id);
      if (currentRoom.players.size === 0) {
        rooms.delete(currentRoom.id);
      } else {
        io.to(currentRoom.id).emit('playerLeft', { players: getPlayerList(currentRoom) });
      }
    }
    console.log(`퇴장: ${socket.id}`);
  });
});

function getPlayerList(room) {
  const list = [];
  for (const [id, p] of room.players) {
    list.push({ id, name: p.name, ready: !!p.build });
  }
  return list;
}

function startBattle(room) {
  room.state = 'battle';
  const builds = [...room.players.values()].map(p => p.build);

  const engine = new BattleEngine(builds);
  const { log, results } = engine.run();
  const rewarded = calculateRewards(results);

  io.to(room.id).emit('battleStart', { totalTicks: log.length });

  // 틱별 재생 전송
  let tickIndex = 0;
  const interval = setInterval(() => {
    if (tickIndex >= log.length) {
      clearInterval(interval);
      io.to(room.id).emit('battleEnd', { results: rewarded });

      // 방 리셋
      room.state = 'waiting';
      for (const p of room.players.values()) {
        p.build = null;
      }
      return;
    }
    io.to(room.id).emit('battleTick', log[tickIndex]);
    tickIndex++;
  }, TICK_INTERVAL);
}

const PORT = process.env.PORT || 3456;
server.listen(PORT, () => {
  console.log(`Battle Arena 서버 시작: http://localhost:${PORT}`);
});
