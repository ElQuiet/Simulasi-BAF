# Laporan Verifikasi Model – Simulator Termal BAF

Tanggal: 18 November 2026 · Solver: `src/baf-solver.js` · Uji: `node tests/verify.js` dan `node tests/sensitivity.js`

## 1. Ringkasan

| Pertanyaan | Jawaban |
|---|---|
| Apakah persamaan diselesaikan dengan benar (verifikasi)? | **Ya.** 37/37 uji lulus terhadap solusi analitik, kekekalan energi, konvergensi, dan tabel sifat referensi. |
| Apakah model sudah mewakili alat nyata (validasi)? | **Belum.** Belum ada satu pun pengukuran suhu spesimen/tatakan yang dibandingkan. |
| Seberapa pasti angka lag 20,3 °C pada T<sub>atm</sub> = 300 °C? | Kisaran wajar **≈ 17–25 °C** dari ketidakpastian emisivitas, konveksi, dan dudukan. Bisa **11–31 °C** bila posisi termokopel atau poros jack berbeda dari asumsi. |

Verifikasi membuktikan perhitungan matematisnya benar. Validasi (membandingkan dengan termokopel tertanam di bawah spesimen) tetap **wajib** sebelum hasil dipakai untuk keputusan proses.

## 2. Persamaan yang dipakai dan sumbernya

| Bagian | Persamaan | Sumber | Status |
|---|---|---|---|
| Konduksi | ρ c<sub>p</sub>(T) ∂T/∂t = ∇·(k(T)∇T), 3D pada tatakan; per lembar pada spesimen | Hukum Fourier | Terverifikasi (U3, U4) |
| Radiasi | q = F σ (T<sub>w</sub>⁴ − T<sub>s</sub>⁴), F = 1/[1/ε<sub>s</sub> + (A<sub>s</sub>/A<sub>w</sub>)(1/ε<sub>w</sub> − 1)] | Pertukaran dua permukaan, benda cembung dalam selubung (Incropera Bab 13) | Terverifikasi (U2) |
| Konveksi alami | Pelat horizontal: Nu = 0,54 Ra<sup>1/4</sup> (sisi tak stabil), Nu = 0,52 Ra<sup>1/5</sup> (sisi stabil); vertikal: Churchill–Chu | Incropera pers. 9.26, 9.30–9.32 | Implementasi benar (U1); **Ra ≈ 10³ di bawah rentang korelasi 10⁴** |
| Konveksi paksa | Nu = 0,664 Re<sup>1/2</sup> Pr<sup>1/3</sup>, digabung (h<sub>n</sub>³ + h<sub>f</sub>³)<sup>1/3</sup> | Incropera pers. 7.30 | Kontribusinya < 1 W/m²K |
| Kontak lembar–tatakan | h = k<sub>gas</sub>/(δ + M) + 4σT³/(1/ε₁ + 1/ε₂ − 1) + 1,25 k<sub>s</sub>(m/σ)(P/H<sub>c</sub>)<sup>0,95</sup> | Model celah gas + radiasi celah + Mikic (plastis) | Bentuk persamaan benar; δ = 50 µm adalah **asumsi** |
| c<sub>p</sub> baja karbon | 425 + 0,773θ − 1,69·10⁻³θ² + 2,22·10⁻⁶θ³ (θ < 600 °C); 666 + 13002/(738 − θ) (600–735 °C) | EN 1993-1-2 §3.4.1.2 | Cocok persis (U6) |
| k baja | Tabel AISI 1010 | Incropera Tabel A.1 | Cocok (U6) |
| k SS310 | 14,2 W/m·K @100 °C; 18,7 @500 °C (linear) | Lembar data 310/310S | Cocok (U6) |
| c<sub>p</sub> SS310 > 100 °C | 500 + 0,18(T − 100) | **Perkiraan tren austenitik**, bukan data pabrik | Perlu data pemasok |
| Gas N₂ + 5% H₂ | k = 0,0259(T/300)<sup>0,78</sup>(1 + 1,9x<sub>H₂</sub>); ν = 15,63·10⁻⁶(T/300)<sup>1,7</sup> | Fit dari Incropera Tabel A.4 | Galat ≤ 3% (U6) |

Diskretisasi: volume hingga, Euler implisit (orde-1 dalam waktu), line Gauss–Seidel dengan over-relaxation 1,5, kolom vertikal diselesaikan algoritma Thomas. Radiasi, h, dan kontak dievaluasi ulang pada suhu akhir langkah (iterasi Picard), sehingga kondisi batas implisit penuh.

## 3. Hasil uji

| Uji | Yang diuji | Acuan | Galat terbesar |
|---|---|---|---|
| U1 | Konveksi, benda lumped, ramp 2 °C/min | T − T<sub>∞</sub> = −rτ(1 − e<sup>−t/τ</sup>) | +0,16 °C pada lag 23,5 °C (0,7%) |
| U2 | Radiasi, benda lumped, lompatan 30→630 °C | Solusi implisit ln/atan | −0,14 °C (Δt 0,25 s); −0,64 °C (Δt 2 s) |
| U3 | Konduksi non-lumped, pelat Bi = 0,61 | Deret Fourier eksak (40 suku) | 0,43 °C pada ~440 °C |
| U4 | Kekekalan energi, simulasi lengkap 410 min | Σ panas masuk = Σ energi tersimpan | 0,000 kJ dari 508,9 kJ; residu ≤ 0,002 J/langkah |
| U4 | Energi tersimpan vs entalpi ∫c<sub>p</sub>dT | Integrasi c<sub>p</sub>(T) | 0,003% |
| U5 | Konvergensi Δt, ukuran sel, lapisan tebal | Run lebih halus | ≤ 0,005 °C pada lag; 0,1 °C pada ΔT spesimen |
| U6 | Sifat N₂, c<sub>p</sub> baja, k SS310 | Tabel referensi | k N₂ ≤ 3%, ν N₂ ≤ 2,6%, c<sub>p</sub> baja ≤ 0,04 J/kg·K |

## 4. Temuan dan perbaikan selama verifikasi

1. **Radiasi tertinggal satu langkah waktu.** Sebelumnya koefisien radiasi dihitung dari suhu awal langkah. Pada lompatan suhu cepat (misalnya log CSV dengan perubahan mendadak) ini memberi galat sekitar 1,4 °C. Diperbaiki dengan iterasi Picard: radiasi, h, dan kontak dievaluasi ulang pada suhu akhir langkah.
2. **Konvergensi iterasi terlalu longgar.** Residu energi per langkah sebelumnya sekitar 1,5 J dari ~135 J (≈1%). Toleransi diperketat (0,002 → 0,0001 K) dan over-relaxation ditambahkan. Residu sekarang ≤ 0,002 J per langkah dan waktu hitung tetap ~3 s.
3. Pada data PDF, kedua perbaikan **tidak mengubah hasil utama** (lag 20,31 °C sebelum dan sesudah). Perbaikan ini mencegah galat pada kasus lain.

## 5. Sensitivitas (data PDF, spesimen 0,35 mm)

| Parameter yang diubah | Lag @300 °C | Δ dari dasar | Spesimen ≥ 605 °C | ΔT spesimen maks |
|---|---|---|---|---|
| Dasar | 20,3 °C | – | menit 291 | 0,91 °C |
| ε tatakan & spesimen 0,70 / 0,85 | 22,3 / 18,8 | +2,0 / −1,5 | 292 / 291 | 0,9 |
| ε spesimen 0,40 (baja cerah) | 23,0 | +2,7 | 292 | 1,5 |
| h konveksi ×0,5 / ×2 | 22,7 / 17,2 | +2,4 / −3,1 | 292 / 291 | 0,9 |
| T dinding − T termokopel = +10 / −10 °C | 11,4 / 28,9 | −8,9 / +8,6 | 286 / **tidak tercapai** | 0,9 |
| Bawah tatakan terbuka 50% | 24,9 | +4,6 | 292 | 1,1 |
| Celah kontak 10 / 150 µm | 20,7 / 19,4 | +0,4 / −0,9 | 292 / 291 | 1,0 / 0,8 |
| Sifat material konstan (PDF) | 19,1 | −1,2 | 291 | 0,9 |
| Poros jack aktif (Ø20 mm, 100 mm) | 30,8 | +10,4 | **tidak tercapai** | **22,6** |
| Spesimen 0,70 mm | 20,8 | +0,5 | 292 | 0,85 |

Urutan pengaruh: **posisi termokopel (T dinding vs T termokopel) dan poros jack** > dudukan tatakan > konveksi ≈ emisivitas > celah kontak, tebal spesimen, sifat material.

## 6. Asumsi dan batas model

1. Suhu gas di sekitar tatakan dianggap seragam dan sama dengan pembacaan termokopel controller.
2. Dinding muffle dianggap isotermal dengan T<sub>dinding</sub> = T<sub>termokopel</sub> + ΔT (bawaan ΔT = 0).
3. Korelasi konveksi alami dipakai sedikit di bawah rentang Ra validnya. Dampaknya tercakup di baris h ×0,5 / ×2 (±3 °C).
4. c<sub>p</sub> SS310 di atas 100 °C adalah perkiraan tren. Dampak bila memakai nilai konstan: −1,2 °C.
5. Poros jack dimodelkan sebagai konduksi 1D ke udara 30 °C tanpa pemanasan sepanjang poros di dalam tungku. Model ini cenderung **melebih-lebihkan** efek pendinginnya.
6. Sisi tepi spesimen (1,6% luas) dan pemuaian termal diabaikan.
7. "Suhu spesimen" pada grafik adalah rata-rata permukaan lembar teratas. Untuk satu lembar 0,35 mm, perbedaan atas–bawah < 0,1 °C.

## 7. Langkah validasi yang disarankan

1. Pasang termokopel tertanam (tipe K, Ø ≤ 1 mm) di tatakan 2 mm di bawah pusat spesimen. Pasang satu lagi di tepi tatakan bila memungkinkan.
2. Rekam T<sub>termokopel controller</sub> dan T<sub>tertanam</sub> per menit selama satu siklus penuh.
3. Masukkan ke tab Program suhu tungku → Log CSV (kolom: menit; T<sub>atm</sub>; T<sub>ukur</sub>). Atur posisi termokopel virtual sama dengan posisi pemasangan.
4. Bila RMSE > 2% rentang suhu, kalibrasi **satu** parameter saja, dimulai dari ΔT dinding, lalu fraksi sisi bawah terbuka. Kemudian uji pada siklus kedua yang **tidak** dipakai untuk kalibrasi.
