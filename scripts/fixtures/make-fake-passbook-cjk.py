# 假存摺（中文、非內嵌字型 MSung-Light＋UniCNS-UCS2-H，台灣產的 PDF 常見）：AES-256 R6、密碼 A123456789，內容全虛構
# 用法同 make-fake-passbook.py；中文用沒內嵌的 MSung-Light＋UniCNS-UCS2-H（台灣產 PDF 常見），測 pdf.js 的 cMapUrl
import pikepdf, sys
out = sys.argv[1]
pdf = pikepdf.new()
lines = ["保險存摺測試檔（假資料）", "被保險人：測試人員", "示範人壽　示範醫療附約計劃二　日額三千元", "示範人壽　示範定期壽險二十年期　一百萬元", "範例人壽　範例重大傷病險　五十萬元"]
def hx(t): return "<" + t.encode("utf-16-be").hex() + ">"
ops = ["BT", "/F1 14 Tf", "20 TL", "50 780 Td"] + [f"{hx(l)} Tj T*" for l in lines] + ["ET"]
page = pdf.add_blank_page(page_size=(595, 842))
cid = pikepdf.Dictionary(Type=pikepdf.Name.Font, Subtype=pikepdf.Name.CIDFontType0, BaseFont=pikepdf.Name("/MSung-Light"),
    CIDSystemInfo=pikepdf.Dictionary(Registry=pikepdf.String("Adobe"), Ordering=pikepdf.String("CNS1"), Supplement=4),
    FontDescriptor=pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.FontDescriptor, FontName=pikepdf.Name("/MSung-Light"), Flags=6, FontBBox=[0,-200,1000,900], ItalicAngle=0, Ascent=880, Descent=-120, CapHeight=880, StemV=93)))
f = pikepdf.Dictionary(Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type0, BaseFont=pikepdf.Name("/MSung-Light"), Encoding=pikepdf.Name("/UniCNS-UCS2-H"), DescendantFonts=[pdf.make_indirect(cid)])
page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=pdf.make_indirect(f)))
page.Contents = pdf.make_stream("\n".join(ops).encode())
pdf.save(out, encryption=pikepdf.Encryption(user="A123456789", owner="owner-fake-1", R=6, aes=True))
b = open(out, "rb").read(); open(out, "wb").write(b"%PDF-1.4" + b[8:])
print(pikepdf.open(out, password="A123456789").encryption.R)
