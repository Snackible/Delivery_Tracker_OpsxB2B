/**
 * Free daily timer for the Delivery Tracker.
 *
 * Calls the app's /api/cron-reminders once a day. The app decides what to send (at most one
 * email a day to ops), so running this more often is harmless.
 *
 * Setup:
 *  1. script.google.com > New project > paste this file.
 *  2. Project Settings > Script properties: add CRON_SECRET (same value as the app's CRON_SECRET)
 *     and APP_URL (for example https://your-app.vercel.app, no trailing slash).
 *  3. Run installDailyTrigger once and approve the permissions.
 *
 * The trigger runs as the Google account that installs it, so use an account that will stay.
 */

function pingTracker() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('APP_URL');
  const secret = props.getProperty('CRON_SECRET');
  if (!url || !secret) throw new Error('Set APP_URL and CRON_SECRET in Script properties.');

  const res = UrlFetchApp.fetch(url + '/api/cron-reminders', {
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
