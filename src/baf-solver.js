/*
 * BAF Simulator – solver perpindahan panas transien 3D (Finite Volume / FDM)
 * Domain : tatakan SS310 (3D) + lembaran spesimen baja (2D per lembar, ditumpuk)
 * Skema  : Euler implisit, Gauss–Seidel garis (kolom z diselesaikan dengan Thomas)
 * Batas  : konveksi gas HNx (korelasi konveksi alami + paksa) + radiasi dinding muffle
 *          + kontak termal (celah gas + radiasi celah + kontak padat Mikic) + sink poros jack
 * Satuan : SI, suhu dalam °C (radiasi dihitung dalam K)
 */
(function (root) {
  'use strict';
  const SIG = 5.670374e-8, GRAV = 9.81, TK = 273.15;

  function interp(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    const n = xs.length;
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 1;
    while (xs[i] < x) i++;
    const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
    return ys[i - 1] + f * (ys[i] - ys[i - 1]);
  }

  // ---------- Sifat material ----------
  const MAT = {
    steel: {
      name: 'Baja karbon rendah',
      rho: 7850,
      // cp: EN 1993-1-2 (Eurocode 3) – termasuk kenaikan menuju puncak Curie
      cpT(T) {
        if (T < 600) return 425 + 0.773 * T - 1.69e-3 * T * T + 2.22e-6 * T * T * T;
        if (T < 735) return 666 + 13002 / (738 - T);
        if (T < 900) return 545 + 17820 / (T - 731);
        return 650;
      },
      // k: AISI 1010 (Incropera), °C
      kT(T) { return interp([27, 127, 327, 527, 727], [63.9, 58.7, 48.8, 39.2, 31.3], T); },
      cpC: 551, kC: 40.65 // nilai tengah rentang PDF (502–600 ; 31,3–50)
    },
    ss310: {
      name: 'Stainless steel 310',
      rho: 8000,
      cpT(T) { return T <= 100 ? 500 : 500 + 0.18 * (T - 100); }, // tren austenitik
      kT(T) { return 13.07 + 0.01125 * T; },                      // 14,2 @100°C ; 18,7 @500°C
      cpC: 500, kC: 16.5
    }
  };

  // ---------- Gas HNx ----------
  function gasProps(TKel, xH2) {
    const r = TKel / 300;
    const k = 0.0259 * Math.pow(r, 0.78) * (1 + 1.9 * xH2);
    const Mmix = 28.013 * (1 - xH2) + 2.016 * xH2;
    const nu = 15.63e-6 * Math.pow(r, 1.7) * (28.013 / Mmix);
    const Pr = 0.71;
    return { k, nu, Pr, alpha: nu / Pr };
  }

  // Konveksi alami (Incropera Bab 9). orient: 'up' | 'down' | 'vert'
  function hNatural(Ts, Tg, orient, L, xH2) {
    const Tf = (Ts + Tg) / 2 + TK;
    const g = gasProps(Tf, xH2);
    const dT = Math.abs(Ts - Tg);
    if (dT < 1e-6) return g.k / L;
    const Ra = GRAV * (1 / Tf) * dT * L * L * L / (g.nu * g.alpha);
    let Nu;
    if (orient === 'vert') {
      Nu = 0.68 + 0.67 * Math.pow(Ra, 0.25) / Math.pow(1 + Math.pow(0.492 / g.Pr, 9 / 16), 4 / 9);
    } else {
      const hot = Ts > Tg;
      const unstable = (orient === 'up') === hot;
      Nu = unstable ? (Ra < 1e7 ? 0.54 * Math.pow(Ra, 0.25) : 0.15 * Math.pow(Ra, 1 / 3))
                    : 0.52 * Math.pow(Ra, 0.2);
    }
    return Math.max(Nu, 1) * g.k / L;
  }

  // Konveksi paksa laminar pelat datar dari debit gas
  function hForced(Tg, flowLpm, Across, L, xH2) {
    if (!(flowLpm > 0)) return 0;
    const TKel = Tg + TK;
    const g = gasProps(TKel, xH2);
    const v = (flowLpm / 60000) * (TKel / TK) / Across;
    const Re = v * L / g.nu;
    return 0.664 * Math.sqrt(Re) * Math.pow(g.Pr, 1 / 3) * g.k / L;
  }

  function hComb(hn, hf) { return Math.cbrt(hn * hn * hn + hf * hf * hf); }

  // ---------- Program suhu atmosfer ----------
  function makeProgram(P) {
    const pr = P.program;
    if (pr.csv && pr.csv.t.length > 1) {
      const t = pr.csv.t, T = pr.csv.T;
      return { f: (s) => interp(t, T, s / 60), end: t[t.length - 1] * 60, T0: T[0] };
    }
    const T0 = pr.T0, rate = Math.max(pr.rate, 1e-6), Ts = pr.Tset;
    const t1 = (Ts - T0) / rate;           // menit
    const t2 = t1 + pr.soak;
    const cr = Math.max(pr.coolRate || 1, 1e-6);
    const t3 = pr.coolOn ? t2 + Math.max(0, (Ts - pr.Tend) / cr) : t2;
    const f = (s) => {
      const m = s / 60;
      if (m <= t1) return T0 + rate * m;
      if (m <= t2) return Ts;
      if (pr.coolOn && m <= t3) return Ts - cr * (m - t2);
      return pr.coolOn ? pr.Tend : Ts;
    };
    return { f, end: t3 * 60, T0, t1, t2, t3 };
  }

  // ---------- Konduktansi kontak ----------
  // gas gap + radiasi celah + kontak padat (Mikic, deformasi plastis)
  function hContact(T, P, k1, k2, eps1, eps2) {
    const c = P.contact, xH2 = P.gas.xH2;
    const TKel = T + TK;
    const kg = gasProps(TKel, xH2).k;
    const M = 0.5e-6 * (TKel / 300);                 // parameter loncatan suhu gas
    const hg = kg / (c.gap_um * 1e-6 + M);
    const hr = 4 * SIG * TKel * TKel * TKel / (1 / eps1 + 1 / eps2 - 1);
    let hs = 0;
    const Pc = P.contactPressure;                     // Pa
    if (Pc > 0) {
      const ks = 2 * k1 * k2 / (k1 + k2);
      hs = 1.25 * ks * (c.slope / (c.rough_um * 1e-6)) * Math.pow(Pc / (c.H_GPa * 1e9), 0.95);
    }
    return hg + hr + hs;
  }

  // ---------- Simulator ----------
  class BafSim {
    constructor(P) {
      this.P = P;
      this.setup();
    }

    setup() {
      const P = this.P;
      const dx = P.grid / 1000;
      const nx = Math.max(2, Math.round(P.tray.Lx / dx));
      const ny = Math.max(2, Math.round(P.tray.Ly / dx));
      const nz = Math.max(2, P.tray.nz | 0);
      const dz = P.tray.Lz / nz;
      const nsx = Math.min(nx, Math.max(1, Math.round(P.spec.Lx / dx)));
      const nsy = Math.min(ny, Math.max(1, Math.round(P.spec.Ly / dx)));
      const i0 = Math.floor((nx - nsx) / 2), j0 = Math.floor((ny - nsy) / 2);
      const ns = Math.max(1, P.spec.nSheets | 0);
      Object.assign(this, { dx, nx, ny, nz, dz, nsx, nsy, i0, j0, ns, th: P.spec.th });

      const NT = nx * ny * nz, NS = nsx * nsy * ns;
      this.NT = NT; this.NS = NS;
      this.prog = makeProgram(P);
      const T0 = this.prog.f(0);
      this.T = new Float64Array(NT).fill(T0);
      this.Told = new Float64Array(NT);
      this.S = new Float64Array(NS).fill(T0);
      this.Sold = new Float64Array(NS);
      this.Ct = new Float64Array(NT); this.kt = new Float64Array(NT);
      this.Cs = new Float64Array(NS); this.ks = new Float64Array(NS);
      this.Gx = new Float64Array(NT); this.Gy = new Float64Array(NT); this.Gz = new Float64Array(NT);
      this.gb = new Float64Array(NT); this.qb = new Float64Array(NT);
      this.Gsx = new Float64Array(NS); this.Gsy = new Float64Array(NS); this.Gss = new Float64Array(NS);
      this.Gc = new Float64Array(nsx * nsy);
      this.gbs = new Float64Array(nsx * nsy); this.qbs = new Float64Array(nsx * nsy);
      // map kolom tatakan -> kolom spesimen
      this.specCol = new Int32Array(nx * ny).fill(-1);
      for (let j = 0; j < nsy; j++) for (let i = 0; i < nsx; i++)
        this.specCol[(j + j0) * nx + (i + i0)] = j * nsx + i;

      // sink poros hydraulic jack
      this.shaftW = new Float64Array(nx * ny);
      if (P.support.shaftOn) {
        const r = Math.max(P.support.shaftD / 2000, dx * 0.75);
        const cx = P.tray.Lx / 2, cy = P.tray.Ly / 2;
        let sum = 0;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const x = (i + 0.5) * dx, y = (j + 0.5) * dx;
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { this.shaftW[j * nx + i] = 1; sum++; }
        }
        if (sum > 0) for (let c = 0; c < nx * ny; c++) this.shaftW[c] /= sum;
        const Ash = Math.PI * (P.support.shaftD / 1000) ** 2 / 4;
        this.Gshaft = P.support.shaftK * Ash / (P.support.shaftL / 1000);
      } else this.Gshaft = 0;

      // faktor pertukaran radiasi (benda kecil dalam selubung)
      const F = P.furnace;
      const Aw = 2 * (F.W * F.H + F.W * F.D + F.H * F.D);
      const As = 2 * P.tray.Lx * P.tray.Ly + 2 * P.tray.Lz * (P.tray.Lx + P.tray.Ly);
      const ratio = Math.min(1, As / Aw);
      this.Ftray = 1 / (1 / P.tray.eps + ratio * (1 / F.epsWall - 1));
      this.Fspec = 1 / (1 / P.spec.eps + ratio * (1 / F.epsWall - 1));
      this.Across = Math.max(1e-4, F.W * F.H - P.tray.Lx * P.tray.Lz);
      this.Lh = (P.tray.Lx * P.tray.Ly) / (2 * (P.tray.Lx + P.tray.Ly));

      // Probe termokopel virtual
      const tc = P.tc;
      this.tcI = Math.min(nx - 1, Math.max(0, Math.floor((P.tray.Lx / 2 + tc.x / 1000) / dx)));
      this.tcJ = Math.min(ny - 1, Math.max(0, Math.floor((P.tray.Ly / 2 + tc.y / 1000) / dx)));
      this.tcDepth = Math.min(P.tray.Lz, Math.max(0, tc.depth / 1000));

      this.t = 0;
      this.stepCount = 0; this.iterTotal = 0; this.iterMax = 0;
      this.rec = [];
      this.snaps = [];
      const end = this.prog.end;
      this.recEvery = 60;
      this.snapEvery = Math.max(60, Math.ceil(end / 240 / 60) * 60);
      this.record(); this.snapshot();
    }

    // sifat termal dan konduktansi internal, dievaluasi pada suhu awal langkah
    updateCoefficients(Tatm, Twall) { this.updateProps(); this.updateBoundary(Tatm, Twall); }

    updateProps() {
      const P = this.P, { nx, ny, nz, dx, dz, nsx, nsy, ns, th, i0, j0 } = this;
      const constP = P.props === 'const';
      const SS = MAT.ss310, ST = MAT.steel;
      const T = this.T, S = this.S;
      const Vt = dx * dx * dz, Vs = dx * dx * th;
      for (let n = 0; n < this.NT; n++) {
        const Tn = T[n];
        this.kt[n] = constP ? SS.kC : SS.kT(Tn);
        this.Ct[n] = SS.rho * (constP ? SS.cpC : SS.cpT(Tn)) * Vt;
      }
      for (let n = 0; n < this.NS; n++) {
        const Tn = S[n];
        this.ks[n] = constP ? ST.kC : ST.kT(Tn);
        this.Cs[n] = ST.rho * (constP ? ST.cpC : ST.cpT(Tn)) * Vs;
      }
      const kt = this.kt, ks = this.ks;
      const hm = (a, b) => 2 * a * b / (a + b);
      // konduktansi internal tatakan
      const Ax = dx * dz, Az = dx * dx;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const col = j * nx + i;
        for (let k = 0; k < nz; k++) {
          const n = col * nz + k;
          this.Gx[n] = i < nx - 1 ? hm(kt[n], kt[n + nz]) * Ax / dx : 0;
          this.Gy[n] = j < ny - 1 ? hm(kt[n], kt[n + nx * nz]) * Ax / dx : 0;
          this.Gz[n] = k < nz - 1 ? hm(kt[n], kt[n + 1]) * Az / dz : 0;
        }
      }
      // konduktansi internal spesimen
      const Asx = dx * th;
      for (let j = 0; j < nsy; j++) for (let i = 0; i < nsx; i++) {
        const c = j * nsx + i;
        for (let s = 0; s < ns; s++) {
          const n = c * ns + s;
          this.Gsx[n] = i < nsx - 1 ? hm(ks[n], ks[n + ns]) * Asx / dx : 0;
          this.Gsy[n] = j < nsy - 1 ? hm(ks[n], ks[n + nsx * ns]) * Asx / dx : 0;
          if (s < ns - 1) {
            const Tm = 0.5 * (S[n] + S[n + 1]);
            const hc = hContact(Tm, P, ks[n], ks[n + 1], P.spec.eps, P.spec.eps);
            this.Gss[n] = Az / (th / (2 * ks[n]) + 1 / hc + th / (2 * ks[n + 1]));
          } else this.Gss[n] = 0;
        }
      }

    }

    // koefisien perpindahan panas permukaan & kontak, dievaluasi pada iterasi suhu terkini
    updateBoundary(Tatm, Twall) {
      const P = this.P, { nx, ny, nz, dx, dz, nsx, nsy, ns, th, i0, j0 } = this;
      const T = this.T, S = this.S, kt = this.kt, ks = this.ks;
      const Ax = dx * dz, Az = dx * dx;
      // koefisien konveksi permukaan (dengan suhu rata-rata kelompok permukaan)
      const xH2 = P.gas.xH2;
      let sumTop = 0, nTop = 0, sumBot = 0, sumSide = 0, nSide = 0;
      for (let col = 0; col < nx * ny; col++) {
        sumBot += T[col * nz];
        if (this.specCol[col] < 0) { sumTop += T[col * nz + nz - 1]; nTop++; }
      }
      for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
        sumSide += T[(j * nx) * nz + k] + T[(j * nx + nx - 1) * nz + k]; nSide += 2;
      }
      let sumSpec = 0;
      for (let c = 0; c < nsx * nsy; c++) sumSpec += S[c * ns + ns - 1];
      const Tbot = sumBot / (nx * ny), Ttop = nTop ? sumTop / nTop : Tbot;
      const Tside = sumSide / nSide, Tsp = sumSpec / (nsx * nsy);
      const hf = hForced(Tatm, P.gas.flow, this.Across, P.tray.Ly, xH2);
      let hTop = hComb(hNatural(Ttop, Tatm, 'up', this.Lh, xH2), hf);
      let hBot = hComb(hNatural(Tbot, Tatm, 'down', this.Lh, xH2), hf);
      let hSide = hComb(hNatural(Tside, Tatm, 'vert', P.tray.Lz, xH2), hf);
      let hSpec = hComb(hNatural(Tsp, Tatm, 'up', (P.spec.Lx * P.spec.Ly) / (2 * (P.spec.Lx + P.spec.Ly)), xH2), hf);
      // kait verifikasi (hanya dipakai skrip uji): h konveksi tetap / pengali h / radiasi mati
      const dbg = P.debug || {};
      if (dbg.hConst != null) hTop = hBot = hSide = hSpec = dbg.hConst;
      if (dbg.hScale != null) { hTop *= dbg.hScale; hBot *= dbg.hScale; hSide *= dbg.hScale; hSpec *= dbg.hScale; }
      this.hInfo = { hTop, hBot, hSide, hSpec, hForced: hf };

      const TwK = Twall + TK;
      const radOn = !dbg.noRad;
      const hrad = (Ts, F) => { if (!radOn) return 0; const t = Ts + TK; return F * SIG * (TwK * TwK + t * t) * (TwK + t); };
      const fb = P.support.bottomView;
      const hFloor = P.support.floorH || 0;
      const Tamb = P.support.shaftTamb;
      const gb = this.gb, qb = this.qb;
      gb.fill(0); qb.fill(0);
      // penambah kondisi batas: konduksi setengah sel seri dengan film permukaan
      const addB = (n, A, half, hc, hr, extraG, extraQ) => {
        const hs = hc + hr;
        if (hs > 0) {
          const G = A / (half / kt[n] + 1 / hs);
          const Tenv = (hc * Tatm + hr * Twall) / hs;
          gb[n] += G; qb[n] += G * Tenv;
        }
        if (extraG) { gb[n] += extraG; qb[n] += extraQ; }
      };
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const col = j * nx + i;
        // bawah
        const nB = col * nz;
        let eG = 0, eQ = 0;
        if (hFloor > 0) { const G = Az * hFloor; eG += G; eQ += G * Twall; }
        if (this.Gshaft > 0 && this.shaftW[col] > 0) { const G = this.Gshaft * this.shaftW[col]; eG += G; eQ += G * Tamb; }
        addB(nB, Az, dz / 2, fb * hBot, fb * hrad(T[nB], this.Ftray), eG, eQ);
        // atas (jika tidak tertutup spesimen)
        const nT = col * nz + nz - 1;
        if (this.specCol[col] < 0) addB(nT, Az, dz / 2, hTop, hrad(T[nT], this.Ftray), 0, 0);
        // sisi
        for (let k = 0; k < nz; k++) {
          const n = col * nz + k;
          if (i === 0) addB(n, Ax, dx / 2, hSide, hrad(T[n], this.Ftray), 0, 0);
          if (i === nx - 1) addB(n, Ax, dx / 2, hSide, hrad(T[n], this.Ftray), 0, 0);
          if (j === 0) addB(n, Ax, dx / 2, hSide, hrad(T[n], this.Ftray), 0, 0);
          if (j === ny - 1) addB(n, Ax, dx / 2, hSide, hrad(T[n], this.Ftray), 0, 0);
        }
      }
      // kontak tatakan–spesimen dan permukaan atas spesimen
      let hcSum = 0;
      for (let jj = 0; jj < nsy; jj++) for (let ii = 0; ii < nsx; ii++) {
        const c = jj * nsx + ii;
        const col = (jj + j0) * nx + (ii + i0);
        const nT = col * nz + nz - 1, n0 = c * ns;
        const Tm = 0.5 * (T[nT] + S[n0]);
        const hc = hContact(Tm, P, kt[nT], ks[n0], P.tray.eps, P.spec.eps);
        hcSum += hc;
        this.Gc[c] = Az / (dz / (2 * kt[nT]) + 1 / hc + th / (2 * ks[n0]));
        const nTop = c * ns + ns - 1;
        const hr = hrad(S[nTop], this.Fspec);
        const hs = hSpec + hr;
        const G = Az / (th / (2 * ks[nTop]) + 1 / hs);
        this.gbs[c] = G;
        this.qbs[c] = G * (hSpec * Tatm + hr * Twall) / hs;
      }
      this.hInfo.hContact = hcSum / (nsx * nsy);
      this.hInfo.hRadTray = hrad(Ttop, this.Ftray);
      this.hInfo.hRadSpec = hrad(Tsp, this.Fspec);
    }

    step(dt) {
      const P = this.P, { nx, ny, nz, nsx, nsy, ns, i0, j0 } = this;
      const tNew = this.t + dt;
      const Tatm = this.prog.f(tNew);
      const Twall = Tatm + P.furnace.dTwall;
      this.updateProps();                                  // c_p, k pada suhu awal langkah
      const T = this.T, S = this.S, Told = this.Told, Sold = this.Sold;
      Told.set(T); Sold.set(S);
      // prediktor: ekstrapolasi linear dari langkah sebelumnya
      if (this.Tprev) {
        for (let n = 0; n < this.NT; n++) T[n] = 2 * T[n] - this.Tprev[n];
        for (let n = 0; n < this.NS; n++) S[n] = 2 * S[n] - this.Sprev[n];
      }
      // Iterasi Picard: radiasi (∝T⁴), h konveksi dan kontak dievaluasi ulang pada suhu akhir langkah
      // sehingga kondisi batas implisit penuh (bukan tertinggal satu langkah).
      let it = 0;
      for (let pass = 0; pass < 4; pass++) {
        this.updateBoundary(Tatm, Twall);
        const r = this.solveGS(dt);
        it += r.it;
        if (pass > 0 && r.first < 1e-3) break;
      }
      this.Tprev = this.Tprev || new Float64Array(this.NT);
      this.Sprev = this.Sprev || new Float64Array(this.NS);
      this.Tprev.set(Told); this.Sprev.set(Sold);
      this.t = tNew;
      this.stepCount++; this.iterTotal += it; if (it > this.iterMax) this.iterMax = it;
      this.lastTatm = Tatm; this.lastTwall = Twall;
    }

    // Gauss–Seidel garis (kolom z diselesaikan Thomas) untuk sistem Euler implisit
    solveGS(dt) {
      const P = this.P, { nx, ny, nz, nsx, nsy, ns } = this;
      const T = this.T, S = this.S, Told = this.Told, Sold = this.Sold;
      const { Ct, Cs, Gx, Gy, Gz, gb, qb, Gsx, Gsy, Gss, Gc, gbs, qbs } = this;
      const nmax = nz + ns;
      const a = this.a || (this.a = new Float64Array(nmax));
      const b = this.b || (this.b = new Float64Array(nmax));
      const c = this.c || (this.c = new Float64Array(nmax));
      const d = this.d || (this.d = new Float64Array(nmax));
      const x = this.x || (this.x = new Float64Array(nmax));
      const tol = P.tol || 1e-4;                // K, perubahan maks per sapuan
      const maxIt = 2000;
      const w = P.omega || 1.5;                 // faktor relaksasi berlebih (line-SOR)
      let it = 0, maxChange = 0, first = 0;
      const nzx = nx * nz;
      do {
        maxChange = 0;
        const rev = it & 1;
        for (let jj = 0; jj < ny; jj++) {
          const j = rev ? ny - 1 - jj : jj;
          for (let ii = 0; ii < nx; ii++) {
            const i = rev ? nx - 1 - ii : ii;
            const col = j * nx + i;
            const sc = this.specCol[col];
            const m = sc >= 0 ? nz + ns : nz;
            for (let k = 0; k < nz; k++) {
              const n = col * nz + k;
              let diag = Ct[n] / dt + gb[n];
              let rhs = Ct[n] / dt * Told[n] + qb[n];
              if (i > 0) { const g = Gx[n - nz]; diag += g; rhs += g * T[n - nz]; }
              if (i < nx - 1) { const g = Gx[n]; diag += g; rhs += g * T[n + nz]; }
              if (j > 0) { const g = Gy[n - nzx]; diag += g; rhs += g * T[n - nzx]; }
              if (j < ny - 1) { const g = Gy[n]; diag += g; rhs += g * T[n + nzx]; }
              const gdn = k > 0 ? Gz[n - 1] : 0;
              let gup = k < nz - 1 ? Gz[n] : 0;
              if (k === nz - 1 && sc >= 0) gup = Gc[sc];
              diag += gdn + gup;
              a[k] = -gdn; c[k] = -gup; b[k] = diag; d[k] = rhs;
            }
            if (sc >= 0) {
              const si = sc % nsx, sj = (sc / nsx) | 0;
              for (let s = 0; s < ns; s++) {
                const n = sc * ns + s, r = nz + s;
                let diag = Cs[n] / dt, rhs = Cs[n] / dt * Sold[n];
                if (si > 0) { const g = Gsx[n - ns]; diag += g; rhs += g * S[n - ns]; }
                if (si < nsx - 1) { const g = Gsx[n]; diag += g; rhs += g * S[n + ns]; }
                if (sj > 0) { const g = Gsy[n - nsx * ns]; diag += g; rhs += g * S[n - nsx * ns]; }
                if (sj < nsy - 1) { const g = Gsy[n]; diag += g; rhs += g * S[n + nsx * ns]; }
                const gdn = s === 0 ? Gc[sc] : Gss[n - 1];
                const gup = s < ns - 1 ? Gss[n] : 0;
                if (s === ns - 1) { diag += gbs[sc]; rhs += qbs[sc]; }
                diag += gdn + gup;
                a[r] = -gdn; c[r] = -gup; b[r] = diag; d[r] = rhs;
              }
            }
            // Thomas
            for (let r = 1; r < m; r++) {
              const w = a[r] / b[r - 1];
              b[r] -= w * c[r - 1];
              d[r] -= w * d[r - 1];
            }
            x[m - 1] = d[m - 1] / b[m - 1];
            for (let r = m - 2; r >= 0; r--) x[r] = (d[r] - c[r] * x[r + 1]) / b[r];
            for (let k = 0; k < nz; k++) {
              const n = col * nz + k;
              const xn = T[n] + w * (x[k] - T[n]);
              const ch = Math.abs(xn - T[n]);
              if (ch > maxChange) maxChange = ch;
              T[n] = xn;
            }
            if (sc >= 0) for (let s = 0; s < ns; s++) {
              const n = sc * ns + s;
              const xs = S[n] + w * (x[nz + s] - S[n]);
              const ch = Math.abs(xs - S[n]);
              if (ch > maxChange) maxChange = ch;
              S[n] = xs;
            }
          }
        }
        if (it === 0) first = maxChange;
        it++;
      } while (maxChange > tol && it < maxIt);
      return { it, first };
    }

    // energi keseimbangan: kapasitas panas total
    tcValue() {
      const { nz, nx, dz } = this;
      const col = this.tcJ * nx + this.tcI;
      // kedalaman dari atas -> posisi pusat sel
      const zFromBottom = this.P.tray.Lz - this.tcDepth;
      const kf = zFromBottom / dz - 0.5;
      const k0 = Math.max(0, Math.min(nz - 1, Math.floor(kf)));
      const k1 = Math.min(nz - 1, k0 + 1);
      const f = Math.max(0, Math.min(1, kf - k0));
      return this.T[col * nz + k0] * (1 - f) + this.T[col * nz + k1] * f;
    }

    record() {
      const { nx, ny, nz, nsx, nsy, ns, T, S } = this;
      let tMin = 1e9, tMax = -1e9, tSum = 0;
      for (let n = 0; n < this.NT; n++) { const v = T[n]; tSum += v; if (v < tMin) tMin = v; if (v > tMax) tMax = v; }
      let sMin = 1e9, sMax = -1e9, sSum = 0, bSum = 0, bMin = 1e9;
      for (let c = 0; c < nsx * nsy; c++) {
        const v = S[c * ns + ns - 1];
        sSum += v; if (v < sMin) sMin = v; if (v > sMax) sMax = v;
        const vb = S[c * ns];
        bSum += vb; if (vb < bMin) bMin = vb;
      }
      const cc = (Math.floor(nsy / 2)) * nsx + Math.floor(nsx / 2);
      const Tatm = this.prog.f(this.t);
      this.rec.push({
        t: this.t / 60,
        Tatm,
        Twall: Tatm + this.P.furnace.dTwall,
        trayAvg: tSum / this.NT, trayMin: tMin, trayMax: tMax,
        trayCtr: T[((Math.floor(ny / 2)) * nx + Math.floor(nx / 2)) * nz + nz - 1],
        specAvg: sSum / (nsx * nsy), specMin: sMin, specMax: sMax,
        specCtr: S[cc * ns + ns - 1], specCorner: S[ns - 1],
        specBotAvg: bSum / (nsx * nsy), specBotMin: bMin,
        tc: this.tcValue(),
        h: this.hInfo ? Object.assign({}, this.hInfo) : null
      });
    }

    snapshot() {
      this.snaps.push({ t: this.t / 60, Tatm: this.prog.f(this.t), T: Float32Array.from(this.T), S: Float32Array.from(this.S) });
    }

    // jalankan sampai waktu habis atau batas waktu dinding (ms)
    advance(budgetMs) {
      const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
      const end = this.prog.end;
      const dt = this.P.dt;
      while (this.t < end - 1e-9) {
        const h = Math.min(dt, end - this.t);
        this.step(h);
        const tr = Math.round(this.t * 1000);
        if (tr % (this.recEvery * 1000) < h * 1000 - 1e-6 || this.t >= end - 1e-9) this.record();
        if (tr % (this.snapEvery * 1000) < h * 1000 - 1e-6 || this.t >= end - 1e-9) this.snapshot();
        if (budgetMs && ((typeof performance !== 'undefined' ? performance : Date).now() - t0) > budgetMs) break;
      }
      return this.t >= end - 1e-9;
    }

    progress() { return Math.min(1, this.t / this.prog.end); }

    runAll() { this.advance(0); return this; }
  }

  // ---------- Ringkasan / KPI ----------
  function summarize(sim) {
    const R = sim.rec, P = sim.P;
    const Tset = P.program.csv ? Math.max(...R.map(r => r.Tatm)) : P.program.Tset;
    const firstAt = (pred) => { for (const r of R) if (pred(r)) return r; return null; };
    const r300 = firstAt(r => r.Tatm >= 300);
    let maxLag = 0, maxLagAt = null, maxSpread = 0, maxSpreadAt = null, maxTrayGrad = 0;
    for (const r of R) {
      const lag = r.Tatm - r.specAvg;
      if (lag > maxLag) { maxLag = lag; maxLagAt = r; }
      const sp = r.specMax - r.specMin;
      if (sp > maxSpread) { maxSpread = sp; maxSpreadAt = r; }
      if (r.trayMax - r.trayMin > maxTrayGrad) maxTrayGrad = r.trayMax - r.trayMin;
    }
    const atmReach = firstAt(r => r.Tatm >= Tset - 0.01);
    const sp5 = firstAt(r => r.specMin >= Tset - 5);
    const sp2 = firstAt(r => r.specMin >= Tset - 2);
    let soakEff = 0;
    for (let i = 1; i < R.length; i++) if (R[i].specMin >= Tset - 5 && R[i].specMax <= Tset + 5) soakEff += R[i].t - R[i - 1].t;
    let peak = -1e9; for (const r of R) peak = Math.max(peak, r.specMax);
    const massTray = MAT.ss310.rho * P.tray.Lx * P.tray.Ly * P.tray.Lz;
    const massSpec = MAT.steel.rho * P.spec.Lx * P.spec.Ly * P.spec.th * P.spec.nSheets;
    return {
      Tset, lag300: r300 ? r300.Tatm - r300.specAvg : null, t300: r300 ? r300.t : null,
      maxLag, maxLagAt: maxLagAt ? maxLagAt.t : null, maxLagTatm: maxLagAt ? maxLagAt.Tatm : null,
      maxSpread, maxSpreadAt: maxSpreadAt ? maxSpreadAt.t : null, maxTrayGrad,
      tAtmReach: atmReach ? atmReach.t : null,
      tSpec5: sp5 ? sp5.t : null, tSpec2: sp2 ? sp2.t : null,
      delay5: (sp5 && atmReach) ? sp5.t - atmReach.t : null,
      soakEff, peak, massTray, massSpec,
      steps: sim.stepCount, avgIter: sim.iterTotal / Math.max(1, sim.stepCount), maxIter: sim.iterMax
    };
  }

  function defaults() {
    return {
      grid: 5, dt: 5, tol: 1e-4, omega: 1.5, props: 'T',
      tray: { Lx: 0.10, Ly: 0.20, Lz: 0.01, nz: 5, eps: 0.78 },
      spec: { Lx: 0.08, Ly: 0.10, th: 0.00035, nSheets: 1, eps: 0.78 },
      contact: { gap_um: 50, rough_um: 1.0, slope: 0.1, H_GPa: 2.0, force_tf: 0 },
      furnace: { W: 0.175, H: 0.10, D: 0.30, epsWall: 0.85, dTwall: 0 },
      gas: { flow: 2, xH2: 0.05 },
      support: { bottomView: 0.85, floorH: 0, shaftOn: false, shaftD: 20, shaftL: 100, shaftK: 16, shaftTamb: 30 },
      tc: { x: 0, y: 0, depth: 2 },
      program: { T0: 30, rate: 2, Tset: 610, soak: 120, coolOn: false, coolRate: 1, Tend: 200, csv: null }
    };
  }

  function prepare(P) {
    // tekanan kontak dari gaya hidrolik (ton-force) dibagi luas overlap spesimen
    const A = P.spec.Lx * P.spec.Ly;
    P.contactPressure = (P.contact.force_tf || 0) * 9806.65 / A;
    return P;
  }

  const api = { BafSim, summarize, defaults, prepare, MAT, gasProps, hNatural, hForced, hContact, makeProgram };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BAF = api;
})(typeof window !== 'undefined' ? window : globalThis);
