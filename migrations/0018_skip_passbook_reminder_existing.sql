-- W2 w2-06（主管 10/15）：存摺提醒只寄「這個功能上線之後才建立」的預約。
-- 既有預約先填標記值，排程只找 passbook_reminded_at 是空的，所以不會補寄（v1.0 上線時真客戶不會突然收到）。
UPDATE "bookings" SET "passbook_reminded_at" = 'skipped:before-w2' WHERE "passbook_reminded_at" IS NULL;
