// ─── Shared Rendering Functions ───
var G = window.Game;

function darkenColor(hex, factor) {
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return 'rgb(' + Math.round(r * factor) + ',' + Math.round(g * factor) + ',' + Math.round(b * factor) + ')';
}

function drawClassIcon(ctx, className, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  switch (className) {
    case '전사':
      ctx.beginPath();
      ctx.moveTo(-size, 0); ctx.lineTo(size, 0);
      ctx.moveTo(0, -size); ctx.lineTo(0, size);
      ctx.stroke();
      break;
    case '마법사':
      for (var i = 0; i < 6; i++) {
        var a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
        ctx.stroke();
      }
      break;
    case '도적':
      ctx.beginPath();
      ctx.moveTo(-size, size * 0.5);
      ctx.lineTo(size, -size * 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, size);
      ctx.lineTo(size * 0.5, -size);
      ctx.stroke();
      break;
    case '기사':
      ctx.strokeRect(-size * 0.6, -size * 0.7, size * 1.2, size * 1.4);
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.4); ctx.lineTo(0, size * 0.4);
      ctx.moveTo(-size * 0.3, 0); ctx.lineTo(size * 0.3, 0);
      ctx.stroke();
      break;
    case '궁수':
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, -size * 0.6);
      ctx.lineTo(size * 0.7, 0);
      ctx.lineTo(-size * 0.5, size * 0.6);
      ctx.closePath();
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function drawWeapon(ctx, className, bodyW, bodyTop, baseSize, color) {
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = Math.max(1, baseSize * 0.1);
  var weaponLen = baseSize * 0.9;
  switch (className) {
    case '전사':
      ctx.beginPath();
      ctx.moveTo(bodyW * 0.45, bodyTop + baseSize * 0.3);
      ctx.lineTo(bodyW * 0.45 + weaponLen, bodyTop);
      ctx.stroke();
      break;
    case '마법사':
      ctx.beginPath();
      ctx.moveTo(bodyW * 0.4, bodyTop + baseSize * 0.5);
      ctx.lineTo(bodyW * 0.35, bodyTop - baseSize * 0.8);
      ctx.stroke();
      ctx.fillStyle = '#7ec8e3';
      ctx.beginPath();
      ctx.arc(bodyW * 0.35, bodyTop - baseSize * 0.9, baseSize * 0.15, 0, Math.PI * 2);
      ctx.fill();
      break;
    case '도적':
      ctx.beginPath();
      ctx.moveTo(bodyW * 0.4, bodyTop + baseSize * 0.4);
      ctx.lineTo(bodyW * 0.4 + weaponLen * 0.6, bodyTop + baseSize * 0.1);
      ctx.stroke();
      break;
    case '기사':
      ctx.fillStyle = darkenColor(color, 0.6);
      ctx.fillRect(-bodyW * 0.5 - baseSize * 0.3, bodyTop + baseSize * 0.1, baseSize * 0.35, baseSize * 0.5);
      ctx.beginPath();
      ctx.moveTo(bodyW * 0.45, bodyTop + baseSize * 0.3);
      ctx.lineTo(bodyW * 0.45 + weaponLen * 0.8, bodyTop);
      ctx.stroke();
      break;
    case '궁수':
      ctx.beginPath();
      ctx.moveTo(-bodyW * 0.4, bodyTop + baseSize * 0.1);
      ctx.quadraticCurveTo(-bodyW * 0.4 - baseSize * 0.4, bodyTop + baseSize * 0.5, -bodyW * 0.4, bodyTop + baseSize * 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-bodyW * 0.35, bodyTop + baseSize * 0.5);
      ctx.lineTo(-bodyW * 0.35 - weaponLen * 0.8, bodyTop + baseSize * 0.5);
      ctx.stroke();
      break;
  }
}

function drawCharacter(ctx, char, qvX, qvY, scale, deathProgress) {
  var color = (char.alive || deathProgress !== undefined)
    ? (G.classColors[char.className] || '#e94560') : '#555';
  var baseSize = 14 * scale;
  var canvasWidth = ctx.canvas.width;

  ctx.save();
  ctx.translate(qvX, qvY);

  if (deathProgress !== undefined) {
    var shrink = 1.0 - deathProgress * 0.7;
    var alpha = 1.0 - deathProgress;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.scale(shrink, shrink);
  } else if (!char.alive) {
    ctx.globalAlpha = 0.3;
  }

  // Shadow ellipse
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 0, baseSize * 1.2, baseSize * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  var legW = baseSize * 0.25;
  var legH = baseSize * 0.4;
  ctx.fillStyle = darkenColor(color, 0.7);
  ctx.fillRect(-baseSize * 0.35, -legH, legW, legH);
  ctx.fillRect(baseSize * 0.1, -legH, legW, legH);

  // Body
  var bodyW = baseSize * 1.1;
  var bodyH = baseSize * 1.2;
  var bodyTop = -legH - bodyH;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-bodyW * 0.45, -legH);
  ctx.lineTo(-bodyW * 0.38, bodyTop);
  ctx.quadraticCurveTo(0, bodyTop - bodyH * 0.1, bodyW * 0.38, bodyTop);
  ctx.lineTo(bodyW * 0.45, -legH);
  ctx.closePath();
  ctx.fill();

  // Class icon on body
  var iconY = bodyTop + bodyH * 0.5;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(1, scale * 1.5);
  drawClassIcon(ctx, char.className, 0, iconY, baseSize * 0.3);

  // Head
  var headR = baseSize * 0.5;
  var headY = bodyTop - headR * 0.7;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-headR * 0.3, headY - headR * 0.1, headR * 0.15, 0, Math.PI * 2);
  ctx.arc(headR * 0.3, headY - headR * 0.1, headR * 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Weapon
  drawWeapon(ctx, char.className, bodyW, bodyTop, baseSize, color);

  ctx.restore();

  // HP bar above character
  if (char.alive && (deathProgress === undefined)) {
    var hpRatio = Math.max(0, (char.hp || 0) / (char.maxHP || char.stats?.maxHP || 1));
    var barW = baseSize * 2;
    var barH = Math.max(2, baseSize * 0.15);
    var barY = qvY - baseSize * 3.2;
    ctx.fillStyle = '#333';
    ctx.fillRect(qvX - barW/2, barY, barW, barH);
    var hpColor = hpRatio > 0.5 ? '#2ecc71' : hpRatio > 0.25 ? '#f39c12' : '#e94560';
    ctx.fillStyle = hpColor;
    ctx.fillRect(qvX - barW/2, barY, barW * hpRatio, barH);
  }

  // Name label
  if (deathProgress === undefined || deathProgress < 0.8) {
    var isMobile = canvasWidth < 400;
    var fontSize = Math.max(8, Math.round((isMobile ? 9 : 11) * scale));
    ctx.fillStyle = '#fff';
    ctx.font = fontSize + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = deathProgress !== undefined ? Math.max(0, 1 - deathProgress) : (char.alive ? 1 : 0.3);
    ctx.fillText(char.name, qvX, qvY + baseSize * 0.8);
    ctx.globalAlpha = 1;
  }
}

function drawMonster(ctx, char, qvX, qvY, scale, deathProgress) {
  var size = 10 * scale;
  ctx.save();
  ctx.translate(qvX, qvY);

  if (deathProgress !== undefined) {
    ctx.globalAlpha = Math.max(0, 1 - deathProgress);
    ctx.scale(1 - deathProgress * 0.7, 1 - deathProgress * 0.7);
  } else if (!char.alive) {
    ctx.globalAlpha = 0.2;
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 0, size, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Monster body (inverted triangle)
  var lvColor = char.level >= 4 ? '#ff4444' : char.level >= 3 ? '#ff8800' : char.level >= 2 ? '#ffcc00' : '#88cc44';
  ctx.fillStyle = lvColor;
  ctx.beginPath();
  ctx.moveTo(-size, -size * 1.5);
  ctx.lineTo(size, -size * 1.5);
  ctx.lineTo(0, size * 0.3);
  ctx.closePath();
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-size * 0.3, -size * 0.8, size * 0.15, 0, Math.PI * 2);
  ctx.arc(size * 0.3, -size * 0.8, size * 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // HP bar above monster
  if (char.alive && deathProgress === undefined) {
    var hpRatio = Math.max(0, (char.hp || 0) / (char.maxHP || 1));
    var barW = size * 2;
    var barH = Math.max(2, size * 0.2);
    var barY = qvY - size * 2.2;
    ctx.fillStyle = '#333';
    ctx.fillRect(qvX - barW/2, barY, barW, barH);
    ctx.fillStyle = hpRatio > 0.5 ? '#2ecc71' : hpRatio > 0.25 ? '#f39c12' : '#e94560';
    ctx.fillRect(qvX - barW/2, barY, barW * hpRatio, barH);
  }

  // Level label
  if (deathProgress === undefined || deathProgress < 0.5) {
    ctx.fillStyle = '#aaa';
    ctx.font = Math.max(7, Math.round(8 * scale)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = deathProgress !== undefined ? Math.max(0, 1 - deathProgress) : (char.alive ? 0.7 : 0.2);
    ctx.fillText('Lv' + (char.level || '?'), qvX, qvY + size * 1.2);
    ctx.globalAlpha = 1;
  }
}

function drawEffect(ctx, effect, now) {
  var elapsed = now - effect.born;
  var t = Math.min(1, elapsed / effect.duration);
  var alpha = 1 - t;
  var canvasWidth = ctx.canvas.width;

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);

  switch (effect.type) {
    case 'damage': {
      var isMobile = canvasWidth < 400;
      var baseFontSize = effect.isCrit
        ? Math.max(14, Math.round(isMobile ? 18 : 22))
        : effect.isSkill
          ? Math.max(12, Math.round(isMobile ? 14 : 18))
          : Math.max(10, Math.round(isMobile ? 12 : 15));
      var fontSize = effect.isCrit ? baseFontSize * (1 + (1-t)*0.3) : baseFontSize;
      ctx.font = 'bold ' + Math.round(fontSize) + 'px sans-serif';
      ctx.textAlign = 'center';
      var dy = -40 * t;
      var x = effect.x;
      var y = effect.startY + dy;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(effect.amount, x, y);
      ctx.fillStyle = effect.isCrit ? '#ff6600' : effect.isSkill ? '#ffd700' : '#fff';
      ctx.fillText(effect.amount, x, y);
      break;
    }
    case 'skillName': {
      var fontSize2 = Math.max(10, Math.round(14));
      ctx.font = 'bold ' + fontSize2 + 'px sans-serif';
      ctx.textAlign = 'center';
      var dy2 = -30 * t;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeText(effect.text, effect.x, effect.startY + dy2);
      ctx.fillStyle = '#7ec8e3';
      ctx.fillText(effect.text, effect.x, effect.startY + dy2);
      break;
    }
    case 'aoe': {
      var maxR = 40;
      var r = maxR * t;
      ctx.strokeStyle = effect.color || '#7ec8e3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'projectile': {
      var px = effect.fromX + (effect.toX - effect.fromX) * Math.min(1, t * 2.5);
      var py = effect.fromY + (effect.toY - effect.fromY) * Math.min(1, t * 2.5);
      ctx.fillStyle = effect.color || '#fff';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'buff': {
      var r2 = 15 + 10 * t;
      ctx.strokeStyle = effect.color || '#3498db';
      ctx.lineWidth = 2 + (1 - t) * 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, r2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'particle': {
      var px2 = effect.x + effect.vx * t;
      var py2 = effect.y + effect.vy * t;
      ctx.fillStyle = effect.color;
      ctx.fillRect(px2 - 2, py2 - 2, 4, 4);
      break;
    }
  }
  ctx.restore();
}

// ─── Animation spawn helpers ───
function spawnDamageNumber(targetArray, x, y, amount, isSkill, isCrit) {
  targetArray.push({
    type: 'damage',
    x: x, y: y,
    startY: y,
    amount: isCrit ? amount + ' CRIT!' : amount,
    isSkill: isSkill,
    isCrit: !!isCrit,
    born: performance.now(),
    duration: isCrit ? 1200 : 1000,
  });
}

function spawnSkillName(targetArray, x, y, skillName) {
  targetArray.push({
    type: 'skillName',
    x: x, y: y,
    startY: y,
    text: skillName,
    born: performance.now(),
    duration: 900,
  });
}

function spawnAoeEffect(targetArray, x, y, color) {
  targetArray.push({
    type: 'aoe',
    x: x, y: y,
    color: color,
    born: performance.now(),
    duration: 600,
  });
}

function spawnProjectile(targetArray, fromX, fromY, toX, toY, color) {
  targetArray.push({
    type: 'projectile',
    fromX: fromX, fromY: fromY, toX: toX, toY: toY,
    color: color,
    born: performance.now(),
    duration: 400,
  });
}

function spawnBuffEffect(targetArray, x, y, color) {
  targetArray.push({
    type: 'buff',
    x: x, y: y,
    color: color,
    born: performance.now(),
    duration: 700,
  });
}

function spawnDeathEffect(targetArray, deathAnimsMap, x, y, color, charId) {
  deathAnimsMap.set(charId, { born: performance.now(), duration: 800 });
  for (var i = 0; i < 6; i++) {
    var angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
    var speed = 30 + Math.random() * 40;
    targetArray.push({
      type: 'particle',
      x: x, y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: color,
      born: performance.now(),
      duration: 800,
    });
  }
}
