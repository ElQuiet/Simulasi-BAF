// =====================================================================
// Simulator Termal BAF – antarmuka
// =====================================================================
const $ = (id) => document.getElementById(id);
const fmt = (v, d=1) => (v==null || !isFinite(v)) ? '–' : Number(v).toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d});
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const store = {
  get(k){ try { return JSON.parse(localStorage.getItem('baf.'+k)); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem('baf.'+k, JSON.stringify(v)); } catch(e){} }
};

// ---------- Skema parameter ----------
// pdf: nilai dari dokumen; tag: pdf|asm|lit|need; tagText: teks label; pnote: catatan sumber (mode PDF saja); hint: bantuan (selalu tampil)
const GROUPS = [
  { id:'g_prog', title:'Program suhu tungku', open:true, items:[
    { type:'html', html:`<div class="sub-seg" role="radiogroup" aria-label="Sumber suhu atmosfer">
        <label class="chk"><input type="radio" name="tsrc" value="ramp" checked> Program ramp</label>
        <label class="chk"><input type="radio" name="tsrc" value="csv"> Log CSV controller</label></div>` },
    { id:'prog_T0', label:'Suhu awal', unit:'°C', step:1, pdf:30, tag:'asm', pnote:'suhu ruang', ramp:true },
    { id:'prog_rate', label:'Laju pemanasan', unit:'°C/min', step:0.1, min:0.01, pdf:2, tag:'pdf', ramp:true },
    { id:'prog_Tset', label:'Suhu tahan (soaking)', unit:'°C', step:1, pdf:610, tag:'pdf', ramp:true },
    { id:'prog_soak', label:'Lama tahan', unit:'min', step:5, min:0, pdf:120, tag:'asm', pnote:'isi sesuai resep uji', ramp:true },
    { type:'check', id:'prog_coolOn', label:'Sertakan tahap pendinginan', pdf:false, ramp:true },
    { id:'prog_coolRate', label:'Laju pendinginan', unit:'°C/min', step:0.1, min:0.01, pdf:1, ramp:true, dep:'prog_coolOn' },
    { id:'prog_Tend', label:'Suhu akhir pendinginan', unit:'°C', step:1, pdf:200, ramp:true, dep:'prog_coolOn' },
    { type:'html', csv:true, html:`<div style="display:grid;gap:8px">
        <label for="csvIn" style="font-size:13px">Tempel log: <span style="font-family:var(--f-mono)">menit; T_atm; T_ukur (opsional)</span></label>
        <textarea id="csvIn" placeholder="0;30&#10;10;50;41,2&#10;20;70;58,9…"></textarea>
        <input id="csvFile" type="file" accept=".csv,.txt,text/csv" aria-label="Pilih berkas CSV" style="font-size:12px;max-width:100%">
        <div class="btn-row"><button class="btn sm" id="btnCsv" type="button">Pakai log ini</button><button class="btn sm" id="btnCsvClear" type="button">Kosongkan</button></div>
        <div class="status" id="csvStatus" role="status" aria-live="polite">Pemisah koma, titik koma, atau tab. Koma desimal didukung. Kolom ke-3 dipakai untuk kalibrasi.</div></div>` }
  ], sum:(v)=> v.tsrc==='csv' ? (csvData ? `log CSV, ${csvData.t.length} baris` : 'log CSV belum diisi') : `${fmt(v.prog_T0,0)}→${fmt(v.prog_Tset,0)} °C · ${fmt(v.prog_rate,1)} °C/min · tahan ${fmt(v.prog_soak,0)} min` },

  { id:'g_spec', title:'Spesimen baja', open:true, items:[
    { id:'spec_th', label:'Tebal per lembar', unit:'mm', step:0.05, min:0.05, pdf:0.35, tag:'pdf', pnote:'PDF menguji 0,35 dan 0,70 mm', hintFn:(v)=>`massa ≈ ${fmt(7850*v.spec_Lx*v.spec_Ly*v.spec_th/1e6,0)} g per lembar` },
    { id:'spec_n', label:'Jumlah lembar ditumpuk', unit:'lbr', step:1, min:1, max:20, pdf:1, tag:'asm', hint:'Lebih dari 1 untuk meniru lilitan coil.' },
    { type:'multi', ids:['spec_Lx','spec_Ly'], label:'Lebar × panjang', unit:'mm', step:5, min:5, pdf:[80,100], tag:'pdf' },
    { id:'spec_eps', label:'Emisivitas permukaan', step:0.01, min:0.05, max:1, pdf:0.78, tag:'pdf', pnote:'rentang PDF 0,70–0,85', hint:'Baja cerah dalam atmosfer HNx bisa 0,3–0,5.' }
  ], sum:(v)=>`${fmt(v.spec_th,2)} mm · ${fmt(v.spec_Lx,0)}×${fmt(v.spec_Ly,0)} mm · ${fmt(v.spec_n,0)} lbr` },

  { id:'g_tray', title:'Tatakan SS310', items:[
    { type:'multi', ids:['tray_Lx','tray_Ly'], label:'Lebar × panjang', unit:'mm', step:5, min:10, pdf:[100,200], tag:'pdf' },
    { id:'tray_Lz', label:'Tebal', unit:'mm', step:1, min:2, pdf:10, tag:'pdf', hintFn:(v)=>`massa ≈ ${fmt(8000*v.tray_Lx*v.tray_Ly*v.tray_Lz/1e9,2)} kg` },
    { id:'tray_eps', label:'Emisivitas', step:0.01, min:0.05, max:1, pdf:0.78, tag:'pdf', pnote:'rentang PDF 0,70–0,85 (teroksidasi)' }
  ], sum:(v)=>`${fmt(v.tray_Lx,0)}×${fmt(v.tray_Ly,0)}×${fmt(v.tray_Lz,0)} mm` },

  { id:'g_furn', title:'Tungku & atmosfer', items:[
    { type:'multi', ids:['f_W','f_H','f_D'], label:'Ruang muffle L × T × P', unit:'mm', step:5, min:20, pdf:[175,100,300], tag:'pdf' },
    { id:'f_epsWall', label:'Emisivitas dinding', step:0.01, min:0.05, max:1, pdf:0.85, tag:'asm' },
    { id:'f_dTwall', label:'Selisih T dinding − T termokopel', unit:'°C', step:1, pdf:0, tag:'need', tagText:'DATA #2', hint:'Positif bila dinding lebih panas daripada yang dibaca termokopel.' },
    { id:'g_flow', label:'Debit gas', unit:'L/min', step:0.5, min:0, pdf:2, tag:'need', tagText:'DATA #3' },
    { id:'g_xH2', label:'Kadar H₂ dalam N₂', unit:'%', step:1, min:0, max:100, pdf:5, tag:'pdf' }
  ], sum:(v)=>`${fmt(v.f_W,0)}×${fmt(v.f_H,0)}×${fmt(v.f_D,0)} mm · ${fmt(v.g_flow,1)} L/min` },

  { id:'g_sup', title:'Dudukan tatakan', items:[
    { id:'s_view', label:'Fraksi sisi bawah terbuka', step:0.05, min:0, max:1, pdf:0.85, tag:'need', tagText:'DATA #4', hint:'1 = di atas pin, 0 = tertutup penuh.' },
    { id:'s_floorH', label:'Kontak dengan lantai muffle', unit:'W/m²K', step:10, min:0, pdf:0, tag:'need', tagText:'DATA #4', hint:'0 bila tidak menempel lantai.' },
    { type:'check', id:'s_shaftOn', label:'Poros hydraulic jack menembus dinding', pdf:false },
    { id:'s_shaftD', label:'Diameter poros', unit:'mm', step:1, min:1, pdf:20, tag:'asm', dep:'s_shaftOn' },
    { id:'s_shaftL', label:'Panjang tembus insulasi', unit:'mm', step:5, min:5, pdf:100, tag:'asm', dep:'s_shaftOn' },
    { id:'s_shaftK', label:'Konduktivitas poros', unit:'W/mK', step:1, min:0.1, pdf:16, tag:'asm', dep:'s_shaftOn' }
  ], sum:(v)=>`${v.s_floorH>0?'di lantai':'di atas pin'}${v.s_shaftOn?' · poros aktif':''}` },

  { id:'g_cont', title:'Kontak & tekanan', items:[
    { id:'c_gap', label:'Celah efektif lembar–tatakan', unit:'µm', step:5, min:1, pdf:50, tag:'asm', hint:'Makin rata lembarnya, makin kecil celahnya.' },
    { id:'c_force', label:'Gaya tekan hidrolik', unit:'ton-f', step:0.1, min:0, pdf:0, tag:'need', tagText:'DATA #5', hintFn:(v)=>`tekanan kontak ≈ ${fmt(v.c_force*9806.65/(v.spec_Lx*v.spec_Ly/1e6)/1e6,2)} MPa` },
    { id:'c_rough', label:'Kekasaran gabungan σ', unit:'µm', step:0.1, min:0.05, pdf:1.0, tag:'lit' },
    { id:'c_H', label:'Kekerasan mikro', unit:'GPa', step:0.1, min:0.1, pdf:2.0, tag:'lit' }
  ], sum:(v)=>`celah ${fmt(v.c_gap,0)} µm · ${fmt(v.c_force,1)} ton-f` },

  { id:'g_tc', title:'Termokopel virtual', items:[
    { type:'multi', ids:['tc_x','tc_y'], label:'Posisi x, y dari pusat', unit:'mm', step:5, pdf:[0,0], hint:'x searah lebar tatakan, y searah panjang.' },
    { id:'tc_depth', label:'Kedalaman dari permukaan atas', unit:'mm', step:0.5, min:0, pdf:2, pnote:'saran PDF: tepat di bawah spesimen' }
  ], sum:(v)=>`(${fmt(v.tc_x,0)}, ${fmt(v.tc_y,0)}) mm · ${fmt(v.tc_depth,1)} mm` },

  { id:'g_num', title:'Pengaturan numerik', items:[
    { type:'select', id:'props', label:'Sifat termofisika', options:[['T','Fungsi suhu'],['const','Konstan']], pdf:'T', tag:'lit' },
    { type:'select', id:'grid', label:'Ukuran sel', options:[['5','5 mm (teliti)'],['10','10 mm (cepat)']], pdf:'5' },
    { id:'dt', label:'Langkah waktu', unit:'s', step:1, min:0.5, max:60, pdf:5, hint:'Skema implisit: stabil pada langkah besar.' }
  ], sum:(v)=>`sel ${v.grid} mm · Δt ${fmt(v.dt,0)} s` }
];
const ITEMS = GROUPS.flatMap(g => g.items.filter(i => i.id || i.ids).map(i => Object.assign(i, {group:g.id})));
const FIELD_IDS = ITEMS.flatMap(i => i.ids || [i.id]);
const PDF_VALUES = Object.fromEntries(ITEMS.flatMap(i => i.ids ? i.ids.map((id,k)=>[id, i.pdf[k]]) : [[i.id, i.pdf]]));

function tagHtml(it){
  if (!it.tag) return '';
  const t = it.tagText || {pdf:'PDF', asm:'ASUMSI', lit:'LITERATUR', need:'PERLU DATA'}[it.tag];
  return `<span class="tag ${it.tag} pdf-only" data-tagfor="${it.ids ? it.ids.join(',') : it.id}">${t}</span>`;
}
function numInput(id, it, label){
  const a = [`id="${id}"`, `name="${id}"`, 'type="number"', 'inputmode="decimal"', 'autocomplete="off"', `step="${it.step ?? 'any'}"`];
  if (it.min != null) a.push(`min="${it.min}"`); if (it.max != null) a.push(`max="${it.max}"`);
  if (label) a.push(`aria-label="${label}"`);
  return `<input ${a.join(' ')}>`;
}
function buildParams(){
  const host = $('paramHost');
  host.innerHTML = GROUPS.map(g => {
    const rows = g.items.map(it => {
      const cls = [it.ramp ? 'ramp-only' : '', it.csv ? 'csv-only' : ''].join(' ');
      if (it.type === 'html') return `<div class="${cls}">${it.html}</div>`;
      if (it.type === 'check') return `<label class="chk ${cls}"><input id="${it.id}" name="${it.id}" type="checkbox"> ${it.label}</label>`;
      const notes = (it.pnote ? `<div class="note-line pdf-only" data-pnote="${it.ids ? it.ids[0] : it.id}">${it.pnote}</div>` : '')
        + (it.hint ? `<div class="note-line">${it.hint}</div>` : '')
        + (it.hintFn ? `<div class="note-line" data-hintfn="${it.id}"></div>` : '')
        + `<div class="err" data-err="${it.ids ? it.ids[0] : it.id}" hidden></div>`;
      let ctrl;
      if (it.type === 'select') ctrl = `<select id="${it.id}" name="${it.id}">${it.options.map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('')}</select>`;
      else if (it.ids) ctrl = it.ids.map((id,k) => numInput(id, it, k ? `${it.label} (${k+1})` : null)).join('');
      else ctrl = numInput(it.id, it);
      const unit = it.unit ? `<em>${it.unit}</em>` : '';
      return `<div class="f ${cls}" data-item="${it.ids ? it.ids[0] : it.id}"><label for="${it.ids ? it.ids[0] : it.id}">${it.label}${tagHtml(it)}</label><div class="inp">${ctrl}${unit}</div>${notes}</div>`;
    }).join('');
    return `<details class="grp" id="${g.id}"${g.open ? ' open' : ''}><summary><span>${g.title}</span><span class="sum" data-sum="${g.id}"></span></summary><div class="fields">${rows}</div></details>`;
  }).join('');
}

// ---------- Nilai form ----------
function getValues(){
  const v = {};
  for (const id of FIELD_IDS){
    const el = $(id);
    if (el.type === 'checkbox') v[id] = el.checked;
    else if (el.tagName === 'SELECT') v[id] = el.value;
    else { const x = parseFloat(String(el.value).replace(',','.')); v[id] = isFinite(x) ? x : NaN; }
  }
  v.tsrc = document.querySelector('input[name=tsrc]:checked').value;
  return v;
}
function setValues(vals){
  for (const id of FIELD_IDS){
    if (!(id in vals)) continue;
    const el = $(id);
    if (el.type === 'checkbox') el.checked = !!vals[id]; else el.value = vals[id];
  }
  if (vals.tsrc) document.querySelector(`input[name=tsrc][value=${vals.tsrc}]`).checked = true;
}
const sameVal = (a, b) => (typeof b === 'number') ? Math.abs(Number(a) - b) < 1e-9 : String(a) === String(b);

// ---------- Mode PDF / manual ----------
let mode = 'pdf';
function applyMode(m, {load=true}={}){
  const prev = mode; mode = m;
  document.body.dataset.mode = m;
  $(m === 'pdf' ? 'mode_pdf' : 'mode_manual').checked = true;
  if (load && m === 'pdf' && prev !== 'pdf'){ store.set('manual', getValues()); setValues(PDF_VALUES); }
  if (load && m === 'manual' && prev !== 'manual'){ const mv = store.get('manual'); if (mv) setValues(mv); }
  $('modeNote').innerHTML = m === 'pdf'
    ? 'Nilai dari dokumen spesifikasi BAF simulator. Label menunjukkan asal tiap nilai dan hilang bila nilainya Anda ubah. <button class="linkbtn" id="btnReloadPdf" type="button">Muat ulang nilai PDF</button>'
    : 'Isi semua nilai sesuai alat dan resep Anda. Nilai yang tampil hanya titik awal.';
  if (m === 'pdf') $('btnReloadPdf').onclick = () => { setValues(PDF_VALUES); csvData = null; refreshForm(); doRun(); };
  store.set('mode', m);
  refreshForm();
}
function refreshForm(){
  const v = getValues();
  // label sumber: tampil hanya di mode PDF dan hanya bila nilainya masih sama dengan PDF
  document.querySelectorAll('[data-tagfor]').forEach(t => {
    const ids = t.dataset.tagfor.split(',');
    t.hidden = !(mode === 'pdf' && ids.every(id => sameVal(v[id], PDF_VALUES[id])));
  });
  document.querySelectorAll('[data-pnote]').forEach(n => { n.hidden = !(mode === 'pdf' && sameVal(v[n.dataset.pnote], PDF_VALUES[n.dataset.pnote])); });
  // bantuan dinamis
  for (const it of ITEMS) if (it.hintFn){ const el = document.querySelector(`[data-hintfn="${it.id}"]`); try { el.textContent = it.hintFn(v); } catch(e){ el.textContent = ''; } }
  // kolom yang bergantung pada kotak centang
  for (const it of ITEMS) if (it.dep) $(it.id).disabled = !v[it.dep];
  // ramp vs CSV
  const csvMode = v.tsrc === 'csv';
  document.querySelectorAll('.ramp-only').forEach(e => e.hidden = csvMode);
  document.querySelectorAll('.csv-only').forEach(e => e.hidden = !csvMode);
  // ringkasan grup
  for (const g of GROUPS){ const el = document.querySelector(`[data-sum="${g.id}"]`); try { el.textContent = g.sum(v); } catch(e){ el.textContent = ''; } }
}

// ---------- Validasi ----------
function validate(v){
  const errs = {};
  const need = (id, cond, msg) => { if (!cond && !errs[id]) errs[id] = msg; };
  for (const it of ITEMS){
    if (it.type === 'check' || it.type === 'select') continue;
    if (it.dep && !v[it.dep]) continue;
    if (it.ramp && v.tsrc === 'csv') continue;
    for (const id of (it.ids || [it.id])){
      const x = v[id], key = it.ids ? it.ids[0] : it.id;
      if (!isFinite(x)) { need(key, false, 'Isi dengan angka.'); continue; }
      if (it.min != null && x < it.min) need(key, false, `Minimal ${fmt(it.min, it.min<1?2:0)}${it.unit ? ' '+it.unit : ''}.`);
      if (it.max != null && x > it.max) need(key, false, `Maksimal ${fmt(it.max, it.max<1?2:0)}${it.unit ? ' '+it.unit : ''}.`);
    }
  }
  if (v.tsrc === 'ramp'){
    need('prog_Tset', v.prog_Tset > v.prog_T0, 'Suhu tahan harus lebih tinggi dari suhu awal.');
    need('prog_Tset', v.prog_Tset <= 1100, 'Model ini dibatasi sampai 1100 °C.');
    if (v.prog_coolOn) need('prog_Tend', v.prog_Tend < v.prog_Tset, 'Suhu akhir harus di bawah suhu tahan.');
  }
  need('spec_Lx', v.spec_Lx <= v.tray_Lx && v.spec_Ly <= v.tray_Ly, 'Spesimen harus muat di atas tatakan.');
  need('tray_Lx', v.tray_Lx <= v.f_W && v.tray_Ly <= v.f_D, 'Tatakan harus muat di dalam muffle (lebar ≤ L, panjang ≤ P).');
  need('f_W', v.tray_Lz + v.spec_n*v.spec_th < v.f_H, 'Tinggi muffle terlalu kecil untuk tatakan dan spesimen.');
  need('tc_x', Math.abs(v.tc_x) <= v.tray_Lx/2 && Math.abs(v.tc_y) <= v.tray_Ly/2, 'Posisi termokopel harus di dalam tatakan.');
  need('tc_depth', v.tc_depth <= v.tray_Lz, 'Kedalaman tidak boleh melebihi tebal tatakan.');
  return errs;
}
function showErrors(errs){
  document.querySelectorAll('[data-err]').forEach(e => { e.hidden = true; e.textContent = ''; e.closest('.f').classList.remove('invalid'); });
  const keys = Object.keys(errs).filter(k => errs[k]);
  for (const k of keys){
    const e = document.querySelector(`[data-err="${k}"]`); if (!e) continue;
    e.textContent = errs[k]; e.hidden = false; e.closest('.f').classList.add('invalid');
    e.closest('details').open = true;
  }
  if (keys.length){ const first = $(keys[0]); first && first.focus(); }
  return keys.length;
}

function buildParamsObject(v){
  const P = BAF.defaults();
  P.program = {T0:v.prog_T0, rate:v.prog_rate, Tset:v.prog_Tset, soak:v.prog_soak, coolOn:v.prog_coolOn, coolRate:v.prog_coolRate, Tend:v.prog_Tend, csv:null};
  if (v.tsrc === 'csv' && csvData) P.program.csv = {t:csvData.t, T:csvData.T};
  P.spec = {Lx:v.spec_Lx/1000, Ly:v.spec_Ly/1000, th:v.spec_th/1000, nSheets:Math.round(v.spec_n), eps:v.spec_eps};
  P.tray = {Lx:v.tray_Lx/1000, Ly:v.tray_Ly/1000, Lz:v.tray_Lz/1000, nz:5, eps:v.tray_eps};
  P.contact = {gap_um:v.c_gap, force_tf:v.c_force, rough_um:v.c_rough, slope:0.1, H_GPa:v.c_H};
  P.furnace = {W:v.f_W/1000, H:v.f_H/1000, D:v.f_D/1000, epsWall:v.f_epsWall, dTwall:v.f_dTwall};
  P.gas = {flow:v.g_flow, xH2:v.g_xH2/100};
  P.support = {bottomView:v.s_view, floorH:v.s_floorH, shaftOn:v.s_shaftOn, shaftD:v.s_shaftD, shaftL:v.s_shaftL, shaftK:v.s_shaftK, shaftTamb:30};
  P.tc = {x:v.tc_x, y:v.tc_y, depth:v.tc_depth};
  P.props = v.props; P.grid = parseFloat(v.grid); P.dt = v.dt;
  P.meta = {mode, label:pinLabel(v)};
  return BAF.prepare(P);
}
function pinLabel(v){
  const p = [`${fmt(v.spec_th,2)} mm`, `ε ${fmt(v.spec_eps,2)}`];
  if (v.spec_n > 1) p.push(`${v.spec_n} lbr`);
  if (v.s_shaftOn) p.push('poros aktif');
  if (v.f_dTwall) p.push(`ΔT dinding ${fmt(v.f_dTwall,0)} °C`);
  if (v.tsrc === 'csv') p.push('log CSV');
  else p.push(`${fmt(v.prog_rate,1)} °C/min`);
  return p.join(', ');
}

// ---------- Menjalankan solver (Web Worker, cadangan thread utama) ----------
let csvData = null, sim = null, band = null, pinned = null, running = false;
let chartT = null, chartLag = null, snapIdx = 0, playTimer = null;
const SIM_KEYS = ['nx','ny','nz','dz','dx','nsx','nsy','i0','j0','ns','th','specCol','tcI','tcJ','rec','snaps','P','stepCount','iterTotal','iterMax'];
const WORKER_SRC = `self.onmessage=function(e){try{var s=new BAF.BafSim(e.data.P);while(!s.advance(150)){self.postMessage({type:'prog',p:s.progress()});}
var o={};${JSON.stringify(SIM_KEYS)}.forEach(function(k){o[k]=s[k];});self.postMessage({type:'done',sim:o});}catch(err){self.postMessage({type:'err',msg:String(err&&err.message||err)});}};`;
let workerUrl = null;
function runSim(P, onProg){
  try {
    if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([$('baf-solver').textContent, '\n', WORKER_SRC], {type:'text/javascript'}));
    const w = new Worker(workerUrl);
    return new Promise((resolve, reject) => {
      w.onmessage = (e) => { const m = e.data;
        if (m.type === 'prog') onProg && onProg(m.p);
        else if (m.type === 'done'){ w.terminate(); onProg && onProg(1); resolve(m.sim); }
        else { w.terminate(); reject(new Error(m.msg)); } };
      w.onerror = (err) => { w.terminate(); err.preventDefault && err.preventDefault(); runSimMain(P, onProg).then(resolve, reject); };
      w.postMessage({P});
    });
  } catch(e){ return runSimMain(P, onProg); }
}
function runSimMain(P, onProg){
  return new Promise((resolve, reject) => {
    let s; try { s = new BAF.BafSim(P); } catch(e){ reject(e); return; }
    const tick = () => { try { const done = s.advance(40); onProg && onProg(s.progress()); if (done) resolve(s); else setTimeout(tick, 0); } catch(e){ reject(e); } };
    tick();
  });
}
function setStatus(t, cls){ const s = $('status'); s.textContent = t; s.className = 'status' + (cls ? ' '+cls : ''); }
function setStale(on){
  $('btnRun').classList.toggle('stale', on);
  if (on && !running) setStatus('Parameter diubah. Tekan Jalankan simulasi atau Enter untuk memperbarui hasil.', 'stale');
}

async function doRun(){
  if (running) return;
  const v = getValues();
  if (showErrors(validate(v))){ setStatus('Periksa kolom yang ditandai merah.', 'err'); return; }
  if (v.tsrc === 'csv' && !csvData){ $('g_prog').open = true; setStatus('Tempel log CSV lalu tekan "Pakai log ini", atau pilih Program ramp.', 'err'); return; }
  running = true; $('btnRun').disabled = true; band = null; setStale(false);
  $('btnRun').textContent = 'Menghitung…';
  const t0 = performance.now();
  try {
    const P = buildParamsObject(v);
    setStatus('Menghitung…');
    sim = await runSim(P, p => { $('prog').style.width = (p*100).toFixed(1)+'%'; });
    setStatus(`Selesai dalam ${((performance.now()-t0)/1000).toFixed(1)} s · ${sim.stepCount} langkah waktu · ${sim.nx}×${sim.ny}×${sim.nz} sel tatakan`);
    store.set(mode === 'manual' ? 'manual' : 'pdfEdits', v);
    render();
  } catch(e){ console.error(e); setStatus('Simulasi gagal: '+e.message, 'err'); }
  running = false; $('btnRun').disabled = false; $('btnRun').textContent = 'Jalankan simulasi';
}

async function doBand(){
  if (running || !sim) return;
  running = true; $('btnBand').disabled = true;
  try {
    const v = getValues();
    const mk = (lo) => { const P = buildParamsObject(v); P.grid = 10; P.dt = Math.max(P.dt, 10);
      if (lo){ P.tray.eps = 0.70; P.spec.eps = 0.70; P.contact.gap_um = 150; } else { P.tray.eps = 0.85; P.spec.eps = 0.85; P.contact.gap_um = 20; }
      return BAF.prepare(P); };
    setStatus('Kasus batas bawah (ε 0,70; celah 150 µm)…');
    const lo = await runSim(mk(true), p => $('prog').style.width=(p*50).toFixed(1)+'%');
    setStatus('Kasus batas atas (ε 0,85; celah 20 µm)…');
    const hi = await runSim(mk(false), p => $('prog').style.width=(50+p*50).toFixed(1)+'%');
    band = {lo, hi};
    const sl = BAF.summarize(lo), sh = BAF.summarize(hi);
    setStatus(`Pita ketidakpastian: lag pada 300 °C antara ${fmt(sh.lag300)} dan ${fmt(sl.lag300)} °C.`);
    renderCharts();
  } catch(e){ console.error(e); setStatus('Gagal: '+e.message, 'err'); }
  running = false; $('btnBand').disabled = false;
}

// ---------- Render hasil ----------
function nearestRec(t){ let b=null,bd=1e9; for (const r of sim.rec){ const d=Math.abs(r.t-t); if (d<bd){bd=d;b=r;} } return b; }
function render(){
  if (!sim) return;
  const S = BAF.summarize(sim);
  renderVerdict(S); renderKpis(S); renderCharts();
  const sl = $('snapSlider'); sl.max = sim.snaps.length - 1;
  let best = 0, bl = -1;
  sim.snaps.forEach((s,i) => { const r = nearestRec(s.t); const l = r ? r.Tatm - r.specAvg : 0; if (l > bl){ bl = l; best = i; } });
  snapIdx = best; sl.value = best;
  V3.builtKey = null;
  updateSnapViews(); renderCsvOut(); renderCalib();
}
function renderVerdict(S){
  const P = sim.P, th = fmt(P.spec.th*1000, 2);
  const prog = P.program.csv ? 'log suhu yang dimasukkan' : `program ${fmt(P.program.T0,0)}→${fmt(S.Tset,0)} °C pada ${fmt(P.program.rate,1)} °C/min`;
  const reach = S.tSpec5 != null
    ? `mencapai ${fmt(S.Tset-5,0)} °C pada <b>menit ${fmt(S.tSpec5,0)}</b>${S.delay5!=null?` (${fmt(S.delay5,0)} min setelah atmosfer)`:''}`
    : `<b>tidak mencapai ${fmt(S.Tset-5,0)} °C</b> selama simulasi (suhu akhir rata-rata ${fmt(sim.rec[sim.rec.length-1].specAvg,1)} °C)`;
  const uni = S.maxSpread > 10 ? `<b>tidak seragam</b> (ΔT maks ${fmt(S.maxSpread,1)} °C)` : S.maxSpread > 5 ? `<b>agak tidak seragam</b> (ΔT maks ${fmt(S.maxSpread,1)} °C)` : `<b>seragam</b> (ΔT maks ${fmt(S.maxSpread,1)} °C)`;
  const lag = S.lag300 != null ? `tertinggal <b>${fmt(S.lag300)} °C</b> dari atmosfer saat T<sub>atm</sub> 300 °C, ` : '';
  $('verdict').innerHTML = `Dengan ${prog}, spesimen ${th} mm ${lag}${reach}, dan permukaannya ${uni}.`;
}
function renderKpis(S){
  const k = [];
  k.push(`<div class="kpi hl"><span class="k">Thermal lag saat T<sub>atm</sub> = 300 °C</span><span class="v">${fmt(S.lag300)}<small>°C</small></span><span class="n">${mode==='pdf' ? '<span class="pdf-only">estimasi PDF ≈ 23,0 °C</span>' : 'T<sub>atm</sub> − T<sub>spesimen</sub>'}</span></div>`);
  k.push(`<div class="kpi"><span class="k">Lag maksimum</span><span class="v">${fmt(S.maxLag)}<small>°C</small></span><span class="n">menit ${fmt(S.maxLagAt,0)}, T<sub>atm</sub> ${fmt(S.maxLagTatm,0)} °C</span></div>`);
  k.push(`<div class="kpi"><span class="k">Spesimen ≥ T<sub>tahan</sub> − 5 °C</span><span class="v">${fmt(S.tSpec5,0)}<small>min</small></span><span class="n">${S.delay5==null?'tidak tercapai':fmt(S.delay5,0)+' min setelah atmosfer'}</span></div>`);
  k.push(`<div class="kpi"><span class="k">Waktu tahan efektif ±5 °C</span><span class="v">${fmt(S.soakEff,0)}<small>min</small></span><span class="n">seluruh permukaan spesimen</span></div>`);
  const c = S.maxSpread>10?'crit':S.maxSpread>5?'warn':'ok';
  k.push(`<div class="kpi"><span class="k">ΔT maks di permukaan spesimen</span><span class="v">${fmt(S.maxSpread,2)}<small>°C</small></span><span class="n"><span class="pill ${c}">${c==='ok'?'seragam':c==='warn'?'perlu dicek':'tidak seragam'}</span>menit ${fmt(S.maxSpreadAt,0)}</span></div>`);
  $('kpis').innerHTML = k.join('');
}

// ---------- Grafik ----------
function ds(label, data, color, extra){ return Object.assign({label, data, borderColor:color, backgroundColor:color, borderWidth:2, pointRadius:0, tension:0}, extra||{}); }
const cursorPlugin = { id:'cursor', afterDatasetsDraw(c){ if(!sim||!sim.snaps[snapIdx]) return; const x = c.scales.x.getPixelForValue(sim.snaps[snapIdx].t); const a=c.chartArea; if(x<a.left||x>a.right) return; const g=c.ctx; g.save(); g.strokeStyle=css('--accent'); g.setLineDash([3,3]); g.lineWidth=1; g.beginPath(); g.moveTo(x,a.top); g.lineTo(x,a.bottom); g.stroke(); g.restore(); } };
function baseOpts(yTitle, dec){
  const fg = css('--muted'), grid = css('--line');
  return { animation:false, responsive:true, maintainAspectRatio:false, parsing:false, normalized:true,
    interaction:{mode:'index', intersect:false},
    plugins:{ legend:{labels:{color:fg, boxWidth:14, font:{family:'IBM Plex Sans', size:12}, filter:(i)=>!i.text.startsWith('_')}},
      tooltip:{filter:(it)=>!it.dataset.label.startsWith('_') && it.dataset.data.length>0, callbacks:{title:(it)=>'menit '+fmt(it[0].parsed.x,0), label:(it)=>`${it.dataset.label}: ${fmt(it.parsed.y,dec)} °C`}} },
    scales:{ x:{type:'linear', title:{display:true,text:'Waktu (menit)',color:fg}, ticks:{color:fg}, grid:{color:grid}},
             y:{title:{display:true,text:yTitle,color:fg}, ticks:{color:fg}, grid:{color:grid}} },
    onClick:(ev, el, chart) => { const x = chart.scales.x.getValueForPixel(ev.x); setSnapByTime(x); } };
}
function renderCharts(){
  if (typeof Chart === 'undefined'){ $('chT').replaceWith(Object.assign(document.createElement('p'), {className:'note', textContent:'Pustaka grafik tidak termuat; periksa koneksi internet.'})); return; }
  const R = sim.rec, m = (f) => R.map(r => ({x:r.t, y:f(r)}));
  const cAtm=css('--atm'), cSp=css('--steel'), cTr=css('--tray'), cAcc=css('--accent'), cFg=css('--fg');
  const sets = [
    ds('Atmosfer (termokopel)', m(r=>r.Tatm), cAtm, {borderDash:[6,4]}),
    ds('Tatakan (rata-rata)', m(r=>r.trayAvg), cTr, {borderWidth:1.25}),
    ds('_specMin', m(r=>r.specMin), 'transparent', {borderWidth:0}),
    ds('_specMax', m(r=>r.specMax), 'transparent', {borderWidth:0, fill:'-1', backgroundColor:cSp+'40'}),
    ds(`Spesimen ${fmt(sim.P.spec.th*1000,2)} mm (rata-rata, pita = min–maks)`, m(r=>r.specAvg), cSp, {borderWidth:2.75, order:-1}),
    ds('Termokopel virtual', m(r=>r.tc), cAcc, {borderWidth:1.5, borderDash:[2,3]})
  ];
  if (pinned) sets.push(ds(`Pembanding: ${pinned.label}`, pinned.rec.map(r=>({x:r.t,y:r.specAvg})), cFg, {borderWidth:1.5, borderDash:[8,3,2,3], order:-2}));
  if (band){
    sets.push(ds('_bandLo', band.lo.rec.map(r=>({x:r.t,y:r.specAvg})), cSp, {borderWidth:1, borderDash:[1,3]}));
    sets.push(ds('_bandHi', band.hi.rec.map(r=>({x:r.t,y:r.specAvg})), cSp, {borderWidth:1, borderDash:[1,3], fill:'-1', backgroundColor:cSp+'22'}));
    sets.push(ds('Pita ketidakpastian', [], cSp+'55', {borderWidth:6}));
  }
  if (csvData && sim.P.program.csv && csvData.meas.some(v=>v!=null))
    sets.push({label:'Pengukuran (T_ukur)', data:csvData.t.map((t,i)=>({x:t,y:csvData.meas[i]})).filter(p=>p.y!=null), showLine:false, pointRadius:2.5, borderColor:cFg, backgroundColor:cFg});
  const sp = sim.P.program;
  if (!sp.csv) sets.push(ds('Suhu tahan', [{x:0,y:sp.Tset},{x:R[R.length-1].t,y:sp.Tset}], css('--crit'), {borderWidth:1, borderDash:[2,2]}));
  if (chartT) chartT.destroy();
  chartT = new Chart($('chT'), {type:'line', data:{datasets:sets}, options:baseOpts('Temperatur (°C)', 1), plugins:[cursorPlugin]});
  const lagSets = [
    ds('Lag atmosfer − spesimen', m(r=>r.Tatm-r.specAvg), cAcc),
    ds('ΔT tatakan (maks − min)', m(r=>r.trayMax-r.trayMin), cTr),
    ds('ΔT spesimen (maks − min)', m(r=>r.specMax-r.specMin), cSp)
  ];
  if (pinned) lagSets.push(ds(`Lag pembanding: ${pinned.label}`, pinned.rec.map(r=>({x:r.t,y:r.Tatm-r.specAvg})), cFg, {borderWidth:1.25, borderDash:[8,3,2,3]}));
  if (chartLag) chartLag.destroy();
  chartLag = new Chart($('chLag'), {type:'line', data:{datasets:lagSets}, options:baseOpts('ΔT (°C)', 2), plugins:[cursorPlugin]});
}
function setSnapByTime(t){
  if (!sim) return;
  let b=0, bd=1e9; sim.snaps.forEach((s,i) => { const d=Math.abs(s.t-t); if (d<bd){bd=d;b=i;} });
  snapIdx = b; $('snapSlider').value = b; updateSnapViews();
}
function updateSnapViews(){
  drawHeat(); renderMech();
  chartT && chartT.draw(); chartLag && chartLag.draw();
  const snap = sim.snaps[snapIdx], r = nearestRec(snap.t);
  $('snapRead').textContent = `menit ${fmt(snap.t,0)} · T_atm ${fmt(snap.Tatm,1)} °C · spesimen ${fmt(r?r.specAvg:null,1)} °C`;
  if (activeTab === 'tab-3d') draw3D();
}

// ---------- Peta 2D ----------
const CM = [[0,0,4],[40,11,84],[101,21,110],[159,42,99],[212,72,66],[245,125,21],[250,193,39],[252,255,164]];
function cmap(f){ f=Math.max(0,Math.min(1,f)); const p=f*(CM.length-1), i=Math.min(CM.length-2,Math.floor(p)), u=p-i; const a=CM[i], b=CM[i+1]; return [a[0]+(b[0]-a[0])*u, a[1]+(b[1]-a[1])*u, a[2]+(b[2]-a[2])*u]; }
function drawLegendOn(c){ const g=c.getContext('2d'); for(let x=0;x<c.width;x++){const [r,gg,b]=cmap(x/(c.width-1)); g.fillStyle=`rgb(${r|0},${gg|0},${b|0})`; g.fillRect(x,0,1,c.height);} }
let heatGeom = null, heatScale = {lo:0, hi:1};
function computeScale(snap){
  const rel = document.querySelector('input[name=scale]:checked').value === 'rel';
  let lo=Infinity, hi=-Infinity;
  if (rel){ for (const v of snap.T){ if(v<lo)lo=v; if(v>hi)hi=v; } for (const v of snap.S){ if(v<lo)lo=v; if(v>hi)hi=v; } if (hi-lo<0.05){ const m=(hi+lo)/2; lo=m-0.025; hi=m+0.025; } }
  else { lo = Math.min(...sim.rec.map(r=>Math.min(r.specMin, r.trayMin))); hi = Math.max(...sim.rec.map(r=>Math.max(r.Tatm, r.trayMax))); }
  heatScale = {lo, hi, rel};
  for (const s of ['', '3']){ $('legMin'+s).textContent = fmt(lo,1)+' °C'; $('legMax'+s).textContent = fmt(hi,1)+' °C'; }
  $('legInfo').textContent = rel ? `rentang ${fmt(hi-lo,2)} °C` : '';
}
function drawHeat(){
  const snap = sim.snaps[snapIdx]; if (!snap) return;
  computeScale(snap);
  const {nx,ny,nz,nsx,nsy,ns,i0,j0,dz,th} = sim, T = snap.T, S = snap.S;
  const top = new Float32Array(nx*ny);
  for (let j=0;j<ny;j++) for (let i=0;i<nx;i++){ const col=j*nx+i, sc=sim.specCol[col]; top[col] = sc>=0 ? S[sc*ns+ns-1] : T[col*nz+nz-1]; }
  const {lo, hi} = heatScale, f = (v) => (v-lo)/(hi-lo);
  const cv = $('cvPlan'), g = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 34;
  const cs = Math.min((W-2*pad)/ny, (H-2*pad)/nx), ox = (W - cs*ny)/2, oy = (H - cs*nx)/2;
  g.fillStyle = css('--surface-2'); g.fillRect(0,0,W,H);
  for (let j=0;j<ny;j++) for (let i=0;i<nx;i++){ const [r,gg,b]=cmap(f(top[j*nx+i])); g.fillStyle=`rgb(${r|0},${gg|0},${b|0})`; g.fillRect(ox+j*cs, oy+(nx-1-i)*cs, Math.ceil(cs), Math.ceil(cs)); }
  g.strokeStyle = css('--fg'); g.lineWidth = 1.5; g.setLineDash([5,4]); g.strokeRect(ox+j0*cs, oy+(nx-i0-nsx)*cs, nsy*cs, nsx*cs); g.setLineDash([]);
  g.strokeStyle = css('--muted'); g.lineWidth = 1; g.strokeRect(ox,oy,ny*cs,nx*cs);
  g.strokeStyle = css('--accent'); g.lineWidth = 2; g.beginPath(); g.arc(ox+(sim.tcJ+0.5)*cs, oy+(nx-1-sim.tcI+0.5)*cs, 5, 0, Math.PI*2); g.stroke();
  g.fillStyle = css('--muted'); g.font = '22px IBM Plex Mono, monospace';
  g.fillText(`${Math.round(sim.P.tray.Ly*1000)} mm`, ox+ny*cs/2-40, H-6);
  g.save(); g.translate(ox-10, oy+nx*cs/2+40); g.rotate(-Math.PI/2); g.fillText(`${Math.round(sim.P.tray.Lx*1000)} mm`,0,0); g.restore();
  g.fillStyle = css('--fg'); g.fillText('spesimen', ox+j0*cs+4, oy+(nx-i0-nsx)*cs-6);
  const ic = Math.floor(nx/2), cv2 = $('cvSec'), g2 = cv2.getContext('2d'), W2 = cv2.width, H2 = cv2.height;
  g2.fillStyle = css('--surface-2'); g2.fillRect(0,0,W2,H2);
  const layH = 22, sheetH = Math.max(8, 22*Math.min(1, th/dz*4)), totH = nz*layH + ns*sheetH;
  const oy2 = (H2 - totH)/2 + ns*sheetH, ox2 = ox;
  for (let j=0;j<ny;j++){
    for (let k=0;k<nz;k++){ const [r,gg,b]=cmap(f(T[(j*nx+ic)*nz+k])); g2.fillStyle=`rgb(${r|0},${gg|0},${b|0})`; g2.fillRect(ox2+j*cs, oy2+(nz-1-k)*layH, Math.ceil(cs), layH); }
    const sc = sim.specCol[j*nx+ic];
    if (sc>=0) for (let s=0;s<ns;s++){ const [r,gg,b]=cmap(f(S[sc*ns+s])); g2.fillStyle=`rgb(${r|0},${gg|0},${b|0})`; g2.fillRect(ox2+j*cs, oy2-(s+1)*sheetH+1, Math.ceil(cs), sheetH-1); }
  }
  g2.strokeStyle = css('--muted'); g2.strokeRect(ox2, oy2, ny*cs, nz*layH);
  g2.fillStyle = css('--muted'); g2.font = '22px IBM Plex Mono, monospace';
  g2.fillText(`tatakan ${fmt(sim.P.tray.Lz*1000,0)} mm`, ox2+4, oy2+nz*layH+26);
  g2.fillText(`${ns} lembar × ${fmt(th*1000,2)} mm`, ox2+j0*cs, oy2-ns*sheetH-6);
  heatGeom = {ox,oy,cs,ox2,oy2,layH,sheetH,ic,top};
}
function hoverPlan(ev){
  if (!sim || !heatGeom) return;
  const c = $('cvPlan'), rect = c.getBoundingClientRect();
  const x = (ev.clientX-rect.left)*c.width/rect.width, y = (ev.clientY-rect.top)*c.height/rect.height;
  const j = Math.floor((x-heatGeom.ox)/heatGeom.cs), i = sim.nx-1-Math.floor((y-heatGeom.oy)/heatGeom.cs);
  if (j<0||j>=sim.ny||i<0||i>=sim.nx){ $('hoverInfo').textContent=''; return; }
  const snap = sim.snaps[snapIdx], col=j*sim.nx+i, sc=sim.specCol[col];
  $('hoverInfo').textContent = `x ${fmt((i+0.5)*sim.dx*1000-sim.P.tray.Lx*500,1)} mm, y ${fmt((j+0.5)*sim.dx*1000-sim.P.tray.Ly*500,1)} mm · ${sc>=0?'spesimen':'tatakan atas'} ${fmt(heatGeom.top[col],2)} °C · tatakan bawah ${fmt(snap.T[col*sim.nz],2)} °C`;
}
function hoverSec(ev){
  if (!sim || !heatGeom) return;
  const c = $('cvSec'), rect = c.getBoundingClientRect();
  const x = (ev.clientX-rect.left)*c.width/rect.width, y = (ev.clientY-rect.top)*c.height/rect.height;
  const j = Math.floor((x-heatGeom.ox2)/heatGeom.cs); if (j<0||j>=sim.ny) return;
  const snap = sim.snaps[snapIdx], col = j*sim.nx+heatGeom.ic;
  let txt;
  if (y >= heatGeom.oy2){ const k = sim.nz-1-Math.floor((y-heatGeom.oy2)/heatGeom.layH); if(k<0||k>=sim.nz) return; txt = `tatakan, kedalaman ${fmt((sim.nz-1-k+0.5)*sim.dz*1000,1)} mm: ${fmt(snap.T[col*sim.nz+k],2)} °C`; }
  else { const sc=sim.specCol[col], s=Math.floor((heatGeom.oy2-y)/heatGeom.sheetH); if(sc<0||s>=sim.ns) return; txt = `lembar ke-${s+1} dari bawah: ${fmt(snap.S[sc*sim.ns+s],2)} °C`; }
  $('hoverInfo').textContent = `y ${fmt((j+0.5)*sim.dx*1000-sim.P.tray.Ly*500,1)} mm · ${txt}`;
}

// ---------- Mekanisme ----------
function renderMech(){
  const snap = sim.snaps[snapIdx], r = nearestRec(snap.t), h = r && r.h;
  $('mechT').textContent = `menit ${fmt(snap.t,0)} · T_atm ${fmt(snap.Tatm,0)} °C`;
  if (!h){ $('mechTbl').innerHTML = '<tr><td>Belum ada data pada t = 0.</td></tr>'; return; }
  const fb = sim.P.support.bottomView;
  const rows = [['Atas tatakan', h.hTop, h.hRadTray], ['Bawah tatakan', h.hBot*fb, h.hRadTray*fb], ['Sisi tatakan', h.hSide, h.hRadTray], ['Atas spesimen', h.hSpec, h.hRadSpec]];
  const cC=css('--steel'), cR=css('--accent');
  let html = '<thead><tr><th>Permukaan</th><th class="num">h konveksi</th><th class="num">h radiasi</th><th>Porsi</th></tr></thead><tbody>';
  for (const [n,c,rd] of rows){ const t=(c+rd)||1; html += `<tr><td>${n}</td><td class="num">${fmt(c,1)}</td><td class="num">${fmt(rd,1)}</td><td><div class="mech-bar" title="konveksi ${fmt(100*c/t,0)}%, radiasi ${fmt(100*rd/t,0)}%"><i style="width:${100*c/t}%;background:${cC}"></i><i style="width:${100*rd/t}%;background:${cR}"></i></div></td></tr>`; }
  html += `<tr><td>Kontak spesimen–tatakan</td><td class="num" colspan="2">${fmt(h.hContact,0)}</td><td class="note">≈${fmt(h.hContact/(h.hSpec+h.hRadSpec),0)}× film atas</td></tr>`;
  html += `<tr><td>Konveksi paksa dari debit gas</td><td class="num" colspan="2">${fmt(h.hForced,2)}</td><td></td></tr></tbody>`;
  html += `<caption style="caption-side:bottom;text-align:left;padding-top:6px" class="note">Satuan W/m²K. Biru = konveksi, oranye = radiasi.</caption>`;
  $('mechTbl').innerHTML = html;
}

// ---------- CSV ----------
function parseCsv(txt){
  const t=[], T=[], meas=[];
  for (let line of txt.split(/\r?\n/)){
    line = line.trim(); if (!line) continue;
    let parts = line.includes(';') ? line.split(';') : line.includes('\t') ? line.split('\t') : line.split(',');
    if (parts.length === 1) parts = line.split(/\s+/);
    const vals = parts.map(p => parseFloat(p.trim().replace(',','.')));
    if (!isFinite(vals[0]) || !isFinite(vals[1])) continue;
    t.push(vals[0]); T.push(vals[1]); meas.push(isFinite(vals[2]) ? vals[2] : null);
  }
  if (t.length < 2) throw new Error('perlu minimal 2 baris berisi angka');
  for (let i=1;i<t.length;i++) if (t[i] <= t[i-1]) throw new Error(`waktu tidak naik pada baris data ke-${i+1}`);
  return {t, T, meas};
}
function csvText(){
  const lines = ['menit;T_atm;T_tatakan_rata;T_tatakan_min;T_tatakan_maks;T_spesimen_rata;T_spesimen_min;T_spesimen_maks;T_spesimen_pusat;T_spesimen_sudut;T_termokopel_virtual'];
  for (const r of sim.rec) lines.push([r.t,r.Tatm,r.trayAvg,r.trayMin,r.trayMax,r.specAvg,r.specMin,r.specMax,r.specCtr,r.specCorner,r.tc].map((v,i)=>i===0?v.toFixed(0):v.toFixed(2)).join(';'));
  return lines.join('\n');
}
function renderCsvOut(){ $('csvOut').value = csvText(); }
function renderCalib(){
  const panel = $('calibPanel');
  if (!csvData || !sim.P.program.csv || !csvData.meas.some(v=>v!=null)){ panel.hidden = true; return; }
  panel.hidden = false;
  const R = sim.rec; let se=0, n=0, maxE=0;
  const tcAt = (t) => { let i=1; while (i<R.length-1 && R[i].t<t) i++; const a=R[i-1], b=R[i]; const u=(t-a.t)/((b.t-a.t)||1); return a.tc+(b.tc-a.tc)*Math.max(0,Math.min(1,u)); };
  csvData.t.forEach((t,i) => { const m=csvData.meas[i]; if (m==null) return; const e=tcAt(t)-m; se+=e*e; n++; if (Math.abs(e)>Math.abs(maxE)) maxE=e; });
  const ms = csvData.meas.filter(v=>v!=null), rmse = Math.sqrt(se/n), acc = 100*(1-rmse/Math.max(1, Math.max(...ms)-Math.min(...ms)));
  const cls = acc>=98?'ok':acc>=95?'warn':'crit';
  $('calibOut').innerHTML = `<p style="margin:0 0 6px"><span class="pill ${cls}">${acc>=98?'target >98% tercapai':'di bawah target 98%'}</span> ${n} titik ukur · RMSE <b>${fmt(rmse,2)} °C</b> · galat maks ${fmt(maxE,2)} °C · akurasi ${fmt(acc,1)}%</p><p class="note" style="margin:0">Akurasi = 1 − RMSE/rentang suhu ukur. Bila model selalu lebih panas dari pengukuran, turunkan emisivitas atau isi selisih T dinding negatif; bila lebih dingin, sebaliknya. Bila hanya awal pemanasan yang meleset, periksa suhu awal dan fraksi sisi bawah terbuka.</p>`;
}

// ---------- Tab ----------
let activeTab = 'tab-sum';
function showTab(id, focus){
  activeTab = id;
  document.querySelectorAll('[role=tab]').forEach(t => { const on = t.getAttribute('aria-controls') === id; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
  document.querySelectorAll('.tabpanel').forEach(p => p.hidden = p.id !== id);
  $('timebar').hidden = !(id === 'tab-3d' || id === 'tab-map');
  if (id === 'tab-sum'){ chartT && chartT.resize(); chartLag && chartLag.resize(); }
  if (id === 'tab-3d' && sim){ if (init3D()){ size3D(); draw3D(); } }
  if (id === 'tab-map' && sim) drawHeat();
  flowLoop();
  store.set('tab', id);
}

// ---------- Inisialisasi ----------
function init(){
  buildParams();
  const savedMode = store.get('mode') === 'manual' ? 'manual' : 'pdf';
  setValues(PDF_VALUES);
  mode = 'pdf';
  if (savedMode === 'manual'){ applyMode('manual'); } else { const ed = store.get('pdfEdits'); if (ed) setValues(ed); applyMode('pdf', {load:false}); }

  document.querySelectorAll('input[name=mode]').forEach(r => r.onchange = () => { applyMode(r.value); doRun(); });
  const aside = document.querySelector('aside.params');
  const onEdit = (e) => {
    if (e.target.name === 'mode' || e.target.id === 'csvIn' || e.target.id === 'csvFile') return;
    refreshForm(); if (sim) setStale(true);
  };
  aside.addEventListener('input', onEdit); aside.addEventListener('change', onEdit);
  aside.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('#paramHost input:not([type=checkbox]):not([type=radio]):not([type=file]), #paramHost select')) { e.preventDefault(); doRun(); } });
  $('btnRun').onclick = doRun;
  $('btnBand').onclick = doBand;
  $('btnPin').onclick = () => { if (!sim) return; pinned = {rec:sim.rec, label:sim.P.meta.label}; $('btnUnpin').hidden = false; setStatus(`Pembanding disimpan (${pinned.label}). Ubah parameter lalu jalankan lagi.`); renderCharts(); };
  $('btnUnpin').onclick = () => { pinned = null; $('btnUnpin').hidden = true; if (sim) renderCharts(); setStatus('Pembanding dihapus.'); };
  $('btnCsv').onclick = () => {
    try { csvData = parseCsv($('csvIn').value);
      $('csvStatus').textContent = `${csvData.t.length} baris, menit ${fmt(csvData.t[0],0)}–${fmt(csvData.t[csvData.t.length-1],0)}, ${csvData.meas.filter(v=>v!=null).length} titik T_ukur.`;
      refreshForm(); doRun();
    } catch(e){ $('csvStatus').textContent = 'Log tidak terbaca: '+e.message+'. Format tiap baris: menit;T_atm;T_ukur'; }
  };
  $('btnCsvClear').onclick = () => { csvData = null; $('csvIn').value = ''; $('csvStatus').textContent = 'Log dikosongkan.'; refreshForm(); };
  $('csvFile').onchange = (e) => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { $('csvIn').value = rd.result; $('btnCsv').click(); }; rd.readAsText(f); };

  // tab dengan keyboard (panah kiri/kanan)
  const tabs = [...document.querySelectorAll('[role=tab]')];
  tabs.forEach((t, i) => {
    t.onclick = () => showTab(t.getAttribute('aria-controls'));
    t.onkeydown = (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft'){ const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length-1)) % tabs.length]; showTab(n.getAttribute('aria-controls'), true); } };
  });
  $('snapSlider').oninput = (e) => { snapIdx = +e.target.value; updateSnapViews(); };
  $('btnPlay').onclick = () => {
    if (playTimer){ clearInterval(playTimer); playTimer = null; $('btnPlay').textContent = 'Putar'; return; }
    if (!sim) return;
    $('btnPlay').textContent = 'Jeda';
    if (snapIdx >= sim.snaps.length-1) snapIdx = 0;
    playTimer = setInterval(() => {
      snapIdx++;
      if (snapIdx >= sim.snaps.length-1){ snapIdx = sim.snaps.length-1; clearInterval(playTimer); playTimer = null; $('btnPlay').textContent = 'Putar'; }
      $('snapSlider').value = snapIdx; updateSnapViews();
    }, 110);
  };
  document.querySelectorAll('input[name=scale]').forEach(r => r.onchange = () => updateSnapViews());
  $('cvPlan').onmousemove = hoverPlan; $('cvSec').onmousemove = hoverSec;
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { if (init3D()) setView(b.dataset.view); });
  ['v3_cut','v3_explode','v3_mult'].forEach(id => $(id).onchange = () => { V3.builtKey = null; draw3D(); });
  $('v3_vis').onchange = () => { $('flowKey').hidden = $('v3_vis').value !== 'flow'; draw3D(); flowLoop(); };
  $('btnCopy').onclick = async () => {
    const ta = $('csvOut');
    try { await navigator.clipboard.writeText(ta.value); $('btnCopy').textContent = 'Tersalin'; }
    catch(e){ ta.focus(); ta.select(); $('btnCopy').textContent = 'Teks terpilih, tekan Ctrl+C'; }
    setTimeout(() => $('btnCopy').textContent = 'Salin CSV', 2500);
  };
  // unduhan hanya ditawarkan di luar penampil artifact (mis. Streamlit atau berkas lokal)
  const inViewer = /claude\.ai|claudeusercontent|anthropic/.test(location.hostname + ' ' + document.referrer);
  $('btnDownload').hidden = inViewer;
  $('btnDownload').onclick = () => {
    const url = URL.createObjectURL(new Blob([csvText()], {type:'text/csv'}));
    const a = Object.assign(document.createElement('a'), {href:url, download:'hasil-simulasi-baf.csv'});
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const rerender = () => { V3.builtKey = null; drawLegendOn($('cvLeg')); drawLegendOn($('cvLeg3')); if (sim){ renderCharts(); updateSnapViews(); } };
  const mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener && mq.addEventListener('change', rerender);
  new MutationObserver(rerender).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
  document.addEventListener('visibilitychange', flowLoop);

  drawLegendOn($('cvLeg')); drawLegendOn($('cvLeg3'));
  const t = store.get('tab'); if (t && $(t)) showTab(t);
  if (typeof BAF === 'undefined') setStatus('Solver tidak termuat.', 'err'); else doRun();
}
