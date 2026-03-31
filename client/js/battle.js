// ─── PvP Battle Arena ───
var G = window.Game;

var canvas = document.getElementById('battle-canvas');
var ctx = canvas.getContext('2d');
var ARENA_WIDTH = 1600;
var ARENA_HEIGHT = 400;

// ─── 배속 컨트롤 ───
var speedBtn = document.getElementById('speedBtn');
if (speedBtn) {
  speedBtn.addEventListener('click', function() {
    var idx = (G.SPEED_OPTIONS.indexOf(G.playbackSpeed) + 1) % G.SPEED_OPTIONS.length;
    G.playbackSpeed = G.SPEED_OPTIONS[idx];
    speedBtn.textContent = G.playbackSpeed + 'x';
    G.socket.emit('setSpeed', G.playbackSpeed);
  });
}

// ─── Canvas resize (2:1 aspect) ───
function resizeCanvas() {
  var container = canvas.parentElement;
  var style = getComputedStyle(container);
  var pad = parseFloat(style.paddingLeft || 0) + parseFloat(style.paddingRight || 0);
  var w = Math.min(800, container.clientWidth - Math.max(pad, 10));
  canvas.width = w;
  canvas.height = Math.round(w * 0.5);
}

resizeCanvas();
window.addEventListener('resize', function() {
  resizeCanvas();
  if (G.battleChars.length > 0 && !G.isBattleActive) {
    renderFrame();
  }
});

// ─── Diamond field rendering ───
function getDiamondParams(W, H) {
  var cx = W / 2;
  var cy = H * 0.62;
  var dw = W * 0.45;
  var dh = H * 0.30;
  return { cx: cx, cy: cy, dw: dw, dh: dh };
}

function drawDiamondField(W, H) {
  var d = getDiamondParams(W, H);

  ctx.fillStyle = '#0f3460';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#0f2847';
  ctx.beginPath();
  ctx.moveTo(d.cx, d.cy - d.dh);
  ctx.lineTo(d.cx + d.dw, d.cy);
  ctx.lineTo(d.cx, d.cy + d.dh);
  ctx.lineTo(d.cx - d.dw, d.cy);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#1a3a5c';
  ctx.lineWidth = 1;
  var gridCount = 6;
  for (var i = 1; i < gridCount; i++) {
    var t = i / gridCount;
    ctx.beginPath();
    var lx1 = d.cx + (-d.dw) * (1 - t) + 0 * t;
    var ly1 = d.cy + 0 * (1 - t) + (-d.dh) * t;
    var lx2 = d.cx + 0 * (1 - t) + d.dw * t;
    var ly2 = d.cy + d.dh * (1 - t) + 0 * t;
    ctx.moveTo(lx1, ly1);
    ctx.lineTo(lx2, ly2);
    ctx.stroke();

    ctx.beginPath();
    var rx1 = d.cx + d.dw * (1 - t) + 0 * t;
    var ry1 = d.cy + 0 * (1 - t) + (-d.dh) * t;
    var rx2 = d.cx + 0 * (1 - t) + (-d.dw) * t;
    var ry2 = d.cy + d.dh * (1 - t) + 0 * t;
    ctx.moveTo(rx1, ry1);
    ctx.lineTo(rx2, ry2);
    ctx.stroke();
  }
}

// ─── Coordinate transformation ───
function serverToQuarterView(serverX, syntheticY, W, H) {
  var d = getDiamondParams(W, H);
  var normX = (serverX / ARENA_WIDTH) * 2 - 1;
  var normY = (syntheticY / ARENA_HEIGHT) * 2 - 1;
  var qvX = d.cx + (normX - normY) * d.dw * 0.5;
  var qvY = d.cy + (normX + normY) * d.dh * 0.5;
  return { qvX: qvX, qvY: qvY };
}

function getDepthScale(qvY, H, isMobile) {
  var d = getDiamondParams(canvas.width, H);
  var minY = d.cy - d.dh;
  var maxY = d.cy + d.dh;
  var t = Math.max(0, Math.min(1, (qvY - minY) / (maxY - minY)));
  if (isMobile) return 0.85 + t * 0.15;
  return 0.8 + t * 0.2;
}

// ─── Main render frame ───
function renderFrame() {
  var W = canvas.width;
  var H = canvas.height;
  var now = performance.now();
  var isMobile = W < 400;

  ctx.clearRect(0, 0, W, H);
  drawDiamondField(W, H);

  var totalChars = G.battleChars.length;
  var charsToDraw = G.battleChars.map(function(c, idx) {
    var syntheticY = (idx / Math.max(1, totalChars)) * ARENA_HEIGHT * 0.6 + ARENA_HEIGHT * 0.2;
    var pos = serverToQuarterView(c.x, syntheticY, W, H);
    var depthScale = getDepthScale(pos.qvY, H, isMobile);
    return { char: c, qvX: pos.qvX, qvY: pos.qvY, depthScale: depthScale };
  });

  charsToDraw.sort(function(a, b) { return a.qvY - b.qvY; });

  for (var i = 0; i < charsToDraw.length; i++) {
    var item = charsToDraw[i];
    var deathProgress;
    var da = G.deathAnims.get(item.char.id);
    if (da) {
      var dt = (now - da.born) / da.duration;
      if (dt < 1) {
        deathProgress = dt;
      }
    }
    drawCharacter(ctx, item.char, item.qvX, item.qvY, item.depthScale, deathProgress);
  }

  for (var j = G.animations.length - 1; j >= 0; j--) {
    var anim = G.animations[j];
    if (now - anim.born > anim.duration) {
      G.animations.splice(j, 1);
      continue;
    }
    drawEffect(ctx, anim, now);
  }
}

function animationLoop() {
  renderFrame();
  if (G.isBattleActive) {
    G.animFrameId = requestAnimationFrame(animationLoop);
  }
}

// ─── Helper: find character qv position ───
function getCharQV(charId) {
  var W = canvas.width;
  var H = canvas.height;
  var totalChars = G.battleChars.length;
  var idx = G.battleChars.findIndex(function(c) { return c.id === charId; });
  if (idx < 0) return null;
  var c = G.battleChars[idx];
  var syntheticY = (idx / Math.max(1, totalChars)) * ARENA_HEIGHT * 0.6 + ARENA_HEIGHT * 0.2;
  return serverToQuarterView(c.x, syntheticY, W, H);
}

// ─── Socket events ───
G.socket.on('battleStart', function(data) {
  showScreen('battle-screen');
  resizeCanvas();
  G.battleChars = [];
  G.animations = [];
  G.deathAnims.clear();
  G.deadAnimated.clear();
  G.isBattleActive = true;
  document.getElementById('tickInfo').textContent = '총 ' + data.totalTicks + '틱';
  G.animFrameId = requestAnimationFrame(animationLoop);
});

G.socket.on('battleTick', function(data) {
  G.battleChars = data.state;

  var hpEl = document.getElementById('hpBars');
  hpEl.innerHTML = G.battleChars.map(function(c) {
    var pct = Math.max(0, c.hp / c.maxHP * 100);
    var color = c.alive ? (G.classColors[c.className] || '#e94560') : '#555';
    return '<div class="hp-bar-container">' +
      '<div class="char-name" style="color:' + color + '">' + esc(c.name) + ' (' + esc(c.className || '?') + ')</div>' +
      '<div class="hp-bar-bg"><div class="hp-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<div class="hp-text">' + c.hp + '/' + c.maxHP + '</div>' +
    '</div>';
  }).join('');

  if (data.tick !== null && data.tick !== undefined) {
    document.getElementById('tickInfo').textContent = '틱: ' + data.tick;
  }

  var events = data.events || [];
  for (var i = 0; i < events.length; i++) {
    var evt = events[i];
    switch (evt.type) {
      case 'damage': {
        if (evt.amount <= 0) break;
        var pos = getCharQV(evt.to);
        if (pos) {
          spawnDamageNumber(G.animations, pos.qvX, pos.qvY - 20, evt.amount, !!evt.skill, !!evt.crit);
        }
        break;
      }
      case 'skill': {
        var casterPos = getCharQV(evt.caster);
        if (casterPos) {
          var casterColor = (function() {
            var c = G.battleChars.find(function(ch) { return ch.id === evt.caster; });
            return c ? (G.classColors[c.className] || '#7ec8e3') : '#7ec8e3';
          })();
          spawnSkillName(G.animations, casterPos.qvX, casterPos.qvY - 40, evt.skillName);

          if (evt.aoe) {
            spawnAoeEffect(G.animations, casterPos.qvX, casterPos.qvY, casterColor);
          } else if (evt.skillType === 'defense' || evt.skillType === 'buff') {
            spawnBuffEffect(G.animations, casterPos.qvX, casterPos.qvY, casterColor);
          } else {
            var dmgEvt = events.find(function(e) { return e.type === 'damage' && e.skill && e.from === evt.caster; });
            if (dmgEvt) {
              var targetPos = getCharQV(dmgEvt.to);
              if (targetPos) {
                spawnProjectile(G.animations, casterPos.qvX, casterPos.qvY, targetPos.qvX, targetPos.qvY, casterColor);
              }
            }
          }
        }
        break;
      }
      case 'death': {
        if (!G.deadAnimated.has(evt.target)) {
          G.deadAnimated.add(evt.target);
          var dpos = getCharQV(evt.target);
          var dc = G.battleChars.find(function(ch) { return ch.id === evt.target; });
          var dcolor = dc ? (G.classColors[dc.className] || '#e94560') : '#e94560';
          if (dpos) {
            spawnDeathEffect(G.animations, G.deathAnims, dpos.qvX, dpos.qvY, dcolor, evt.target);
          }
        }
        break;
      }
    }
  }
});

// ─── 결과 ───
G.socket.on('battleEnd', function(data) {
  G.isBattleActive = false;
  if (G.animFrameId) {
    cancelAnimationFrame(G.animFrameId);
    G.animFrameId = null;
  }
  G.animations = [];
  G.deathAnims.clear();
  G.deadAnimated.clear();

  showScreen('result-screen');
  var el = document.getElementById('resultCards');
  el.innerHTML = data.results.map(function(r) {
    var rankClass = r.rank <= 3 ? 'rank-' + r.rank : '';
    return '<div class="result-card">' +
      '<div class="rank ' + rankClass + '">' + r.rank + '등</div>' +
      '<div>' +
        '<div style="font-weight:bold">' + esc(r.name) + ' (' + esc(r.className) + ')</div>' +
        '<div style="color:#aaa">HP: ' + r.hpRemaining + '</div>' +
        '<div class="reward-gold">+' + r.reward.gold + 'G</div>' +
      '</div>' +
    '</div>';
  }).join('');
});
