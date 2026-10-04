const SHEET_ID = "1vGfdL6Tb5i9bW-qMzB1CBpiztEs_fAJ-8t2ke7Vhg_Q";
const RESPONSES_SHEET = "Responses";
const SUBMISSIONS_SHEET = "Submissions";
const ADDITIONAL_RISKS_SHEET = "Additional Risks";
const REVIEWERS_SHEET = "Reviewers";
const DRAFTS_SHEET = "Drafts";
const PROJECT_CODE = "IR-CONSENT-2026";
const ROUND = 1;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function doPost(e) {
  try {
    const raw = (e && e.parameter && e.parameter.payload) || (e && e.postData && e.postData.contents) || "{}";
    const payload = JSON.parse(raw);
    const action = payload.action || "submitProcedure";

    if (action === "login") return respond_(withRequestId_(login_(payload), payload.requestId));
    if (action === "saveDraft") return respond_(withRequestId_(saveDraft_(payload), payload.requestId));
    if (action === "submitProcedure") return respond_(withRequestId_(submitProcedure_(payload), payload.requestId));

    return respond_(withRequestId_({ ok: false, code: "UNKNOWN_ACTION", error: "Unknown action" }, payload.requestId));
  } catch (err) {
    return respond_({ ok: false, code: "SERVER_ERROR", error: String(err), requestId: "" });
  }
}

function doGet() {
  return json_({ ok: true, service: "IR Consent Review", version: "gmc-pin-drafts" });
}

function login_(p) {
  const gmc = normaliseGmc_(p.gmcNumber);
  const pin = normalisePin_(p.pin);
  const manualName = String(p.manualName || "").trim();

  if (!/^\d{7}$/.test(gmc)) {
    return { ok: false, code: "INVALID_GMC", error: "Enter a valid 7 digit GMC number." };
  }
  if (!/^\d{6}$/.test(pin)) {
    return { ok: false, code: "INVALID_PIN_FORMAT", error: "PIN must be 6 digits." };
  }

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const reviewerSheet = getOrCreate_(ss, REVIEWERS_SHEET, [
    "gmc_number", "name", "pin_salt", "pin_hash", "created_at", "last_login",
    "failed_attempts", "locked_until", "gmc_verified", "gmc_source_url"
  ]);

  let existing = findReviewer_(reviewerSheet, gmc);
  if (existing) {
    const auth = authenticateExistingReviewer_(reviewerSheet, existing, pin);
    if (!auth.ok) return auth;

    return {
      ok: true,
      newAccount: false,
      gmcNumber: gmc,
      name: auth.name,
      gmcVerified: auth.gmcVerified,
      draft: loadDraft_(ss, gmc, p.projectCode || PROJECT_CODE, p.round || ROUND),
      submittedProcedures: getSubmittedProcedures_(ss, gmc, p.projectCode || PROJECT_CODE, p.round || ROUND)
    };
  }

  const lookup = lookupGmcName_(gmc);
  if (lookup.notFound) {
    return { ok: false, code: "GMC_NOT_FOUND", error: "No doctor was found for that GMC number." };
  }
  if (!lookup.name && !manualName) {
    return {
      ok: false,
      code: "GMC_LOOKUP_FAILED",
      requiresName: true,
      error: "The GMC register could not be read at the moment. Please enter your name to continue."
    };
  }

  const name = lookup.name || cleanName_(manualName);
  if (!name) {
    return { ok: false, code: "MISSING_NAME", error: "Please enter your name." };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    existing = findReviewer_(reviewerSheet, gmc);
    if (existing) {
      const auth = authenticateExistingReviewer_(reviewerSheet, existing, pin);
      if (!auth.ok) return auth;
      return {
        ok: true,
        newAccount: false,
        gmcNumber: gmc,
        name: auth.name,
        gmcVerified: auth.gmcVerified,
        draft: loadDraft_(ss, gmc, p.projectCode || PROJECT_CODE, p.round || ROUND),
        submittedProcedures: getSubmittedProcedures_(ss, gmc, p.projectCode || PROJECT_CODE, p.round || ROUND)
      };
    }

    const salt = Utilities.getUuid();
    reviewerSheet.appendRow([
      gmc,
      name,
      salt,
      hashPin_(pin, salt),
      new Date(),
      new Date(),
      0,
      "",
      Boolean(lookup.name),
      lookup.sourceUrl || "https://www.gmc-uk.org/api/gmc/print/registrant?no=" + gmc
    ]);
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    newAccount: true,
    gmcNumber: gmc,
    name: name,
    gmcVerified: Boolean(lookup.name),
    draft: null,
    submittedProcedures: []
  };
}

function saveDraft_(p) {
  const gmc = normaliseGmc_(p.gmcNumber);
  const pin = normalisePin_(p.pin);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const auth = authenticate_(ss, gmc, pin);
  if (!auth.ok) return auth;

  if (!p.draft || typeof p.draft !== "object") {
    return { ok: false, code: "INVALID_DRAFT", error: "Invalid draft." };
  }

  const projectCode = p.projectCode || PROJECT_CODE;
  const round = p.round || ROUND;
  const json = JSON.stringify(p.draft);
  const packed = gzipBase64_(json);

  const draftSheet = getOrCreate_(ss, DRAFTS_SHEET, [
    "gmc_number", "project_code", "round", "draft_b64", "updated_at"
  ]);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const row = findDraftRow_(draftSheet, gmc, projectCode, round);
    const values = [[gmc, projectCode, round, packed, new Date()]];
    if (row) {
      draftSheet.getRange(row, 1, 1, values[0].length).setValues(values);
    } else {
      draftSheet.getRange(draftSheet.getLastRow() + 1, 1, 1, values[0].length).setValues(values);
    }
  } finally {
    lock.releaseLock();
  }

  return { ok: true, savedAt: new Date().toISOString() };
}

function submitProcedure_(p) {
  const gmc = normaliseGmc_(p.gmcNumber || p.consultantId);
  const pin = normalisePin_(p.pin);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const auth = authenticate_(ss, gmc, pin);
  if (!auth.ok) return auth;

  validateSubmission_(p);

  const projectCode = p.projectCode || PROJECT_CODE;
  const round = p.round || ROUND;
  if (hasExistingSubmission_(ss, gmc, projectCode, round, p.procedure)) {
    return { ok: true, alreadySubmitted: true, rows: 0, additionalRisks: 0 };
  }

  const responseSheet = getOrCreate_(ss, RESPONSES_SHEET, [
    "timestamp", "project_code", "round", "consultant_id", "procedure", "experience",
    "item_id", "risk", "risk_type", "score", "frequency_statement", "comment"
  ]);
  const submissionSheet = getOrCreate_(ss, SUBMISSIONS_SHEET, [
    "timestamp", "project_code", "round", "consultant_id", "procedure", "experience",
    "started_at", "submitted_at", "response_count", "additional_risk_count", "user_agent"
  ]);
  const additionalSheet = getOrCreate_(ss, ADDITIONAL_RISKS_SHEET, [
    "timestamp", "project_code", "round", "consultant_id", "procedure", "experience",
    "additional_risk_number", "additional_risk"
  ]);

  const now = new Date();
  const rows = p.responses.map(r => [
    now, projectCode, round, gmc,
    p.procedure || r.procedure || "", p.experience || "",
    r.itemId || "", r.risk || "", r.riskType || "",
    Number(r.score), r.frequencyStatement || "", r.comment || ""
  ]);

  const additional = Array.isArray(p.additionalRisks)
    ? p.additionalRisks.map(x => String(x || "").trim()).filter(Boolean)
    : [];

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (hasExistingSubmission_(ss, gmc, projectCode, round, p.procedure)) {
      return { ok: true, alreadySubmitted: true, rows: 0, additionalRisks: 0 };
    }

    if (rows.length) {
      responseSheet.getRange(responseSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    if (additional.length) {
      const aRows = additional.map((risk, i) => [
        now, projectCode, round, gmc,
        p.procedure || "", p.experience || "", i + 1, risk
      ]);
      additionalSheet.getRange(additionalSheet.getLastRow() + 1, 1, aRows.length, aRows[0].length).setValues(aRows);
    }

    submissionSheet.appendRow([
      now, projectCode, round, gmc,
      p.procedure || "", p.experience || "", p.startedAt || "",
      p.submittedAt || "", rows.length, additional.length, p.userAgent || ""
    ]);
  } finally {
    lock.releaseLock();
  }

  return { ok: true, rows: rows.length, additionalRisks: additional.length };
}

function authenticate_(ss, gmc, pin) {
  if (!/^\d{7}$/.test(gmc) || !/^\d{6}$/.test(pin)) {
    return { ok: false, code: "AUTH_FAILED", error: "Incorrect GMC number or PIN." };
  }
  const reviewerSheet = getOrCreate_(ss, REVIEWERS_SHEET, [
    "gmc_number", "name", "pin_salt", "pin_hash", "created_at", "last_login",
    "failed_attempts", "locked_until", "gmc_verified", "gmc_source_url"
  ]);
  const existing = findReviewer_(reviewerSheet, gmc);
  if (!existing) return { ok: false, code: "AUTH_FAILED", error: "Incorrect GMC number or PIN." };
  return authenticateExistingReviewer_(reviewerSheet, existing, pin);
}

function authenticateExistingReviewer_(sheet, existing, pin) {
  const v = existing.values;
  const now = new Date();
  const lockedUntil = v[7] ? new Date(v[7]) : null;

  if (lockedUntil && !isNaN(lockedUntil.getTime()) && lockedUntil > now) {
    return {
      ok: false,
      code: "ACCOUNT_LOCKED",
      error: "Too many incorrect PIN attempts. Please try again later."
    };
  }

  const expected = String(v[3] || "");
  const actual = hashPin_(pin, String(v[2] || ""));
  if (expected !== actual) {
    let failed = Number(v[6] || 0) + 1;
    let lockValue = "";
    if (failed >= MAX_FAILED_ATTEMPTS) {
      lockValue = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000);
      failed = 0;
    }
    sheet.getRange(existing.row, 7, 1, 2).setValues([[failed, lockValue]]);
    return {
      ok: false,
      code: lockValue ? "ACCOUNT_LOCKED" : "AUTH_FAILED",
      error: lockValue ? "Too many incorrect PIN attempts. Please try again later." : "Incorrect GMC number or PIN."
    };
  }

  sheet.getRange(existing.row, 6, 1, 3).setValues([[now, 0, ""]]);
  return {
    ok: true,
    gmcNumber: String(v[0]),
    name: String(v[1]),
    gmcVerified: Boolean(v[8])
  };
}

function lookupGmcName_(gmc) {
  const url = "https://www.gmc-uk.org/api/gmc/print/registrant?no=" + encodeURIComponent(gmc);
  try {
    const response = UrlFetchApp.fetch(url, {
      method: "get",
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IRConsentReview/1.0)",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    const code = response.getResponseCode();
    if (code === 404) return { name: "", notFound: true, sourceUrl: url };
    if (code < 200 || code >= 400) return { name: "", unavailable: true, sourceUrl: url };

    const html = response.getContentText();
    const text = decodeHtml_(stripTags_(html)).replace(/\s+/g, " ").trim();

    if (/page not found|registrant not found|no record found/i.test(text)) {
      return { name: "", notFound: true, sourceUrl: url };
    }

    const doctorFirst = text.match(new RegExp("Doctor\\s+(.{2,120}?)\\s+" + gmc + "\\s+GMC reference number", "i"));
    if (doctorFirst && doctorFirst[1]) {
      return { name: cleanName_(doctorFirst[1]), sourceUrl: url };
    }

    const numberFirst = text.match(new RegExp("(.{2,120}?)\\s+" + gmc + "\\s+GMC reference number", "i"));
    if (numberFirst && numberFirst[1]) {
      let candidate = numberFirst[1].replace(/^.*?Doctor\s+/i, "");
      candidate = cleanName_(candidate);
      if (candidate) return { name: candidate, sourceUrl: url };
    }

    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      const h1 = cleanName_(decodeHtml_(stripTags_(h1Match[1])));
      if (h1 && !/our registers|registrant details/i.test(h1)) {
        return { name: h1, sourceUrl: url };
      }
    }

    if (text.indexOf(gmc) === -1) {
      return { name: "", notFound: true, sourceUrl: url };
    }
    return { name: "", unavailable: true, sourceUrl: url };
  } catch (err) {
    return { name: "", unavailable: true, sourceUrl: url };
  }
}

function findReviewer_(sheet, gmc) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === gmc) return { row: i + 2, values: values[i] };
  }
  return null;
}

function findDraftRow_(sheet, gmc, projectCode, round) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (let i = 0; i < values.length; i++) {
    if (
      String(values[i][0]).trim() === gmc &&
      String(values[i][1]).trim() === String(projectCode) &&
      String(values[i][2]).trim() === String(round)
    ) return i + 2;
  }
  return 0;
}

function loadDraft_(ss, gmc, projectCode, round) {
  const sheet = getOrCreate_(ss, DRAFTS_SHEET, [
    "gmc_number", "project_code", "round", "draft_b64", "updated_at"
  ]);
  const row = findDraftRow_(sheet, gmc, projectCode, round);
  if (!row) return null;
  const packed = String(sheet.getRange(row, 4).getValue() || "");
  if (!packed) return null;
  try {
    return JSON.parse(ungzipBase64_(packed));
  } catch (err) {
    return null;
  }
}

function getSubmittedProcedures_(ss, gmc, projectCode, round) {
  const sheet = getOrCreate_(ss, SUBMISSIONS_SHEET, [
    "timestamp", "project_code", "round", "consultant_id", "procedure", "experience",
    "started_at", "submitted_at", "response_count", "additional_risk_count", "user_agent"
  ]);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  const found = {};
  values.forEach(row => {
    if (
      String(row[1]) === String(projectCode) &&
      String(row[2]) === String(round) &&
      String(row[3]).trim() === gmc &&
      row[4]
    ) found[String(row[4])] = true;
  });
  return Object.keys(found);
}

function hasExistingSubmission_(ss, gmc, projectCode, round, procedure) {
  return getSubmittedProcedures_(ss, gmc, projectCode, round).indexOf(String(procedure)) !== -1;
}

function validateSubmission_(p) {
  if (!p || !Array.isArray(p.responses)) throw new Error("Invalid payload");
  if (!p.procedure) throw new Error("Missing procedure");
  if (!p.experience) throw new Error("Missing procedure experience");
  p.responses.forEach(r => {
    const s = Number(r.score);
    if ([1, 2, 3, 4, 5].indexOf(s) === -1) throw new Error("Invalid score for " + (r.itemId || "item"));
  });
}

function hashPin_(pin, salt) {
  const raw = String(salt) + "|" + String(pin) + "|" + getPinPepper_();
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(b => (b + 256) % 256).map(b => ("0" + b.toString(16)).slice(-2)).join("");
}

function getPinPepper_() {
  const props = PropertiesService.getScriptProperties();
  let pepper = props.getProperty("IR_CONSENT_PIN_PEPPER");
  if (!pepper) {
    pepper = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty("IR_CONSENT_PIN_PEPPER", pepper);
  }
  return pepper;
}

function gzipBase64_(text) {
  const blob = Utilities.newBlob(String(text), "application/json");
  return Utilities.base64Encode(Utilities.gzip(blob).getBytes());
}

function ungzipBase64_(value) {
  const bytes = Utilities.base64Decode(String(value));
  return Utilities.ungzip(Utilities.newBlob(bytes)).getDataAsString();
}

function normaliseGmc_(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalisePin_(value) {
  return String(value || "").replace(/\D/g, "");
}

function cleanName_(value) {
  return String(value || "")
    .replace(/^Dr\.?\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function stripTags_(html) {
  return String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeHtml_(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function getOrCreate_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}

function withRequestId_(obj, requestId) {
  obj = obj || {};
  obj.requestId = String(requestId || "");
  return obj;
}

function respond_(obj) {
  const payload = JSON.stringify(obj).replace(/</g, "\\u003c");
  const requestId = obj && obj.requestId ? String(obj.requestId) : "";
  const html = "<!doctype html><html><body><script>" +
    "window.top.postMessage({source:'IR_CONSENT_BACKEND',requestId:" +
    JSON.stringify(requestId) + ",payload:" + payload + "},'*');" +
    "</script></body></html>";
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
