// battleFx.js — High-Impact 60fps Anime Canvas VFX & Web Audio SFX Engine (Zero Dependencies, Offline Acode Ready)

class SfxEngine {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  _ensureCtx() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playAttack(style) {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (style === "gen") {
      // Eerie Sharingan / illusion chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.42);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.46);
      return;
    }

    if (style === "special") {
      // Chidori / lightning crackle
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.35);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.38);
      return;
    }

    // Filtered noise whoosh for NIN / TAI / KUN
    const bufferSize = Math.floor(ctx.sampleRate * 0.32);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(style === "kun" ? 1800 : style === "nin" ? 650 : 420, now);
    filter.frequency.exponentialRampToValueAtTime(style === "kun" ? 3200 : 1200, now + 0.28);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(now);
  }

  playHit(heavy = false) {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Punchy sub-bass impact thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(heavy ? 160 : 130, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + (heavy ? 0.34 : 0.22));
    gain.gain.setValueAtTime(heavy ? 0.32 : 0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.36 : 0.24));
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  playBlock() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Resonant chakra barrier clang
    [420, 630].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 0 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.15, now + 0.28);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.34);
    });
  }

  playCounter() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.18);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }
}

export class BattleFxEngine {
  constructor(canvasEl, stageEl) {
    this.canvas = canvasEl;
    this.stage = stageEl;
    this.ctx = canvasEl ? canvasEl.getContext("2d") : null;
    this.sfx = new SfxEngine();

    this.particles = [];
    this.effects = [];
    this.rafId = null;
    this.lastTime = 0;

    this._resize();
    if (typeof ResizeObserver !== "undefined" && this.stage) {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this.stage);
    }
    window.addEventListener("resize", () => this._resize());
  }

  setSoundEnabled(flag) {
    this.sfx.enabled = Boolean(flag);
  }

  _resize() {
    if (!this.canvas || !this.stage) return;
    const rect = this.stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.width = w;
      this.height = h;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  _anchor(side) {
    this._resize();
    const w = this.width || 600;
    const h = this.height || 260;
    const isStacked = w < 640;
    if (isStacked) {
      return side === "A"
        ? { x: w * 0.5, y: h * 0.22 }
        : side === "B"
        ? { x: w * 0.5, y: h * 0.78 }
        : { x: w * 0.5, y: h * 0.5 };
    }
    return side === "A"
      ? { x: w * 0.22, y: h * 0.5 }
      : side === "B"
      ? { x: w * 0.78, y: h * 0.5 }
      : { x: w * 0.5, y: h * 0.5 };
  }

  clear() {
    this.particles = [];
    this.effects = [];
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.width || 0, this.height || 0);
    }
  }

  _startLoop() {
    if (this.rafId !== null) return;
    this.lastTime = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this._update(dt);
      this._draw();
      if (this.particles.length > 0 || this.effects.length > 0) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.rafId = null;
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  playClashIntro() {
    const c = this._anchor("CENTER");
    this.effects.push({
      type: "impactStar",
      x: c.x,
      y: c.y,
      color: "#fbbf24",
      core: "#ffffff",
      radius: 95,
      age: 0,
      duration: 0.45,
    });
    for (let i = 0; i < 24; i++) {
      const ang = (Math.PI * 2 * i) / 24 + (Math.random() - 0.5) * 0.2;
      const spd = 120 + Math.random() * 220;
      this.particles.push({
        x: c.x,
        y: c.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 2 + Math.random() * 3,
        color: i % 2 === 0 ? "#38bdf8" : "#fbbf24",
        age: 0,
        life: 0.42 + Math.random() * 0.2,
        drag: 0.94,
      });
    }
    this._startLoop();
  }

  playStyleAttack(fromSide, style) {
    const start = this._anchor(fromSide);
    const end = this._anchor(fromSide === "A" ? "B" : "A");
    this.sfx.playAttack(style);

    if (style === "nin") {
      // Swirling Rasengan chakra orb projectile + spiraling blue ribbons
      this.effects.push({
        type: "rasengan",
        sx: start.x,
        sy: start.y,
        ex: end.x,
        ey: end.y,
        age: 0,
        duration: 0.44,
      });
    } else if (style === "special") {
      // Jagged Chidori / Six Paths lightning bolts across the arena
      this.effects.push({
        type: "lightning",
        sx: start.x,
        sy: start.y,
        ex: end.x,
        ey: end.y,
        color: "#38bdf8",
        secondary: "#f87171",
        age: 0,
        duration: 0.46,
      });
    } else if (style === "gen") {
      // Hypnotic crimson/violet Sharingan illusion waves over target
      this.effects.push({
        type: "genjutsu",
        x: end.x,
        y: end.y,
        age: 0,
        duration: 0.55,
      });
    } else if (style === "kun") {
      // Rapid metallic kunai streaks + X sword slash
      this.effects.push({
        type: "slash",
        sx: start.x,
        sy: start.y,
        ex: end.x,
        ey: end.y,
        age: 0,
        duration: 0.42,
      });
    } else {
      // TAI: Eight Gates emerald-green sonic rush + wind rings
      this.effects.push({
        type: "taijutsu",
        sx: start.x,
        sy: start.y,
        ex: end.x,
        ey: end.y,
        age: 0,
        duration: 0.42,
      });
    }

    this._startLoop();
  }

  playImpact(targetSide, { isHit, heavy = false, style = "tai", isCounter = false } = {}) {
    const pos = this._anchor(targetSide);

    if (isHit) {
      this.sfx.playHit(heavy);
      const palette = {
        nin: ["#38bdf8", "#e0f2fe"],
        special: ["#ef4444", "#fde047"],
        gen: ["#c084fc", "#f43f5e"],
        kun: ["#e2e8f0", "#fbbf24"],
        tai: ["#4ade80", "#fef08a"],
      }[style] || ["#f97316", "#ffffff"];

      // Anime impact star burst
      this.effects.push({
        type: "impactStar",
        x: pos.x,
        y: pos.y,
        color: palette[0],
        core: "#ffffff",
        radius: heavy ? 115 : 80,
        age: 0,
        duration: heavy ? 0.55 : 0.4,
      });

      // Shockwave ring
      this.effects.push({
        type: "shockwave",
        x: pos.x,
        y: pos.y,
        color: palette[0],
        maxR: heavy ? 125 : 85,
        age: 0,
        duration: 0.48,
      });

      // Sparks & flying rock debris chunks
      const count = heavy ? 36 : 22;
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (heavy ? 180 : 120) + Math.random() * 240;
        const isRock = i % 4 === 0;
        this.particles.push({
          x: pos.x,
          y: pos.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - (isRock ? 60 : 0),
          gravity: isRock ? 460 : 40,
          size: isRock ? 4 + Math.random() * 4 : 2 + Math.random() * 3.5,
          color: isRock ? "#64748b" : i % 2 === 0 ? palette[0] : palette[1],
          shape: isRock ? "rock" : "spark",
          age: 0,
          life: 0.45 + Math.random() * 0.35,
          drag: 0.94,
        });
      }

      // Trigger stage camera shake
      if (this.stage) {
        const cls = heavy ? "stage-shake-heavy" : "stage-shake";
        this.stage.classList.remove("stage-shake", "stage-shake-heavy");
        void this.stage.offsetWidth;
        this.stage.classList.add(cls);
      }
    } else {
      // Complete Block -> Glowing Chakra Hex Barrier Dome!
      this.sfx.playBlock();
      this.effects.push({
        type: "shieldDome",
        x: pos.x,
        y: pos.y,
        age: 0,
        duration: 0.62,
      });
      for (let i = 0; i < 18; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 90 + Math.random() * 140;
        this.particles.push({
          x: pos.x + Math.cos(ang) * 32,
          y: pos.y + Math.sin(ang) * 32,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          size: 2.5 + Math.random() * 2.5,
          color: i % 2 === 0 ? "#38bdf8" : "#bae6fd",
          shape: "spark",
          age: 0,
          life: 0.42 + Math.random() * 0.2,
          drag: 0.92,
        });
      }
    }

    if (isCounter) {
      // ADP Counter-Read violet reverse bolt back to attacker!
      this.sfx.playCounter();
      const other = this._anchor(targetSide === "A" ? "B" : "A");
      this.effects.push({
        type: "lightning",
        sx: pos.x,
        sy: pos.y,
        ex: other.x,
        ey: other.y,
        color: "#c084fc",
        secondary: "#e879f9",
        age: 0,
        duration: 0.42,
      });
    }

    this._startLoop();
  }

  _update(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age += dt;
      if (e.type === "rasengan" && Math.random() < 0.85) {
        const t = Math.min(1, e.age / e.duration);
        const cx = e.sx + (e.ex - e.sx) * t;
        const cy = e.sy + (e.ey - e.sy) * t;
        this.particles.push({
          x: cx + (Math.random() - 0.5) * 20,
          y: cy + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 60,
          vy: (Math.random() - 0.5) * 60,
          size: 2 + Math.random() * 3,
          color: Math.random() < 0.5 ? "#38bdf8" : "#e0f2fe",
          shape: "spark",
          age: 0,
          life: 0.28,
          drag: 0.92,
        });
      }
      if (e.age >= e.duration) this.effects.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      p.vx *= p.drag || 0.95;
      p.vy *= p.drag || 0.95;
      if (p.gravity) p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.age >= p.life) this.particles.splice(i, 1);
    }
  }

  _drawBolt(ctx, sx, sy, ex, ey, color, width, jitter = 18) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    const steps = 9;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = sx + (ex - sx) * t + (Math.random() - 0.5) * jitter;
      const y = sy + (ey - sy) * t + (Math.random() - 0.5) * jitter;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
  }

  _draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width || 0, this.height || 0);

    for (const e of this.effects) {
      const p = Math.min(1, e.age / e.duration);
      const alpha = 1 - p;

      if (e.type === "rasengan") {
        const cx = e.sx + (e.ex - e.sx) * p;
        const cy = e.sy + (e.ey - e.sy) * p;
        ctx.save();
        const grad = ctx.createRadialGradient(cx, cy, 3, cx, cy, 34);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.45, "#38bdf8");
        grad.addColorStop(1, "rgba(56, 189, 248, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 34, 0, Math.PI * 2);
        ctx.fill();

        // Swirling chakra rings
        ctx.strokeStyle = "#bae6fd";
        ctx.lineWidth = 2.2;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          const ang = e.age * 16 + k * 2.1;
          ctx.arc(cx, cy, 14 + k * 7, ang, ang + Math.PI * 1.15);
          ctx.stroke();
        }
        ctx.restore();
      } else if (e.type === "lightning") {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p * 0.7);
        this._drawBolt(ctx, e.sx, e.sy, e.ex, e.ey, e.color, 3.5, 24);
        this._drawBolt(ctx, e.sx, e.sy, e.ex, e.ey, "#ffffff", 1.5, 14);
        this._drawBolt(ctx, e.sx, e.sy, e.ex, e.ey, e.secondary, 2.0, 32);
        ctx.restore();
      } else if (e.type === "genjutsu") {
        ctx.save();
        ctx.translate(e.x, e.y);
        for (let k = 0; k < 4; k++) {
          const r = 16 + ((p * 95 + k * 24) % 95);
          ctx.strokeStyle = k % 2 === 0 ? `rgba(192,132,252,${alpha})` : `rgba(239,68,68,${alpha})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Spinning 3-tomoe Sharingan dots
        const orbit = 32;
        for (let t = 0; t < 3; t++) {
          const a = e.age * 9 + (t * Math.PI * 2) / 3;
          ctx.fillStyle = `rgba(239,68,68,${alpha})`;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * orbit, Math.sin(a) * orbit, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (e.type === "slash") {
        ctx.save();
        ctx.globalAlpha = alpha;
        // Flying kunai streak
        const cx = e.sx + (e.ex - e.sx) * Math.min(1, p * 1.4);
        const cy = e.sy + (e.ey - e.sy) * Math.min(1, p * 1.4);
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(e.sx, e.sy);
        ctx.lineTo(cx, cy);
        ctx.stroke();

        // Cross blade slash at target
        if (p > 0.35) {
          const s = 42 * ((p - 0.35) / 0.65);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(e.ex - s, e.ey - s);
          ctx.lineTo(e.ex + s, e.ey + s);
          ctx.moveTo(e.ex + s, e.ey - s);
          ctx.lineTo(e.ex - s, e.ey + s);
          ctx.stroke();
        }
        ctx.restore();
      } else if (e.type === "taijutsu") {
        ctx.save();
        const cx = e.sx + (e.ex - e.sx) * p;
        const cy = e.sy + (e.ey - e.sy) * p;
        ctx.strokeStyle = `rgba(74, 222, 128, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = "#4ade80";
        ctx.shadowBlur = 12;
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(e.sx, e.sy + k * 14);
          ctx.lineTo(cx, cy + k * 14);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(cx, cy, 18 + p * 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (e.type === "impactStar") {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.globalAlpha = alpha;
        const spikes = 10;
        const outer = e.radius * (0.45 + p * 0.75);
        const inner = outer * 0.28;
        ctx.fillStyle = e.color;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const r = i % 2 === 0 ? outer : inner;
          const a = (Math.PI * i) / spikes;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = e.core;
        ctx.beginPath();
        ctx.arc(0, 0, inner * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.type === "shockwave") {
        ctx.save();
        ctx.strokeStyle = e.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 4 * alpha + 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 14 + e.maxR * p, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (e.type === "shieldDome") {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.globalAlpha = alpha;
        const r = 46 + p * 18;
        const grad = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
        grad.addColorStop(0, "rgba(56, 189, 248, 0.08)");
        grad.addColorStop(1, "rgba(56, 189, 248, 0.55)");
        ctx.fillStyle = grad;
        ctx.strokeStyle = "#7dd3fc";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const pt of this.particles) {
      const a = Math.max(0, 1 - pt.age / pt.life);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      if (pt.shape === "rock") {
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
