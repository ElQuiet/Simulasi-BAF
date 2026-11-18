"""Simulator Termal BAF – aplikasi Streamlit.

Seluruh perhitungan (solver FVM 3D) dan tampilan berjalan di browser pengguna
dari app/index.html, jadi server Streamlit hanya menyajikan halaman. Ini membuat
aplikasi ringan dipakai banyak orang sekaligus di Streamlit Community Cloud.

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

# Rapatkan bingkai Streamlit agar simulator memakai seluruh lebar layar.
st.markdown(
    """
    <style>
      .block-container {padding: 0.5rem 0.75rem 0 0.75rem; max-width: 100%;}
      header[data-testid="stHeader"] {height: 0; background: transparent;}
      #MainMenu, footer {visibility: hidden;}
      iframe {border: 0;}
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

with st.sidebar:
    st.header("Tampilan")
    height = st.slider("Tinggi area simulator (px)", 700, 2400, 1150, 50,
                       help="Simulator punya gulungan sendiri; atur agar pas dengan layar Anda.")
    st.caption("Perhitungan berjalan di browser Anda. Data yang dimasukkan tidak dikirim ke server.")

components.html(load_page(PAGE.stat().st_mtime), height=height, scrolling=True)
