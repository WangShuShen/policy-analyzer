import nodemailer from "nodemailer";

function getTransport() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

export interface PolicySummary {
  uuid: string;
  productName: string;
  company: string;
  planCode: string;
}

// ── Shared layout wrapper（純 table 排版，相容 Gmail / Outlook）──────────

function emailWrapper(header: string, body: string) {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
</head>
<body style="margin:0;padding:0;background:#F5EDE0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5EDE0;font-family:'Helvetica Neue',Arial,'PingFang TC','Noto Sans TC',sans-serif;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">

          <!-- Brand Header -->
          <tr>
            <td align="center" style="padding:8px 0 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:18px;border:1px solid #EDE0CE;">
                <tr>
                  <td style="padding:12px 22px;">
                    <span style="font-size:21px;font-weight:700;color:#7C4F2F;letter-spacing:2px;">傳家知保</span>
                    <span style="font-size:11px;color:#C8956C;padding-left:8px;letter-spacing:1px;">保單分析工具</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:20px;border:1px solid #EDE0CE;overflow:hidden;">
                ${header}
                ${body}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:20px 0 8px;">
              <span style="font-size:11px;color:#C8A882;letter-spacing:0.5px;">© 傳家知保 · 僅供顧問內部使用 · 請勿轉寄</span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// 單列保單卡（table，含「開啟審核」直達連結）
function policyRow(p: PolicySummary, idx: number, baseUrl: string, accent: string, btnText: string) {
  return `
  <tr>
    <td style="padding:12px 0;border-bottom:1px solid #F2E9DA;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="30" valign="top" style="padding-right:10px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" width="26" height="26" style="background:#FBF0E3;border-radius:13px;font-size:12px;font-weight:700;color:${accent};line-height:26px;">${idx + 1}</td></tr>
            </table>
          </td>
          <td valign="middle">
            <div style="font-size:14px;font-weight:600;color:#3D2B1A;line-height:1.4;">${p.productName}</div>
            <div style="font-size:11px;color:#A0714F;padding-top:2px;">${p.company}　·　${p.planCode}</div>
          </td>
          <td valign="middle" align="right" width="92">
            <a href="${baseUrl}/review/${p.uuid}" style="display:inline-block;font-size:12px;color:#ffffff;background:${accent};text-decoration:none;border-radius:8px;padding:7px 14px;white-space:nowrap;">${btnText}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ── Daily Assignment ──────────────────────────────────────────────

export async function sendDailyAssignment(
  to: string,
  advisorName: string,
  policies: PolicySummary[],
  date: string
) {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const accent = "#C8956C";

  const rows = policies.map((p, i) => policyRow(p, i, baseUrl, accent, "開啟審核")).join("");

  const header = `
    <tr>
      <td style="background:#C8956C;background:linear-gradient(135deg,#C8956C 0%,#A0714F 100%);padding:26px 30px;">
        <div style="font-size:11px;color:#F3E3D2;letter-spacing:1px;text-transform:uppercase;padding-bottom:6px;">每日審核通知</div>
        <div style="font-size:21px;font-weight:700;color:#ffffff;line-height:1.3;">今日保單審核清單</div>
        <div style="font-size:13px;color:#F3E3D2;padding-top:6px;">${date}　共 ${policies.length} 份</div>
      </td>
    </tr>`;

  const body = `
    <tr>
      <td style="padding:24px 30px;">
        <p style="margin:0 0 4px;font-size:15px;color:#3D2B1A;">嗨，${advisorName} 👋</p>
        <p style="margin:0 0 18px;font-size:14px;color:#8B6347;line-height:1.7;">
          今天有 <strong style="color:#C8956C;">${policies.length} 份</strong>保單等你確認，請在今晚 <strong style="color:#3D2B1A;">22:00</strong> 前完成審核，謝謝你的用心！
        </p>

        <!-- 進度提示 -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FBF0E3;border-radius:12px;margin-bottom:14px;">
          <tr>
            <td style="padding:11px 16px;font-size:12px;color:#A0714F;">今日進度</td>
            <td align="right" style="padding:11px 16px;font-size:13px;font-weight:700;color:#C8956C;">0 / ${policies.length}</td>
          </tr>
        </table>

        <!-- 保單清單 -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${rows}
        </table>

        <!-- 主行動按鈕 -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
          <tr>
            <td align="center">
              <a href="${baseUrl}/review" style="display:inline-block;background:#C8956C;background:linear-gradient(135deg,#C8956C,#A0714F);color:#ffffff;padding:13px 36px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.5px;">前往審核頁面</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#FBF0E3;padding:16px 30px;border-top:1px solid #EDE0CE;">
        <p style="margin:0;font-size:12px;color:#A0714F;line-height:1.6;">💡 點各保單的「開啟審核」可直接跳至該份，審核完成後記得按「歸檔」讓進度同步。</p>
      </td>
    </tr>`;

  await getTransport().sendMail({
    from: `"傳家知保" <${process.env.GMAIL_USER}>`,
    to,
    subject: `【傳家知保】${date} 今日審核清單 · ${policies.length} 份待確認`,
    html: emailWrapper(header, body),
  });
}

// ── Reminder ─────────────────────────────────────────────────────

export async function sendReminderEmail(
  to: string,
  advisorName: string,
  remaining: PolicySummary[],
  date: string
) {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const accent = "#D97706";

  const rows = remaining.map((p, i) => policyRow(p, i, baseUrl, accent, "立即審核")).join("");

  const header = `
    <tr>
      <td style="background:#D97706;background:linear-gradient(135deg,#D97706 0%,#B45309 100%);padding:26px 30px;">
        <div style="font-size:11px;color:#FDE9C8;letter-spacing:1px;text-transform:uppercase;padding-bottom:6px;">審核提醒 · 晚間 9 點</div>
        <div style="font-size:21px;font-weight:700;color:#ffffff;line-height:1.3;">還有保單等你確認哦！</div>
        <div style="font-size:13px;color:#FDE9C8;padding-top:6px;">${date}　剩餘 ${remaining.length} 份</div>
      </td>
    </tr>`;

  const body = `
    <tr>
      <td style="padding:24px 30px;">
        <p style="margin:0 0 4px;font-size:15px;color:#3D2B1A;">嗨，${advisorName} 👋</p>
        <p style="margin:0 0 18px;font-size:14px;color:#8B6347;line-height:1.7;">
          今天還有 <strong style="color:#D97706;">${remaining.length} 份</strong>保單尚未完成審核，截止時間是今晚 <strong style="color:#3D2B1A;">22:00</strong>，加油，快完成囉！
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;margin-bottom:14px;">
          <tr>
            <td style="padding:11px 16px;font-size:12px;color:#92400E;">尚未完成</td>
            <td align="right" style="padding:11px 16px;font-size:13px;font-weight:700;color:#D97706;">${remaining.length} 份</td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${rows}
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
          <tr>
            <td align="center">
              <a href="${baseUrl}/review" style="display:inline-block;background:#D97706;background:linear-gradient(135deg,#D97706,#B45309);color:#ffffff;padding:13px 36px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.5px;">繼續完成審核</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#FBF0E3;padding:16px 30px;border-top:1px solid #EDE0CE;">
        <p style="margin:0;font-size:12px;color:#A0714F;line-height:1.6;">⏰ 如果今天來不及完成，請提前告知主管，以便安排補審。</p>
      </td>
    </tr>`;

  await getTransport().sendMail({
    from: `"傳家知保" <${process.env.GMAIL_USER}>`,
    to,
    subject: `【傳家知保】提醒：今日還有 ${remaining.length} 份保單待審核`,
    html: emailWrapper(header, body),
  });
}
