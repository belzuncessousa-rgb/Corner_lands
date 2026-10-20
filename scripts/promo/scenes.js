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
    body:not(.promo-tut) #tutor { display: none !important; }
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
  // ---- staged scenes: spots on the map laid out by hand for the camera
  const reserved = [];
  const clearTile = (s, x, y) => {
    if (x < 0 || y < 0 || x >= s.width || y >= s.height) return false;
    const k = y * s.width + x;
    return s.terrain[k] === 0 && s.occ[k] < 0 && !s.road[k] && !s.rock[k] && !s.ore[k];
  };
  const treesAt = (s, x, y) => (x < 0 || y < 0 || x >= s.width || y >= s.height ? 0 : s.trees[y * s.width + x] ? 1 : 0);
  const farFrom = (x, y, w, h, gap) => reserved.every((q) => x > q.x + q.w + gap || q.x > x + w + gap || y > q.y + q.h + gap || q.y > y + h + gap);
  /** The best clear w×h patch (with a clear margin), by score, away from the camp and the other staged spots. */
  const findRect = (w, h, score) => {
    const s = S();
    const c = centreOf(camp());
    let best = null;
    for (let y = 2; y + h + 2 < s.height; y++)
      for (let x = 2; x + w + 2 < s.width; x++) {
        const dc = Math.hypot(x + w / 2 - c.x, y + h / 2 - c.y);
        if (dc < 16 || dc > 60 || !farFrom(x, y, w, h, 8)) continue;
        let ok = true;
        for (let ty = y - 1; ok && ty <= y + h; ty++) for (let tx = x - 1; tx <= x + w; tx++) if (!clearTile(s, tx, ty)) { ok = false; break; }
        if (!ok) continue;
        const v = score(x, y, dc);
        if (!best || v > best.v) best = { x, y, w, h, v };
      }
    if (best) reserved.push(best);
    return best;
  };
  const ringTrees = (x, y, w, h, r) => {
    const s = S();
    let t = 0;
    for (let ty = y - r; ty < y + h + r; ty++) for (let tx = x - r; tx < x + w + r; tx++) if (tx < x || ty < y || tx >= x + w || ty >= y + h) t += treesAt(s, tx, ty);
    return t;
  };
  const innerTrees = (x, y, w, h) => {
    const s = S();
    let t = 0;
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) t += treesAt(s, tx, ty);
    return t;
  };
  const rich = () => {
    const s = S();
    for (const k in s.res) if (k !== 'prestige') s.res[k] = Math.max(s.res[k], 99999);
    s.tier = Math.max(s.tier, 4);
  };
  /** A building placed at exactly (x, y), as a bare site that the scene raises itself. */
  const site = (type, x, y) => {
    const b = cl.placeOrder(S(), type, Math.round(x), Math.round(y));
    if (b) b.need = undefined;
    return b;
  };
  const road = (x, y) => cl.buildRoad(S(), Math.round(x), Math.round(y), 3);
  const finish = (b) => {
    const s = S();
    b.build = 1;
    b.need = undefined;
    b.status = 'Completed';
    s.dirty = true;
  };
  /** Raises the staged sites one after another: site k starts at frame start + k*gap and takes len frames. */
  const raise = (list, i, start, gap, len) => {
    list.forEach((b, k) => {
      if (!b || b.build >= 1) return;
      b.need = undefined;
      const t = (i - start - k * gap) / len;
      if (t <= 0) b.build = 0;
      else if (t >= 1) {
        finish(b);
        cl.recompute(S());
      } else b.build = Math.min(0.99, t);
    });
  };
  /** Keeps people living and working in the staged buildings. */
  const people = (list) => {
    for (const b of list) {
      if (!b || b.build < 1) continue;
      if (b.type === 'house') b.residents = 5;
      else if (cl.defs[b.type].workers) b.workers = cl.defs[b.type].workers;
    }
  };
  const quiet = () => {
    const s = S();
    s.pendingEvent = null;
    if (s.tutorial && !document.body.classList.contains('promo-tut')) s.tutorial = undefined;
  };
  const fell = (x0, y0, x1, y1) => {
    const s = S();
    for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(s.height - 1, Math.max(y0, y1)); y++)
      for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(s.width - 1, Math.max(x0, x1)); x++) s.trees[y * s.width + x] = 0;
    s.dirty = true;
  };
  let village = [];
  let works = [];
  let estate = {};
  let saved = null;
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
    life(i, n) {
      const s = S();
      quiet();
      if (i === 0) {
        toDay(47, 0.4);
        g.setSpeed(1);
        // An open meadow by the water at the edge of the woods: two herds of deer and the rabbits come to graze there.
        const wetNear = (x, y, w, h, r) => {
          let t = 0;
          for (let ty = y - r; ty < y + h + r; ty++) for (let tx = x - r; tx < x + w + r; tx++) if (tx >= 0 && ty >= 0 && tx < s.width && ty < s.height && s.terrain[ty * s.width + tx] === 1) t++;
          return t;
        };
        const a = findRect(9, 7, (x, y, dc) => Math.min(wetNear(x, y, 9, 7, 3), 20) + Math.min(ringTrees(x, y, 9, 7, 3), 30) * 0.5 - innerTrees(x, y, 9, 7) * 2 - dc * 0.1);
        pan = { x: a.x + 4.5, y: a.y + 3.5 };
        const herds = s.herds ?? [];
        const pick = (kind, k) => herds.map((h, hi) => ({ h, hi })).filter((o) => o.h.kind === kind).slice(k, k + 1)[0];
        const moves = [[pick('deer', 0), -1.5, -0.5], [pick('deer', 1), 1.5, 1], [pick('rabbit', 0), 0.5, -1.5]];
        for (const [o, dx, dy] of moves) {
          if (!o) continue;
          o.h.x = pan.x + dx;
          o.h.y = pan.y + dy;
          o.h.n = Math.max(o.h.n, 3);
          g.wildlife.animals = g.wildlife.animals.filter((an) => an.herd !== o.hi);
          g.wildlife.seen.delete(o.hi);
        }
        g.wildlife.turtlesIn = 0;
      }
      // The camera drifts gently after the animals.
      const near = g.wildlife.animals.filter((an) => an.herd >= 0 && Math.hypot(an.x - pan.x, an.y - pan.y) < 7);
      if (near.length) {
        if (!pan.cx) [pan.cx, pan.cy] = [near.reduce((t, an) => t + an.x, 0) / near.length, near.reduce((t, an) => t + an.y, 0) / near.length];
        const ax = near.reduce((t, an) => t + an.x, 0) / near.length;
        const ay = near.reduce((t, an) => t + an.y, 0) / near.length;
        pan.cx += (ax - pan.cx) * 0.02;
        pan.cy += (ay - pan.cy) * 0.02;
      }
      r().cam.zoom = 4.2 - (i / n) * 0.3;
      r().centerOn((pan.cx ?? pan.x) + 0.3, (pan.cy ?? pan.y) + 0.3);
      caption('Filled with life', fade(i, n));
    },
    village(i, n) {
      quiet();
      if (i === 0) {
        saved = { ...S().res, tier: S().tier };
        rich();
        g.setSpeed(1);
        // Two blocks either side of a cobbled street: a church beside the tavern, homes, a well and flower beds.
        const a = findRect(14, 10, (x, y, dc) => ringTrees(x, y, 14, 10, 3) * 0.3 - innerTrees(x, y, 14, 10) - dc * 0.2);
        const [X, Y] = [a.x, a.y];
        for (let x = 0; x < 14; x++) road(X + x, Y + 4);
        for (let y = 0; y < 10; y++) if (y !== 4) road(X + 7, Y + y);
        const lay = [
          ['church', 0, 0], ['tavern', 3, 1], ['house', 8, 2], ['house', 10, 2], ['house', 12, 2],
          ['house', 0, 5], ['house', 2, 5], ['house', 4, 5], ['house', 8, 5], ['house', 10, 5], ['house', 12, 5],
          ['well', 6, 6], ['garden', 9, 0], ['garden', 12, 0], ['fountain', 10, 7], ['shrine', 5, 0],
        ];
        village = lay.map(([t, x, y]) => site(t, X + x, Y + y));
        for (const x of [0, 1, 2, 3, 4, 5]) village.push(site('flowerbed', X + x, Y + 8));
        for (const x of [8, 9, 11, 12, 13]) village.push(site('flowerbed', X + x, Y + 8));
        for (const x of [3, 4]) village.push(site('flowerbed', X + x, Y + 0));
        village.forEach((b, k) => {
          if (b?.type === 'house') b.level = 1 + (k % 3);
        });
        // The church and the tavern stand already; the homes and gardens rise round them.
        for (const b of village.slice(0, 2)) if (b) finish(b);
        village[0] && (village[0].level = 2);
        village[1] && (village[1].level = 2);
        cl.recompute(S());
        pan = { x: X + 7, y: Y + 5 };
      }
      raise(village.slice(2), i, 4, 6, 30);
      people(village);
      r().cam.zoom = 2.15 - (i / n) * 0.35;
      r().centerOn(pan.x - 1.2 + i * 0.008, pan.y - 0.4 + i * 0.004);
      caption('For you to grow a beautiful village', fade(i, n));
    },
    industry(i, n) {
      const s = S();
      quiet();
      if (i === 0) {
        rich();
        // A straight bit of shore: the street runs down to the water, the dock, kiln and storehouse on one side, the clay pit on the other.
        const c = centreOf(camp());
        let best = null;
        const land = (x, y) => clearTile(s, x, y);
        const wet = (x, y) => x >= 0 && y >= 0 && x < s.width && y < s.height && s.terrain[y * s.width + x] === 1;
        for (let y = 3; y < s.height - 3; y++)
          for (let x = 3; x < s.width - 3; x++) {
            if (!land(x, y)) continue;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              if (!wet(x + dx, y + dy)) continue;
              const [ix, iy] = [-dx, -dy];
              const [px, py] = [dy, dx];
              // The street's strip runs inland on clear ground; the shore along it is mostly water.
              let ok = true;
              let shore = 0;
              for (let k = -5; ok && k <= 4; k++) {
                if (wet(x + px * k + dx, y + py * k + dy) || wet(x + px * k, y + py * k)) shore++;
                for (let m = 1; ok && m <= 8; m++) if (!land(x + px * k + ix * m, y + py * k + iy * m)) ok = false;
              }
              if (shore < 6) ok = false;
              if (!ok) continue;
              const dc = Math.hypot(x - c.x, y - c.y);
              const box = { x: Math.min(x - 6 * Math.abs(px), x + 8 * ix), y: Math.min(y - 6 * Math.abs(py), y + 8 * iy), w: 12, h: 12 };
              if (dc < 14 || !farFrom(box.x, box.y, box.w, box.h, 6)) continue;
              const v = -dc;
              if (!best || v > best.v) best = { x, y, ix, iy, px, py, v, box };
            }
          }
        const { x, y, ix, iy, px, py } = best;
        reserved.push(best.box);
        const at = (k, m) => ({ x: x + px * k + ix * m, y: y + py * k + iy * m });
        const [c0, c1] = [at(-10, 0), at(9, 13)];
        fell(c0.x, c0.y, c1.x, c1.y);
        for (let m = 0; m <= 8; m++) road(at(0, m).x, at(0, m).y);
        if (!s.road[y * s.width + x]) road(x, y);
        for (let k = -5; k <= 4; k++) if (k !== 0) road(at(k, 4).x, at(k, 4).y);
        /** Places a building on one side of the street (side -1 or 1), as close to (k, m) as it fits. */
        const onSide = (type, k0, m0, side) => {
          const d = cl.defs[type];
          for (let r = 0; r < 6; r++)
            for (let dk = -r; dk <= r; dk++)
              for (let dm = -r; dm <= r; dm++) {
                if (Math.max(Math.abs(dk), Math.abs(dm)) !== r) continue;
                const p = at(k0 + dk, m0 + dm);
                if (cl.placementError(s, type, p.x, p.y)) continue;
                // Every tile of it on the chosen side of the street.
                let ok = true;
                for (let ty = p.y; ty < p.y + d.h; ty++) for (let tx = p.x; tx < p.x + d.w; tx++) if (Math.sign((tx - x) * px + (ty - y) * py) !== side) ok = false;
                if (ok) return site(type, p.x, p.y);
              }
          return null;
        };
        works = [
          onSide('dock', -3, 0, -1), onSide('kiln', -2, 2, -1), onSide('storehouse', -3, 6, -1), onSide('claypit', 2, 1, 1),
          onSide('sawmill', -6, 2, -1), onSide('cooper', -6, 6, -1), onSide('potter', -2, 9, -1), onSide('carpenter', -6, 9, -1),
          onSide('smithy', 2, 6, 1), onSide('bloomery', 5, 6, 1), onSide('tanner', 5, 2, 1), onSide('weaver', 2, 9, 1), onSide('stonemason', 5, 9, 1),
        ];
        for (const b of works) if (b) finish(b);
        cl.recompute(s);
        const built = works.filter(Boolean);
        pan = { x: built.reduce((t, b) => t + b.x + b.w / 2, 0) / built.length, y: built.reduce((t, b) => t + b.y + b.h / 2, 0) / built.length };
      }
      people(works);
      r().cam.zoom = 1.8 - (i / n) * 0.12;
      r().centerOn(pan.x + 0.8 - i * 0.008, pan.y + 0.3 + i * 0.003);
      caption('Or a thriving industry', fade(i, n));
    },
    manor(i, n) {
      const s = S();
      quiet();
      const T = (f) => Math.round(f * n);
      if (i === 0) {
        rich();
        // A clearing by the woods, with room for the manor to grow and its works round it.
        const a = findRect(16, 16, (x, y, dc) => ringTrees(x, y, 16, 16, 4) - innerTrees(x, y, 16, 16) * 0.5 - dc * 0.05);
        fell(a.x, a.y, a.x + 15, a.y + 15);
        estate = { X: a.x, Y: a.y, hall: site('townhall', a.x + 1, a.y + 1) };
        pan = { x: a.x + 3, y: a.y + 3 };
      }
      const { X, Y, hall } = estate;
      /** The renovation from one manor level to the next, between two frames. */
      const renovate = (to, from, until) => {
        if (i < from || hall.level >= to) return;
        if (until > from) {
          hall.upgrading = to;
          hall.upProgress = Math.min(1, (i - from) / (until - from));
        }
        if (i >= until) {
          hall.level = to;
          hall.upgrading = undefined;
          hall.upProgress = undefined;
          const size = [0, 3, 3, 4][to];
          if (size > hall.w) {
            for (let y = hall.y; y < hall.y + size; y++) for (let x = hall.x; x < hall.x + size; x++) {
              s.occ[y * s.width + x] = hall.id;
              s.trees[y * s.width + x] = 0;
            }
            hall.w = size;
            hall.h = size;
          }
          s.dirty = true;
          cl.recompute(s);
        }
      };
      // Each stage simply stands: the Manor Hall, the Manor House, the Stone Manor, then the lord's works one by one.
      if (i === 0) finish(hall);
      if (i === T(0.22)) renovate(2, 0, 0);
      if (i === T(0.44)) renovate(3, 0, 0);
      if (i === T(0.6)) estate.more = [site('stable', X + 6, Y + 1), site('watchtower', X + 12, Y + 1), site('manorgarden', X + 1, Y + 6), site('watchtower', X + 12, Y + 6)];
      if (estate.more) estate.more.forEach((b, k) => b && b.build < 1 && i >= T(0.6) + k * T(0.08) && finish(b));
      if (estate.more) cl.recompute(s);
      const t = i / (n - 1);
      r().cam.zoom = 2.5 - Math.max(0, t - 0.6) * 2.4;
      r().centerOn(pan.x + Math.max(0, t - 0.6) * 9, pan.y + Math.max(0, t - 0.6) * 9);
      caption('Raise your manor, and fly your own arms', fade(i, n));
    },
    tutorial(i, n) {
      const s = S();
      const say = 'Greetings, my liege. Your subjects await you...';
      const tu = g.tutor;
      if (i === 0) {
        if (saved) {
          const { tier, ...res } = saved;
          Object.assign(s.res, res);
          s.tier = tier;
        }
        s.tutorial = undefined;
        g.hud.closeModal();
        ui(true);
        g.setPhoto(false);
        g.setSpeed(1);
        const v = village.find((b) => b?.type === 'church') ?? camp();
        const c = centreOf(v);
        pan = { x: c.x + 2.5, y: c.y + 4 };
        // His own drawing and balloon, held still by us rather than by the tutorial.
        tu.promoUpdate = tu.update;
        tu.update = () => {};
        document.body.classList.add('promo-tut');
        tu.root.style.display = 'block';
        for (const e of tu.root.querySelectorAll('.t-grey, .t-dim, .t-shield')) e.style.display = 'none';
      }
      r().cam.zoom = 1.7;
      r().centerOn(pan.x, pan.y);
      people(village);
      quiet();
      // A little larger than in play, so his words read in the video.
      const Z = 1.4;
      tu.root.style.zoom = String(Z);
      const W = window.innerWidth / Z;
      const H = window.innerHeight / Z;
      const gx = Math.round(W * 0.06);
      const gy = Math.round(H * 0.5);
      // He springs up, then talks at his usual pace.
      const a = i / 30;
      const pop = a < 0.2 ? 0 : a < 0.6 ? 1 + Math.sin(((a - 0.2) / 0.4) * Math.PI) * 0.18 : 1;
      tu.guide.style.left = `${gx}px`;
      tu.guide.style.top = `${gy}px`;
      tu.guide.style.opacity = a < 0.2 ? '0' : '1';
      tu.guide.style.transform = pop === 1 ? '' : `scale(${pop.toFixed(3)})`;
      tu.paintGuide(false);
      const typed = Math.max(0, Math.min(say.length, Math.floor(((i - 24) / 30) * 48)));
      const done = typed >= say.length;
      tu.balloon.style.display = i >= 24 ? 'block' : 'none';
      tu.balloon.classList.remove('left');
      tu.balloon.innerHTML = `<div class="t-name">Fingamoboblius</div><p>${say.slice(0, typed)}<span class="t-caret">${done ? '' : '▌'}</span></p>
        <div class="t-foot"><span class="t-next">${done ? 'Click or press Enter to go on ▸' : 'Click to hurry him'}</span><button data-t="skip">Skip tutorial</button></div>`;
      tu.balloon.style.left = `${gx + 52}px`;
      tu.balloon.style.top = `${gy - 30}px`;
      tu.balloon.style.width = '340px';
      caption('', 0);
      if (i === n - 1) {
        tu.update = tu.promoUpdate;
        tu.root.style.display = 'none';
        tu.root.style.zoom = '';
        document.body.classList.remove('promo-tut');
      }
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
