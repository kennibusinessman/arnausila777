"""
Responsive repacker for the /zakk bundled pages.

The 8 desktop pages (clients, tovary, ostatki, otcet, otceti, platezhi, rashod,
label) are self-unpacking "Bundled Page" exports. The real page HTML lives as a
JSON-encoded string inside <script type="__bundler/template">...</script>, where
closing-tag slashes are escaped as the JSON unicode escape \\u002F (so a nested
</script> can't break out of the bundler tag).

This script injects / refreshes the head responsive IIFE that decides, per device:
  - phone               -> redirect to mobile.html
  - portrait tablet     -> redirect to mobile.html (touch + portrait + vw<=1180)
  - landscape tablet    -> fit-to-width CSS zoom (--dc-scale = vw/1440)
  - desktop (>=1440)    -> original, centered

It edits ONLY the template tag's inner content and leaves the manifest + loader
byte-identical. Run with --dry to validate without writing.

  python responsive_repack.py --dry
  python responsive_repack.py
"""
import json, re, sys, os

ZAKK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # the /zakk dir
DESKTOP = ["clients", "tovary", "ostatki", "otcet", "otceti", "platezhi", "rashod", "label"]

TPL_RE = re.compile(r'(<script type="__bundler/template">)(.*?)(</script>)', re.S)

# The complete responsive IIFE we want present in each desktop page's <head>.
HEAD_IIFE = """<script>
(function(){
  var DESIGN_W = 1440, PHONE_MAX = 767, PHONE_SIDE = 500, PTAB_MAX = 1180;
  function vw(){ return window.innerWidth || document.documentElement.clientWidth; }
  function vh(){ return window.innerHeight || document.documentElement.clientHeight; }
  function isPhone(){
    var s = screen ? Math.min(screen.width || 9999, screen.height || 9999) : 9999;
    return s <= PHONE_SIDE || vw() <= PHONE_MAX;
  }
  function isTouch(){
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
  }
  function isPortraitTablet(){
    return isTouch() && vh() >= vw() && vw() <= PTAB_MAX;
  }
  function wantsMobile(){ return isPhone() || isPortraitTablet(); }
  function apply(){
    if (wantsMobile()) { try { location.replace('mobile.html'); } catch(e) { location.href = 'mobile.html'; } return; }
    var w = vw(), k = w < DESIGN_W ? (w / DESIGN_W) : 1;
    document.documentElement.style.setProperty('--dc-scale', String(k));
  }
  apply();
  window.addEventListener('resize', apply, { passive: true });
  window.addEventListener('orientationchange', apply);
})();
</script>"""

# Matches whatever responsive IIFE is currently in the head (old or new), so the
# script is idempotent and can refresh the logic in place.
IIFE_RE = re.compile(r'<script>\s*\(function\(\)\{.*?\}\)\(\);\s*</script>', re.S)


def parse_template(inner):
    return json.loads(inner)  # tolerates the leading "\n" whitespace before the JSON string


def encode_template(tpl):
    s = json.dumps(tpl, ensure_ascii=False)
    s = s.replace('</', '<\\u002F')      # re-escape closing-tag slashes like the bundler
    return "\n" + s


def process(name, dry=False):
    path = os.path.join(ZAKK, name + ".html")
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()
    m = TPL_RE.search(html)
    if not m:
        return f"{name}: NO TEMPLATE TAG"
    tpl = parse_template(m.group(2))

    if not IIFE_RE.search(tpl):
        return f"{name}: NO EXISTING IIFE TO REPLACE (ABORT)"
    new_tpl = IIFE_RE.sub(lambda _: HEAD_IIFE, tpl, count=1)
    new_inner = encode_template(new_tpl)
    new_html = html[:m.start(2)] + new_inner + html[m.end(2):]

    # ---- validation ----
    m2 = TPL_RE.search(new_html)
    inner2 = m2.group(2)
    if '</' in inner2:
        return f"{name}: VALIDATION FAIL - literal '</' in template region"
    if parse_template(inner2) != new_tpl:
        return f"{name}: VALIDATION FAIL - roundtrip mismatch"
    if new_html[:m.start(2)] != html[:m.start(2)] or new_html[m2.end(2):] != html[m.end(2):]:
        return f"{name}: VALIDATION FAIL - surrounding bytes changed"

    if not dry:
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(new_html)
    return f"{name}: OK ({'dry' if dry else 'written'})"


if __name__ == '__main__':
    dry = '--dry' in sys.argv
    for n in DESKTOP:
        print(process(n, dry=dry))
