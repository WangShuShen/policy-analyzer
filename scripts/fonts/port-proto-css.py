"""把原型（100_Todo/projects/RADIA-v2-prototype/proto.html）的 CSS 搬進 app/radia.css。
原型的樣式是唯一標準：產品畫面一律用這份，不要另外手寫一套。
  ・每條規則加上 .rd 範圍（只影響 RADIA 畫面，不影響舊工具頁）
  ・:root／body → .rd；預覽外殼（工具列、裝置框）與設計註記 .note 不搬
  ・原型用 @container vp 依「外框寬」換版面 → .rd 本身就是 vp 容器
  ・字型改用 app/gensen.css 的完整切片
用法：python3 -I scripts/fonts/port-proto-css.py <proto.html> <輸出 css>"""
import re, sys
from pathlib import Path

html = Path(sys.argv[1]).read_text(encoding="utf-8")
css = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)                     # 註解先拿掉（裡面可能有大括號）
css = re.sub(r"@font-face\{[^}]*\}", "", css)                         # 字型改用 gensen.css

DROP = {".stage", ".toolbar", ".tt", ".tbtn", ".hint", ".sizelabel", ".device", ".viewport", ".note", "body:not(.shownotes)"}

def scope_selector(sel: str) -> str:
    sel = sel.strip()
    if not sel: return sel
    if sel.startswith(":root"): return ".rd" + sel[len(":root"):]
    if sel in ("body", "html"): return ".rd"
    if sel == "*": return ".rd,.rd *"
    if sel.startswith("body "): return ".rd " + sel[5:]
    return ".rd " + sel

def dropped(sel: str) -> bool:
    s = sel.strip()
    return any(s == d or s.startswith(d + " ") or s.startswith(d + ":") or s.startswith(d + "[") or s.startswith(d + ".") or s.startswith(d + ">") for d in DROP)

def walk(text: str) -> str:
    out, i, n = [], 0, len(text)
    while i < n:
        j = text.find("{", i)
        if j < 0: break
        head = text[i:j].strip()
        # 找對應的 }
        depth, k = 1, j + 1
        while k < n and depth:
            if text[k] == "{": depth += 1
            elif text[k] == "}": depth -= 1
            k += 1
        body = text[j + 1:k - 1]
        if head.startswith("@media") or head.startswith("@container") or head.startswith("@supports"):
            inner = walk(body)
            if inner.strip(): out.append(f"{head}{{{inner}}}")
        elif head.startswith("@keyframes"):
            out.append(f"{head}{{{body}}}")
        else:
            sels = [s for s in head.split(",") if s.strip() and not dropped(s)]
            if sels: out.append(",".join(scope_selector(s) for s in sels) + "{" + body.strip() + "}")
        i = k
    return "\n".join(out)

result = walk(css)
header = """/* ⚠️ 自動產生自原型 proto.html（scripts/fonts/port-proto-css.py），勿手改；要改樣式先改原型再重跑。
 * 原型＝唯一標準。.rd 是 RADIA 畫面的根：同時是 @container vp 的容器（原型的「裝置框」）。 */
.rd{container-type:inline-size;container-name:vp;height:100dvh;display:flex;flex-direction:column;background:var(--ground)}   /* 原型的 .viewport：固定高度＝真的視窗，body 捲動、右欄 sticky 才有作用 */
"""
footer = ".rd{background:var(--ground)}   /* 原型的 body 底色是「裝置框外」的灰；產品本體＝ground */\n"
Path(sys.argv[2]).write_text(header + result + "\n" + footer, encoding="utf-8")
print(len(result.splitlines()), "rules")
