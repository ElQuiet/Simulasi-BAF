/*
 * Verifikasi solver BAF terhadap solusi analitik, kekekalan energi, dan konvergensi.
 * Jalankan:  node tests/verify.js
 */
'use strict';
const path = require('path');
const B = require(path.join(__dirname, '..', 'src', 'baf-solver.js'));
const SIG = 5.670374e-8, TK = 273.15;
const results = [];
function report(name, value, ref, tolAbs, unit, note) {
  const err = value - ref, ok = Math.abs(err) <= tolAbs;
  results.push({ name, value, ref, err, tolAbs, unit, ok, note });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${name}: model ${value.toFixed(3)} ${unit} | acuan ${ref.toFixed(3)} ${unit} | selisih ${err.toFixed(3)} (batas ±${tolAbs})${note ? ' — ' + note : ''}`);
}
function base(mod) { const P = B.defaults(); mod && mod(P); return B.prepare(P); }
function runTo(sim, tEnd, dt, cb) { while (sim.t < tEnd - 1e-9) { sim.step(Math.min(dt, tEnd - sim.t)); cb && cb(sim); } return sim; }
function massAvg(sim) {
  // suhu rata-rata berbobot kapasitas panas (tatakan + spesimen)
  let c = 0, cT = 0;
  sim.Ct.forEach((C, n) => { c += C; cT += C * sim.T[n]; });
  sim.Cs.forEach((C, n) => { c += C; cT += C * sim.S[n]; });
  return cT / c;
}
// sifat konstan untuk uji analitik
B.MAT.ss310.kC = 16.5; B.MAT.ss310.cpC = 500; B.MAT.steel.kC = 40.65; B.MAT.steel.cpC = 551;

console.log('\n=== U1. Konveksi murni, benda lumped, program ramp (solusi analitik) ===');
{
  // dT/dt = (hA/C)(Tatm(t) − T), Tatm = T0 + r t  →  T = Tatm − r τ (1 − e^{−t/τ}),  τ = C/(hA)
  const h = 25, rate = 2;
  const P = base(P => { P.props = 'const'; P.debug = { hConst: h, noRad: true }; P.support.bottomView = 1; P.gas.flow = 0;
    P.contact.gap_um = 1; P.program = { T0: 30, rate, Tset: 610, soak: 0, coolOn: false, csv: null }; });
  const s = new B.BafSim(P);
  const C = B.MAT.ss310.rho * B.MAT.ss310.cpC * P.tray.Lx * P.tray.Ly * P.tray.Lz + B.MAT.steel.rho * B.MAT.steel.cpC * P.spec.Lx * P.spec.Ly * P.spec.th;
  const A = 2 * P.tray.Lx * P.tray.Ly + 2 * P.tray.Lz * (P.tray.Lx + P.tray.Ly);
  const tau = C / (h * A), r = rate / 60;
  for (const tmin of [30, 100, 200]) {
    runTo(s, tmin * 60, 5);
    const lagModel = s.prog.f(s.t) - massAvg(s), lagExact = r * tau * (1 - Math.exp(-s.t / tau));
    report(`U1 lag pada menit ${tmin} (τ = ${(tau / 60).toFixed(1)} min)`, lagModel, lagExact, 0.02 * lagExact + 0.05, '°C');
  }
}

console.log('\n=== U2. Radiasi murni, benda lumped, lompatan suhu dinding (solusi analitik implisit) ===');
// Solusi analitik mensyaratkan suhu benda seragam (lumped). Agar syarat itu terpenuhi persis,
// konduktivitas dinaikkan 100×; yang diuji di sini adalah implementasi radiasi σ(Tw⁴ − T⁴).
for (const [dt, label] of [[2, 'Δt 2 s'], [0.25, 'Δt 0,25 s']]) {
  B.MAT.ss310.kC = 1650; B.MAT.steel.kC = 4065;
  // C dT/dt = εσA (Tw⁴ − T⁴)  →  t = C/(4εσA Tw³) [ ln((Tw+T)/(Tw−T)) + 2 atan(T/Tw) ]_{T0}^{T}
  const eps = 0.8, Tw = 630 + TK, T0 = 30 + TK;
  const P = base(P => { P.props = 'const'; P.debug = { hConst: 0 }; P.tray.eps = eps; P.spec.eps = eps; P.furnace.epsWall = 1;
    P.support.bottomView = 1; P.contact.gap_um = 1; P.program = { T0: 30, rate: 6e6, Tset: 630, soak: 120, coolOn: false, csv: null }; });
  const s = new B.BafSim(P);
  const C = B.MAT.ss310.rho * B.MAT.ss310.cpC * P.tray.Lx * P.tray.Ly * P.tray.Lz + B.MAT.steel.rho * B.MAT.steel.cpC * P.spec.Lx * P.spec.Ly * P.spec.th;
  const A = 2 * P.tray.Lx * P.tray.Ly + 2 * P.tray.Lz * (P.tray.Lx + P.tray.Ly);
  const F = (T) => Math.log((Tw + T) / (Tw - T)) + 2 * Math.atan(T / Tw);
  const tOf = (T) => C / (4 * eps * SIG * A * Tw ** 3) * (F(T) - F(T0));
  for (const Tc of [300, 500, 600]) {
    const tExact = tOf(Tc + TK);
    runTo(s, tExact, dt);
    // Euler implisit berorde-1 dalam waktu: galat ∝ Δt (lompatan ~1,5 °C/s di sini; jauh lebih curam daripada ramp nyata)
    report(`U2 ${label}: suhu pada t = ${(tExact / 60).toFixed(1)} min (acuan ${Tc} °C)`, massAvg(s), Tc, dt >= 1 ? 1.0 : 0.25, '°C');
  }
  B.MAT.ss310.kC = 16.5; B.MAT.steel.kC = 40.65;
}

console.log('\n=== U3. Konduksi transien non-lumped: pelat dengan konveksi dua sisi (deret Fourier eksak) ===');
{
  // pelat tebal 2L = 50 mm, sisi lateral sangat lebar; θ/θi = Σ Cn exp(−ζn² Fo) cos(ζn x/L)
  const h = 400, L = 0.025;
  const P = base(P => { P.props = 'const'; P.debug = { hConst: h, noRad: true }; P.grid = 20; P.dt = 1;
    P.tray.Lx = 0.8; P.tray.Ly = 0.8; P.tray.Lz = 2 * L; P.tray.nz = 20;
    P.spec.Lx = 0.02; P.spec.Ly = 0.02; P.spec.th = 1e-6; P.contact.gap_um = 0.01;
    P.furnace.W = 1; P.furnace.D = 1; P.furnace.H = 0.2; P.support.bottomView = 1; P.gas.flow = 0;
    P.program = { T0: 30, rate: 6e6, Tset: 630, soak: 60, coolOn: false, csv: null }; });
  const k = B.MAT.ss310.kC, alpha = k / (B.MAT.ss310.rho * B.MAT.ss310.cpC), Bi = h * L / k;
  const zetas = [];
  for (let n = 0; n < 40; n++) {           // akar ζ tan ζ = Bi pada (nπ, nπ + π/2)
    let lo = n * Math.PI + 1e-12, hi = n * Math.PI + Math.PI / 2 - 1e-12;
    for (let it = 0; it < 200; it++) { const m = (lo + hi) / 2; (m * Math.tan(m) - Bi > 0) ? hi = m : lo = m; }
    zetas.push((lo + hi) / 2);
  }
  const exact = (x, t) => { const Fo = alpha * t / (L * L); let s = 0;
    for (const z of zetas) s += 4 * Math.sin(z) / (2 * z + Math.sin(2 * z)) * Math.exp(-z * z * Fo) * Math.cos(z * x / L);
    return 630 + (30 - 630) * s; };
  const s = new B.BafSim(P);
  const i = Math.floor(s.nx / 4), j = Math.floor(s.ny / 4), col = j * s.nx + i, nz = s.nz, dz = s.dz;
  for (const tsec of [60, 150, 300]) {
    runTo(s, tsec, 1);
    const Tmid = 0.5 * (s.T[col * nz + nz / 2 - 1] + s.T[col * nz + nz / 2]);          // bidang tengah x = 0
    const Tsurf = s.T[col * nz + nz - 1], xSurf = L - dz / 2;                            // pusat sel teratas
    report(`U3 bidang tengah, t = ${tsec} s (Bi = ${Bi.toFixed(2)})`, Tmid, exact(0, tsec), 1.0, '°C');
    report(`U3 dekat permukaan, t = ${tsec} s`, Tsurf, exact(xSurf, tsec), 1.0, '°C');
  }
}

console.log('\n=== U4. Kekekalan energi pada simulasi lengkap (data PDF, semua mekanisme aktif) ===');
{
  const P = base(P => { P.props = 'T'; });
  const s = new B.BafSim(P);
  let Ein = 0, dE = 0, dH = 0, maxRes = 0;
  const steelH = (T) => { let h = 0; for (let x = 20; x < T; x += 1) h += B.MAT.steel.cpT(x + 0.5); return h; };
  const ssH = (T) => { let h = 0; for (let x = 20; x < T; x += 1) h += B.MAT.ss310.cpT(x + 0.5); return h; };
  while (s.t < s.prog.end - 1e-9) {
    const Told = Float64Array.from(s.T), Sold = Float64Array.from(s.S);
    s.step(5);
    let q = 0, st = 0;
    for (let n = 0; n < s.NT; n++) { q += s.qb[n] - s.gb[n] * s.T[n]; st += s.Ct[n] * (s.T[n] - Told[n]); }
    for (let c = 0; c < s.nsx * s.nsy; c++) { const n = c * s.ns + s.ns - 1; q += s.qbs[c] - s.gbs[c] * s.S[n]; }
    for (let n = 0; n < s.NS; n++) st += s.Cs[n] * (s.S[n] - Sold[n]);
    Ein += q * 5; dE += st; maxRes = Math.max(maxRes, Math.abs(q * 5 - st));
  }
  // entalpi sebenarnya (∫cp dT) dibanding Σ C·ΔT dengan cp tertinggal satu langkah
  const V = s.dx * s.dx * s.dz, Vs = s.dx * s.dx * s.th;
  let Htrue = 0;
  for (let n = 0; n < s.NT; n++) Htrue += B.MAT.ss310.rho * V * (ssH(s.T[n]) - ssH(30));
  for (let n = 0; n < s.NS; n++) Htrue += B.MAT.steel.rho * Vs * (steelH(s.S[n]) - steelH(30));
  report('U4 energi masuk lewat batas vs perubahan energi tersimpan (kJ)', Ein / 1000, dE / 1000, 0.001 * Math.abs(dE) / 1000, 'kJ', `residu per langkah maks ${maxRes.toFixed(4)} J`);
  report('U4 energi tersimpan diskret vs entalpi ∫cp dT (kJ)', dE / 1000, Htrue / 1000, 0.005 * Htrue / 1000, 'kJ', 'galat cp tertinggal satu langkah');
}

console.log('\n=== U5. Konvergensi grid dan langkah waktu (data PDF) ===');
{
  const lag = (mod) => B.summarize(new B.BafSim(base(mod)).runAll());
  const a = lag(P => { P.grid = 5; P.dt = 5; }), b = lag(P => { P.grid = 5; P.dt = 1; }), c = lag(P => { P.grid = 10; P.dt = 5; }), d = lag(P => { P.grid = 5; P.dt = 5; P.tray.nz = 10; });
  report('U5 lag @300 °C: Δt 5 s vs 1 s', a.lag300, b.lag300, 0.1, '°C');
  report('U5 lag @300 °C: sel 5 mm vs 10 mm', a.lag300, c.lag300, 0.1, '°C');
  report('U5 lag @300 °C: 5 vs 10 lapisan tebal', a.lag300, d.lag300, 0.1, '°C');
  report('U5 ΔT spesimen maks: sel 5 vs 10 mm', a.maxSpread, c.maxSpread, 0.2, '°C');
}

console.log('\n=== U6. Sifat material & gas vs tabel referensi ===');
{
  const g = (T) => B.gasProps(T, 0);
  // Incropera Tabel A.4, nitrogen 1 atm
  for (const [T, k, nu] of [[300, 0.0259, 15.63e-6], [400, 0.0327, 25.74e-6], [600, 0.0446, 52.15e-6], [800, 0.0548, 84.12e-6], [1000, 0.0646, 121.9e-6]]) {
    report(`U6 k N₂ ${T} K (W/m·K)`, g(T).k, k, 0.03 * k, '');
    report(`U6 ν N₂ ${T} K (×1e-6 m²/s)`, g(T).nu * 1e6, nu * 1e6, 0.04 * nu * 1e6, '');
  }
  // EN 1993-1-2 cp baja karbon
  for (const [T, cp] of [[20, 439.8], [300, 564.7], [600, 760.2], [700, 1008.2]]) report(`U6 cp baja ${T} °C (J/kg·K)`, B.MAT.steel.cpT(T), cp, 0.5, '');
  // SS310S datasheet: k 14,2 @100 °C, 18,7 @500 °C
  report('U6 k SS310 100 °C', B.MAT.ss310.kT(100), 14.2, 0.05, 'W/m·K');
  report('U6 k SS310 500 °C', B.MAT.ss310.kT(500), 18.7, 0.05, 'W/m·K');
}

const fail = results.filter(r => !r.ok);
console.log(`\nRingkasan: ${results.length - fail.length}/${results.length} uji lulus.`);
if (process.argv.includes('--json')) require('fs').writeFileSync(path.join(__dirname, 'verify-results.json'), JSON.stringify(results, null, 1));
process.exit(fail.length ? 1 : 0);
