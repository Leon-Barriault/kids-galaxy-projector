#!/usr/bin/env python3
"""Build a one-page printable quick-start card from the parent guide.

Run from the repository root:

    python3 scripts/build_user_card.py

The Markdown stays the source. This writes an HTML file beside it and, when
Chrome is installed, a PDF of that same page.
"""

from __future__ import annotations

import html
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCALES = ("en", "fr")
MARKER = re.compile(r"<!--.*?-->\n?", re.DOTALL)
HEADING = re.compile(r"^(#{1,3}) (.+)$")
CHROME_CANDIDATES = (
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
)


def markdown_to_html(source: str) -> str:
    body: list[str] = []
    in_list = False
    for raw_line in MARKER.sub("", source).splitlines():
        line = raw_line.rstrip()
        if not line:
            if in_list:
                body.append("</ul>")
                in_list = False
            continue
        if line.startswith(">"):
            continue
        heading = HEADING.match(line)
        if heading:
            if in_list:
                body.append("</ul>")
                in_list = False
            level = min(len(heading.group(1)), 2)
            body.append(f"<h{level}>{html.escape(heading.group(2))}</h{level}>")
            continue
        if line.startswith("- ") or re.match(r"\d+\. ", line):
            if not in_list:
                body.append("<ul>")
                in_list = True
            text = re.sub(r"^\d+\. ", "", line)
            text = text.removeprefix("- ")
            body.append(f"<li>{html.escape(text)}</li>")
            continue
        if in_list:
            body.append("</ul>")
            in_list = False
        body.append(f"<p>{html.escape(line)}</p>")
    if in_list:
        body.append("</ul>")
    return "\n".join(body)


def page(title: str, body: str, *, lang: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="{html.escape(lang)}">
<head>
  <meta charset="utf-8" />
  <title>{html.escape(title)}</title>
  <style>
    @page {{ size: letter; margin: 0.45in; }}
    body {{
      font-family: Georgia, "Times New Roman", serif;
      font-size: 11pt;
      line-height: 1.25;
      color: #111;
    }}
    h1 {{ font-size: 16pt; margin: 0 0 6px; }}
    h2 {{ font-size: 12pt; margin: 8px 0 2px; }}
    p, ul {{ margin: 0 0 4px; }}
    li {{ margin: 0; }}
  </style>
</head>
<body>
{body}
</body>
</html>
"""


def chrome_bin() -> str | None:
    for name in CHROME_CANDIDATES:
        found = shutil.which(name)
        if found:
            return found
    bundled = Path("/opt/google/chrome/chrome")
    if bundled.is_file():
        return str(bundled)
    return None


def write_locale(locale: str) -> None:
    folder = ROOT / "docs" / "user" / locale
    source = (folder / "quick-start.md").read_text(encoding="utf-8")
    title = "Kids Galaxy quick start" if locale == "en" else "Démarrage rapide Kids Galaxy"
    lang = "en" if locale == "en" else "fr-CA"
    document = page(title, markdown_to_html(source), lang=lang)
    html_path = folder / "quick-start.html"
    pdf_path = folder / "quick-start.pdf"
    html_path.write_text(document, encoding="utf-8")
    browser = chrome_bin()
    if browser is None:
        print(f"Wrote {html_path}. Chrome is not installed, so no PDF was made.")
        return
    process = subprocess.Popen(
        [
            browser,
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--no-pdf-header-footer",
            f"--print-to-pdf={pdf_path}",
            html_path.as_uri(),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        process.wait(timeout=20)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
    if not pdf_path.is_file() or not pdf_path.read_bytes().rstrip().endswith(b"%%EOF"):
        raise SystemExit(f"Chrome did not write a finished PDF at {pdf_path}")
    print(f"Wrote {pdf_path}")


def main() -> None:
    for locale in LOCALES:
        write_locale(locale)


if __name__ == "__main__":
    main()
