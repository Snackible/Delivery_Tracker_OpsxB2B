// Automatic email (the daily email to ops, urgent alerts, the master "send now"). It goes through
// the Apps Script web app in appscript/Code.gs, which sends from the Google account that owns the
// script. Who it is "from" is therefore not a setting here: replies go to the signed-in person's
// email from the Users sheet. Manual reminders do not use this; they open a Gmail draft instead.
// With the script not configured it is a dry run (logged only), so nothing is sent from a demo.
const env = (k, d = "") => (process.env[k] || d).trim();

export function emailConfigured() {
  return Boolean(env("APPS_SCRIPT_MAIL_URL") && env("MAIL_SECRET"));
}

export async function sendEmail({ sender, to, subject, text, html }) {
  if (!emailConfigured()) {
    const who = sender?.name ? `${sender.name} via Delivery Tracker` : "Delivery Tracker";
    console.log(`[mail dry-run] from=${who} to=${to.join(", ")} subject="${subject}"`);
    return { ok: true, dryRun: true };
  }
  const res = await fetch(env("APPS_SCRIPT_MAIL_URL"), {
    method: "POST",
    // text/plain keeps this a simple request; Apps Script reads the raw body either way.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      secret: env("MAIL_SECRET"),
      to,
      subject,
      text,
      html,
      senderName: sender?.name ? `${sender.name} via Delivery Tracker` : "Delivery Tracker",
      replyTo: sender?.email || "",
    }),
    redirect: "follow",
  });
  const body = await res.text();
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {}
  if (!json) {
    throw new Error("The mail script did not answer with JSON. Check it is deployed as a web app that anyone can open (Execute as: Me).");
  }
  if (!json.ok) throw new Error(`The mail script refused the message: ${json.error || "unknown error"}`);
  return { ok: true, dryRun: false };
}
