"""
Re-classify TII catalog products with better categories and set plan_type (主約/附約).
Run: python3 scripts/reclassify-catalog.py
"""
import sqlite3, json, re

DB = "data/policies.db"

def derive_category(name: str, plan_code: str) -> str:
    # Most specific first
    if any(k in name for k in ("防癌", "癌症")):
        return "防癌險"
    if "失能" in name:
        return "失能"
    if any(k in name for k in ("長期照顧", "長照", "長期照護")):
        return "長照"
    if any(k in name for k in ("重大疾病", "重大傷病", "重疾")):
        return "重大傷病"
    if "醫療" in name and "實支" in name:
        return "醫療實支"
    if any(k in name for k in ("醫療", "住院", "日額", "手術")):
        return "定額醫療"
    if "健康" in name or "團體保險" in name:
        return "健康保險"
    if "年金" in name and any(k in name for k in ("投資", "變額")):
        return "投資型年金"
    if any(k in name for k in ("年金", "養老")):
        return "傳統型年金"
    if "投資型" in name or re.search(r"MU|MV", plan_code):
        return "投資型壽險"
    if any(k in name for k in ("傷害", "意外")):
        return "傷害保險"
    # Fallback: use 4th char of plan_code (TII category code)
    if len(plan_code) >= 4:
        c = plan_code[3]
        if c == "3": return "健康保險"
        if c == "4": return "傳統型年金"
        if c == "5": return "傷害保險"
        if c == "9": return "投資型壽險"
    return "傳統型壽險"

def derive_plan_type(name: str) -> str:
    if "批註" in name:
        return "批註條款"
    if "附加條款" in name or "附約" in name:
        return "附約"
    return "主約"

conn = sqlite3.connect(DB)
cur = conn.cursor()

# Fetch all TII catalog products
cur.execute("""
    SELECT id, product_name, plan_code, coverage_template
    FROM products
    WHERE coverage_template LIKE '%tii_catalog%'
""")
rows = cur.fetchall()
print(f"Found {len(rows)} TII catalog products to reclassify")

updates = 0
for pid, name, plan_code, tmpl_json in rows:
    new_category = derive_category(name, plan_code or "")
    new_plan_type = derive_plan_type(name)
    cur.execute(
        "UPDATE products SET category = ?, plan_type = ? WHERE id = ?",
        (new_category, new_plan_type, pid)
    )
    updates += 1

conn.commit()
conn.close()

print(f"Updated {updates} products")

# Verify
conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute("SELECT category, plan_type, COUNT(*) FROM products WHERE coverage_template LIKE '%tii_catalog%' GROUP BY category, plan_type ORDER BY COUNT(*) DESC")
for row in cur.fetchall():
    print(f"  {row[2]:4d}  {row[0] or '—':12s}  {row[1] or '—'}")
conn.close()
