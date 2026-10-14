/*
 * 快訊內文的 Markdown（W3）。刻意只支援文章用得到的幾種，其他一律當純文字：
 *   ## 小標      **粗體**      1. 編號清單 / - 清單      | 表格 |      > 💡 提示框      [文字](https://…)
 * 先把 < > & 轉義再套格式，所以內文寫 HTML 不會變成 HTML（後台貼上的內容不能塞 script）。
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener nofollow">$1</a>');
}

const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim() || /^-{3,}\s*$/.test(l)) { i++; continue; }
    const h = l.match(/^(#{2,3})\s+(.+)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (isRow(l)) {
      const rows: string[][] = [];
      while (i < lines.length && isRow(lines[i])) { if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(cells(lines[i])); i++; }
      const [head, ...body] = rows;
      out.push(`<table class="nw-tbl"><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^>\s?/.test(l)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, "")); i++; }
      const items = q.filter(x => x.trim());
      const [first, ...rest] = items;
      const hd = first && !/^\s*-\s/.test(first) ? `<div class="th">${inline(first.replace(/^\p{Extended_Pictographic}️?\s*/u, ""))}</div>` : "";
      const lis = (hd ? rest : items).map(x => x.replace(/^\s*-\s+/, ""));
      out.push(`<div class="tip">${hd}${lis.length > 1 || (hd && lis.length) ? `<ul>${lis.map(x => `<li>${inline(x)}</li>`).join("")}</ul>` : lis.map(inline).join("<br>")}</div>`);
      continue;
    }
    const ol = /^\s*\d+[.)]\s+/, ul = /^\s*[-*]\s+/;
    if (ol.test(l) || ul.test(l)) {
      const re = ol.test(l) ? ol : ul, tag = re === ol ? "ol" : "ul";
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) { items.push(lines[i].replace(re, "")); i++; }
      out.push(`<${tag}>${items.map(x => `<li>${inline(x)}</li>`).join("")}</${tag}>`);
      continue;
    }
    const p: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|>|\s*\||\s*\d+[.)]\s|\s*[-*]\s|-{3,}\s*$)/.test(lines[i])) { p.push(lines[i]); i++; }
    if (p.length) out.push(`<p>${p.map(inline).join("<br>")}</p>`);
    else { out.push(`<p>${inline(l)}</p>`); i++; }
  }
  return out.join("\n");
}

/** 純文字（合規檢查、摘要、閱讀時間用） */
export const plainText = (md: string) => md.replace(/[#>*|`]/g, " ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();

/** 中文約每分鐘 400 字 */
export const readMinutes = (md: string) => Math.max(1, Math.round(plainText(md).length / 400));
