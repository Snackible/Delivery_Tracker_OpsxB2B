// Email through Resend's HTTP API. Without RESEND_API_KEY it runs as a dry run (logs only),
// so nothing is ever sent from a demo or an unconfigured deployment.
const env = (k, d = "") => (process.env[k] || d).trim();

export function emailConfigured() {
  return Boolean(env("RESEND_API_KEY") && env("EMAIL_FROM"));
}

function domainOf(addr) {
  return String(addr).split("@")[1]?.toLowerCase() || "";
}

/**
 * Send as the logged-in user when their address is on the verified sending domain;
 * otherwise send from the system address with Reply-To set to them.
 */
export async function sendEmail({ sender, to, subject, text, html }) {
  const systemFrom = env("EMAIL_FROM", "tracker@example.com");
  const verified = domainOf(systemFrom);
  const useSender = sender?.email && domainOf(sender.email) === verified;
  const from = useSender ? `${sender.name} <${sender.email}>` : `${sender?.name ? sender.name + " via " : ""}Delivery Tracker <${systemFrom}>`;
  const payload = { from, to, subject, text, html };
  if (sender?.email && !useSender) payload.reply_to = sender.email;

  if (!emailConfigured()) {
    console.log(`[mail dry-run] from=${from} to=${to.join(", ")} subject="${subject}"`);
    return { ok: true, dryRun: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Email provider rejected the message (${res.status}). ${detail.slice(0, 200)}`);
  }
  return { ok: true, dryRun: false };
}
