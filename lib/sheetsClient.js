// Thin wrapper over the Sheets v4 REST API.
import { getAccessToken } from "./sheetsAuth.js";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function call(path, { method = "GET", body } = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      detail = JSON.parse(text).error?.message || text;
    } catch {}
    throw new Error(`Sheets API ${res.status}: ${detail}`);
  }
  return res.json();
}

const enc = (range) => encodeURIComponent(range);

export async function readRange(sheetId, range) {
  const json = await call(`/${sheetId}/values/${enc(range)}?valueRenderOption=FORMATTED_VALUE`);
  return json.values || [];
}

export async function writeRange(sheetId, range, values) {
  return call(`/${sheetId}/values/${enc(range)}?valueInputOption=RAW`, {
    method: "PUT",
    body: { range, majorDimension: "ROWS", values },
  });
}

export async function appendRows(sheetId, range, values) {
  return call(`/${sheetId}/values/${enc(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: { majorDimension: "ROWS", values },
  });
}

export async function batchWrite(sheetId, data) {
  return call(`/${sheetId}/values:batchUpdate`, {
    method: "POST",
    body: { valueInputOption: "RAW", data: data.map(({ range, values }) => ({ range, majorDimension: "ROWS", values })) },
  });
}

/** Create a tab with a header row if it does not exist yet. */
export async function ensureTab(sheetId, title, headers) {
  const meta = await call(`/${sheetId}?fields=sheets.properties.title`);
  const exists = (meta.sheets || []).some((s) => s.properties.title === title);
  if (exists) return false;
  await call(`/${sheetId}:batchUpdate`, {
    method: "POST",
    body: { requests: [{ addSheet: { properties: { title } } }] },
  });
  if (headers?.length) await writeRange(sheetId, `${title}!A1`, [headers]);
  return true;
}

/** 0-based column index → A1 letters. */
export function colLetter(index) {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
