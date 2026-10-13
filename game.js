// Version 4 - updated 2026-10-14
// Web Catcher - the little game at the bottom of the page.
// Fly Spider-Man anywhere (free 2D movement), catch fruit, dodge bombs. Every 5 levels a scorpion boss shows up,
// and from level 10 allies help out.

(function () {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // the game is always drawn on a 720x420 board, CSS scales it to the screen
  const WIDTH = 720;
  const HEIGHT = 420;
  const PLAYER_W = 58;
  const MIN_Y = 115;                 // keep Spidey below the score bar
  const MAX_Y = HEIGHT - 40;

  // render at 2x on retina / phone screens so it isn't blurry
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;

  const byId = id => document.getElementById(id);
  const ui = {
    wrap: byId('gameWrap'),
    overlay: byId('gOverlay'),
    title: byId('gTitle'),
    message: byId('gMsg'),
    start: byId('gStart'),
    score: byId('gScore'),
    best: byId('gBest'),
    level: byId('gLevel'),
    combo: byId('gCombo'),
    lives: byId('gLives'),
    progress: byId('gProgress'),
    shoot: byId('gShoot'),
    shield: byId('gShield'),
    pause: byId('gPause'),
    sound: byId('gSound'),
    fullscreen: byId('gFullscreen'),
  };

  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  // things that survive between rounds
  let best = 0;
  try { best = Number(localStorage.getItem('webCatcherBest')) || 0; } catch (e) { /* private mode */ }
  ui.best.textContent = best;

  const keys = {};
  let touching = false;
  let soundOn = false;
  let audio = null;
  let onScreen = true;     // game only runs while it's actually visible
  let looping = false;

  function newState() {
    return {
      running: false, paused: false, introOpen: false,
      time: 0, last: 0, spawnTimer: 0.5,
      score: 0, lives: 3, level: 1, combo: 0, comboTimer: 0,
      x: WIDTH / 2, targetX: WIDTH / 2,
      y: HEIGHT - 70, targetY: HEIGHT - 70,
      items: [], particles: [], webShots: [],
      heart: null, boss: null,
      shield: 0, shieldCooldown: 0, slow: 0,
      webBoost: 0, webCooldown: 0, allies: 0,
      flash: 0, shake: 0, vx: 0, vy: 0,
    };
  }
  let g = newState();


  // ---------- sound ----------
  function beep(freq = 520, length = 0.07, wave = 'sine') {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.06, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + length);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + length);
    } catch (e) { /* no audio, no problem */ }
  }


  // ---------- hud + overlay ----------
  function updateHud() {
    const active = g.running && !g.paused;
    ui.score.textContent = g.score;
    ui.lives.textContent = g.lives > 0 ? '❤️'.repeat(g.lives) : '💔';
    ui.level.textContent = g.level;
    ui.combo.textContent = 'x' + Math.max(1, g.combo);
    ui.progress.style.width = (g.score % 100) + '%';

    ui.shield.disabled = !active || g.shieldCooldown > 0;
    if (g.shield > 0) ui.shield.textContent = '🛡️ Shield active';
    else if (g.shieldCooldown > 0) ui.shield.textContent = '🛡️ ' + g.shieldCooldown.toFixed(1) + 's';
    else ui.shield.textContent = '🛡️ Shield';

    ui.shoot.disabled = !active;
    ui.pause.disabled = !g.running;
  }

  function showOverlay(title, message, buttonText) {
    ui.title.textContent = title;
    ui.message.textContent = message;
    ui.start.textContent = buttonText;
    ui.overlay.hidden = false;
    ui.wrap.classList.remove('playing');
  }

  function hideOverlay() {
    ui.overlay.hidden = true;
    ui.wrap.classList.add('playing');
  }


  // ---------- game flow ----------
  function startLoop() {
    if (looping) return;
    looping = true;
    g.last = performance.now();
    requestAnimationFrame(frame);
  }

  function startGame() {
    g = newState();
    g.running = true;
    hideOverlay();
    ui.pause.textContent = 'Ⅱ Pause';
    updateHud();
    startLoop();
  }

  function resume() {
    g.paused = false;
    g.introOpen = false;
    hideOverlay();
    ui.pause.textContent = 'Ⅱ Pause';
    startLoop();
  }

  function togglePause() {
    if (!g.running) return;
    if (g.introOpen) { resume(); return; }
    if (g.paused) { resume(); return; }

    g.paused = true;
    ui.pause.textContent = '▶ Resume';
    showOverlay('Mission paused', `Score ${g.score} · Level ${g.level}. Take a breath, Spidey.`, 'Resume mission');
    updateHud();
  }

  // pauses the game and shows a message (boss, allies, boss defeated)
  function openIntro(title, message, buttonText) {
    g.paused = true;
    g.introOpen = true;
    showOverlay(title, message, buttonText);
  }

  function endGame() {
    g.running = false;
    g.paused = false;
    ui.wrap.classList.remove('playing');

    if (g.score > best) {
      best = g.score;
      ui.best.textContent = best;
      try { localStorage.setItem('webCatcherBest', best); } catch (e) { /* ignore */ }
    }
    beep(160, 0.25, 'triangle');

    const won = g.score >= 300;
    showOverlay(
      won ? 'Mission accomplished! 🏆' : 'Game over',
      `Final score: ${g.score} · Best: ${best} · Level reached: ${g.level}. ` +
        (won ? 'Amazing web-slinging, Spidey!' : 'Ready to swing back into action?'),
      'Play again'
    );
    updateHud();
  }

  ui.start.addEventListener('click', () => {
    if (g.running && g.paused) resume();
    else startGame();
  });
  ui.pause.addEventListener('click', togglePause);
  ui.shield.addEventListener('click', activateShield);
  ui.shoot.addEventListener('click', shootWeb);
  ui.sound.addEventListener('click', () => {
    soundOn = !soundOn;
    ui.sound.textContent = soundOn ? '🔊 Sound: On' : '🔇 Sound: Off';
    ui.sound.setAttribute('aria-pressed', String(soundOn));
    beep();
  });

  // fullscreen isn't available on iPhones, so just hide the button there
  const canFullscreen = ui.wrap.requestFullscreen || ui.wrap.webkitRequestFullscreen;
  if (!canFullscreen) {
    ui.fullscreen.hidden = true;
  } else {
    ui.fullscreen.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await ui.wrap.requestFullscreen();
      } catch (e) { ui.fullscreen.hidden = true; }
    });
    document.addEventListener('fullscreenchange', () => {
      ui.fullscreen.textContent = document.fullscreenElement === ui.wrap ? '⤢ EXIT FULL SCREEN' : '⛶ FULL SCREEN';
    });
  }


  // ---------- input ----------
  function movePlayer(e) {
    const box = canvas.getBoundingClientRect();
    g.targetX = (e.clientX - box.left) / box.width * WIDTH;
    const lift = e.pointerType === 'touch' ? 55 : 18;           // keep Spidey visible above the finger
    g.targetY = (e.clientY - box.top) / box.height * HEIGHT - lift;
  }

  canvas.addEventListener('pointermove', movePlayer);
  canvas.addEventListener('pointerdown', e => {
    movePlayer(e);
    if (e.pointerType === 'touch') {
      touching = true;                          // holding a finger down = auto fire
      canvas.setPointerCapture(e.pointerId);
    }
  });
  ['pointerup', 'pointercancel'].forEach(name => canvas.addEventListener(name, () => { touching = false; }));

  function isTyping(target) {
    return target && /^(input|textarea|select)$/i.test(target.tagName);
  }

  addEventListener('keydown', e => {
    if (isTyping(e.target) || document.getElementById('modal').classList.contains('open')) return;

    const key = e.key.toLowerCase();
    const playing = g.running && !g.paused && onScreen;

    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(key)) {
      keys[key] = true;
      if (playing) e.preventDefault();         // stop the page from scrolling
    }
    if (key === ' ' && playing) {
      e.preventDefault();
      shootWeb();
    }
    if (key === 'e' && playing && !e.repeat) activateShield();
    if (key === 'p' && !e.repeat && g.running) togglePause();
  });
  addEventListener('keyup', e => { delete keys[e.key.toLowerCase()]; });

  // switching tabs / windows shouldn't cost the player a life
  addEventListener('blur', () => {
    Object.keys(keys).forEach(k => delete keys[k]);
    if (g.running && !g.paused) togglePause();
  });

  new IntersectionObserver(entries => {
    onScreen = entries[0].isIntersecting;
    if (onScreen && g.running && !g.paused) startLoop();
  }, { threshold: 0.2 }).observe(canvas);


  // ---------- spawning ----------
  function spawnItem() {
    const roll = Math.random();
    let type = 'fruit', emoji = '🍐', value = 1;

    if (roll < 0.16)      { type = 'bomb'; emoji = '💣'; value = 0; }
    else if (roll < 0.35) { emoji = '🍊'; value = 2; }
    else if (roll < 0.49) { emoji = '🍍'; value = 3; }
    else if (roll < 0.55) { type = 'star'; emoji = '🌟'; value = 5; }
    else if (roll < 0.60) { type = 'shield'; emoji = '🛡️'; value = 0; }
    else if (roll < 0.65) { type = 'slow'; emoji = '⏳'; value = 0; }
    else if (roll < 0.69) { type = 'webboost'; emoji = '⚡'; value = 0; }

    g.items.push({
      type, emoji, value,
      x: rand(32, WIDTH - 32),
      y: -28,
      speed: 105 + g.level * 17 + rand(0, 70),
      angle: rand(0, Math.PI * 2),
      spin: rand(-2.5, 2.5),
      radius: 19,
      done: false,
    });
  }

  function spawnHeart() {
    g.heart = { x: rand(30, WIDTH - 30), y: -24, speed: 440 + g.level * 10, radius: 17, wobble: 0 };
    beep(1050, 0.05);
  }

  const isBossLevel = level => level >= 5 && level % 5 === 0;

  function spawnBoss() {
    const tier = Math.floor(g.level / 5);
    const hp = 18 + tier * 12;
    g.boss = {
      tier, hp, maxHp: hp,
      x: WIDTH / 2, y: 90,
      w: Math.min(650, 120 + tier * 25),
      h: Math.min(190, 82 + tier * 10),
      vx: 80 + Math.min(210, tier * 20),
      shootTimer: Math.max(0.3, 1.15 - tier * 0.07),
      hit: 0,
    };
  }

  function burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(45, 190);
      g.particles.push({
        x, y, color,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rand(0.25, 0.7), maxLife: 0.7,
        size: rand(1.5, 4),
      });
    }
  }


  // ---------- player actions ----------
  function activateShield() {
    if (!g.running || g.paused || g.shieldCooldown > 0) return;
    g.shield = 3.2;
    g.shieldCooldown = 9;
    burst(g.x, g.y, '#22d3ee', 18);
    beep(760, 0.12);
    updateHud();
  }

  function shootWeb() {
    if (!g.running || g.paused || g.webCooldown > 0) return;

    const tier = 1 + Math.floor((g.level - 1) / 2);
    const boost = g.webBoost > 0 ? 3 : 1;

    g.webShots.push({
      x: g.x,
      y: g.y - 22,
      speed: 430 + Math.min(1100, tier * 90),
      width: Math.min(38, (8 + tier * 2) * boost),
      damage: tier * boost,
      life: 1.5,
    });
    g.webCooldown = Math.max(0.07, 0.48 - g.level * 0.012);

    burst(g.x, g.y - 20, g.webBoost > 0 ? '#facc15' : '#dbeafe', 4 + tier * 2);
    beep(660 + Math.min(600, tier * 35), 0.05, 'triangle');
  }


  // ---------- game rules ----------
  function levelUp(newLevel) {
    g.level = newLevel;
    g.flash = 0.14;
    beep(980, 0.2, 'triangle');
    spawnHeart();

    const notes = [];
    let title = '';
    let button = '';

    if (newLevel >= 10 && newLevel % 10 === 0) {
      g.allies = Math.max(g.allies, Math.floor(newLevel / 10));
      title = 'ALLY SUPPORT ARRIVED! 🕷️';
      button = 'Let’s go!';
      notes.push(`${g.allies} web-slinging ally support${g.allies > 1 ? 's' : ''} joined the fight and will shoot at bombs and the scorpion.`);
    }
    if (isBossLevel(newLevel) && !g.boss) {
      spawnBoss();
      title = 'SCORPION BOSS APPROACHING! 🦂';
      button = 'Fight!';
      notes.unshift(`Level ${newLevel}: Scorpion ${g.boss.tier}. Every scorpion is larger, tougher and attacks faster. Grab ⚡ for 3x web damage!`);
    }

    if (notes.length) openIntro(title, notes.join(' '), button);
  }

  function collect(item) {
    item.done = true;

    if (item.type === 'bomb') {
      if (g.shield > 0) {                       // shield eats the bomb
        g.score += 2;
        burst(item.x, item.y, '#3b82f6', 18);
        beep(320);
        return;
      }
      g.lives--;
      g.combo = 0;
      g.comboTimer = 0;
      g.flash = 0.3;
      g.shake = 9;
      burst(item.x, item.y, '#ff2d55', 20);
      beep(130, 0.18, 'sawtooth');
    } else if (item.type === 'shield') {
      g.shield = Math.max(g.shield, 4);
      g.score += 2;
      burst(item.x, item.y, '#60a5fa', 16);
      beep(740);
    } else if (item.type === 'slow') {
      g.slow = 4.5;
      g.score += 2;
      burst(item.x, item.y, '#c792ea', 16);
      beep(620);
    } else if (item.type === 'webboost') {
      g.webBoost = 8;
      g.score += 5;
      burst(item.x, item.y, '#facc15', 28);
      beep(1040, 0.18, 'square');
    } else {
      // fruit and stars build the combo
      g.combo = g.comboTimer > 0 ? Math.min(g.combo + 1, 9) : 1;
      g.comboTimer = 1.5;
      g.score += item.value + (g.combo >= 3 ? Math.floor(g.combo / 3) * 2 : 0);
      burst(item.x, item.y, item.type === 'star' ? '#ffcb6b' : '#c3e88d', item.type === 'star' ? 22 : 10);
      beep(item.type === 'star' ? 880 : 520);
    }

    const newLevel = Math.floor(g.score / 100) + 1;
    if (newLevel > g.level) levelUp(newLevel);

    updateHud();
    if (g.lives <= 0) endGame();
  }

  function killBoss() {
    const boss = g.boss;
    g.score += 100 + boss.tier * 50;
    burst(boss.x, boss.y, '#ff2d55', 45);
    burst(boss.x, boss.y, '#dbeafe', 35);
    g.boss = null;
    g.flash = 0.35;
    beep(1120, 0.25);
    openIntro('BOSS DEFEATED! 🏆', `Amazing, Spidey! Bonus points earned. Level ${g.level} cleared.`, 'Continue');
  }

  function updateWebShots(dt) {
    const tier = 1 + Math.floor((g.level - 1) / 2);

    for (const shot of g.webShots) {
      shot.y -= shot.speed * dt;
      shot.life -= dt;

      // webs can blow up bombs
      for (const item of g.items) {
        if (item.done || item.type !== 'bomb') continue;
        if (Math.abs(item.x - shot.x) < shot.width + item.radius && Math.abs(item.y - shot.y) < shot.width + item.radius) {
          item.done = true;
          shot.life = 0;
          g.score += 2;
          burst(item.x, item.y, '#dbeafe', 12);
          beep(820, 0.06, 'triangle');
          break;
        }
      }

      const boss = g.boss;
      if (boss && shot.life > 0 &&
          Math.abs(shot.x - boss.x) < boss.w / 2 + shot.width &&
          Math.abs(shot.y - boss.y) < boss.h / 2 + shot.width) {
        shot.life = 0;
        boss.hp -= shot.damage;
        boss.hit = 0.16;
        g.score += 3;
        burst(shot.x, shot.y, '#f8fafc', 10 + tier * 2);
        beep(720 + Math.min(500, boss.tier * 45), 0.06, 'triangle');
        if (boss.hp <= 0) killBoss();
      }
    }
    g.webShots = g.webShots.filter(s => s.life > 0 && s.y > -20);
  }


  // ---------- main loop ----------
  function frame(now) {
    if (!g.running || g.paused || !onScreen) { looping = false; return; }

    const dt = Math.min((now - g.last) / 1000, 0.04);
    g.last = now;
    g.time += dt;

    // movement
    const moveSpeed = 460 + Math.min(260, (g.level - 1) * 12);
    if (keys.arrowleft || keys.a) g.targetX -= moveSpeed * dt;
    if (keys.arrowright || keys.d) g.targetX += moveSpeed * dt;
    if (keys.arrowup || keys.w) g.targetY -= moveSpeed * dt;
    if (keys.arrowdown || keys.s) g.targetY += moveSpeed * dt;
    g.targetX = clamp(g.targetX, PLAYER_W / 2, WIDTH - PLAYER_W / 2);
    g.targetY = clamp(g.targetY, MIN_Y, MAX_Y);
    g.vx = (g.targetX - g.x) * Math.min(1, dt * 13);
    g.vy = (g.targetY - g.y) * Math.min(1, dt * 13);
    g.x += g.vx;
    g.y += g.vy;

    if (touching) shootWeb();

    // timers
    for (const name of ['shield', 'shieldCooldown', 'slow', 'comboTimer', 'webCooldown', 'webBoost']) {
      g[name] = Math.max(0, g[name] - dt);
    }

    // spawn new stuff, a bit faster every level
    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) {
      spawnItem();
      g.spawnTimer = Math.max(0.27, 0.83 - (g.level - 1) * 0.055 - g.score * 0.0012);
    }

    // falling items
    for (const item of g.items) {
      item.y += item.speed * (g.slow > 0 ? 0.52 : 1) * dt;
      item.angle += item.spin * dt;
      const hit = Math.abs(item.x - g.x) < PLAYER_W / 2 + item.radius - 4 &&
                  Math.abs(item.y - (g.y - 4)) < 30 + item.radius - 4;
      if (!item.done && hit) collect(item);
    }
    g.items = g.items.filter(i => !i.done && i.y < HEIGHT + 40);

    // extra life
    if (g.heart) {
      g.heart.y += g.heart.speed * dt;
      g.heart.wobble += dt * 5;
      const caught = Math.abs(g.heart.x - g.x) < PLAYER_W / 2 + g.heart.radius &&
                     Math.abs(g.heart.y - (g.y - 4)) < 30 + g.heart.radius;
      if (caught) {
        g.heart = null;
        g.lives = Math.min(9, g.lives + 1);
        burst(g.x, g.y, '#fb7185', 24);
        beep(1180, 0.12);
        updateHud();
      } else if (g.heart.y > HEIGHT + 30) {
        g.heart = null;
      }
    }

    // allies shoot on their own
    if (g.level >= 10 && g.allies > 0) {
      const count = Math.min(g.allies, 5);
      for (let i = 0; i < count; i++) {
        if (Math.random() < dt * (1 + count * 0.35)) {
          g.webShots.push({
            x: clamp(g.x + (i - (count - 1) / 2) * 58, 20, WIDTH - 20),
            y: g.y - 30,
            speed: 520 + g.level * 12,
            width: Math.min(24, 7 + count * 2),
            damage: 2 + Math.floor(g.level / 10),
            life: 1.4,
          });
        }
      }
    }

    // boss
    const boss = g.boss;
    if (boss) {
      boss.x += boss.vx * dt;
      if (boss.x < boss.w / 2 + 12 || boss.x > WIDTH - boss.w / 2 - 12) boss.vx *= -1;
      boss.hit = Math.max(0, boss.hit - dt);
      boss.shootTimer -= dt;

      if (boss.shootTimer <= 0) {
        const lanes = boss.tier >= 4 ? [-1, 0, 1] : [0];     // stronger scorpions throw 3 bombs
        for (const lane of lanes) {
          g.items.push({
            type: 'bomb', emoji: '💣', value: 0,
            x: clamp(boss.x + lane * 34, 24, WIDTH - 24),
            y: boss.y + boss.h / 2,
            speed: 180 + boss.tier * 35,
            radius: 19, angle: 0, spin: 1, done: false,
          });
        }
        boss.shootTimer = Math.max(0.32, 1.5 - boss.tier * 0.055);
      }
    }

    updateWebShots(dt);

    // particles
    for (const p of g.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.04, dt);
      p.vy *= Math.pow(0.04, dt);
      p.life -= dt;
    }
    g.particles = g.particles.filter(p => p.life > 0);

    g.flash = Math.max(0, g.flash - dt);
    g.shake = Math.max(0, g.shake - dt * 28);

    updateHud();
    draw();
    if (g.running && !g.paused) requestAnimationFrame(frame);
    else looping = false;
  }


  // ---------- drawing ----------
  function drawSpiderman() {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = g.shield > 0 ? '#60a5fa' : '#fb7185';
    ctx.shadowBlur = g.shield > 0 ? 22 : 10;

    // arms and legs, blue outline first then the red on top
    const limbs = () => {
      ctx.beginPath();
      ctx.moveTo(-8, -4); ctx.lineTo(-23, 5); ctx.lineTo(-30, 16);
      ctx.moveTo(8, -4);  ctx.lineTo(23, 5);  ctx.lineTo(30, 16);
      ctx.moveTo(-7, 10); ctx.lineTo(-15, 25);
      ctx.moveTo(7, 10);  ctx.lineTo(15, 25);
      ctx.stroke();
    };
    ctx.strokeStyle = '#164eaa'; ctx.lineWidth = 13; limbs();
    ctx.strokeStyle = '#e62435'; ctx.lineWidth = 6;  limbs();

    // body
    const suit = ctx.createLinearGradient(-15, -12, 15, 18);
    suit.addColorStop(0, '#ff5665');
    suit.addColorStop(0.55, '#e62435');
    suit.addColorStop(1, '#8f102a');
    ctx.fillStyle = suit;
    ctx.strokeStyle = '#ffb2bd';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10, -12);
    ctx.quadraticCurveTo(-17, -4, -12, 12);
    ctx.quadraticCurveTo(0, 20, 12, 12);
    ctx.quadraticCurveTo(17, -4, 10, -12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // blue side panels
    ctx.fillStyle = '#1765c0';
    ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(-7, 12); ctx.lineTo(-12, 10); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(10, -7);  ctx.lineTo(7, 12);  ctx.lineTo(12, 10);  ctx.closePath(); ctx.fill();

    // mask
    const mask = ctx.createLinearGradient(-12, -35, 12, -10);
    mask.addColorStop(0, '#ff5665');
    mask.addColorStop(1, '#a80e2b');
    ctx.fillStyle = mask;
    ctx.strokeStyle = '#ffb2bd';
    ctx.beginPath();
    ctx.ellipse(0, -22, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // eyes
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#651225';
      ctx.beginPath(); ctx.ellipse(side * 6, -23, 5.4, 4.5, side * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0fbff';
      ctx.beginPath(); ctx.ellipse(side * 6, -23, 3.8, 3, side * 0.2, 0, Math.PI * 2); ctx.fill();
    }

    // web lines on the mask
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(65,7,30,.8)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -36); ctx.lineTo(0, -10);
    ctx.moveTo(-11, -27); ctx.lineTo(11, -17);
    ctx.moveTo(-11, -18); ctx.lineTo(11, -27);
    ctx.moveTo(-8, -32); ctx.lineTo(8, -12);
    ctx.moveTo(8, -32); ctx.lineTo(-8, -12);
    ctx.stroke();

    // chest spider
    ctx.fillStyle = '#101a36';
    ctx.beginPath(); ctx.arc(0, 1, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#101a36';
    ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 2, 1); ctx.lineTo(side * 7, -3); ctx.lineTo(side * 9, 0);
      ctx.moveTo(side * 2, 2); ctx.lineTo(side * 7, 5);  ctx.lineTo(side * 9, 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawScorpion(boss) {
    ctx.save();
    ctx.translate(boss.x, boss.y);
    const scale = Math.min(1.55, boss.w / 150);
    ctx.scale(scale, scale);
    ctx.shadowColor = '#fb451f';
    ctx.shadowBlur = boss.hit > 0 ? 34 : 20;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const shell = ctx.createLinearGradient(-70, -35, 70, 45);
    shell.addColorStop(0, boss.hit > 0 ? '#fff' : '#d95b27');   // flashes white when hit
    shell.addColorStop(0.45, '#681b19');
    shell.addColorStop(1, '#160d16');

    // eight legs
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const startY = -15 + i * 11;
        const footX = side * (67 + i * 7);
        const footY = startY + (i % 2 ? 27 : 18);
        const leg = () => {
          ctx.beginPath();
          ctx.moveTo(side * 23, startY);
          ctx.lineTo(side * 42, startY - 7);
          ctx.lineTo(footX, footY);
          ctx.stroke();
        };
        ctx.strokeStyle = '#251016'; ctx.lineWidth = 9; leg();
        ctx.strokeStyle = '#bd4827'; ctx.lineWidth = 4; leg();
        ctx.fillStyle = '#e5a15b';
        ctx.beginPath();
        ctx.moveTo(footX, footY);
        ctx.lineTo(footX - side * 8, footY - 5);
        ctx.lineTo(footX - side * 5, footY + 7);
        ctx.closePath();
        ctx.fill();
      }
    }

    // body + head
    ctx.fillStyle = shell;
    ctx.strokeStyle = '#f08a42';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 7, 47, 32, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = 'rgba(255,188,100,.65)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(-15 + i * 10, 8, 8, 28, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = shell;
    ctx.strokeStyle = '#f08a42';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, -25, 30, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // angry eyes
    ctx.shadowColor = '#ff170e';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ff2418';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(side * 12, -28, 7, 4, side * 0.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;

    // claws
    for (const side of [-1, 1]) {
      const arm = () => {
        ctx.beginPath();
        ctx.moveTo(side * 24, -16);
        ctx.lineTo(side * 45, -27);
        ctx.lineTo(side * 56, -13);
        ctx.stroke();
      };
      ctx.strokeStyle = '#1c0c13'; ctx.lineWidth = 12; arm();
      ctx.strokeStyle = '#e36b31'; ctx.lineWidth = 6;  arm();
      ctx.fillStyle = '#f1a052';
      ctx.beginPath();
      ctx.moveTo(side * 54, -13);
      ctx.lineTo(side * 68, -22);
      ctx.lineTo(side * 64, -8);
      ctx.lineTo(side * 73, 0);
      ctx.lineTo(side * 57, -3);
      ctx.closePath();
      ctx.fill();
    }

    // tail with the stinger
    ctx.strokeStyle = '#241019';
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(10, 24);
    ctx.bezierCurveTo(37, 44, 57, 24, 50, -1);
    ctx.bezierCurveTo(47, -22, 37, -35, 48, -49);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const u = i / 5;
      ctx.fillStyle = i % 2 ? '#9b3428' : '#d66b35';
      ctx.strokeStyle = '#f6a35a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(23 + 26 * Math.sin(u * 2.6), 28 - u * 73, 8, 7, -u * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#f5b14e';
    ctx.beginPath(); ctx.moveTo(48, -49); ctx.lineTo(60, -67); ctx.lineTo(57, -44); ctx.closePath(); ctx.fill();
    ctx.restore();

    // health bar + name above it
    const barX = boss.x - boss.w / 2;
    const barY = boss.y + boss.h / 2 + 8;
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.fillRect(barX, barY, boss.w, 8);
    ctx.fillStyle = '#fb451f';
    ctx.fillRect(barX, barY, boss.w * Math.max(0, boss.hp / boss.maxHp), 8);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`SCORPION ${boss.tier} · ${boss.hp}/${boss.maxHp}`, boss.x, barY + 22);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    if (g.shake > 0) ctx.translate(rand(-g.shake, g.shake), rand(-g.shake, g.shake));

    // background
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#0b1a4a');
    sky.addColorStop(0.45, '#2a1066');
    sky.addColorStop(1, '#5a1450');
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, WIDTH + 40, HEIGHT + 40);

    const glow = ctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.5, 15, WIDTH * 0.5, HEIGHT * 0.5, 400);
    glow.addColorStop(0, 'rgba(34,211,238,.22)');
    glow.addColorStop(0.6, 'rgba(168,85,247,.10)');
    glow.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // neon sun / horizon glow at the bottom
    const horizon = ctx.createLinearGradient(0, HEIGHT - 120, 0, HEIGHT);
    horizon.addColorStop(0, 'rgba(255,45,120,0)');
    horizon.addColorStop(1, 'rgba(255,45,120,.28)');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, HEIGHT - 120, WIDTH, 120);

    ctx.strokeStyle = 'rgba(167,139,250,.13)';
    ctx.lineWidth = 1;
    for (let x = 0; x < WIDTH; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke(); }
    for (let y = 0; y < HEIGHT; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke(); }

    for (let i = 0; i < 32; i++) {
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,190,230,.8)' : i % 3 === 1 ? 'rgba(165,243,252,.8)' : 'rgba(255,255,255,.7)';
      ctx.fillRect((i * 137 + Math.sin(g.time * 0.5 + i) * 18) % WIDTH, (i * 71 + g.time * 12) % HEIGHT, 2, 2);
    }

    // web line holding Spidey up
    ctx.strokeStyle = 'rgba(165,243,252,.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(g.x, 0); ctx.lineTo(g.x, g.y - 38); ctx.stroke();

    // items
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const item of g.items) {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.angle || 0);
      if (item.type === 'bomb') {               // red pulse = spider-sense
        ctx.strokeStyle = `rgba(255,45,85,${0.45 + 0.4 * Math.sin(g.time * 14)})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 25 + Math.sin(g.time * 12) * 3, 0, Math.PI * 2); ctx.stroke();
      }
      if (item.type === 'fruit') { ctx.shadowColor = 'rgba(255,255,255,.55)'; ctx.shadowBlur = 12; }
      if (item.type === 'star') { ctx.shadowColor = '#ffcb6b'; ctx.shadowBlur = 24; }
      if (item.type === 'webboost') { ctx.shadowColor = '#facc15'; ctx.shadowBlur = 22; }
      if (item.type === 'shield' || item.type === 'slow') { ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 18; }
      ctx.font = '30px serif';
      ctx.fillText(item.emoji, 0, 0);
      ctx.restore();
    }

    if (g.heart) {
      ctx.save();
      ctx.translate(g.heart.x, g.heart.y);
      ctx.rotate(Math.sin(g.heart.wobble) * 0.25);
      ctx.shadowColor = '#fb7185';
      ctx.shadowBlur = 22;
      ctx.font = '30px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('❤️', 0, 0);
      ctx.restore();
    }

    if (g.boss) drawScorpion(g.boss);

    // webs
    const tier = 1 + Math.floor((g.level - 1) / 2);
    for (const shot of g.webShots) {
      ctx.save();
      ctx.strokeStyle = g.webBoost > 0 ? '#facc15' : '#e0f2fe';
      ctx.lineWidth = shot.width / 3;
      ctx.shadowColor = g.webBoost > 0 ? '#facc15' : '#93c5fd';
      ctx.shadowBlur = g.webBoost > 0 ? 24 : 12;
      ctx.beginPath(); ctx.moveTo(shot.x, shot.y + 22); ctx.lineTo(shot.x, shot.y - 20); ctx.stroke();
      ctx.lineWidth = 1;
      for (let k = -tier; k <= tier; k++) {
        ctx.beginPath(); ctx.moveTo(shot.x, shot.y - 12); ctx.lineTo(shot.x + k * 5, shot.y + 12); ctx.stroke();
      }
      ctx.restore();
    }

    for (const p of g.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (g.shield > 0) {
      ctx.strokeStyle = `rgba(96,165,250,${0.5 + 0.3 * Math.sin(g.time * 8)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(g.x, g.y, 43, 38, 0, 0, Math.PI * 2); ctx.stroke();
    }

    // Spidey leans a little towards where he's heading
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(clamp((g.vx || 0) * 0.03, -0.3, 0.3));       // leans into the direction of travel
    ctx.scale(1, 1 + clamp(-(g.vy || 0) * 0.004, -0.06, 0.08));
    drawSpiderman();
    ctx.restore();

    // status text
    ctx.font = 'bold 15px monospace';
    if (g.webBoost > 0) {
      ctx.fillStyle = '#facc15';
      ctx.textAlign = 'left';
      ctx.fillText(`⚡ WEB POWER 3x · ${g.webBoost.toFixed(1)}s`, 14, 62);
    }
    if (g.level >= 10) {
      ctx.fillStyle = '#93c5fd';
      ctx.textAlign = 'right';
      ctx.fillText(`ALLY SUPPORT ×${Math.min(g.allies, 5)}`, WIDTH - 14, 62);
    }

    if (g.slow > 0) { ctx.fillStyle = 'rgba(167,139,250,.08)'; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
    if (g.flash > 0) { ctx.fillStyle = `rgba(255,45,85,${g.flash})`; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
    ctx.restore();
  }

  updateHud();
  draw();
})();
