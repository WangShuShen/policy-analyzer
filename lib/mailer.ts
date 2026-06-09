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

export async function sendDailyAssignment(
  to: string,
  advisorName: string,
  policies: PolicySummary[],
  date: string
) {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

  const policyRows = policies
    .map(
      (p, i) =>
        `<tr style="border-bottom:1px solid #EDE0CE">
          <td style="padding:10px 12px;color:#6B7280;font-size:13px">${i + 1}</td>
          <td style="padding:10px 12px;font-size:13px;color:#374151">${p.company}</td>
          <td style="padding:10px 12px;font-size:13px;color:#374151">${p.productName}</td>
          <td style="padding:10px 12px">
            <a href="${baseUrl}/review/${p.uuid}" style="color:#C8956C;font-size:13px;text-decoration:none">開啟審核 →</a>
          </td>
        </tr>`
    )
    .join("");

  await getTransport().sendMail({
    from: `"傳家知保" <${process.env.GMAIL_USER}>`,
    to,
    subject: `【傳家知保】${date} 今日待審核保單（${policies.length} 份）`,
    html: `
      <div style="font-family:sans-serif;max-width:640px;margin:0 auto;background:#FEF9F2;border-radius:16px;overflow:hidden;border:1px solid #EDE0CE">
        <div style="background:linear-gradient(135deg,#C8956C,#A0714F);padding:24px 32px">
          <h1 style="color:white;margin:0;font-size:20px">傳家知保 · 每日審核通知</h1>
          <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px">${date}</p>
        </div>
        <div style="padding:24px 32px">
          <p style="color:#374151;font-size:15px">嗨 ${advisorName}，</p>
          <p style="color:#6B7280;font-size:14px;line-height:1.6">
            今日共有 <strong style="color:#C8956C">${policies.length} 份</strong>保單等待你審核，
            請於 <strong>今日 22:00</strong> 前完成，謝謝！
          </p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;background:white;border-radius:12px;overflow:hidden;border:1px solid #EDE0CE">
            <thead>
              <tr style="background:#FBF0E3">
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#9CA3AF;font-weight:600">#</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#9CA3AF;font-weight:600">保險公司</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#9CA3AF;font-weight:600">商品名稱</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#9CA3AF;font-weight:600">連結</th>
              </tr>
            </thead>
            <tbody>${policyRows}</tbody>
          </table>
          <a href="${baseUrl}/review" style="display:inline-block;background:linear-gradient(135deg,#C8956C,#A0714F);color:white;padding:12px 24px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;margin-top:8px">
            前往審核頁面
          </a>
        </div>
        <div style="padding:16px 32px;border-top:1px solid #EDE0CE;text-align:center">
          <p style="color:#D1D5DB;font-size:12px;margin:0">© 傳家知保 保單分析工具</p>
        </div>
      </div>
    `,
  });
}

export async function sendReminderEmail(
  to: string,
  advisorName: string,
  remaining: PolicySummary[],
  date: string
) {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

  await getTransport().sendMail({
    from: `"傳家知保" <${process.env.GMAIL_USER}>`,
    to,
    subject: `【傳家知保】提醒：${date} 還有 ${remaining.length} 份保單尚未審核`,
    html: `
      <div style="font-family:sans-serif;max-width:640px;margin:0 auto;background:#FEF9F2;border-radius:16px;overflow:hidden;border:1px solid #EDE0CE">
        <div style="background:linear-gradient(135deg,#D97706,#B45309);padding:24px 32px">
          <h1 style="color:white;margin:0;font-size:20px">⏰ 審核提醒</h1>
          <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px">${date} 晚上 9 點提醒</p>
        </div>
        <div style="padding:24px 32px">
          <p style="color:#374151;font-size:15px">嗨 ${advisorName}，</p>
          <p style="color:#6B7280;font-size:14px;line-height:1.6">
            還有 <strong style="color:#D97706">${remaining.length} 份</strong>保單尚未完成審核，
            請在 <strong>22:00</strong> 前完成，謝謝！
          </p>
          <a href="${baseUrl}/review" style="display:inline-block;background:linear-gradient(135deg,#D97706,#B45309);color:white;padding:12px 24px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;margin-top:8px">
            繼續審核
          </a>
        </div>
        <div style="padding:16px 32px;border-top:1px solid #EDE0CE;text-align:center">
          <p style="color:#D1D5DB;font-size:12px;margin:0">© 傳家知保 保單分析工具</p>
        </div>
      </div>
    `,
  });
}
