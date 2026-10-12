import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/*
 * 特種個資欄位的應用層加密（設計準則 T4／N4–N6；實作設計 D2）。
 *
 * 密文格式：v{金鑰版本}:{iv}:{tag}:{密文}（皆 base64url）
 * 金鑰版本寫在每一筆密文裡，所以不需要另外的 key_version 欄位（設計準則 Q4）：
 * 日後換金鑰時，新資料用新版本加密，舊資料照它自己標的版本解密，可以慢慢轉。
 *
 * 金鑰：FIELD_ENC_KEY_V{n}＝32 bytes 的 base64；FIELD_ENC_KEY_CURRENT＝目前加密用的版本號。
 * 金鑰只放環境變數（Vercel 後台），不進 git。
 *
 * ⚠️ 加密欄位不能拿來查詢或排序。要統計的用 facts.bucket（不含個資的粗略級距）。
 */
const ALGO = "aes-256-gcm";

function keyFor(version: number): Buffer {
  const raw = process.env[`FIELD_ENC_KEY_V${version}`];
  if (!raw) throw new Error(`缺少加密金鑰 FIELD_ENC_KEY_V${version}`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`FIELD_ENC_KEY_V${version} 必須是 32 bytes 的 base64`);
  return key;
}

function currentVersion(): number {
  const v = Number(process.env.FIELD_ENC_KEY_CURRENT ?? "1");
  if (!Number.isInteger(v) || v < 1) throw new Error("FIELD_ENC_KEY_CURRENT 必須是正整數");
  return v;
}

export function encryptField(plain: string): string {
  const version = currentVersion();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, keyFor(version), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${version}:${iv.toString("base64url")}:${tag.toString("base64url")}:${ct.toString("base64url")}`;
}

export function decryptField(stored: string): string {
  const m = /^v(\d+):([\w-]+):([\w-]+):([\w-]*)$/.exec(stored);
  if (!m) throw new Error("密文格式不正確");
  const decipher = createDecipheriv(ALGO, keyFor(Number(m[1])), Buffer.from(m[2], "base64url"));
  decipher.setAuthTag(Buffer.from(m[3], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(m[4], "base64url")), decipher.final()]).toString("utf8");
}

/** JSON 物件的加解密（分析結果、存摺讀出的原始欄位等） */
export const encryptJson = (value: unknown): string => encryptField(JSON.stringify(value));
export const decryptJson = <T = unknown>(stored: string): T => JSON.parse(decryptField(stored)) as T;

/** 這筆密文用的是哪一版金鑰（換金鑰時用來找出還沒轉的資料） */
export function keyVersionOf(stored: string): number | null {
  const m = /^v(\d+):/.exec(stored);
  return m ? Number(m[1]) : null;
}
