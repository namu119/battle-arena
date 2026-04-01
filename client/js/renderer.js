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
  var _sigMap = {red:'#e94560',blue:'#3498db',green:'#2ecc71',yellow:'#f0a500',purple:'#a855f7'};
  var _hasSig = char.signalColor && char.signalColor !== 'none' && _sigMap[char.signalColor];
  var color = (char.alive || deathProgress !== undefined)
    ? (_hasSig || G.classColors[char.className] || '#e94560') : '#555';
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
  ctx.fill();
  ctx.beginPath();
  ctx.arc(headR * 0.3, headY - headR * 0.1, headR * 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Weapon
  drawWeapon(ctx, char.className, bodyW, bodyTop, baseSize, color);

  ctx.restore();

  // Signal color marker (glow ring under character)
  if (char.alive && _hasSig && !char.isDecoy) {
    ctx.save();
    ctx.translate(qvX, qvY);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = _hasSig;
    ctx.beginPath();
    ctx.ellipse(0, baseSize * 0.3, baseSize * 1.0, baseSize * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = _hasSig;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, baseSize * 0.3, baseSize * 1.0, baseSize * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // HP bar above character (잔상은 HP바 숨김)
  if (char.alive && !char.isDecoy && (deathProgress === undefined)) {
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
  ctx.fill();
  ctx.beginPath();
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
    case 'zone': {
      var zoneR = effect.radius || 40;
      var pulse = 1 + Math.sin(elapsed * 0.006) * 0.08;
      var drawR = zoneR * pulse;
      var zoneColor = effect.color || '#ff4400';
      ctx.globalAlpha = Math.max(0, alpha * 0.35);
      ctx.fillStyle = zoneColor;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, drawR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = Math.max(0, alpha * 0.7);
      ctx.strokeStyle = zoneColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, drawR, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'dash': {
      ctx.strokeStyle = effect.color || '#ffcc44';
      ctx.lineWidth = 3 * (1 - t);
      ctx.globalAlpha = Math.max(0, alpha * 0.7);
      ctx.beginPath();
      ctx.moveTo(effect.fromX, effect.fromY);
      ctx.lineTo(effect.toX, effect.toY);
      ctx.stroke();
      var segments = 4;
      for (var di = 0; di < segments; di++) {
        var st = di / segments;
        var sx = effect.fromX + (effect.toX - effect.fromX) * st;
        var sy = effect.fromY + (effect.toY - effect.fromY) * st;
        ctx.globalAlpha = Math.max(0, alpha * (1 - st) * 0.5);
        ctx.fillStyle = effect.color || '#ffcc44';
        ctx.beginPath();
        ctx.arc(sx, sy, 3 * (1 - t), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'teleport': {
      var tpColor = effect.color || '#8844aa';
      // Disappear particles at origin
      ctx.globalAlpha = Math.max(0, (1 - t * 2) * 0.8);
      for (var ti = 0; ti < 6; ti++) {
        var ta = (ti / 6) * Math.PI * 2 + elapsed * 0.01;
        var tr = 8 + 20 * Math.min(1, t * 2);
        ctx.fillStyle = tpColor;
        ctx.beginPath();
        ctx.arc(effect.fromX + Math.cos(ta) * tr, effect.fromY + Math.sin(ta) * tr, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Appear particles at destination
      ctx.globalAlpha = Math.max(0, (t * 2 - 0.5) * 0.8);
      for (var ti2 = 0; ti2 < 6; ti2++) {
        var ta2 = (ti2 / 6) * Math.PI * 2 - elapsed * 0.01;
        var tr2 = 20 * Math.max(0, 1 - (t - 0.3) * 2);
        ctx.fillStyle = tpColor;
        ctx.beginPath();
        ctx.arc(effect.toX + Math.cos(ta2) * tr2, effect.toY + Math.sin(ta2) * tr2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'stun': {
      var stunR = 10;
      var starCount = 3;
      ctx.fillStyle = '#ffdd44';
      ctx.globalAlpha = Math.max(0, alpha);
      for (var si = 0; si < starCount; si++) {
        var sa = (si / starCount) * Math.PI * 2 + elapsed * 0.005;
        var sx2 = effect.x + Math.cos(sa) * stunR;
        var sy2 = effect.y - 20 + Math.sin(sa) * 5;
        // Small 4-point star
        ctx.beginPath();
        for (var sp = 0; sp < 8; sp++) {
          var spa = (sp / 8) * Math.PI * 2;
          var spr = sp % 2 === 0 ? 3 : 1.2;
          var spx = sx2 + Math.cos(spa) * spr;
          var spy = sy2 + Math.sin(spa) * spr;
          if (sp === 0) ctx.moveTo(spx, spy);
          else ctx.lineTo(spx, spy);
        }
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'dot': {
      var dotColor = effect.subType === 'burn' ? '#ff6600'
        : effect.subType === 'bleed' ? '#cc0000'
        : effect.subType === 'poison' ? '#9933cc' : '#cc0000';
      ctx.fillStyle = dotColor;
      ctx.globalAlpha = Math.max(0, alpha * (0.6 + Math.sin(elapsed * 0.01) * 0.3));
      ctx.beginPath();
      if (effect.subType === 'burn') {
        // Flame icon
        ctx.moveTo(effect.x, effect.y - 6);
        ctx.quadraticCurveTo(effect.x + 4, effect.y - 3, effect.x + 3, effect.y);
        ctx.quadraticCurveTo(effect.x, effect.y - 1, effect.x - 3, effect.y);
        ctx.quadraticCurveTo(effect.x - 4, effect.y - 3, effect.x, effect.y - 6);
      } else {
        // Droplet
        ctx.moveTo(effect.x, effect.y - 5);
        ctx.quadraticCurveTo(effect.x + 4, effect.y, effect.x, effect.y + 3);
        ctx.quadraticCurveTo(effect.x - 4, effect.y, effect.x, effect.y - 5);
      }
      ctx.fill();
      break;
    }
    case 'shield': {
      var shR = effect.radius || 18;
      var shPulse = 1 + Math.sin(elapsed * 0.004) * 0.05;
      ctx.strokeStyle = effect.color || '#4488ff';
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = Math.max(0, alpha * 0.6);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, shR * shPulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = Math.max(0, alpha * 0.12);
      ctx.fillStyle = effect.color || '#4488ff';
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, shR * shPulse, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'knockback': {
      var kbColor = effect.color || '#ffaa00';
      var kbR = 15 * t;
      ctx.strokeStyle = kbColor;
      ctx.lineWidth = 2 * (1 - t);
      ctx.globalAlpha = Math.max(0, alpha * 0.8);
      // Star burst
      var kbPoints = 8;
      ctx.beginPath();
      for (var ki = 0; ki < kbPoints * 2; ki++) {
        var ka = (ki / (kbPoints * 2)) * Math.PI * 2;
        var kr = ki % 2 === 0 ? kbR : kbR * 0.4;
        var kx = effect.x + Math.cos(ka) * kr;
        var ky = effect.y + Math.sin(ka) * kr;
        if (ki === 0) ctx.moveTo(kx, ky);
        else ctx.lineTo(kx, ky);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'multiHit': {
      var mhColor = effect.color || '#ff6666';
      var hitIndex = Math.floor(t * (effect.hits || 3));
      var hitT = (t * (effect.hits || 3)) - hitIndex;
      ctx.strokeStyle = mhColor;
      ctx.lineWidth = 2 * (1 - hitT);
      ctx.globalAlpha = Math.max(0, (1 - hitT) * 0.8);
      var mhLen = 10;
      var mhAngle = effect.angles ? effect.angles[hitIndex] : hitIndex * 1.2 + hitIndex * 0.17;
      var mx = effect.x + Math.cos(mhAngle) * 5;
      var my = effect.y + Math.sin(mhAngle) * 5;
      ctx.beginPath();
      ctx.moveTo(mx - Math.cos(mhAngle) * mhLen, my - Math.sin(mhAngle) * mhLen);
      ctx.lineTo(mx + Math.cos(mhAngle) * mhLen, my + Math.sin(mhAngle) * mhLen);
      ctx.stroke();
      break;
    }
    case 'impact': {
      var impColor = effect.color || '#ffaa00';
      var impR = 20 * t;
      ctx.strokeStyle = impColor;
      ctx.lineWidth = 3 * (1 - t);
      ctx.globalAlpha = Math.max(0, alpha * 0.9);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, impR, 0, Math.PI * 2);
      ctx.stroke();
      // Radial lines
      for (var ii = 0; ii < 6; ii++) {
        var ia = (ii / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(effect.x + Math.cos(ia) * impR * 0.5, effect.y + Math.sin(ia) * impR * 0.5);
        ctx.lineTo(effect.x + Math.cos(ia) * impR, effect.y + Math.sin(ia) * impR);
        ctx.stroke();
      }
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

// ─── Skill-to-Effect Mapping ───
var SKILL_FX = {
  // zone skills
  '화염방벽': { type: 'zone', color: '#ff4400', particles: 8 },
  '빙결장판': { type: 'zone', color: '#44bbff', particles: 6 },
  // attack skills
  '연속찌르기': { type: 'multiHit', color: '#ff6666', particles: 3, hits: 3 },
  '강타': { type: 'impact', color: '#ffaa00', particles: 10, shake: true },
  '마력폭발': { type: 'aoe', color: '#aa44ff', particles: 12 },
  '지진밟기': { type: 'aoe', color: '#cc8844', particles: 8, shake: true },
  '질풍돌진': { type: 'dash', color: '#66ffaa', particles: 5 },
  // defense/buff skills
  '철벽방어': { type: 'shield', color: '#4488ff', particles: 4 },
  '마력증폭': { type: 'buff', color: '#aa44ff', particles: 6 },
  '질풍회피': { type: 'buff', color: '#44ff88', particles: 4 },
  // movement skills
  '그림자 도약': { type: 'teleport', color: '#8844aa', particles: 8 },
  '대시': { type: 'dash', color: '#ffcc44', particles: 4 },
};

function spawnSkillEffect(targetArray, skillName, x, y, targetX, targetY) {
  var fx = SKILL_FX[skillName];
  if (!fx) return;
  var now = performance.now();
  var color = fx.color;
  var pCount = fx.particles || 4;

  switch (fx.type) {
    case 'zone':
      targetArray.push({
        type: 'zone', x: x, y: y, radius: 40,
        color: color, born: now, duration: 2000,
      });
      for (var i = 0; i < pCount; i++) {
        var a = (i / pCount) * Math.PI * 2 + Math.random() * 0.5;
        targetArray.push({
          type: 'particle', x: x, y: y,
          vx: Math.cos(a) * (15 + Math.random() * 20),
          vy: Math.sin(a) * (15 + Math.random() * 20),
          color: color, born: now, duration: 800,
        });
      }
      break;
    case 'dash':
      var tx = targetX !== undefined ? targetX : x + 60;
      var ty = targetY !== undefined ? targetY : y;
      targetArray.push({
        type: 'dash', fromX: x, fromY: y, toX: tx, toY: ty,
        color: color, born: now, duration: 400,
      });
      for (var di = 0; di < pCount; di++) {
        var dt = di / pCount;
        targetArray.push({
          type: 'particle',
          x: x + (tx - x) * dt, y: y + (ty - y) * dt,
          vx: (Math.random() - 0.5) * 20,
          vy: (Math.random() - 0.5) * 20,
          color: color, born: now, duration: 500,
        });
      }
      break;
    case 'teleport':
      var ttx = targetX !== undefined ? targetX : x;
      var tty = targetY !== undefined ? targetY : y;
      targetArray.push({
        type: 'teleport', fromX: x, fromY: y, toX: ttx, toY: tty,
        color: color, born: now, duration: 600,
      });
      for (var tpi = 0; tpi < pCount; tpi++) {
        var tpa = (tpi / pCount) * Math.PI * 2;
        targetArray.push({
          type: 'particle', x: x, y: y,
          vx: Math.cos(tpa) * 25, vy: Math.sin(tpa) * 25,
          color: color, born: now, duration: 500,
        });
      }
      break;
    case 'shield':
      targetArray.push({
        type: 'shield', x: x, y: y, radius: 18,
        color: color, born: now, duration: 1500,
      });
      for (var shi = 0; shi < pCount; shi++) {
        var sha = (shi / pCount) * Math.PI * 2;
        targetArray.push({
          type: 'particle', x: x + Math.cos(sha) * 18, y: y + Math.sin(sha) * 18,
          vx: Math.cos(sha) * 8, vy: Math.sin(sha) * 8,
          color: color, born: now, duration: 600,
        });
      }
      break;
    case 'multiHit':
      var mhAngles = [];
      for (var mi = 0; mi < (fx.hits || 3); mi++) mhAngles.push(mi * 1.2 + mi * 0.17);
      targetArray.push({
        type: 'multiHit', x: x, y: y, hits: fx.hits || 3,
        angles: mhAngles,
        color: color, born: now, duration: 600,
      });
      break;
    case 'impact':
      targetArray.push({
        type: 'impact', x: x, y: y,
        color: color, born: now, duration: 500,
      });
      if (fx.shake) {
        targetArray.push({
          type: 'impact', x: x, y: y,
          color: color, born: now + 50, duration: 400,
        });
      }
      for (var imi = 0; imi < pCount; imi++) {
        var ima = (imi / pCount) * Math.PI * 2 + Math.random() * 0.3;
        targetArray.push({
          type: 'particle', x: x, y: y,
          vx: Math.cos(ima) * (20 + Math.random() * 30),
          vy: Math.sin(ima) * (20 + Math.random() * 30),
          color: color, born: now, duration: 600,
        });
      }
      break;
    case 'aoe':
      targetArray.push({
        type: 'aoe', x: x, y: y,
        color: color, born: now, duration: 600,
      });
      for (var aoi = 0; aoi < pCount; aoi++) {
        var aoa = (aoi / pCount) * Math.PI * 2 + Math.random() * 0.4;
        targetArray.push({
          type: 'particle', x: x, y: y,
          vx: Math.cos(aoa) * (15 + Math.random() * 25),
          vy: Math.sin(aoa) * (15 + Math.random() * 25),
          color: color, born: now, duration: 700,
        });
      }
      break;
    case 'buff':
      targetArray.push({
        type: 'buff', x: x, y: y,
        color: color, born: now, duration: 700,
      });
      for (var bfi = 0; bfi < pCount; bfi++) {
        targetArray.push({
          type: 'particle', x: x, y: y,
          vx: (Math.random() - 0.5) * 15,
          vy: -10 - Math.random() * 20,
          color: color, born: now, duration: 600,
        });
      }
      break;
  }
}

function spawnStunEffect(targetArray, x, y) {
  targetArray.push({
    type: 'stun', x: x, y: y,
    born: performance.now(), duration: 1500,
  });
}

function spawnDotEffect(targetArray, x, y, subType) {
  targetArray.push({
    type: 'dot', x: x, y: y,
    subType: subType || 'bleed',
    born: performance.now(), duration: 1000,
  });
}

function spawnShieldEffect(targetArray, x, y, color, radius) {
  targetArray.push({
    type: 'shield', x: x, y: y,
    color: color || '#4488ff',
    radius: radius || 18,
    born: performance.now(), duration: 1500,
  });
}

function spawnKnockbackEffect(targetArray, x, y, color) {
  targetArray.push({
    type: 'knockback', x: x, y: y,
    color: color || '#ffaa00',
    born: performance.now(), duration: 400,
  });
}

// ─── Zone Rendering (called every frame) ───
var ZONE_COLORS = { fire: '#ff4400', ice: '#44bbff', wind: '#44ff88' };

function drawZones(ctx, zones, scale, offsetX) {
  if (!zones || !zones.length) return;
  ctx.save();
  var now = performance.now();
  for (var i = 0; i < zones.length; i++) {
    var z = zones[i];
    var zColor = ZONE_COLORS[z.visual] || '#ff4400';
    var r = (z.radius || 40) * scale;
    var zx = z.x * scale + (offsetX || 0);
    var zy = z.y * scale;
    var pulse = 1 + Math.sin(now * 0.004) * 0.06;
    var drawR = r * pulse;

    // Fill
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = zColor;
    ctx.beginPath();
    ctx.arc(zx, zy, drawR, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = zColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(zx, zy, drawR, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring pulse
    ctx.globalAlpha = 0.12;
    var innerPulse = 1 + Math.sin(now * 0.008) * 0.15;
    ctx.beginPath();
    ctx.arc(zx, zy, drawR * 0.6 * innerPulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
