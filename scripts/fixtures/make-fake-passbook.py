# 產生假的保險存摺 PDF（測試用，內容全是虛構）：跟壽險公會存摺一樣 PDF 1.4 開頭、AES-256（/V 5 /R 6）、密碼 A123456789。
# 不准用真的存摺測（真客戶資料）。用法：python3 -m venv /tmp/v && /tmp/v/bin/pip install pikepdf && /tmp/v/bin/python make-fake-passbook.py fake-passbook-aes256.pdf
import sys
import pikepdf

out = sys.argv[1]
pdf = pikepdf.new()
lines = ["FAKE INSURANCE PASSBOOK - TEST ONLY (not real data)",
         "Insured: TEST PERSON   ID: A1234*****",
         "Company        Product                    Sum insured   Start",
         "Demo Life      Demo Medical Rider Plan 2  NT$ 3,000/day 2018-05-01",
         "Demo Life      Demo Term Life 20          NT$ 1,000,000 2019-03-15",
         "Sample Life    Sample Critical Illness    NT$ 500,000   2021-07-01"]
ops = ["BT", "/F1 11 Tf", "14 TL", "50 780 Td"] + [f"({l}) Tj T*" for l in lines] + ["ET"]
page = pdf.add_blank_page(page_size=(595, 842))
page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=pikepdf.Dictionary(
    Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.Helvetica)))
page.Contents = pdf.make_stream("\n".join(ops).encode())
pdf.save(out, encryption=pikepdf.Encryption(user="A123456789", owner="owner-fake-1", R=6, aes=True))

# pikepdf 加 R6 會把版本升到 1.7；真存摺開頭是 %PDF-1.4，改回去（同長度，xref 位移不變）
b = open(out, "rb").read()
assert b.startswith(b"%PDF-1.7")
open(out, "wb").write(b"%PDF-1.4" + b[8:])
p = pikepdf.open(out, password="A123456789")
print(out, p.pdf_version, "R", p.encryption.R, "V", p.encryption.V)
