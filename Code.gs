
const SHEET_ID = "1vGfdL6Tb5i9bW-qMzB1CBpiztEs_fAJ-8t2ke7Vhg_Q";
const RESPONSES_SHEET = "Responses";
const SUBMISSIONS_SHEET = "Submissions";
const ADDITIONAL_RISKS_SHEET = "Additional Risks";

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    validatePayload_(payload);

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const responseSheet = getOrCreate_(ss, RESPONSES_SHEET, [
      "timestamp","project_code","round","consultant_id","procedure","experience",
      "item_id","risk","risk_type","score","frequency_statement","comment"
    ]);
    const submissionSheet = getOrCreate_(ss, SUBMISSIONS_SHEET, [
      "timestamp","project_code","round","consultant_id","procedure","experience",
      "started_at","submitted_at","response_count","additional_risk_count","user_agent"
    ]);
    const additionalSheet = getOrCreate_(ss, ADDITIONAL_RISKS_SHEET, [
      "timestamp","project_code","round","consultant_id","procedure","experience",
      "additional_risk_number","additional_risk"
    ]);

    const now = new Date();
    const rows = payload.responses.map(r => [
      now, payload.projectCode || "", payload.round || "", payload.consultantId || "",
      payload.procedure || r.procedure || "", payload.experience || "",
      r.itemId || "", r.risk || "", r.riskType || "",
      Number(r.score), r.frequencyStatement || "", r.comment || ""
    ]);

    if (rows.length) {
      responseSheet.getRange(responseSheet.getLastRow()+1,1,rows.length,rows[0].length).setValues(rows);
    }

    const additional = Array.isArray(payload.additionalRisks)
      ? payload.additionalRisks.map(x => String(x || "").trim()).filter(Boolean)
      : [];

    if (additional.length) {
      const aRows = additional.map((risk,i) => [
        now, payload.projectCode || "", payload.round || "", payload.consultantId || "",
        payload.procedure || "", payload.experience || "", i+1, risk
      ]);
      additionalSheet.getRange(additionalSheet.getLastRow()+1,1,aRows.length,aRows[0].length).setValues(aRows);
    }

    submissionSheet.appendRow([
      now, payload.projectCode || "", payload.round || "", payload.consultantId || "",
      payload.procedure || "", payload.experience || "", payload.startedAt || "",
      payload.submittedAt || "", rows.length, additional.length, payload.userAgent || ""
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      ok:true, rows:rows.length, additionalRisks:additional.length
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput("IR Consent Review endpoint is running.");
}

function validatePayload_(p) {
  if (!p || !Array.isArray(p.responses)) throw new Error("Invalid payload");
  if (!p.consultantId) throw new Error("Missing consultantId");
  if (!p.procedure) throw new Error("Missing procedure");
  if (!p.experience) throw new Error("Missing procedure experience");
  p.responses.forEach(r => {
    const s = Number(r.score);
    if (![1,2,3,4,5].includes(s)) throw new Error("Invalid score for " + (r.itemId || "item"));
  });
}

function getOrCreate_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}
