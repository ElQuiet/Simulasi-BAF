# Simulator Termal BAF

Simulasi distribusi temperatur tatakan SS310 dan spesimen baja di dalam muffle
BAF (Batch Annealing Furnace) simulator. Model konduksi 3D transien (volume hingga,
Euler implisit) dengan batas konveksi gas HNx, radiasi dinding muffle, dan kontak
termal lembar–tatakan.

## Struktur

| Berkas | Isi |
|---|---|
| `src/baf-solver.js` | Solver fisika (juga bisa dijalankan dengan Node untuk pengujian) |
| `src/app.js` | Antarmuka: parameter, mode Preset PDF / Input manual, grafik, peta 2D |
| `src/view3d.js` | Tampilan 3D, aliran partikel dan panah fluks panas |
| `src/index.html`, `src/styles.css` | Kerangka halaman dan gaya |
| `build.py` | Menggabungkan `src/` menjadi `app/index.html` dan `simulasi-baf.html` |
| `streamlit_app.py` | Aplikasi Streamlit yang menyajikan `app/index.html` |

Setiap kali berkas di `src/` diubah, jalankan:

```
python build.py
```

## Menjalankan lokal

```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
streamlit run streamlit_app.py
```

`app/index.html` juga bisa dibuka langsung di browser tanpa Streamlit.

## Deploy ke Streamlit Community Cloud

1. Unggah folder ini ke repositori GitHub (sertakan `app/index.html` hasil build).
2. Di share.streamlit.io pilih **New app**, pilih repositori dan cabang, lalu isi
   *Main file path* dengan `streamlit_app.py`.
3. Deploy. Tidak ada secret atau database yang dibutuhkan.

Perhitungan berjalan di browser pengguna (Web Worker), jadi server hanya
menyajikan halaman. Halaman memuat three.js, Chart.js dan font dari CDN publik,
sehingga pengguna perlu akses internet.

## Uji cepat solver

```
node -e "const B=require('./src/baf-solver.js');const P=B.prepare(B.defaults());const s=new B.BafSim(P).runAll();console.log(B.summarize(s).lag300)"
```

Dengan nilai bawaan (data PDF, spesimen 0,35 mm) hasilnya sekitar 20,3 °C.
