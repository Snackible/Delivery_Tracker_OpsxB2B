// Gmail "compose" links. Like the WhatsApp links, they open a ready-made draft in the person's
// own Gmail and they press Send, so the email really comes from their address. No server access
// to anyone's mailbox is needed.
const env = (k, d = "") => (process.env[k] || d).trim();

/**
 * Returns { url, trimmed }. A link can only carry a few thousand characters, so a long body is cut
 * (whole lines) and pointed at the tracker for the rest. `authuser` picks the signed-in Gmail
 * account when the browser is signed in to several.
 */
export function gmailComposeUrl({ to, subject, body, authuser = "", maxUrl = 6500 }) {
  const e = encodeURIComponent;
  const build = (b) =>
    `https://mail.google.com/mail/?view=cm&fs=1&to=${e(to.join(","))}&su=${e(subject)}${authuser ? `&authuser=${e(authuser)}` : ""}&body=${e(b)}`;

  let text = body;
  let trimmed = false;
  if (build(text).length > maxUrl) {
    trimmed = true;
    const lines = text.split("\n");
    const tail = `\n…\n${env("APP_URL") ? `Full list: ${env("APP_URL")}` : "The rest is in the Delivery Tracker."}`;
    while (lines.length > 3 && build(lines.join("\n") + tail).length > maxUrl) lines.pop();
    text = lines.join("\n") + tail;
  }
  return { url: build(text), trimmed };
}
