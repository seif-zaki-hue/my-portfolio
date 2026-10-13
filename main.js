// Version 4 - updated 2026-10-14
// Page behaviour: menu, certificates, preview popup, typing text and the small effects.
// The game has its own file (game.js) and the certificate list is in certificates.js.

const $ = selector => document.querySelector(selector);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// the fancy cursor / tilt stuff only makes sense with a real mouse
const hasMouse = matchMedia('(hover: hover) and (pointer: fine)').matches;


// ---------- mobile menu ----------
const nav = $('#nav');
const navToggle = $('#navToggle');
const navLinks = $('#navLinks');

function setMenu(open) {
  navLinks.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}

navToggle.addEventListener('click', () => setMenu(!navLinks.classList.contains('open')));
navLinks.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('click', e => { if (!nav.contains(e.target)) setMenu(false); });


// ---------- certificates ----------
const grid = $('#certGrid');
const moreBtn = $('#moreBtn');
const searchInput = $('#search');
const emptyMsg = $('#empty');
const VISIBLE_AT_FIRST = 12;
let showAll = false;

// small helper so I don't repeat createElement everywhere
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function buildCard(cert) {
  const card = el('article', 'cert-card');
  card.dataset.search = (cert.title + ' ' + (cert.issuer || '')).toLowerCase();

  card.append(el('div', 'cert-icon', cert.icon), el('h3', null, cert.title));
  if (cert.issuer) card.append(el('div', 'issuer', cert.issuer));
  if (cert.date) card.append(el('div', 'date', cert.date));

  const actions = el('div', 'cert-actions');

  if (cert.drive) {
    const preview = el('button', null, 'Preview');
    preview.type = 'button';
    preview.dataset.drive = cert.drive;
    preview.dataset.title = cert.title;
    actions.append(preview);
  }
  if (cert.verify) {
    const verify = el('a', null, 'Verify ↗');
    verify.href = cert.verify;
    verify.target = '_blank';
    verify.rel = 'noopener';
    actions.append(verify);
  }
  if (cert.drive) {
    const open = el('a', null, 'Open ↗');
    open.href = 'https://drive.google.com/file/d/' + cert.drive + '/view';
    open.target = '_blank';
    open.rel = 'noopener';
    actions.append(open);
  }

  card.append(actions);
  return card;
}

const cards = certificates.map(buildCard);
grid.append(...cards);
$('#certCount').dataset.count = certificates.length;

function applyFilter() {
  const query = searchInput.value.trim().toLowerCase();
  let shown = 0;

  cards.forEach((card, i) => {
    const matches = !query || card.dataset.search.includes(query);
    const allowed = query || showAll || i < VISIBLE_AT_FIRST;
    card.hidden = !(matches && allowed);
    if (!card.hidden) shown++;
  });

  moreBtn.hidden = !!query || certificates.length <= VISIBLE_AT_FIRST;
  moreBtn.textContent = showAll ? 'Show fewer' : `Show all certificates (${certificates.length})`;
  emptyMsg.hidden = shown > 0;
}

searchInput.addEventListener('input', () => {
  applyFilter();
  // replay the little pop animation on whatever is left
  cards.forEach(card => {
    if (card.hidden) return;
    card.classList.remove('pop');
    void card.offsetWidth;     // restart the animation
    card.classList.add('pop');
  });
});
moreBtn.addEventListener('click', () => {
  showAll = !showAll;
  applyFilter();
  if (!showAll) $('#certs').scrollIntoView();
});
applyFilter();


// ---------- preview popup (certificates + CV) ----------
const modal = $('#modal');
const modalFrame = $('#modalFrame');
let lastTrigger = null;

function openPreview(button) {
  lastTrigger = button;
  modalFrame.src = `https://drive.google.com/file/d/${button.dataset.drive}/preview`;
  $('#modalTitle').textContent = button.dataset.title;
  $('#modalOpen').href = `https://drive.google.com/file/d/${button.dataset.drive}/view`;
  modal.classList.add('open');
  document.body.classList.add('no-scroll');
  $('#modalClose').focus();
}

function closePreview() {
  modal.classList.remove('open');
  document.body.classList.remove('no-scroll');
  modalFrame.src = 'about:blank';
  if (lastTrigger) lastTrigger.focus();
}

document.addEventListener('click', e => {
  const button = e.target.closest('[data-drive]');
  if (button) openPreview(button);
});
$('#modalClose').addEventListener('click', closePreview);
modal.addEventListener('click', e => { if (e.target === modal) closePreview(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (modal.classList.contains('open')) closePreview();
  setMenu(false);
});


// ---------- typing roles in the hero ----------
const roles = ['Python Developer', 'BIS Student', 'Networking Enthusiast', '🕷 Spider-Man Fan'];
const typing = $('#typing');

if (reduceMotion) {
  typing.textContent = roles.join(' | ');
} else {
  let roleIndex = 0;
  let charCount = 0;
  let deleting = false;

  (function tick() {
    const word = roles[roleIndex];
    typing.textContent = word.slice(0, charCount);

    if (!deleting && charCount === word.length) {
      deleting = true;
      return setTimeout(tick, 1400);       // pause once the word is complete
    }
    if (deleting && charCount === 0) {
      deleting = false;
      roleIndex = (roleIndex + 1) % roles.length;
    }
    charCount += deleting ? -1 : 1;
    setTimeout(tick, deleting ? 35 : 80);
  })();
}


// ---------- stat counters ----------
const counterObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const node = entry.target;
    const end = Number(node.dataset.count);
    const start = performance.now();

    function step(now) {
      const progress = Math.min((now - start) / 1200, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = Math.round(end * eased);
      if (progress < 1 && !reduceMotion) requestAnimationFrame(step);
      else node.textContent = end;
    }
    requestAnimationFrame(step);
    counterObserver.unobserve(node);
  });
}, { threshold: 0.6 });

document.querySelectorAll('.stat b').forEach(node => counterObserver.observe(node));


// ---------- fade sections in as they scroll into view ----------
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('in');
    revealObserver.unobserve(entry.target);
  });
}, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(node => revealObserver.observe(node));


// ---------- scroll: progress bar, back-to-top, active menu link ----------
const menuLinks = [...navLinks.querySelectorAll('a')];
const sectionsForMenu = menuLinks.map(a => document.querySelector(a.getAttribute('href')));
const progressBar = $('#progress');
const toTop = $('#toTop');
let scrollQueued = false;

function onScroll() {
  scrollQueued = false;
  const page = document.documentElement;
  const scrolled = page.scrollTop;
  const total = page.scrollHeight - page.clientHeight;

  progressBar.style.width = (total > 0 ? scrolled / total * 100 : 0) + '%';
  toTop.classList.toggle('show', scrolled > 600);

  // last section whose top has passed ~40% of the screen
  let current = -1;
  sectionsForMenu.forEach((section, i) => {
    if (section.getBoundingClientRect().top < innerHeight * 0.4) current = i;
  });
  menuLinks.forEach((link, i) => link.classList.toggle('active', i === current));
}

addEventListener('scroll', () => {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(onScroll);
}, { passive: true });

toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
onScroll();


// ---------- skills ticker ----------
(function buildMarquee() {
  const words = ['PYTHON', 'SQL', 'NETWORKING', 'IP ADDRESSING', 'AI LITERACY', 'DATABASES', 'WEB TECHNOLOGIES', 'BIS'];
  const html = words.map(w => `<span>${w}</span><i>🕸</i>`).join('');
  $('#track').innerHTML = html + html;     // twice so the loop looks seamless
})();


// ---------- spider-web background ----------
(function webBackground() {
  const canvas = $('#web');
  const ctx = canvas.getContext('2d');
  const mouse = { x: -999, y: -999 };
  let width, height, points = [];

  function resize() {
    width = canvas.width = innerWidth;
    height = canvas.height = innerHeight;
    const count = Math.min(90, Math.floor(width * height / 16000));
    points = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
    }));
    if (reduceMotion) draw();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    for (const p of points) {
      if (!reduceMotion) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fill();
    }

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
        if (d < 130) {
          ctx.strokeStyle = `rgba(255,255,255,${0.12 * (1 - d / 130)})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(points[i].x, points[i].y);
          ctx.lineTo(points[j].x, points[j].y);
          ctx.stroke();
        }
      }
      // red threads towards the cursor / finger
      const dm = Math.hypot(points[i].x - mouse.x, points[i].y - mouse.y);
      if (dm < 190) {
        ctx.strokeStyle = `rgba(255,45,85,${0.55 * (1 - dm / 190)})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(points[i].x, points[i].y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.stroke();
      }
    }

    if (!reduceMotion) requestAnimationFrame(draw);
  }

  addEventListener('resize', resize);
  addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  document.addEventListener('pointerleave', () => { mouse.x = mouse.y = -999; });
  resize();
  if (!reduceMotion) draw();
})();


// ---------- spider-sense flash when certs / contact come into view ----------
(function spiderSense() {
  const flash = $('#sense');
  let lastId = null;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || entry.target.id === lastId) return;
      lastId = entry.target.id;
      flash.classList.add('on');
      setTimeout(() => flash.classList.remove('on'), 450);
    });
  }, { threshold: 0.35 });

  if (!reduceMotion) document.querySelectorAll('#certs, #contact').forEach(s => observer.observe(s));
})();


// ---------- desktop-only extras (mouse needed) ----------
if (hasMouse) {

  // custom cursor: dot follows instantly, ring lags a bit behind
  (function cursor() {
    const dot = $('#curDot');
    const ring = $('#curRing');
    let x = 0, y = 0, ringX = 0, ringY = 0;

    addEventListener('pointermove', e => {
      x = e.clientX;
      y = e.clientY;
      dot.style.transform = `translate(${x}px, ${y}px)`;
    });
    document.addEventListener('pointerover', e => {
      ring.classList.toggle('big', !!e.target.closest('a, button, input, .skill, .cert-card'));
    });

    (function follow() {
      ringX += (x - ringX) * 0.18;
      ringY += (y - ringY) * 0.18;
      ring.style.transform = `translate(${ringX}px, ${ringY}px)`;
      requestAnimationFrame(follow);
    })();
  })();

  // glow that follows the mouse inside certificate cards
  grid.addEventListener('pointermove', e => {
    const card = e.target.closest('.cert-card');
    if (!card) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - box.left) + 'px');
    card.style.setProperty('--my', (e.clientY - box.top) + 'px');
  });

  if (!reduceMotion) {

    // 3D tilt: code card + certificate cards
    const tiltCard = $('#tilt');
    tiltCard.addEventListener('pointermove', e => {
      const box = tiltCard.getBoundingClientRect();
      const x = (e.clientX - box.left) / box.width - 0.5;
      const y = (e.clientY - box.top) / box.height - 0.5;
      tiltCard.style.transform = `perspective(700px) rotateY(${x * 14}deg) rotateX(${-y * 14}deg)`;
    });
    tiltCard.addEventListener('pointerleave', () => { tiltCard.style.transform = ''; });

    grid.addEventListener('pointermove', e => {
      const card = e.target.closest('.cert-card');
      if (!card) return;
      const box = card.getBoundingClientRect();
      const x = (e.clientX - box.left) / box.width - 0.5;
      const y = (e.clientY - box.top) / box.height - 0.5;
      card.style.transform = `perspective(800px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-6px)`;
    });
    grid.addEventListener('pointerout', e => {
      const card = e.target.closest('.cert-card');
      if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
    });

    // hero emblem drifts a little with the mouse
    const emblem = $('#heroEmblem');
    addEventListener('pointermove', e => {
      const x = (e.clientX / innerWidth - 0.5) * 20;
      const y = (e.clientY / innerHeight - 0.5) * 20;
      emblem.style.translate = `${x}px ${y}px`;
    });

    // click anywhere to shoot a web line from the bottom corner
    (function webShots() {
      const canvas = $('#shots');
      const ctx = canvas.getContext('2d');
      let shots = [];

      function fit() { canvas.width = innerWidth; canvas.height = innerHeight; }
      addEventListener('resize', fit);
      fit();

      addEventListener('pointerdown', e => {
        if (e.target.closest('input, iframe, .modal, #gameWrap')) return;
        shots.push({
          x: e.clientX, y: e.clientY,
          fromX: e.clientX < innerWidth / 2 ? innerWidth : 0,
          fromY: innerHeight,
          t: 0,
        });
        if (shots.length === 1) run();
      });

      function run() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        shots = shots.filter(s => s.t < 1.6);

        for (const s of shots) {
          s.t += 0.06;
          const travel = Math.min(s.t, 1);
          const fade = s.t > 1 ? 1 - (s.t - 1) / 0.6 : 1;
          const endX = s.fromX + (s.x - s.fromX) * travel;
          const endY = s.fromY + (s.y - s.fromY) * travel;

          ctx.strokeStyle = `rgba(255,255,255,${0.85 * fade})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(s.fromX, s.fromY);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          if (travel >= 1) {            // little web splat where it lands
            const radius = 18 * (1 + (s.t - 1));
            for (let k = 0; k < 8; k++) {
              const angle = k * Math.PI / 4;
              ctx.beginPath();
              ctx.moveTo(s.x, s.y);
              ctx.lineTo(s.x + Math.cos(angle) * radius, s.y + Math.sin(angle) * radius);
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(s.x, s.y, 10 * (1 + (s.t - 1) * 0.5), 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        if (shots.length) requestAnimationFrame(run);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    })();
  }
}
