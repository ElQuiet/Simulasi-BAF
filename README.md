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

`app/index.html` juga bisa dibuka langsung di browser.


## Verifikasi

```
node tests/verify.js        # 37 uji: solusi analitik, kekekalan energi, konvergensi, sifat material
node tests/sensitivity.js   # pengaruh tiap parameter tak pasti
```

Hasil dan pembahasannya ada di [VALIDASI.md](VALIDASI.md). Jalankan `tests/verify.js` setiap kali `src/baf-solver.js` diubah.
