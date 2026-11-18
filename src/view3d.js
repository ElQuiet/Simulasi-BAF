// =====================================================================
// Tampilan 3D: muffle, tatakan, spesimen, fluks panas (aliran partikel / panah)
// =====================================================================
const V3 = { ready:false, theta:-0.85, phi:0.95, dist:390, faces:[], builtKey:null };
const SIGMA = 5.670374e-8;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function init3D(){
  if (V3.ready) return true;
  if (typeof THREE === 'undefined'){ $('hover3d').textContent = 'Pustaka 3D (three.js) tidak termuat; periksa koneksi internet.'; return false; }
  const host = $('view3d');
  if (!host.clientWidth) return false;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({antialias:true}); }
  catch(e){ $('hover3d').textContent = 'Browser ini tidak mendukung WebGL, tampilan 3D tidak tersedia.'; return false; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.appendChild(renderer.domElement);
  Object.assign(V3, {renderer, scene:new THREE.Scene(), camera:new THREE.PerspectiveCamera(32, 1.6, 1, 6000), host, target:new THREE.Vector3(0,35,0), ready:true, ray:new THREE.Raycaster()});
  const el = renderer.domElement;
  el.style.touchAction = 'none'; el.style.display = 'block'; el.style.cursor = 'grab';
  el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Tampilan 3D muffle, tatakan dan spesimen. Seret untuk memutar, gulir untuk zoom.');
  let drag = null;
  el.addEventListener('pointerdown', (e) => { drag = {x:e.clientX, y:e.clientY, t:V3.theta, p:V3.phi}; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; });
  el.addEventListener('pointermove', (e) => {
    if (drag){ V3.theta = drag.t - (e.clientX-drag.x)*0.008; V3.phi = Math.max(0.12, Math.min(1.52, drag.p - (e.clientY-drag.y)*0.008)); render3D(); }
    else hover3D(e);
  });
  const end = () => { drag = null; el.style.cursor = 'grab'; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => { e.preventDefault(); V3.dist = Math.max(160, Math.min(1600, V3.dist * (e.deltaY > 0 ? 1.1 : 0.9))); render3D(); }, {passive:false});
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { size3D(); render3D(); }).observe(host);
  size3D();
  return true;
}
function size3D(){
  if (!V3.ready) return;
  const w = V3.host.clientWidth; if (!w) return;
  const h = Math.round(Math.max(300, Math.min(560, w*0.58)));
  V3.renderer.setSize(w, h); V3.camera.aspect = w/h; V3.camera.updateProjectionMatrix();
}
function render3D(){
  if (!V3.ready) return;
  const c = V3.camera, t = V3.target;
  c.position.set(t.x + V3.dist*Math.sin(V3.phi)*Math.sin(V3.theta), t.y + V3.dist*Math.cos(V3.phi), t.z + V3.dist*Math.sin(V3.phi)*Math.cos(V3.theta));
  c.lookAt(t);
  V3.renderer.render(V3.scene, c);
}
function setView(name){
  [V3.theta, V3.phi, V3.dist] = {iso:[-0.85,0.95,390], top:[0,0.12,470], side:[-Math.PI/2,1.42,330], front:[0,1.42,300]}[name];
  render3D();
}

// ---------- geometri ----------
function makeFace(cw, ch, w, h, map, getKey){
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({map:tex}));
  mesh.userData = {cv, tex, cw, ch, map, getKey};
  V3.faces.push(mesh);
  return mesh;
}
// balok sel i∈[ia..ib], j∈[0..ny-1], k∈[0..nz-1]; ukuran dalam mm
function makeBlock(getKey, ia, ib, ny, nz, dxmm, dzmm){
  const nxb = ib - ia + 1, sx = nxb*dxmm, sz = ny*dxmm, sy = nz*dzmm, g = new THREE.Group();
  const add = (m, pos, rot) => { m.position.set(...pos); if (rot) m.rotation.set(...rot); g.add(m); };
  add(makeFace(nxb, ny, sx, sz, (px,py)=>[ia+px, py, nz-1], getKey), [0, sy/2, 0], [-Math.PI/2,0,0]);
  add(makeFace(nxb, ny, sx, sz, (px,py)=>[ia+px, ny-1-py, 0], getKey), [0, -sy/2, 0], [Math.PI/2,0,0]);
  add(makeFace(ny, nz, sz, sy, (px,py)=>[ib, ny-1-px, nz-1-py], getKey), [sx/2, 0, 0], [0,Math.PI/2,0]);
  add(makeFace(ny, nz, sz, sy, (px,py)=>[ia, px, nz-1-py], getKey), [-sx/2, 0, 0], [0,-Math.PI/2,0]);
  add(makeFace(nxb, nz, sx, sy, (px,py)=>[ia+px, ny-1, nz-1-py], getKey), [0, 0, sz/2], null);
  add(makeFace(nxb, nz, sx, sy, (px,py)=>[ib-px, 0, nz-1-py], getKey), [0, 0, -sz/2], [0,Math.PI,0]);
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)), new THREE.LineBasicMaterial({color:css('--fg'), transparent:true, opacity:.35})));
  g.userData = {sx, sy, sz};
  return g;
}
function textSprite(text, hMM){
  const fs = 44, pad = 10, cv = document.createElement('canvas'), g = cv.getContext('2d');
  const font = `500 ${fs}px IBM Plex Sans, Segoe UI, sans-serif`;
  g.font = font; cv.width = Math.ceil(g.measureText(text).width) + pad*2; cv.height = fs + pad*2;
  g.font = font; g.fillStyle = css('--fg'); g.textBaseline = 'middle'; g.fillText(text, pad, cv.height/2);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv), transparent:true, depthTest:false}));
  sp.scale.set(hMM*cv.width/cv.height, hMM, 1); sp.renderOrder = 10;
  return sp;
}
function disposeTree(o){ o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material){ if (n.material.map) n.material.map.dispose(); n.material.dispose(); } }); }

function build3D(){
  if (!sim || !init3D()) return false;
  const P = sim.P, mult = +$('v3_mult').value, cut = $('v3_cut').checked, explode = $('v3_explode').checked;
  if (!sim.__v3id) sim.__v3id = (V3.idc = (V3.idc||0) + 1);
  const key = [sim.__v3id, mult, cut, explode].join('|');
  if (V3.builtKey === key) return true;
  V3.builtKey = key;
  const scene = V3.scene;
  while (scene.children.length){ const c = scene.children[0]; scene.remove(c); disposeTree(c); }
  V3.faces = [];
  scene.background = new THREE.Color(css('--surface-2'));
  const mm = 1000, W = P.furnace.W*mm, H = P.furnace.H*mm, D = P.furnace.D*mm;
  const dxmm = sim.dx*mm, dzmm = sim.dz*mm, thmm = sim.th*mm*mult, Lz = P.tray.Lz*mm;
  const onFloor = (P.support.floorH || 0) > 0;
  const pinH = onFloor ? 0 : Math.max(3, Math.min(15, H - Lz - sim.ns*thmm - 30));
  const muf = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)), new THREE.LineBasicMaterial({color:css('--muted')}));
  muf.position.y = H/2; scene.add(muf);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({color:css('--line'), transparent:true, opacity:.55, side:THREE.DoubleSide}));
  floor.rotation.x = -Math.PI/2; scene.add(floor);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({color:css('--line'), transparent:true, opacity:.18, side:THREE.DoubleSide}));
  back.position.set(0, H/2, -D/2); scene.add(back);
  const nxCut = cut ? Math.floor(sim.nx/2) : sim.nx - 1;
  const tray = makeBlock((i,j,k)=>['T', (j*sim.nx+i)*sim.nz+k], 0, nxCut, sim.ny, sim.nz, dxmm, dzmm);
  const trayX0 = -sim.nx*dxmm/2;
  tray.position.set(trayX0 + tray.userData.sx/2, pinH + tray.userData.sy/2, 0); scene.add(tray);
  const lift = explode ? 18 : 0, sIb = cut ? Math.min(sim.nsx-1, nxCut - sim.i0) : sim.nsx - 1;
  if (sIb >= 0){
    const spec = makeBlock((i,j,k)=>['S', (j*sim.nsx+i)*sim.ns+k], 0, sIb, sim.nsy, sim.ns, dxmm, thmm);
    spec.position.set(trayX0 + sim.i0*dxmm + spec.userData.sx/2, pinH + Lz + lift + spec.userData.sy/2, -sim.ny*dxmm/2 + sim.j0*dxmm + spec.userData.sz/2);
    scene.add(spec);
  }
  const steel = new THREE.MeshBasicMaterial({color:css('--atm')});
  if (pinH > 0){
    const ix = sim.nx*dxmm/2 - 10, iz = sim.ny*dxmm/2 - 12;
    for (const [x,z] of [[-ix,-iz],[ix,-iz],[-ix,iz],[ix,iz]]){ const pin = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, pinH, 12), steel); pin.position.set(x, pinH/2, z); scene.add(pin); }
  }
  if (P.support.shaftOn){ const r = P.support.shaftD/2, L = pinH + 45; const sh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 24), steel); sh.position.set(0, pinH - L/2, 0); scene.add(sh); }
  const tc = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12), new THREE.MeshBasicMaterial({color:css('--accent'), depthTest:false}));
  tc.position.set(trayX0 + (sim.tcI+0.5)*dxmm, pinH + Lz - P.tc.depth, -sim.ny*dxmm/2 + (sim.tcJ+0.5)*dxmm); tc.renderOrder = 5; scene.add(tc);
  const lab = (t, x, y, z, h) => { const s = textSprite(t, h || 9); s.position.set(x, y, z); scene.add(s); };
  lab(`muffle ${Math.round(W)} × ${Math.round(H)} × ${Math.round(D)} mm`, 0, H + 12, -D/2);
  lab(`tatakan ${Math.round(P.tray.Lx*mm)} × ${Math.round(P.tray.Ly*mm)} × ${Math.round(Lz)} mm`, 0, pinH - 10, sim.ny*dxmm/2 + 22, 7.5);
  lab(`spesimen ${Math.round(P.spec.Lx*mm)} × ${Math.round(P.spec.Ly*mm)} × ${fmt(P.spec.th*mm,2)} mm${sim.ns>1?' × '+sim.ns+' lbr':''}${mult>1?' (tebal ×'+mult+')':''}`, 0, pinH + Lz + lift + sim.ns*thmm + 14, 0, 7.5);
  if (P.support.shaftOn) lab('poros jack', P.support.shaftD/2 + 22, -20, 0, 7);
  V3.arrows = new THREE.Group(); scene.add(V3.arrows);
  V3.geo = {pinH, lift, thmm, dxmm, trayX0, Lz, W, H, D, cutX: trayX0 + (nxCut+1)*dxmm, cut};
  V3.target.set(0, Math.min(H/2, pinH + 25), 0);
  makeFlow();
  return true;
}

function cellValue(snap, kv){ return kv[0] === 'T' ? snap.T[kv[1]] : snap.S[kv[1]]; }
function paint3D(snap){
  const lo = heatScale.lo, span = (heatScale.hi - heatScale.lo) || 1;
  for (const f of V3.faces){
    const {cv, tex, cw, ch, map, getKey} = f.userData, g = cv.getContext('2d'), img = g.createImageData(cw, ch);
    for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++){
      const [i,j,k] = map(px,py), [r,gg,b] = cmap((cellValue(snap, getKey(i,j,k)) - lo)/span), o = (py*cw + px)*4;
      img.data[o]=r; img.data[o+1]=gg; img.data[o+2]=b; img.data[o+3]=255;
    }
    g.putImageData(img, 0, 0); tex.needsUpdate = true;
  }
}

// ---------- fluks panas per permukaan (W/m², positif = masuk ke benda) ----------
function surfaceFluxes(snap){
  const r = nearestRec(snap.t); if (!r || !r.h) return null;
  const P = sim.P, h = r.h, nx = sim.nx, ny = sim.ny, nz = sim.nz, T = snap.T, S = snap.S;
  let top=0, nTop=0, bot=0, side=0, nSide=0, sp=0;
  for (let c = 0; c < nx*ny; c++){ bot += T[c*nz]; if (sim.specCol[c] < 0){ top += T[c*nz+nz-1]; nTop++; } }
  for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++){ side += T[(j*nx)*nz+k] + T[(j*nx+nx-1)*nz+k]; nSide += 2; }
  for (let c = 0; c < sim.nsx*sim.nsy; c++) sp += S[c*sim.ns + sim.ns - 1];
  top = nTop ? top/nTop : bot/(nx*ny); bot /= nx*ny; side /= nSide; sp /= sim.nsx*sim.nsy;
  const F = P.furnace, Aw = 2*(F.W*F.H + F.W*F.D + F.H*F.D), As = 2*P.tray.Lx*P.tray.Ly + 2*P.tray.Lz*(P.tray.Lx+P.tray.Ly), ratio = Math.min(1, As/Aw);
  const Ft = 1/(1/P.tray.eps + ratio*(1/F.epsWall - 1)), Fs = 1/(1/P.spec.eps + ratio*(1/F.epsWall - 1)), Tw = r.Twall + 273.15;
  const hr = (Ts, Fx) => { const t = Ts + 273.15; return Fx*SIGMA*(Tw*Tw + t*t)*(Tw + t); };
  const q = (hc, Ts, Fx, f) => f*(hc*(r.Tatm - Ts) + hr(Ts, Fx)*(r.Twall - Ts));
  const qc = (hc, Ts, f) => f*hc*(r.Tatm - Ts);
  const fb = P.support.bottomView, As_ = P.spec.Lx*P.spec.Ly, Ab = P.tray.Lx*P.tray.Ly;
  const out = [
    {id:'spec', name:'Atas spesimen', q:q(h.hSpec, sp, Fs, 1), qc:qc(h.hSpec, sp, 1), A:As_, Ts:sp},
    {id:'top', name:'Atas tatakan (terbuka)', q:q(h.hTop, top, Ft, 1), qc:qc(h.hTop, top, 1), A:Ab - As_, Ts:top},
    {id:'side', name:'Sisi tatakan', q:q(h.hSide, side, Ft, 1), qc:qc(h.hSide, side, 1), A:2*(P.tray.Lx+P.tray.Ly)*P.tray.Lz, Ts:side},
    {id:'bot', name:'Bawah tatakan', q:q(h.hBot, bot, Ft, fb), qc:qc(h.hBot, bot, fb), A:Ab, Ts:bot}
  ];
  if ((P.support.floorH||0) > 0) out.push({id:'floor', name:'Kontak lantai', q:P.support.floorH*(r.Twall - bot), qc:0, A:Ab, Ts:bot});
  if (P.support.shaftOn){
    const G = P.support.shaftK * Math.PI*(P.support.shaftD/1000)**2/4 / (P.support.shaftL/1000);
    const Tc = T[((Math.floor(ny/2))*nx + Math.floor(nx/2))*nz];
    out.push({id:'shaft', name:'Poros jack', Q:-G*(Tc - P.support.shaftTamb), Ts:Tc});
  }
  for (const o of out) if (o.Q === undefined) o.Q = o.q*o.A;
  let C = 0; const SS = BAF.MAT.ss310, ST = BAF.MAT.steel, cst = P.props === 'const';
  const Vt = sim.dx*sim.dx*sim.dz, Vs = sim.dx*sim.dx*sim.th;
  for (const v of T) C += SS.rho*(cst ? SS.cpC : SS.cpT(v))*Vt;
  for (const v of S) C += ST.rho*(cst ? ST.cpC : ST.cpT(v))*Vs;
  const Qnet = out.reduce((a,o)=>a+o.Q, 0);
  // referensi skala visual: panas yang dibutuhkan untuk mengikuti ramp program
  const Qref = Math.max(1, C*(P.program.csv ? 2 : P.program.rate)/60);
  return {faces:out, Qnet, rate:Qnet/C*60, Qref, C, r};
}

function fluxTable(fl){
  if (!fl){ $('flux3d').innerHTML = '<p class="note">Fluks belum tersedia pada t = 0.</p>'; return; }
  let html = '<table><caption style="caption-side:top;text-align:left;padding-bottom:6px;font-weight:600">Neraca panas pada waktu terpilih</caption><thead><tr><th>Permukaan</th><th class="num">T °C</th><th class="num">q W/m²</th><th class="num">Q W</th><th class="num">radiasi</th></tr></thead><tbody>';
  for (const o of fl.faces){
    const rad = (o.q !== undefined && Math.abs(o.q) > 1e-6) ? 100*(o.q - o.qc)/o.q : null;
    html += `<tr><td>${o.name}</td><td class="num">${fmt(o.Ts,1)}</td><td class="num">${o.q===undefined?'–':fmt(o.q,0)}</td><td class="num" style="color:${o.Q>=0?'var(--accent)':'var(--steel)'}">${fmt(o.Q,1)}</td><td class="num">${rad==null?'–':fmt(rad,0)+'%'}</td></tr>`;
  }
  html += `<tr><td><b>Bersih</b></td><td></td><td></td><td class="num"><b>${fmt(fl.Qnet,1)}</b></td><td></td></tr></tbody></table>`;
  html += `<p class="note">Neraca ini menaikkan suhu benda <b>${fmt(fl.rate,2)} °C/min</b>. Q positif = panas masuk, negatif = panas keluar.</p>`;
  $('flux3d').innerHTML = html;
}

// ---------- panah ----------
function arrows3D(fl){
  const grp = V3.arrows; while (grp.children.length){ const c = grp.children[0]; grp.remove(c); disposeTree(c); }
  if (!fl || $('v3_vis').value !== 'arrow') return;
  const qmax = Math.max(1, ...fl.faces.filter(f=>f.q!==undefined).map(f=>Math.abs(f.q)));
  const G = V3.geo, P = sim.P, Lx = P.tray.Lx*1000, Ly = P.tray.Ly*1000, cIn = new THREE.Color(css('--accent')), cOut = new THREE.Color(css('--steel'));
  const put = (q, x, y, z, nx, ny, nz) => {
    if (!isFinite(q) || Math.abs(q) < 0.02*qmax) return;
    const len = 8 + 30*Math.abs(q)/qmax, n = new THREE.Vector3(nx, ny, nz);
    const o = new THREE.Vector3(x,y,z).addScaledVector(n, q > 0 ? len + 1.5 : 1.5);
    grp.add(new THREE.ArrowHelper(q > 0 ? n.clone().negate() : n, o, len, q > 0 ? cIn : cOut, Math.min(7, len*0.35), 4));
  };
  const f = Object.fromEntries(fl.faces.map(o=>[o.id,o])), yTop = G.pinH + G.Lz, ySpec = yTop + G.lift + sim.ns*G.thmm;
  const sx0 = G.trayX0 + sim.i0*G.dxmm, sz0 = -Ly/2 + sim.j0*G.dxmm, sLx = sim.nsx*G.dxmm, sLy = sim.nsy*G.dxmm;
  for (const a of [0.25,0.75]) for (const b of [0.2,0.5,0.8]){ const x = sx0 + a*sLx; if (!G.cut || x < G.cutX) put(f.spec.q, x, ySpec, sz0 + b*sLy, 0,1,0); }
  for (const z of [-Ly/2 + 0.12*Ly, Ly/2 - 0.12*Ly]) for (const x of [-Lx/4, Lx/4]) if (!G.cut || x < G.cutX) put(f.top.q, x, yTop, z, 0,1,0);
  for (const z of [-Ly/3, 0, Ly/3]) put(f.side.q, -Lx/2, G.pinH + G.Lz/2, z, -1,0,0);
  put(f.side.q, -Lx/4, G.pinH + G.Lz/2, Ly/2, 0,0,1); put(f.side.q, -Lx/4, G.pinH + G.Lz/2, -Ly/2, 0,0,-1);
  if (P.support.bottomView > 0) for (const x of [-Lx/4, Lx/4]) for (const z of [-Ly/4, Ly/4]) if (!G.cut || x < G.cutX) put(f.bot.q, x, G.pinH, z, 0,-1,0);
  if (f.shaft) grp.add(new THREE.ArrowHelper(new THREE.Vector3(0,-1,0), new THREE.Vector3(P.support.shaftD/2 + 6, G.pinH - 4, 0), 40, cOut, 8, 5));
}

// ---------- aliran partikel ----------
// Partikel luar: bergerak dari ruang muffle menuju permukaan (panas masuk) atau menjauh (panas keluar).
// Partikel dalam: mengalir di dalam tatakan mengikuti −∇T (konduksi dari bagian panas ke dingin).
const FLOW = { nOut:900, nIn:450 };
function makeFlow(){
  const mkPts = (n, depthTest) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n*3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n*3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({size:3.4, sizeAttenuation:false, vertexColors:true, transparent:true, opacity:.95, depthWrite:false, depthTest}));
    pts.renderOrder = depthTest ? 2 : 6;
    V3.scene.add(pts); return pts;
  };
  FLOW.out = mkPts(FLOW.nOut, true);
  FLOW.inn = mkPts(FLOW.nIn, false);
  FLOW.po = Array.from({length:FLOW.nOut}, () => ({e:-1, age:Math.random(), life:1}));
  FLOW.pi = Array.from({length:FLOW.nIn}, () => ({x:0, z:0, age:Math.random()*2, life:2, live:false}));
  FLOW.emitters = []; FLOW.grad = null;
}
function randIn(a, b){ return a + Math.random()*(b-a); }
function setupFlow(fl, snap){
  if (!FLOW.out) return;
  const G = V3.geo, P = sim.P, Lx = P.tray.Lx*1000, Ly = P.tray.Ly*1000, xMax = G.cut ? G.cutX : Lx/2;
  const yTop = G.pinH + G.Lz, ySpec = yTop + G.lift + sim.ns*G.thmm;
  const sx0 = G.trayX0 + sim.i0*G.dxmm, sz0 = -Ly/2 + sim.j0*G.dxmm, sLx = sim.nsx*G.dxmm, sLy = sim.nsy*G.dxmm;
  const em = [];
  if (fl){
    const f = Object.fromEntries(fl.faces.map(o=>[o.id,o]));
    const add = (Q, q, sample) => { if (isFinite(Q) && Math.abs(Q) > 1e-3) em.push({Q, q, sample}); };
    add(f.spec.Q, f.spec.q, () => { const x = randIn(sx0, Math.min(sx0+sLx, xMax)); return [x, ySpec, randIn(sz0, sz0+sLy), 0,1,0]; });
    add(f.top.Q, f.top.q, () => { for (let t=0;t<20;t++){ const x = randIn(-Lx/2, xMax), z = randIn(-Ly/2, Ly/2); if (!(x>sx0 && x<sx0+sLx && z>sz0 && z<sz0+sLy)) return [x, yTop+0.3, z, 0,1,0]; } return [-Lx/2+2, yTop, -Ly/2+2, 0,1,0]; });
    add(f.side.Q, f.side.q, () => { const y = randIn(G.pinH, yTop), s = Math.random()*(Lx + 2*Ly);
      if (s < Ly) return [-Lx/2, y, randIn(-Ly/2, Ly/2), -1,0,0];
      if (s < 2*Ly && !G.cut) return [Lx/2, y, randIn(-Ly/2, Ly/2), 1,0,0];
      const x = randIn(-Lx/2, xMax); return Math.random() < .5 ? [x, y, Ly/2, 0,0,1] : [x, y, -Ly/2, 0,0,-1]; });
    if (P.support.bottomView > 0) add(f.bot.Q, f.bot.q, () => [randIn(-Lx/2, xMax), G.pinH, randIn(-Ly/2, Ly/2), 0,-1,0]);
    if (f.floor) add(f.floor.Q, f.floor.q, () => [randIn(-Lx/2, xMax), G.pinH, randIn(-Ly/2, Ly/2), 0,-1,0]);
    if (f.shaft) add(f.shaft.Q, null, () => { const a = Math.random()*Math.PI*2, r = Math.random()*P.support.shaftD/2; return [r*Math.cos(a), G.pinH, r*Math.sin(a), 0,-1,0]; });
  }
  const qmax = Math.max(1, ...em.filter(e=>e.q!=null).map(e=>Math.abs(e.q)));
  let acc = 0; const tot = em.reduce((a,e)=>a+Math.abs(e.Q),0) || 1;
  // jumlah partikel aktif ∝ |Q| relatif terhadap panas yang dibutuhkan ramp → memudar saat tahan (soaking)
  const active = Math.min(1, tot / (fl ? fl.Qref : 1)) * FLOW.nOut;
  for (const e of em){ e.cum = (acc += Math.abs(e.Q)/tot); e.speed = e.q==null ? 1 : 0.35 + 0.65*Math.abs(e.q)/qmax; e.dist = e.q==null ? 55 : 34; }
  FLOW.emitters = em; FLOW.active = Math.round(active);
  FLOW.cIn = new THREE.Color(css('--accent')); FLOW.cOut = new THREE.Color(css('--steel')); FLOW.cCond = new THREE.Color(css('--tray'));
  // gradien suhu bidang tengah tatakan untuk konduksi
  const nx = sim.nx, ny = sim.ny, nz = sim.nz, km = Math.floor(nz/2), T = snap.T, gx = new Float32Array(nx*ny), gz = new Float32Array(nx*ny);
  let gmax = 0;
  const Tm = (i,j) => T[(j*nx+i)*nz+km];
  for (let j=0;j<ny;j++) for (let i=0;i<nx;i++){
    const ia = Math.max(0,i-1), ib = Math.min(nx-1,i+1), ja = Math.max(0,j-1), jb = Math.min(ny-1,j+1);
    const a = (Tm(ib,j)-Tm(ia,j))/((ib-ia)*G.dxmm), b = (Tm(i,jb)-Tm(i,ja))/((jb-ja)*G.dxmm);
    gx[j*nx+i] = a; gz[j*nx+i] = b; gmax = Math.max(gmax, Math.hypot(a,b));
  }
  FLOW.grad = {gx, gz, gmax, xMin:-Lx/2, xMax, zMin:-Ly/2, zMax:Ly/2, y:G.pinH + G.Lz/2};
  for (const p of FLOW.po) p.e = -1;
}
function respawnOut(p, idx){
  const em = FLOW.emitters;
  if (!em.length || idx >= FLOW.active){ p.e = -1; return; }
  const u = Math.random(); let k = em.findIndex(e => u <= e.cum); if (k < 0) k = em.length - 1;
  const e = em[k], s = e.sample();
  p.e = k; p.s = s; p.age = 0; p.life = (1.6 + Math.random()*0.8) / e.speed;
}
function respawnIn(p){
  const g = FLOW.grad; p.x = randIn(g.xMin, g.xMax); p.z = randIn(g.zMin, g.zMax); p.age = 0; p.life = 1.5 + Math.random()*1.5;
}
function stepFlow(dt){
  if (!FLOW.out) return;
  const show = $('v3_vis').value === 'flow';
  FLOW.out.visible = FLOW.inn.visible = show;
  if (!show) return;
  const pos = FLOW.out.geometry.attributes.position.array, col = FLOW.out.geometry.attributes.color.array;
  FLOW.po.forEach((p, i) => {
    p.age += dt;
    if (p.e < 0 || p.age > p.life){ respawnOut(p, i); if (p.e >= 0 && dt === 0) p.age = Math.random()*p.life; }
    const o = i*3;
    if (p.e < 0){ pos[o]=pos[o+1]=pos[o+2]=1e5; return; }
    const e = FLOW.emitters[p.e], s = p.s, a = Math.min(1, p.age/p.life), inward = e.Q > 0;
    const d = e.dist * (inward ? (1 - a) : a);
    pos[o] = s[0] + s[3]*d; pos[o+1] = s[1] + s[4]*d; pos[o+2] = s[2] + s[5]*d;
    const c = inward ? FLOW.cIn : FLOW.cOut, fade = Math.sin(Math.PI*a);
    col[o] = c.r*fade + (1-fade)*0.5; col[o+1] = c.g*fade + (1-fade)*0.5; col[o+2] = c.b*fade + (1-fade)*0.5;
  });
  FLOW.out.geometry.attributes.position.needsUpdate = true; FLOW.out.geometry.attributes.color.needsUpdate = true;
  // konduksi di dalam tatakan
  const g = FLOW.grad, pi = FLOW.inn.geometry.attributes.position.array, ci = FLOW.inn.geometry.attributes.color.array;
  const live = g && g.gmax > 0.002;           // > 0,002 K/mm → ada aliran berarti
  const nIn = live ? Math.round(FLOW.nIn * Math.min(1, g.gmax/0.05)) : 0;
  FLOW.pi.forEach((p, i) => {
    const o = i*3;
    if (i >= nIn){ pi[o]=pi[o+1]=pi[o+2]=1e5; return; }
    p.age += dt;
    if (!p.live || p.age > p.life){ respawnIn(p); p.live = true; if (dt === 0) p.age = Math.random()*p.life; }
    const ii = Math.min(sim.nx-1, Math.max(0, Math.floor((p.x - V3.geo.trayX0)/V3.geo.dxmm)));
    const jj = Math.min(sim.ny-1, Math.max(0, Math.floor((p.z + sim.ny*V3.geo.dxmm/2)/V3.geo.dxmm)));
    const vx = -g.gx[jj*sim.nx+ii], vz = -g.gz[jj*sim.nx+ii], vm = Math.hypot(vx, vz);
    const sp = 22 * Math.sqrt(vm / g.gmax);   // mm/s
    if (vm > 1e-9){ p.x += vx/vm*sp*dt; p.z += vz/vm*sp*dt; }
    if (p.x < g.xMin || p.x > g.xMax || p.z < g.zMin || p.z > g.zMax || vm/g.gmax < 0.03) respawnIn(p);
    pi[o] = p.x; pi[o+1] = g.y; pi[o+2] = p.z;
    const fade = Math.sin(Math.PI*Math.min(1, p.age/p.life)), c = FLOW.cCond;
    ci[o] = c.r*fade + (1-fade)*0.5; ci[o+1] = c.g*fade + (1-fade)*0.5; ci[o+2] = c.b*fade + (1-fade)*0.5;
  });
  FLOW.inn.geometry.attributes.position.needsUpdate = true; FLOW.inn.geometry.attributes.color.needsUpdate = true;
}
let flowRaf = 0, flowLast = 0;
function flowLoop(){
  const want = V3.ready && FLOW.out && activeTab === 'tab-3d' && $('v3_vis').value === 'flow' && !document.hidden && !reduceMotion.matches;
  if (!want){ if (flowRaf){ cancelAnimationFrame(flowRaf); flowRaf = 0; } return; }
  if (flowRaf) return;
  flowLast = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.05, (now - flowLast)/1000); flowLast = now;
    stepFlow(dt); render3D();
    flowRaf = requestAnimationFrame(tick);
  };
  flowRaf = requestAnimationFrame(tick);
}

function draw3D(){
  if (!sim || !build3D()) return;
  const snap = sim.snaps[snapIdx]; if (!snap) return;
  paint3D(snap);
  const fl = surfaceFluxes(snap);
  arrows3D(fl); fluxTable(fl); setupFlow(fl, snap);
  stepFlow(0);   // posisi awal acak; tetap tampil statis bila animasi dimatikan
  $('flowKey').hidden = $('v3_vis').value !== 'flow';
  render3D(); flowLoop();
}

function hover3D(e){
  if (!sim || !V3.faces.length) return;
  const rect = V3.renderer.domElement.getBoundingClientRect();
  const m = new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2 - 1, -((e.clientY-rect.top)/rect.height)*2 + 1);
  V3.ray.setFromCamera(m, V3.camera);
  const hit = V3.ray.intersectObjects(V3.faces, false)[0];
  if (!hit || !hit.uv){ $('hover3d').textContent = 'Seret untuk memutar, gulir untuk zoom. Arahkan kursor ke benda untuk membaca suhu.'; return; }
  const {cw, ch, map, getKey} = hit.object.userData;
  const [i,j,k] = map(Math.min(cw-1, Math.floor(hit.uv.x*cw)), Math.min(ch-1, Math.floor((1-hit.uv.y)*ch)));
  const kv = getKey(i,j,k), v = cellValue(sim.snaps[snapIdx], kv);
  $('hover3d').textContent = `${kv[0] === 'T' ? `tatakan, sel (${i+1}, ${j+1}), lapisan ${k+1} dari bawah` : `spesimen lembar ${k+1}, sel (${i+1}, ${j+1})`}: ${fmt(v,2)} °C`;
}
