/**
 * Delivery Tracker helper, one Apps Script project that does two jobs:
 *
 *  1. SENDS the tracker's emails through the Google account that owns this script
 *     (doPost, deployed as a web app). No domain setup needed.
 *  2. Runs the free DAILY TIMER that calls the app's /api/cron-reminders (pingTracker).
 *
 * Setup (about five minutes):
 *  1. Sign in as the Snackible account that should send the emails (a shared one such as
 *     tracker@ or ops@ is safest: the emails stop if that account is removed).
 *  2. script.google.com > New project > paste this file.
 *  3. Project Settings > Script properties. Add:
 *       MAIL_SECRET  a long random string (also set as MAIL_SECRET in the app's env)
 *       APP_URL      the app's address, for example https://your-app.vercel.app (no trailing slash)
 *       CRON_SECRET  same value as the app's CRON_SECRET
 *  4. Deploy > New deployment > type Web app. Execute as: Me. Who has access: Anyone.
 *     Approve the permissions (it needs to send email). Copy the Web app URL and set it as
 *     APPS_SCRIPT_MAIL_URL in the app's env. Requests without the right MAIL_SECRET are refused.
 *  5. Run installDailyTrigger once to schedule the 9am IST daily call.
 *
 * After you edit this file, use Deploy > Manage deployments > edit > New version.
 */

var MAX_RECIPIENTS = 25;

function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('MAIL_SECRET');
    var msg = JSON.parse(e.postData.contents);

    if (!secret || msg.secret !== secret) return reply({ ok: false, error: 'unauthorised' });

    var to = (msg.to || []).filter(function (a) { return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(a); });
    if (!to.length) return reply({ ok: false, error: 'no valid recipients' });
    if (to.length > MAX_RECIPIENTS) return reply({ ok: false, error: 'too many recipients' });
    if (!msg.subject) return reply({ ok: false, error: 'missing subject' });

    var options = { name: msg.senderName || 'Delivery Tracker' };
    if (msg.html) options.htmlBody = msg.html;
    if (msg.replyTo && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(msg.replyTo)) options.replyTo = msg.replyTo;

    GmailApp.sendEmail(to.join(','), String(msg.subject).slice(0, 200), msg.text || '', options);
    return reply({ ok: true, sent: to.length });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Daily timer: asks the app to send the daily email to ops. Every call sends, so running this by hand sends it again. */
function pingTracker() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('APP_URL');
  var secret = props.getProperty('CRON_SECRET');
  if (!url || !secret) throw new Error('Set APP_URL and CRON_SECRET in Script properties.');

  var res = UrlFetchApp.fetch(url + '/api/cron-reminders', {
    method: 'get',
    headers: { Authorization: 'Bearer ' + secret },
    muteHttpExceptions: true,
  });
  console.log(res.getResponseCode() + ' ' + res.getContentText());
}

function installDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'pingTracker'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('pingTracker')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .nearMinute(5)
    .inTimezone('Asia/Kolkata')
    .create();
}
