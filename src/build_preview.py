#!/usr/bin/env python3
"""Flatten the built site into a preview that can be clicked through anywhere.

The real site uses directory URLs (/firm/) served from firm/index.html. A
preview host serves files, not directories, so the same pages are re-linked
to sit side by side as firm.html, approach.html and so on. Only links and
asset paths change; every page is otherwise byte-for-byte what ships.
"""
import pathlib, re, shutil, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "build/preview"

PAGES = {"index.html": "index.html", "careers/index.html": "careers.html",
         "privacy/index.html": "privacy.html", "terms/index.html": "terms.html",
         "disclaimer/index.html": "disclaimer.html"}

FLAT = {"/": "index.html", "/careers/": "careers.html", "/privacy/": "privacy.html",
        "/terms/": "terms.html", "/disclaimer/": "disclaimer.html"}

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True)

for src, dest in PAGES.items():
    html = (ROOT / src).read_text(encoding="utf-8")

    for url, flat in FLAT.items():
        html = html.replace('href="%s"' % url, 'href="%s"' % flat)
    # The legacy-anchor forwarder points at the real URLs; in the preview it
    # has to point at the flattened ones or it forwards into nothing.
    for url, flat in FLAT.items():
        html = html.replace('": "%s"' % url, '": "%s"' % flat)

    for sid in ("firm", "approach", "values", "contact"):
        html = html.replace('href="/#%s"' % sid, 'href="index.html#%s"' % sid)

    html = html.replace('href="/assets/', 'href="assets/').replace('src="/assets/', 'src="assets/')
    html = html.replace('src="/tulsa', 'src="tulsa').replace('url("/tulsa', 'url("tulsa')
    # A canonical pointing at the real site would be wrong on a preview.
    html = re.sub(r'\s*<link rel="canonical"[^>]*>', "", html)

    left = re.findall(r'(?:href|src)="/(?!/)[^"]*"', html)
    if left:
        sys.exit("FAIL: absolute paths survive in %s: %s" % (dest, left[:4]))

    (OUT / dest).write_text(html, encoding="utf-8")

# The stylesheet's image paths are absolute in the shipped build; in a flat
# preview they have to climb back out of assets/css/ instead.
sheet = (ROOT / "assets/css/site.css").read_text(encoding="utf-8")
sheet = sheet.replace('url("/tulsa', 'url("../../tulsa')
(OUT / "assets/css").mkdir(parents=True, exist_ok=True)
(OUT / "assets/css/site.css").write_text(sheet, encoding="utf-8")

for asset in [ "assets/js/site.js", "assets/js/vendor/lenis.min.js",
              "assets/Left Aligned Full Lockup/SVG/PDCM Left Aligned Lockup-Navy.svg",
              "tulsa skyline.jpg", "tulsa-skyline-hires.webp"]:
    dst = OUT / asset
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / asset, dst)

# The preview host wraps the page in its own document, so the wrapper of the
# entry page is stripped the way it is for any other published page.
idx = OUT / "index.html"
s = idx.read_text(encoding="utf-8")
head = re.search(r"<head>(.*?)</head>", s, re.S)
body = re.search(r"<body([^>]*)>(.*?)</body>", s, re.S)
attrs = body.group(1)
cls = re.search(r'class="([^"]*)"', attrs)
page = (head.group(1).strip() +
        '\n\n<script>document.documentElement.classList.add("pdcm-preview");' +
        ('document.body && document.body.classList.add(%r);' % (cls.group(1) if cls else "") if cls else "") +
        '</script>\n\n' + body.group(2).strip() + "\n")
idx.write_text(page, encoding="utf-8")

print("preview written to build/preview")
for f in sorted(OUT.rglob("*")):
    if f.is_file():
        print(f"  {str(f.relative_to(OUT)):52} {f.stat().st_size:>9,}")
