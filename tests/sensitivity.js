/*
 * Analisis sensitivitas: seberapa besar hasil berubah bila satu parameter tak pasti digeser.
 * Jalankan:  node tests/sensitivity.js
 */
'use strict';
const path = require('path');
const B = require(path.join(__dirname, '..', 'src', 'baf-solver.js'));
function run(label, mod) {
  const P = B.defaults(); P.grid = 10; mod && mod(P); B.prepare(P);
  const t0 = Date.now(), s = new B.BafSim(P).runAll(), S = B.summarize(s);
  return { label, lag300: S.lag300, maxLag: S.maxLag, tSpec5: S.tSpec5, spread: S.maxSpread, ms: Date.now() - t0 };
}
const base = run('Dasar (data PDF)');
const cases = [
  run('ε tatakan & spesimen 0,70', P => { P.tray.eps = 0.70; P.spec.eps = 0.70; }),
  run('ε tatakan & spesimen 0,85', P => { P.tray.eps = 0.85; P.spec.eps = 0.85; }),
  run('ε spesimen 0,40 (baja cerah)', P => { P.spec.eps = 0.40; }),
  run('ε dinding 0,70', P => { P.furnace.epsWall = 0.70; }),
  run('h konveksi ×0,5', P => { P.debug = { hScale: 0.5 }; }),
  run('h konveksi ×2', P => { P.debug = { hScale: 2 }; }),
  run('T dinding = T termokopel + 10 °C', P => { P.furnace.dTwall = 10; }),
  run('T dinding = T termokopel − 10 °C', P => { P.furnace.dTwall = -10; }),
  run('Celah kontak 150 µm', P => { P.contact.gap_um = 150; }),
  run('Celah kontak 10 µm', P => { P.contact.gap_um = 10; }),
  run('Bawah tatakan terbuka 50%', P => { P.support.bottomView = 0.5; }),
  run('Sifat material konstan (PDF)', P => { P.props = 'const'; }),
  run('Poros jack aktif (Ø20, 100 mm)', P => { P.support.shaftOn = true; }),
  run('Spesimen 0,70 mm', P => { P.spec.th = 0.0007; })
];
const f = (v, d = 1) => v == null ? '  tidak' : v.toFixed(d).padStart(6);
console.log('Parameter'.padEnd(36), 'lag300', ' Δ', '  lagMaks', ' tSpec5', ' ΔTspes');
for (const c of [base, ...cases]) {
  const d = c === base ? '' : (c.lag300 - base.lag300 >= 0 ? '+' : '') + (c.lag300 - base.lag300).toFixed(1);
  console.log(c.label.padEnd(36), f(c.lag300), d.padStart(5), f(c.maxLag), f(c.tSpec5, 0), f(c.spread, 2));
}
