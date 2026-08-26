// Web App handler for the Viral Mind Labs application form.
//
// Setup (see docs/superpowers/specs/2026-08-26-form-google-sheets-design.md):
//   1. Open the target spreadsheet (blank is fine, headers are created below).
//   2. Extensions > Apps Script, paste this whole file, save.
//   3. Deploy > New deployment > type "Web app".
//      Execute as: Me. Who has access: Anyone.
//   4. Copy the generated Web App URL into script.js's SHEETS_WEBHOOK_URL.
//
// The client posts as text/plain (avoids a CORS preflight Apps Script
// can't handle) with a JSON string body, and never reads the response
// (mode: "no-cors") — see the spec doc for why. This handler stays
// silent on every path (bot, success) since nothing reads it back.

var HEADERS = ["Timestamp", "Nome", "Empresa", "WhatsApp", "Email", "Ramo", "Instagram", "Faturamento", "Observações"];

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }

  var data = JSON.parse(e.postData.contents);

  // honeypot: campo invisível pro humano — se veio preenchido, é bot
  if (data.website) {
    return ContentService.createTextOutput("ok");
  }

  sheet.appendRow([
    new Date(),
    data.nome || "",
    data.empresa || "",
    data.whatsapp || "",
    data.email || "",
    data.ramo || "",
    data.instagram || "",
    data.faturamento || "",
    data.obs || "",
  ]);

  return ContentService.createTextOutput("ok");
}
