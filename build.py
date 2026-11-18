"""Gabungkan berkas di src/ menjadi satu halaman HTML mandiri.

Keluaran:
  app/index.html    dokumen HTML lengkap (dipakai Streamlit dan bisa dibuka langsung di browser)
  simulasi-baf.html isi halaman tanpa <html>/<head> (format untuk artifact claude.ai)

Jalankan:  python build.py
"""
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"

THREE = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
CHART = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"
FONTS = ("https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800"
         "&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap")


def read(name: str) -> str:
    return (SRC / name).read_text(encoding="utf-8")


def head_bits() -> str:
    return "\n".join([
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
        "<title>Simulator Termal BAF</title>",
        '<meta name="claude:viewport-fit-sides" content="cover">',
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        f'<link rel="stylesheet" href="{FONTS}">',
        "<style>\n" + read("styles.css") + "\n</style>",
    ])


def scripts() -> str:
    app = "(function(){\n'use strict';\n" + read("app.js") + "\n" + read("view3d.js") + "\ninit();\n})();"
    return "\n".join([
        f'<script src="{THREE}"></script>',
        f'<script src="{CHART}"></script>',
        '<script id="baf-solver">\n' + read("baf-solver.js") + "\n</script>",
        "<script>\n" + app + "\n</script>",
    ])


def main() -> None:
    body = read("index.html")
    fragment = head_bits() + "\n" + body + "\n" + scripts() + "\n"
    (ROOT / "simulasi-baf.html").write_text(fragment, encoding="utf-8")

    full = ("<!doctype html>\n<html lang=\"id\">\n<head>\n" + head_bits() +
            "\n</head>\n<body>\n" + body + "\n" + scripts() + "\n</body>\n</html>\n")
    (ROOT / "app").mkdir(exist_ok=True)
    (ROOT / "app" / "index.html").write_text(full, encoding="utf-8")
    print(f"OK  simulasi-baf.html ({len(fragment)/1024:.0f} KB), app/index.html ({len(full)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
