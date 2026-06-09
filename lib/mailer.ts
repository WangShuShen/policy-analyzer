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

// ── Shared layout wrapper ─────────────────────────────────────────

function emailWrapper(header: string, body: string) {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5EDE0;font-family:'Helvetica Neue',Arial,'PingFang TC','Noto Sans TC',sans-serif">
  <div style="max-width:600px;margin:32px auto;padding:0 16px">

    <!-- Brand Header -->
    <div style="text-align:center;padding:28px 0 20px">
      <div style="display:inline-block;background:white;border-radius:20px;padding:12px 20px;box-shadow:0 1px 4px rgba(160,113,79,0.12);border:1px solid #EDE0CE">
        <span style="font-size:22px;font-weight:700;color:#7C4F2F;letter-spacing:2px">傳家知保</span>
        <span style="font-size:11px;color:#C8956C;margin-left:8px;letter-spacing:1px">保單分析工具</span>
      </div>
    </div>

    <!-- Main Card -->
    <div style="background:white;border-radius:24px;overflow:hidden;box-shadow:0 2px 12px rgba(160,113,79,0.1);border:1px solid #EDE0CE">
      ${header}
      ${body}
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:20px 0 32px">
      <p style="margin:0;font-size:11px;color:#C8A882;letter-spacing:0.5px">
        © 傳家知保 · 僅供顧問內部使用 · 請勿轉寄
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ── Daily Assignment ──────────────────────────────────────────────

export async function sendDailyAssignment(
  to: string,
  advisorName: string,
  policies: PolicySummary[],
  date: string
) {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

  const policyCards = policies
    .map(
      (p, i) => `
      <div style="display:flex;align-items:center;padding:12px 0;border-bottom:1px solid #F5EDE0">
        <div style="width:28px;height:28px;border-radius:50%;background:#FBF0E3;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;color:#C8956C;text-align:center;line-height:28px">
          ${i + 1}
        </div>
        <div style="flex:1;margin:0 12px;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#3D2B1A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.productName}</div>
          <div style="font-size:11px;color:#A0714F;margin-top:2px">${p.company}</div>
        </div>
        <a href="${baseUrl}/review/${p.uuid}"
           style="flex-shrink:0;font-size:12px;color:#C8956C;text-decoration:none;border:1px solid #EDE0CE;border-radius:8px;padding:5px 12px;white-space:nowrap">
          開啟審核
        </a>
      </div>`
    )
    .join("");

  const header = `
    <div style="background:linear-gradient(135deg,#C8956C 0%,#A0714F 100%);padding:28px 32px 24px">
      <div style="font-size:11px;color:rgba(255,255,255,0.7);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">每日審核通知</div>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:white;line-height:1.3">今日保單審核清單</h1>
      <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8)">${date}　共 ${policies.length} 份</p>
    </div>`;

  const body = `
    <div style="padding:24px 32px">

      <p style="margin:0 0 4px;font-size:15px;color:#3D2B1A">嗨，${advisorName} 👋</p>
      <p style="margin:0 0 20px;font-size:14px;color:#8B6347;line-height:1.7">
        今天有 <strong style="color:#C8956C">${policies.length} 份</strong>保單等你確認，
        請在今晚 <strong style="color:#3D2B1A">22:00</strong> 前完成審核，謝謝你的用心！
      </p>

      <!-- Progress bar -->
      <div style="background:#FBF0E3;border-radius:12px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:#A0714F">今日進度</span>
        <span style="font-size:13px;font-weight:700;color:#C8956C">0 / ${policies.length}</span>
      </div>

      <!-- Policy list -->
      <div style="border:1px solid #F0E4D0;border-radius:16px;padding:0 16px;overflow:hidden">
        ${policyCards}
        <div style="padding:12px 0 4px;text-align:center">
          <a href="${baseUrl}/review"
             style="display:inline-block;background:linear-gradient(135deg,#C8956C,#A0714F);color:white;padding:12px 32px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.5px">
            前往審核頁面
          </a>
        </div>
      </div>

    </div>

    <!-- Tip section -->
    <div style="background:#FBF0E3;padding:16px 32px;border-top:1px solid #EDE0CE">
      <p style="margin:0;font-size:12px;color:#A0714F;line-height:1.6">
        💡 點擊各保單的「開啟審核」可直接跳至該份保單，
        審核完成後記得點「儲存變更」讓進度同步。
      </p>
    </div>`;

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

  const remainingCards = remaining
    .map(
      (p, i) => `
      <div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid #F5EDE0">
        <div style="width:24px;height:24px;border-radius:50%;background:#FFF3E0;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:700;color:#D97706;text-align:center;line-height:24px">
          ${i + 1}
        </div>
        <div style="flex:1;margin:0 12px;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#3D2B1A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.productName}</div>
          <div style="font-size:11px;color:#A0714F;margin-top:1px">${p.company}</div>
        </div>
        <a href="${baseUrl}/review/${p.uuid}"
           style="flex-shrink:0;font-size:12px;color:#D97706;text-decoration:none;border:1px solid #FDE68A;border-radius:8px;padding:5px 12px;white-space:nowrap;background:#FFFBEB">
          立即審核
        </a>
      </div>`
    )
    .join("");

  const header = `
    <div style="background:linear-gradient(135deg,#D97706 0%,#B45309 100%);padding:28px 32px 24px">
      <div style="font-size:11px;color:rgba(255,255,255,0.7);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">審核提醒 · 晚間 9 點</div>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:white;line-height:1.3">還有保單等你確認哦！</h1>
      <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8)">${date}　剩餘 ${remaining.length} 份</p>
    </div>`;

  const body = `
    <div style="padding:24px 32px">

      <p style="margin:0 0 4px;font-size:15px;color:#3D2B1A">嗨，${advisorName} 👋</p>
      <p style="margin:0 0 20px;font-size:14px;color:#8B6347;line-height:1.7">
        今天還有 <strong style="color:#D97706">${remaining.length} 份</strong>保單尚未完成審核，
        截止時間是今晚 <strong style="color:#3D2B1A">22:00</strong>，加油，快完成囉！
      </p>

      <!-- Remaining count chip -->
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:#92400E">尚未完成</span>
        <span style="font-size:13px;font-weight:700;color:#D97706">${remaining.length} 份</span>
      </div>

      <!-- Remaining list -->
      <div style="border:1px solid #FDE68A;border-radius:16px;padding:0 16px;overflow:hidden;background:#FFFDF5">
        ${remainingCards}
        <div style="padding:12px 0 4px;text-align:center">
          <a href="${baseUrl}/review"
             style="display:inline-block;background:linear-gradient(135deg,#D97706,#B45309);color:white;padding:12px 32px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.5px">
            繼續完成審核
          </a>
        </div>
      </div>

    </div>

    <div style="background:#FBF0E3;padding:16px 32px;border-top:1px solid #EDE0CE">
      <p style="margin:0;font-size:12px;color:#A0714F;line-height:1.6">
        ⏰ 如果今天來不及完成，請提前告知主管，以便安排補審。
      </p>
    </div>`;

  await getTransport().sendMail({
    from: `"傳家知保" <${process.env.GMAIL_USER}>`,
    to,
    subject: `【傳家知保】提醒：今日還有 ${remaining.length} 份保單待審核`,
    html: emailWrapper(header, body),
  });
}
