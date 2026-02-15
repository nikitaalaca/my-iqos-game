(() => {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  const timeEl = document.getElementById("time");
  const scoreEl = document.getElementById("score");
  const multEl = document.getElementById("mult");
  const startBtn = document.getElementById("start");
  const hapticBtn = document.getElementById("haptic");

  let W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    W = Math.floor(canvas.clientWidth * dpr);
    H = Math.floor(canvas.clientHeight * dpr);
    canvas.width = W;
    canvas.height = H;
  }
  window.addEventListener("resize", resize);

  // ---- assets ----
  const img = {};
  const ASSETS = {
    hole: "assets/hole.png",
    iqos: "assets/iqos.png",
    sticks: "assets/sticks.png",
    hit: "assets/hit.png",
  };

  function loadImages() {
    const entries = Object.entries(ASSETS);
    return Promise.all(entries.map(([k, src]) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { img[k] = im; res(); };
      im.onerror = rej;
      im.src = src;
    })));
  }

  // ---- game state ----
  const GRID = [
    {x: 0.2, y: 0.25}, {x: 0.5, y: 0.25}, {x: 0.8, y: 0.25},
    {x: 0.2, y: 0.55}, {x: 0.5, y: 0.55}, {x: 0.8, y: 0.55},
    {x: 0.5, y: 0.83},
  ];

  let running = false;
  let timeLeft = 30_000; // 30 сек
  let lastTs = 0;
  let score = 0;

  // кто сейчас “вылез” в дырке
  // type: "iqos" | "sticks" | null
  const holes = GRID.map((p) => ({
    ...p,
    type: null,
    until: 0,     // ms timestamp
    cooldown: 0,  // чтобы не спавнить слишком часто
    justHit: 0,
  }));

  // x2 бонус
  let multiplier = 1;
  let multUntil = 0;

  let hapticOn = true;

  function now() { return performance.now(); }

  function setMultiplier(x, durationMs) {
    multiplier = x;
    multUntil = now() + durationMs;
    multEl.textContent = `x${multiplier}`;
  }

  function addScore(base) {
    const total = base * multiplier;
    score += total;
    scoreEl.textContent = String(score);
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function spawnLogic(ts) {
    for (const h of holes) {
      if (h.type && ts > h.until) h.type = null;

      if (ts < h.cooldown) continue;
      if (h.type) continue;

      // шанс появления
      const p = 0.018; // подкрути под “сложность”
      if (Math.random() < p) {
        // 85% iqos, 15% пачка стиков (x2)
        const isSticks = Math.random() < 0.15;
        h.type = isSticks ? "sticks" : "iqos";
        const life = isSticks ? rand(650, 950) : rand(550, 900);
        h.until = ts + life;
        h.cooldown = ts + rand(250, 520);
      }
    }
  }

  function draw(ts) {
    ctx.clearRect(0, 0, W, H);

    // фон-земля уже в css, но можно и здесь рисовать текстуру/градиент.

    const holeSize = Math.min(W, H) * 0.18;
    const popSize = holeSize * 0.9;

    for (const h of holes) {
      const cx = h.x * W;
      const cy = h.y * H;

      // дырка
      if (img.hole) {
        ctx.drawImage(img.hole, cx - holeSize/2, cy - holeSize/2, holeSize, holeSize);
      } else {
        ctx.beginPath();
        ctx.ellipse(cx, cy, holeSize*0.45, holeSize*0.30, 0, 0, Math.PI*2);
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fill();
      }

      // цель
      if (h.type) {
        const sprite = h.type === "sticks" ? img.sticks : img.iqos;
        if (sprite) {
          ctx.drawImage(sprite, cx - popSize/2, cy - popSize*0.75, popSize, popSize);
        } else {
          ctx.fillStyle = h.type === "sticks" ? "#ffcc00" : "#ffffff";
          ctx.fillRect(cx - popSize/3, cy - popSize*0.9, popSize*0.66, popSize*0.66);
        }
      }

      // эффект удара
      if (h.justHit && ts < h.justHit) {
        const a = (h.justHit - ts) / 160;
        ctx.globalAlpha = Math.max(0, a);
        if (img.hit) {
          ctx.drawImage(img.hit, cx - popSize/2, cy - popSize/2, popSize, popSize);
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy - popSize*0.2, popSize*0.25, 0, Math.PI*2);
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 6 * dpr;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    // x2 таймер
    if (multiplier > 1) {
      const remain = Math.max(0, multUntil - ts);
      if (remain <= 0) {
        multiplier = 1;
        multEl.textContent = "x1";
      }
    }
  }

  function loop(ts) {
    if (!running) return;

    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;

    timeLeft -= dt;
    timeEl.textContent = String(Math.max(0, Math.ceil(timeLeft / 1000)));

    spawnLogic(ts);
    draw(ts);

    if (timeLeft <= 0) {
      endGame();
      return;
    }
    requestAnimationFrame(loop);
  }

  function startGame() {
    running = true;
    timeLeft = 30_000;
    score = 0;
    scoreEl.textContent = "0";
    setMultiplier(1, 0);
    lastTs = 0;

    for (const h of holes) {
      h.type = null;
      h.until = 0;
      h.cooldown = 0;
      h.justHit = 0;
    }

    if (tg?.HapticFeedback && hapticOn) tg.HapticFeedback.selectionChanged();
    requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;

    // отправка результата “в телегу” (по желанию)
    // tg.sendData(JSON.stringify({ score }));

    if (tg?.showPopup) {
      tg.showPopup({
        title: "Игра окончена",
        message: `Счёт: ${score}`,
        buttons: [{type: "ok"}]
      });
    } else {
      alert(`Игра окончена. Счёт: ${score}`);
    }
  }

  function hitAt(clientX, clientY) {
    if (!running) return;

    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * dpr;
    const y = (clientY - rect.top) * dpr;

    const holeSize = Math.min(W, H) * 0.18;
    let hit = false;

    for (const h of holes) {
      const cx = h.x * W;
      const cy = h.y * H;
      const dx = x - cx;
      const dy = y - (cy - holeSize*0.25); // “вылезает” выше дырки

      const r = holeSize * 0.55;
      if (dx*dx + dy*dy <= r*r) {
        if (h.type) {
          hit = true;

          // если ударил по пачке стиков — включаем x2 на 6 секунд
          if (h.type === "sticks") {
            setMultiplier(2, 6000);
            addScore(10); // можно меньше, чтоб бонус был основным
          } else {
            addScore(30);
          }

          h.type = null;
          h.until = 0;
          h.justHit = now() + 160;

          if (tg?.HapticFeedback && hapticOn) tg.HapticFeedback.impactOccurred("light");
          break;
        }
      }
    }

    // промах — лёгкая “негативная” вибрация (если хочешь)
    if (!hit && tg?.HapticFeedback && hapticOn) tg.HapticFeedback.notificationOccurred("warning");
  }

  // pointer events (tap/click)
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    hitAt(e.clientX, e.clientY);
  });

  startBtn.addEventListener("click", startGame);
  hapticBtn.addEventListener("click", () => {
    hapticOn = !hapticOn;
    hapticBtn.textContent = `Вибро: ${hapticOn ? "ON" : "OFF"}`;
  });

  // init
  resize();
  loadImages()
    .then(() => {
      // готово
    })
    .catch(() => {
      // если картинки не загрузились — игра всё равно работает с примитивами
    });
})();
