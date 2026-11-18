"""Simulator Termal BAF – aplikasi Streamlit.

Seluruh perhitungan (solver FVM 3D) dan tampilan berjalan di browser pengguna
dari app/index.html, jadi server Streamlit hanya menyajikan halaman.

Halaman di dalam iframe menyesuaikan tingginya sendiri dengan isinya, sehingga
hanya ada satu scroll (milik halaman Streamlit), bukan scroll di dalam scroll.

Jalankan lokal:  streamlit run streamlit_app.py
"""
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

ROOT = Path(__file__).parent
PAGE = ROOT / "app" / "index.html"

st.set_page_config(
    page_title="Simulator Termal BAF",
    page_icon="🔥",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Bingkai Streamlit dibuat setipis mungkin; tinggi iframe diatur oleh halaman di dalamnya.
st.markdown(
    """
    <style>
      .block-container {padding: 0.5rem 0.5rem 1rem 0.5rem; max-width: 100%;}
      /* toolbar Streamlit disembunyikan agar tidak menutupi bagian atas simulator saat scroll */
      header[data-testid="stHeader"], [data-testid="stToolbar"], [data-testid="stDecoration"] {display: none;}
      #MainMenu, footer {visibility: hidden;}
      iframe {border: 0; display: block;}
      [data-testid="stElementContainer"]:has(iframe) {margin: 0;}
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_data(show_spinner=False)
def load_page(mtime: float) -> str:
    # mtime ikut jadi kunci cache: halaman dimuat ulang otomatis setelah `python build.py`
    return PAGE.read_text(encoding="utf-8")


if not PAGE.exists():
    st.error("Berkas app/index.html belum ada. Jalankan `python build.py` di folder proyek, lalu muat ulang halaman ini.")
    st.stop()

# Tinggi awal sebelum halaman mengukur dirinya sendiri; scrolling=False mencegah scroll ganda.
components.html(load_page(PAGE.stat().st_mtime), height=1800, scrolling=False)
