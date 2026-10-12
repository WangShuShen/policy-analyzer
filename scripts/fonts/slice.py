"""把源泉圓體切成 unicode-range 小片（Google Fonts 的做法）：瀏覽器只下載頁面用到的字所在的片。
用法：python3 -I slice.py <otf 資料夾> <輸出資料夾> <介面字元檔>"""
import sys, re, json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools import subset

src, out, uichars = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
WEIGHTS = [("L", 300), ("R", 400), ("M", 500), ("B", 700)]

cmap = set(TTFont(src / "GenSenRounded2TW-R.otf")["cmap"].getBestCmap().keys())

# 1) 介面字（原型＋程式裡出現的字）＋ ASCII ＋常用全形標點 → 第一片，幾乎每頁都會用到
ui = {ord(c) for c in uichars.read_text(encoding="utf-8") if c.strip()}
ui |= set(range(0x20, 0x7F)) | {ord(c) for c in "，。、：；！？（）「」『』—－·％／＋×÷…　〈〉《》【】～"}
# 2) Big5 一級常用字（5401 字，依筆畫排）→ 每片 300 字
big5_1 = []
for hi in range(0xA4, 0xC7):
    for lo in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
        try: c = bytes([hi, lo]).decode("big5")
        except UnicodeDecodeError: continue
        big5_1.append(ord(c))
slices = [sorted(ui & cmap)]
used = set(slices[0])
common = [c for c in big5_1 if c in cmap and c not in used]
for i in range(0, len(common), 300): slices.append(common[i:i + 300]); used |= set(common[i:i + 300])
# 3) 其他所有字 → 每片 600 字（罕用，很少被下載）
rest = sorted(c for c in cmap if c not in used)
for i in range(0, len(rest), 600): slices.append(rest[i:i + 600])

def ranges(cps):
    cps = sorted(cps); out_r = []; s = p = cps[0]
    for c in cps[1:]:
        if c == p + 1: p = c; continue
        out_r.append((s, p)); s = p = c
    out_r.append((s, p))
    return ",".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in out_r)

css = ["/* 源泉圓體 2 TW（ButTaiwan，SIL OFL 1.1）切片：只下載頁面用到的字。由 scripts/fonts/slice.py 產生，勿手改 */"]
for wcode, weight in WEIGHTS:
    font_path = src / f"GenSenRounded2TW-{wcode}.otf"
    for i, cps in enumerate(slices):
        name = f"gensen-{wcode.lower()}-{i:03d}.woff2"
        opts = subset.Options(); opts.flavor = "woff2"; opts.layout_features = ["*"]; opts.hinting = False; opts.desubroutinize = True
        opts.name_IDs = [0, 1, 2, 3, 4, 5, 6]; opts.notdef_outline = False
        f = TTFont(font_path)
        s = subset.Subsetter(opts); s.populate(unicodes=cps); s.subset(f)
        subset.save_font(f, str(out / name), opts)
        css.append(f'@font-face{{font-family:"GenSen";font-style:normal;font-weight:{weight};font-display:swap;src:url("/fonts/gensen/{name}") format("woff2");unicode-range:{ranges(cps)}}}')
    print(wcode, "done", len(slices), "slices", flush=True)
(out / "gensen.css").write_text("\n".join(css) + "\n", encoding="utf-8")
sizes = sorted(p.stat().st_size for p in out.glob("gensen-r-*.woff2"))
print(json.dumps({"slices": len(slices), "ui_chars": len(slices[0]), "r_first_kb": (out / "gensen-r-000.woff2").stat().st_size // 1024,
                  "r_total_kb": sum(sizes) // 1024, "r_median_kb": sizes[len(sizes) // 2] // 1024}))
