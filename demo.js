/* 폰캠 드라이브 · 가상 플레이 데모
   주소 끝에 ?demo 를 붙이면, 진짜 카메라 대신 3D로 만든 가상 거실 코스를 달리는 화면을
   앱에 넣어서 표지판 인식 · 레이스가 실제로 동작하는 모습을 보여 줍니다. */
(function () {
  document.write('<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"><\/script>');

  /* 데모 동안 이 기기의 설정을 잠시 바꾸고, 나갈 때 되돌림 */
  const KEYS = ['pcd-race', 'pcd-view', 'pcd-vr2'];
  const saved = {};
  try {
    for (const k of KEYS) saved[k] = localStorage.getItem(k);
    localStorage.setItem('pcd-race', JSON.stringify({laps: 2, gates: 4, dirs: ['R', 'R', 'R', 'R'], sens: 'mid', sound: true}));
    localStorage.setItem('pcd-view', JSON.stringify({rot: 0, mir: false, fit: false}));
  } catch (e) {}
  const restore = () => { try { for (const k of KEYS) saved[k] == null ? localStorage.removeItem(k) : localStorage.setItem(k, saved[k]); } catch (e) {} };
  window.addEventListener('pagehide', restore);

  /* 가짜 연결: 가상 카메라 화면을 휴대폰에서 온 영상처럼 넘겨줌 */
  let stream = null;
  const waitStream = cb => { const t = setInterval(() => { if (stream) { clearInterval(t); cb(stream); } }, 50); };
  window.Peer = class {
    constructor() {
      this.h = {};
      setTimeout(() => {
        this.h.open && this.h.open();
        waitStream(s => {
          let bytes = 0;
          const pc = new EventTarget(); pc.iceConnectionState = 'connected'; pc.connectionState = 'connected';
          pc.getStats = async () => {
            bytes += 2.4e6 / 8 * (0.9 + Math.random() * 0.2);
            const now = performance.now();
            return new Map([
              ['p', {type: 'candidate-pair', nominated: true, state: 'succeeded', localCandidateId: 'l', remoteCandidateId: 'r'}],
              ['l', {type: 'local-candidate', candidateType: 'host'}], ['r', {type: 'remote-candidate', candidateType: 'host'}],
              ['v', {type: 'inbound-rtp', kind: 'video', bytesReceived: bytes, timestamp: now, framesPerSecond: 29 + Math.random() * 2, frameWidth: 1280, frameHeight: 720}]
            ]);
          };
          const call = {h: {}, on(e, f) { this.h[e] = f; }, answer() {}, close() {}, peerConnection: pc};
          this.h.call && this.h.call(call);
          setTimeout(() => call.h.stream && call.h.stream(s), 120);
        });
      }, 60);
    }
    on(e, f) { this.h[e] = f; } reconnect() {} destroy() {}
  };

  /* ---------- 가상 코스 ---------- */
  const A = 1.6, B = 1.2, RAD = 0.6;              // 코스 반너비(가로·세로, m), 모서리 반지름
  const path = [];                                 // {x, z, s, hx, hz}
  (function build() {
    const add = (x, z) => { const p = path[path.length - 1]; const s = p ? p.s + Math.hypot(x - p.x, z - p.z) : 0; path.push({x, z, s}); };
    const seg = (x0, z0, x1, z1) => { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.01); for (let i = 0; i < n; i++) add(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n); };
    const arc = (cx, cz, a0, a1) => { const n = Math.ceil(Math.abs(a1 - a0) * RAD / 0.01); for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; add(cx + Math.cos(a) * RAD, cz + Math.sin(a) * RAD); } };
    const ax = A - RAD, bz = B - RAD;
    seg(ax, B, -ax, B);                            // 아래 직선 (−x 방향)
    arc(-ax, bz, Math.PI / 2, Math.PI);            // 오른쪽으로 꺾기
    seg(-A, bz, -A, -bz);
    arc(-ax, -bz, Math.PI, Math.PI * 1.5);
    seg(-ax, -B, ax, -B);
    arc(ax, -bz, -Math.PI / 2, 0);
    seg(A, -bz, A, bz);
    arc(ax, bz, 0, Math.PI / 2);
    for (let i = 0; i < path.length; i++) { const a = path[i], b = path[(i + 1) % path.length], l = Math.hypot(b.x - a.x, b.z - a.z) || 1; a.hx = (b.x - a.x) / l; a.hz = (b.z - a.z) / l; }
  })();
  const LEN = path[path.length - 1].s + 0.01;
  const at = s => { s = ((s % LEN) + LEN) % LEN; let lo = 0, hi = path.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (path[m].s <= s) lo = m; else hi = m - 1; } return path[lo]; };
  const curv = s => { const a = at(s), b = at(s + 0.25); return Math.abs(a.hx * b.hz - a.hz * b.hx); };

  /* 바닥 표지판 배치 (경로 위 거리 s, 옆으로 비킨 거리 off) */
  const ST = 2 * (A - RAD), SB = 2 * (B - RAD), Q = Math.PI * RAD / 2;
  const S0 = 0, S1 = ST, S2 = S1 + Q, S3 = S2 + SB, S4 = S3 + Q, S5 = S4 + ST, S6 = S5 + Q, S7 = S6 + SB, S8 = S7 + Q;
  const START = 0.15;
  const ITEMS = [
    {id: 8, s: 0.55, off: 0},                       // 부스터 A
    {id: 0, s: 1.25, off: 0},                       // 게이트 1 (출발선)
    {id: 1, s: (S2 + S3) / 2, off: 0},              // 게이트 2
    {id: 4, s: S4 + 0.55, off: 0},                  // 함정 A (밟음)
    {id: 2, s: S4 + 1.25, off: 0},                  // 게이트 3
    {id: 5, s: S4 + 1.75, off: 0.36},               // 함정 B (옆으로 피함)
    {id: 3, s: (S6 + S7) / 2, off: 0},              // 게이트 4
    {id: 9, s: S8 - 0.35, off: 0}                   // 부스터 B
  ];
  const SIGNS = [S1, S3, S5, S7];                   // 각 모서리 앞에 오른쪽 화살표 표지판

  /* ---------- 표지판 그림 ---------- */
  const COLORS = {gate: '#0fa38c', trap: '#d93a2f', boost: '#1f9d55'};
  const TITLES = {0: ['게이트 1', '출발선 · 결승선'], 1: ['게이트 2', '체크포인트'], 2: ['게이트 3', '체크포인트'], 3: ['게이트 4', '체크포인트'],
    4: ['함정 A', '밟으면 오물 +2초'], 5: ['함정 B', '밟으면 오물 +2초'], 8: ['부스터 A', '밟으면 기록 −1초'], 9: ['부스터 B', '밟으면 기록 −1초']};
  const kind = id => id <= 3 ? 'gate' : id <= 7 ? 'trap' : 'boost';
  const markerImg = id => new Promise(res => {
    const im = new Image();
    im.onload = () => res(im);
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new AR.Dictionary('PCD4').generateSVG(id).replace('<svg ', '<svg shape-rendering="crispEdges" width="600" height="600" '));
  });
  async function paperTex(id) {
    const mm = 3, c = document.createElement('canvas'); c.width = 210 * mm; c.height = 297 * mm;
    const g = c.getContext('2d'); g.fillStyle = '#f7f6f1'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = COLORS[kind(id)]; g.fillRect(0, 0, c.width, 46 * mm);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `900 ${17 * mm}px "Gothic A1", sans-serif`; g.fillText(TITLES[id][0], c.width / 2, 27 * mm);
    g.font = `700 ${6.5 * mm}px "Gothic A1", sans-serif`; g.fillText(TITLES[id][1], c.width / 2, 39 * mm);
    g.imageSmoothingEnabled = false; g.drawImage(await markerImg(id), 20 * mm, 62 * mm, 170 * mm, 170 * mm);
    g.fillStyle = COLORS[kind(id)]; g.font = `900 ${9 * mm}px "Gothic A1", sans-serif`; g.fillText(TITLES[id][0], c.width / 2, 282 * mm);
    return c;
  }
  async function signTex() {
    const mm = 3, c = document.createElement('canvas'); c.width = 287 * mm; c.height = 95 * mm;
    const g = c.getContext('2d'); g.fillStyle = '#f7f6f1'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#111'; g.lineWidth = 6 * mm; g.strokeRect(3 * mm, 3 * mm, 281 * mm, 89 * mm);
    g.fillStyle = '#111';
    for (let k = 0; k < 5; k++) {
      const x = 100 + k * 34, P = [[x, 17], [x + 12, 17], [x + 34, 47.5], [x + 12, 78], [x, 78], [x + 22, 47.5]];
      g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p[0] * mm, p[1] * mm) : g.moveTo(p[0] * mm, p[1] * mm)); g.closePath(); g.fill();
    }
    g.imageSmoothingEnabled = false; g.drawImage(await markerImg(10), 10 * mm, 10 * mm, 75 * mm, 75 * mm);
    return c;
  }
  function woodTex() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d');
    for (let r = 0; r < 8; r++) {
      const h = 28 + Math.random() * 8, l = 50 + Math.random() * 10;
      g.fillStyle = `hsl(${h},38%,${l}%)`; g.fillRect(0, r * 128, 1024, 128);
      for (let i = 0; i < 60; i++) { g.strokeStyle = `hsla(${h},35%,${l - 12}%,${0.15 + Math.random() * 0.2})`; g.lineWidth = 1 + Math.random() * 2; const y = r * 128 + Math.random() * 128; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(300, y + 6, 700, y - 6, 1024, y + Math.random() * 4); g.stroke(); }
      g.fillStyle = '#5a3f26'; g.fillRect(0, r * 128, 1024, 2);
      const cut = Math.random() * 1024; g.fillRect(cut, r * 128, 2, 128);
    }
    return c;
  }

  /* ---------- 3D 장면 ---------- */
  let renderer, scene, cam, carS = START, speed = 0, moving = false, stopping = false, lastT = 0;
  async function buildScene() {
    const T = window.THREE;
    renderer = new T.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
    renderer.setPixelRatio(1); renderer.setSize(1280, 720, false);
    const cv = renderer.domElement; cv.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;height:720px';
    document.body.appendChild(cv);
    scene = new T.Scene(); scene.background = new T.Color('#cfd8df');
    cam = new T.PerspectiveCamera(42, 16 / 9, 0.02, 30);
    scene.add(new T.HemisphereLight('#ffffff', '#6b5a48', 1.15));
    const sun = new T.DirectionalLight('#fff4e0', 1.1); sun.position.set(2, 4, 1.5); scene.add(sun);

    const wt = new T.CanvasTexture(woodTex()); wt.wrapS = wt.wrapT = T.RepeatWrapping; wt.repeat.set(4, 4); wt.anisotropy = 8; wt.colorSpace = T.SRGBColorSpace;
    const floor = new T.Mesh(new T.PlaneGeometry(9, 9), new T.MeshLambertMaterial({map: wt})); floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const wallM = new T.MeshLambertMaterial({color: '#e9e4da'});
    for (const [x, z, ry] of [[0, -4.5, 0], [0, 4.5, Math.PI], [-4.5, 0, Math.PI / 2], [4.5, 0, -Math.PI / 2]]) { const w = new T.Mesh(new T.PlaneGeometry(9, 2.6), wallM); w.position.set(x, 1.3, z); w.rotation.y = ry; scene.add(w); }
    const box = (w, h, d, col, x, z, ry = 0) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshLambertMaterial({color: col})); m.position.set(x, h / 2, z); m.rotation.y = ry; scene.add(m); return m; };
    box(2.2, 0.45, 0.9, '#5b6f8a', 0, -3.6); box(2.2, 0.85, 0.25, '#4f6079', 0, -4.05);                // 소파
    box(0.5, 0.45, 0.5, '#d9a441', -2.9, -1.2, 0.3); box(0.4, 0.3, 0.4, '#c0563f', -2.7, -0.6, -0.2);   // 상자
    box(1.4, 0.75, 0.45, '#8a6a4a', 3.6, 1.6, Math.PI / 2);                                            // 서랍장
    const pot = new T.Mesh(new T.CylinderGeometry(0.18, 0.14, 0.35, 20), new T.MeshLambertMaterial({color: '#b5654a'})); pot.position.set(-3.3, 0.175, 2.6); scene.add(pot);
    const leaf = new T.Mesh(new T.SphereGeometry(0.42, 16, 12), new T.MeshLambertMaterial({color: '#3f7a4a'})); leaf.position.set(-3.3, 0.75, 2.6); scene.add(leaf);

    /* 마스킹테이프 코스 선 */
    const tapeM = new T.MeshLambertMaterial({color: '#efe3bf'});
    for (const off of [-0.24, 0.24]) {
      const pos = [], idx = [];
      for (let i = 0; i <= path.length; i += 3) {
        const p = path[i % path.length], nx = -p.hz, nz = p.hx, w = 0.012;
        pos.push(p.x + nx * (off - w), 0.002, p.z + nz * (off - w), p.x + nx * (off + w), 0.002, p.z + nz * (off + w));
      }
      for (let i = 0; i < pos.length / 6 - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new T.Mesh(geo, tapeM); m.material.side = T.DoubleSide; scene.add(m);
    }
    /* 바닥 종이 표지판 */
    for (const it of ITEMS) {
      const tex = new T.CanvasTexture(await paperTex(it.id)); tex.anisotropy = 8; tex.colorSpace = T.SRGBColorSpace;
      const m = new T.Mesh(new T.PlaneGeometry(0.21, 0.297), new T.MeshLambertMaterial({map: tex}));
      const p = at(it.s), nx = -p.hz, nz = p.hx;
      m.position.set(p.x + nx * it.off, 0.003, p.z + nz * it.off);
      m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(-p.hx, -p.hz); m.rotation.x = -Math.PI / 2;
      scene.add(m); it.pos = m.position;
    }
    /* 화살표 텐트 표지판: 모서리 앞, 다가오는 차를 바라보게 */
    const stex = new T.CanvasTexture(await signTex()); stex.anisotropy = 8; stex.colorSpace = T.SRGBColorSpace;
    const back = new T.MeshLambertMaterial({color: '#b98a5a'});
    for (const s of SIGNS) {
      const p = at(s - 0.05), grp = new T.Group();
      grp.position.set(p.x + p.hx * (RAD + 0.32), 0, p.z + p.hz * (RAD + 0.32));
      grp.rotation.y = Math.atan2(-p.hx, -p.hz);
      const face = new T.Mesh(new T.PlaneGeometry(0.287, 0.095), new T.MeshLambertMaterial({map: stex}));
      face.position.set(0, 0.046, 0.013); face.rotation.x = -0.28; grp.add(face);
      const bk = new T.Mesh(new T.PlaneGeometry(0.287, 0.095), back); bk.position.set(0, 0.046, -0.013); bk.rotation.x = 0.28; bk.rotation.y = Math.PI; grp.add(bk);
      scene.add(grp);
    }
    stream = cv.captureStream(30);
    lastT = performance.now(); requestAnimationFrame(frame);
  }
  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    const target = !moving ? 0 : stopping ? 0 : (curv(carS) > 0.02 ? 0.55 : 0.8);
    speed += (target - speed) * Math.min(1, dt * 2.5);
    carS += speed * dt;
    const p = at(carS), q = at(carS + 0.35), bob = Math.sin(t / 70) * 0.0012 * (speed > 0.1 ? 1 : 0);
    cam.position.set(p.x, 0.13 + bob, p.z);
    const hx = p.hx * 0.6 + q.hx * 0.4, hz = p.hz * 0.6 + q.hz * 0.4;
    cam.rotation.order = 'YXZ'; cam.rotation.y = Math.atan2(-hx, -hz); cam.rotation.x = -0.24; cam.rotation.z = Math.sin(t / 230) * 0.004 - (p.hx * q.hz - p.hz * q.hx) * 0.08;
    renderer.render(scene, cam);
    drawMap();
    requestAnimationFrame(frame);
  }

  /* ---------- 미니맵 · 안내 ---------- */
  let mapC = null;
  function drawMap() {
    if (!mapC) return;
    const g = mapC.getContext('2d'), W = mapC.width, H = mapC.height, k = Math.min(W / (2 * A + 0.9), H / (2 * B + 0.9));
    const X = x => W / 2 + x * k, Z = z => H / 2 + z * k;
    g.clearRect(0, 0, W, H); g.fillStyle = '#6b4e33'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#efe3bf'; g.lineWidth = 0.48 * k; g.globalAlpha = .35; g.beginPath(); path.forEach((p, i) => i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))); g.closePath(); g.stroke(); g.globalAlpha = 1;
    for (const it of ITEMS) if (it.pos) { g.fillStyle = COLORS[kind(it.id)]; g.fillRect(X(it.pos.x) - 5, Z(it.pos.z) - 5, 10, 10); if (it.id <= 3) { g.fillStyle = '#fff'; g.font = '700 10px sans-serif'; g.textAlign = 'center'; g.fillText(it.id + 1, X(it.pos.x), Z(it.pos.z) + 3.5); } }
    const p = at(carS); g.save(); g.translate(X(p.x), Z(p.z)); g.rotate(Math.atan2(p.hz, p.hx));
    g.fillStyle = '#ffb547'; g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, -6); g.lineTo(-3, 0); g.lineTo(-6, 6); g.closePath(); g.fill(); g.restore();
  }
  function ui() {
    const css = document.createElement('style');
    css.textContent = `.demo{position:fixed;z-index:40;right:max(2%,10px);top:max(8%,56px);width:min(250px,30vw);background:#05080de6;border:1px solid #ffb54766;border-radius:14px;padding:10px;color:#eef3f8;font:13px/1.4 "Gothic A1",sans-serif}
      .demo b{color:#ffb547}.demo canvas{width:100%;height:auto;display:block;border-radius:8px;margin:6px 0}
      .demo .r{display:flex;gap:6px}.demo button{flex:1;min-height:38px;border:0;border-radius:10px;background:#1f2835;color:#fff;font:700 13px "Gothic A1",sans-serif;cursor:pointer}
      .demo button:focus-visible{outline:2px solid #fff}
      .dstart{position:fixed;inset:0;z-index:70;display:grid;place-items:center;background:#05070ccc;text-align:center;padding:20px}
      .dstart h2{font-size:clamp(26px,5vw,40px);margin:0 0 8px}.dstart p{color:#b9c6d6;margin:0 0 20px;max-width:520px}
      .dstart button{min-height:56px;padding:0 34px;border:0;border-radius:999px;background:#ffb547;color:#241500;font:800 20px "Gothic A1",sans-serif;cursor:pointer}
      @media (max-width:700px){.demo{width:150px;top:auto;bottom:8px;right:8px}.demo .t{display:none}}`;
    document.head.appendChild(css);
    const d = document.createElement('div'); d.className = 'demo';
    d.innerHTML = `<div class="t"><b>가상 플레이 데모</b> · 실제 카메라 대신 3D 가상 거실 코스를 달리는 화면이에요. 표지판 인식과 레이스는 실제 앱이 그대로 처리해요.</div>
      <canvas width="250" height="180" id="dMap"></canvas>
      <div class="r"><button id="dVR">VR로 보기</button><button id="dAgain">다시 보기</button></div>
      <div class="r" style="margin-top:6px"><button id="dExit">데모 끝내기</button></div>`;
    document.body.appendChild(d); mapC = d.querySelector('#dMap');
    d.querySelector('#dAgain').onclick = () => location.reload();
    d.querySelector('#dExit').onclick = () => { restore(); location.href = location.pathname; };
    d.querySelector('#dVR').onclick = () => { document.getElementById('vVr').click(); };
    const s = document.createElement('div'); s.className = 'dstart';
    s.innerHTML = `<div><h2>가상 플레이 데모</h2><p>가상 RC카가 거실 바닥 코스를 2바퀴 달려요. 게이트 통과, 함정 오물과 와이퍼, 부스터, 화살표 표지판이 실제 앱에서 어떻게 보이는지 확인해 보세요. 소리가 나요.</p><button id="dGo">▶ 데모 시작</button></div>`;
    document.body.appendChild(s);
    return new Promise(res => { s.querySelector('#dGo').onclick = () => { s.remove(); res(); }; if (/[?&]demo=auto/.test(location.search)) { s.remove(); res(); } });
  }

  /* ---------- 자동 진행 ---------- */
  const $ = id => document.getElementById(id);
  const until = (fn, cb, ms = 100) => { const t = setInterval(() => { if (fn()) { clearInterval(t); cb(); } }, ms); };
  window.addEventListener('DOMContentLoaded', async () => {
    const go = ui();
    try { await buildScene(); } catch (e) { console.error(e); }
    await go;
    $('goView').click();
    until(() => $('ws').classList.contains('on'), () => {
      setTimeout(() => { $('vRace').click(); setTimeout(() => $('rGo').click(), 1800); }, 1200);
    });
    until(() => $('rCount').textContent === '출발!', () => { moving = true; });
    let wiped = '';
    setInterval(() => {
      const t = $('rToast').textContent;
      if (t.includes('함정') && $('rToast').classList.contains('show') && wiped !== t + Math.floor(performance.now() / 4000)) {
        wiped = t + Math.floor(performance.now() / 4000);
        setTimeout(() => $('rWipe').click(), 1400);
      }
    }, 200);
    until(() => !$('rRes').classList.contains('hide'), () => { stopping = true; });
  });
})();
