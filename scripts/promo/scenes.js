// The trailer's scenes, run inside the game page one frame at a time.
// Each scene is (i, n) => void: frame i of n. Captions fade in and out.
(() => {
  const g = window.game;
  const cl = window.cl;
  const S = () => g.state;
  const r = () => g.renderer;
  const fade = (i, n, k = 12) => Math.max(0, Math.min(1, i / k, (n - 1 - i) / k));

  // ---- overlays: a caption on a little wooden board, and full title cards
  const style = document.createElement('style');
  style.textContent = `
    #promo-cap { position: fixed; left: 50%; bottom: 46px; transform: translateX(-50%); z-index: 100;
      padding: 12px 30px 13px; font: 600 30px Cinzel, serif; letter-spacing: 0.03em; color: #fbefd2; white-space: nowrap;
      text-shadow: 0 2px 4px rgba(0,0,0,0.85); pointer-events: none; opacity: 0;
      background: linear-gradient(180deg, rgba(255,220,160,0.18), rgba(0,0,0,0.3)), var(--wood-img-dark, #6a4424) center / cover;
      border: 3px solid #3a2210; border-radius: 4px; box-shadow: 0 6px 16px rgba(0,0,0,0.5);
      clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px); }
    #promo-card { position: fixed; inset: 0; z-index: 101; display: flex; flex-direction: column; align-items: center; justify-content: center;
      pointer-events: none; opacity: 0; background: radial-gradient(ellipse at center, rgba(20,12,4,0.35), rgba(20,12,4,0.78)); }
    #promo-card h1 { margin: 0; font: 700 112px Cinzel, serif; color: #fbefd2; letter-spacing: 0.04em; text-shadow: 0 6px 18px rgba(0,0,0,0.85); }
    #promo-card p { margin: 10px 0 0; font: italic 36px 'EB Garamond', serif; color: #f2e2c0; text-shadow: 0 3px 8px rgba(0,0,0,0.9); }
    #promo-card .small { margin-top: 34px; font: 600 30px Cinzel, serif; font-style: normal; color: #ffe9b0; }
  `;
  document.head.appendChild(style);
  const cap = document.createElement('div');
  cap.id = 'promo-cap';
  document.body.appendChild(cap);
  const card = document.createElement('div');
  card.id = 'promo-card';
  document.body.appendChild(card);
  const caption = (text, a) => {
    cap.textContent = text;
    cap.style.opacity = String(a);
  };
  const showCard = (html, a) => {
    if (card.dataset.html !== html) {
      card.innerHTML = html;
      card.dataset.html = html;
    }
    card.style.opacity = String(a);
  };
  const ui = (on) => {
    document.getElementById('ui').style.display = on ? '' : 'none';
    for (const e of document.querySelectorAll('.banner, .msg, #season-banner')) e.remove();
  };
  const camp = () => S().buildings.find((b) => b.type === 'camp') ?? S().buildings[0];
  const manor = () => S().buildings.find((b) => b.type === 'townhall');
  const centreOf = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  /** Steps the days forward to one of the year (0-119), and sets the hour. */
  const toDay = (day, frac = 0.45) => {
    const s = S();
    let guard = 0;
    while (s.day % 120 !== day && guard++ < 400) cl.stepDay(s);
    s.pendingEvent = null;
    g.simAcc = (frac * 5 - (s.day % 5)) * 22.5;
    if (g.simAcc < 0 || g.simAcc >= 22.5) g.simAcc = 1;
    r().dusk = 0;
  };
  const place = (type, near, from = 3) => {
    const s = S();
    near = { x: Math.round(near.x), y: Math.round(near.y) };
    for (let d = from; d < 16; d++)
      for (let dy = -d; dy <= d; dy++)
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          if (!cl.placementError(s, type, near.x + dx, near.y + dy)) return cl.placeOrder(s, type, near.x + dx, near.y + dy);
        }
    return null;
  };
  let sites = [];
  let pan = { x: 0, y: 0 };

  window.promo = {
    title(i, n) {
      const back = document.querySelector('.modal-back');
      if (back) back.style.display = 'none';
      showCard('<h1>Corner Lands</h1><p>Raise a humble hamlet into a thriving medieval town</p>', fade(i, n, 18));
    },
    found(i, n) {
      const s = S();
      const c = centreOf(camp());
      if (i === 0) {
        showCard('', 0);
        ui(false);
        g.setPhoto(true);
        g.setSpeed(2);
        r().centerOn(c.x, c.y + 1);
        r().cam.zoom = 2.0;
        sites = [place('woodcutter', { x: c.x - 6, y: c.y - 3 }), place('house', { x: c.x + 2, y: c.y + 3 }), place('house', { x: c.x + 5, y: c.y + 1 }), place('forager', { x: c.x - 3, y: c.y + 5 })].filter(Boolean);
        for (const b of sites) b.need = undefined;
      }
      // The sites rise one after another while the builders hammer.
      sites.forEach((b, k) => {
        const start = (k * n) / 6;
        if (i > start && b.build < 1) {
          b.need = undefined;
          b.build = Math.min(1, b.build + 1 / (n * 0.42));
          if (b.build >= 1) {
            b.build = 1;
            s.dirty = true;
            cl.recompute(s);
          }
        }
      });
      r().centerOn(c.x + i * 0.008, c.y + 1 - i * 0.004);
      caption('Found a settlement on a quiet corner of land', fade(i, n));
    },
    grow(i, n) {
      const s = S();
      if (i === 0) g.setSpeed(1);
      if (i % 8 === 4) {
        cl.playBot(s, 0.2, 7);
        s.pendingEvent = null;
        g.setSpeed(1);
      }
      const c = centreOf(manor() ?? camp());
      const t = i / (n - 1);
      r().cam.zoom = 2.0 - t * 1.15;
      r().centerOn(c.x + 1, c.y + 1);
      caption('Watch your hamlet grow into a thriving town', fade(i, n));
    },
    life(i, n) {
      const s = S();
      if (i === 0) {
        toDay(47, 0.35);
        const m = s.buildings.find((b) => b.type === 'market' && b.build >= 1) ?? manor() ?? camp();
        pan = centreOf(m);
        g.setSpeed(1);
      }
      r().cam.zoom = 2.5;
      r().centerOn(pan.x - 1.5 + i * 0.012, pan.y + 0.5 + i * 0.006);
      caption('Every villager has a home, a trade and a road to walk', fade(i, n));
    },
    seasons(i, n) {
      const days = [17, 47, 82, 107];
      const k = Math.floor((i * 4) / n);
      const j = i - Math.floor((k * n) / 4);
      if (j === 0) {
        toDay(days[k], 0.4);
        const c = centreOf(manor() ?? camp());
        pan = { x: c.x - 4, y: c.y + 3 };
      }
      r().cam.zoom = 1.45;
      r().centerOn(pan.x + i * 0.01, pan.y - i * 0.004);
      caption('Four seasons: sowing, harvest and hungry winters', fade(i, n));
    },
    dusk(i, n) {
      const s = S();
      if (i === 0) {
        toDay(49, 0.86);
        r().dusk = 0.85;
        const homes = s.buildings.filter((b) => b.type === 'house' && b.residents > 0);
        const h = homes[Math.floor(homes.length / 2)] ?? camp();
        pan = centreOf(h);
      }
      // Hold the hour, while the villagers go on walking home.
      g.simAcc = (0.86 * 5 - (s.day % 5)) * 22.5;
      r().cam.zoom = 2.2;
      r().centerOn(pan.x + i * 0.01, pan.y);
      caption('Lanterns glow as the day draws in', fade(i, n));
    },
    manor(i, n) {
      if (i === 0) {
        toDay(52, 0.4);
        const m = manor() ?? camp();
        pan = centreOf(m);
      }
      r().cam.zoom = 2.3 - (i / n) * 0.3;
      r().centerOn(pan.x + 0.5, pan.y + 1.5);
      caption('Raise a manor, and fly your own arms', fade(i, n));
    },
    charters(i, n) {
      if (i === 0) {
        g.setPhoto(false);
        ui(true);
        S().res.prestige = Math.max(S().res.prestige, 400);
        g.hud.update();
        document.querySelector('#top [data-action="charters"]').click();
      }
      if (i === Math.floor(n * 0.45)) document.querySelector('.t-node[data-id="learning1"]')?.click();
      caption('Shape your town with charters', fade(i, n));
    },
    tutorial(i, n) {
      if (i === 0) {
        g.hud.closeModal();
        ui(true);
        g.setPhoto(false);
        const c = centreOf(camp());
        r().centerOn(c.x, c.y);
        r().cam.zoom = 1.3;
        S().tutorial = { step: 0, chapter: 'start' };
      }
      caption('', 0);
      if (i === n - 1) S().tutorial = undefined;
    },
    end(i, n) {
      if (i === 0) {
        ui(false);
        g.setPhoto(true);
        toDay(52, 0.45);
        pan = centreOf(manor() ?? camp());
      }
      r().cam.zoom = 1.1;
      r().centerOn(pan.x - 2 + i * 0.015, pan.y + 1);
      showCard('<h1>Corner Lands</h1><p>A cosy medieval city builder</p><p class="small">Play free in your browser on itch.io</p>', Math.min(1, i / 20));
    },
  };
})();
