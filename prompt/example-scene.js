Sim.create({
  title: "Ball kicked off a cliff",
  duration: 10,
  params: [
    { id: "v0", label: "Speed", unit: "m/s", min: 1, max: 40, step: 0.5, value: 15 },
    { id: "theta", label: "Angle", unit: "°", min: -30, max: 85, step: 1, value: 35, digits: 0 },
    { id: "h", label: "Cliff", unit: "m", min: 0, max: 60, step: 1, value: 20, digits: 0 },
    { id: "m", label: "Ball mass", unit: "kg", min: 0.1, max: 5, step: 0.1, value: 0.45, digits: 2 },
  ],
  answers: (p) => {
    const th = (p.theta * Math.PI) / 180, vx = p.v0 * Math.cos(th), vy = p.v0 * Math.sin(th), g = 9.8;
    const t = (vy + Math.sqrt(vy * vy + 2 * g * p.h)) / g;
    return [
      { id: "R", label: "Lands from base", value: vx * t, unit: "m", digits: 1 },
      { id: "t", label: "Time in air", value: t, unit: "s", digits: 2 },
      { id: "v", label: "Impact speed", value: Math.hypot(vx, vy - g * t), unit: "m/s", digits: 1 },
    ];
  },
  init: (p) => {
    const th = (p.theta * Math.PI) / 180;
    return { x: 0, y: p.h, vx: p.v0 * Math.cos(th), vy: p.v0 * Math.sin(th) };
  },
  step: (s, dt) => {
    s.vy -= 9.8 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  },
  stop: (s) => s.y <= 0,
  track: (s) => [s.x, Math.max(0, s.y), 0],
  build: (k, p, A) => {
    const S = k.size;
    k.ground();
    k.slab([[-S * 0.6, 0], [0, 0], [0, p.h], [-S * 0.6, p.h]]);
    k.dim([-S * 0.03, 0, S * 0.18], [-S * 0.03, p.h, S * 0.18], `${p.h} m`);
    k.marker([A.R, 0, 0], `${A.R.toFixed(1)} m`);
    // Mass shows as size: radius grows with the cube root of mass.
    const ball = k.ball({ r: k.massRadius(p.m, 0.45, S * 0.018) });
    const v = k.arrow({ kind: "v", label: "v" });
    return (s) => {
      const y = Math.max(0, s.y) + ball.mesh.scale.x;
      ball.at(s.x, y);
      v.set([s.x, y, 0], [s.vx * S * 0.006, s.vy * S * 0.006, 0]);
    };
  },
  plots: [{ label: "Height", unit: "m", value: (s) => Math.max(0, s.y) }],
});
