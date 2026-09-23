/**
 * Small Laddu Lucky Draw — STANDALONE backend (Google Apps Script)
 * Completely independent from any other event's script/sheet.
 *
 * Setup:
 * 1. Create a new Google Sheet (or use one dedicated to this Lucky Draw).
 * 2. Extensions -> Apps Script -> paste this whole file, replacing the default code.
 * 3. Deploy -> New deployment -> Type: Web app -> Execute as: Me -> Who has access: Anyone.
 * 4. Copy the /exec URL into assets/config.js (API_URL).
 * 5. Re-deploy (New version) any time you change this file.
 *
 * Sheet tab used: "LuckyDraw"
 * Columns: Timestamp | Name | Mobile | Tower | Flat | SerialNumber | PaymentProofUrl | TicketImageUrl
 *
 * Payment screenshots AND the resident's downloadable ticket image are
 * both uploaded as base64 from the browser and saved as files in Google
 * Drive folders (auto-created), with links stored in the sheet.
 */

const LUCKY_SHEET_NAME = "LuckyDraw";
const LUCKY_HEADERS = ["Timestamp", "Name", "Mobile", "Tower", "Flat", "SerialNumber", "PaymentProofUrl", "TicketImageUrl"];
const LUCKY_SERIAL_START = 501;
const LUCKY_SERIAL_END = 1000;
const PROOF_FOLDER_NAME = "LuckyDraw_PaymentProofs";
const TICKET_FOLDER_NAME = "LuckyDraw_TicketImages";

function getLuckySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(LUCKY_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LUCKY_SHEET_NAME);
    sheet.appendRow(LUCKY_HEADERS);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(LUCKY_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readAllLuckyEntries_() {
  const sheet = getLuckySheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const range = sheet.getRange(2, 1, lastRow - 1, LUCKY_HEADERS.length);
  const values = range.getValues();
  return values
    .filter((row) => row[1] || row[5])
    .map((row) => ({
      timestamp: row[0] instanceof Date ? row[0].toISOString() : String(row[0]),
      name: row[1],
      mobile: row[2],
      tower: row[3],
      flat: row[4],
      serialNumber: Number(row[5]),
      paymentProofUrl: row[6] || "",
      ticketImageUrl: row[7] || "",
    }));
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

/**
 * Saves a base64 data-URL image to a named Drive folder and returns a
 * shareable link. Used for both payment-proof screenshots and the
 * resident's downloadable ticket image.
 */
function saveImageToDrive_(dataUrl, folderName, fileNamePrefix) {
  if (!dataUrl || dataUrl.indexOf("base64,") === -1) return "";

  const matches = dataUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
  if (!matches) return "";

  const mimeType = matches[1];
  const base64Data = matches[2];
  const ext = mimeType.split("/")[1] || "png";
  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(bytes, mimeType, fileNamePrefix + "." + ext);

  const folder = getOrCreateFolder_(folderName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function savePaymentProof_(dataUrl, serialNumber) {
  return saveImageToDrive_(dataUrl, PROOF_FOLDER_NAME, "token_" + serialNumber + "_payment");
}

function saveTicketImage_(dataUrl, serialNumber) {
  return saveImageToDrive_(dataUrl, TICKET_FOLDER_NAME, "token_" + serialNumber + "_ticket");
}

/**
 * GET
 *   ?action=luckyList  -> { ok, serialStart, serialEnd, takenSerials }
 *   ?action=admin&password=...  -> { ok, entries } full list for committee
 */
function doGet(e) {
  const params = e.parameter || {};
  const action = params.action || "luckyList";

  if (action === "admin") {
    // Must match ADMIN_PASSWORD in assets/config.js — keep both in sync.
    const ADMIN_PASSWORD = "Ganesh2026";
    if (params.password !== ADMIN_PASSWORD) {
      return jsonOut_({ ok: false, error: "Invalid password" });
    }
    return jsonOut_({ ok: true, entries: readAllLuckyEntries_() });
  }

  // default: luckyList
  const taken = readAllLuckyEntries_().map((s) => s.serialNumber);
  return jsonOut_({
    ok: true,
    serialStart: LUCKY_SERIAL_START,
    serialEnd: LUCKY_SERIAL_END,
    takenSerials: taken,
  });
}

/**
 * POST body (JSON): { tickets: [{name, mobile, tower, flat, serialNumber}, ...], ticketImages, paymentProof }
 * Each ticket is fully independent — a resident can book several tickets
 * in one submission, and each ticket can belong to a DIFFERENT person
 * (own Name/Mobile/Tower/Flat), while all sharing one payment screenshot.
 * ticketImages is an array of base64 PNGs, one per ticket, SAME ORDER as
 * `tickets` — this is the resident's downloadable ticket receipt, saved
 * permanently so the committee can view/verify it later too.
 * (Older single-ticket payloads with serialNumber/serialNumbers + a single
 * top-level name/mobile/tower/flat are still accepted for compatibility.)
 * All tickets are validated together and inserted atomically: if ANY of
 * them is invalid or any serial is already taken, NONE are booked.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (err) {
    return jsonOut_({ ok: false, error: "Server busy, please try again." });
  }

  try {
    const data = JSON.parse(e.postData.contents);
    const paymentProof = data.paymentProof || "";
    const ticketImages = Array.isArray(data.ticketImages) ? data.ticketImages : [];

    // Normalize into a list of { name, mobile, tower, flat, serialNumber }
    let tickets = [];
    if (Array.isArray(data.tickets) && data.tickets.length > 0) {
      tickets = data.tickets.map((t) => ({
        name: (t.name || "").toString().trim(),
        mobile: (t.mobile || "").toString().trim(),
        tower: (t.tower || "").toString().trim(),
        flat: (t.flat || "").toString().trim(),
        serialNumber: Number(t.serialNumber),
      }));
    } else {
      // Backward compatible: single name/mobile/tower/flat + serialNumbers array or serialNumber
      const name = (data.name || "").toString().trim();
      const mobile = (data.mobile || "").toString().trim();
      const tower = (data.tower || "").toString().trim();
      const flat = (data.flat || "").toString().trim();
      let serialNumbers = [];
      if (Array.isArray(data.serialNumbers)) {
        serialNumbers = data.serialNumbers.map(Number);
      } else if (data.serialNumber) {
        serialNumbers = [Number(data.serialNumber)];
      }
      tickets = serialNumbers.map((sn) => ({ name, mobile, tower, flat, serialNumber: sn }));
    }

    if (tickets.length === 0) {
      return jsonOut_({ ok: false, error: "At least one ticket with a Token Serial Number is required." });
    }

    for (const t of tickets) {
      if (!t.name || !t.mobile || !t.tower || !t.flat || !t.serialNumber) {
        return jsonOut_({ ok: false, error: "All fields are required on every ticket, including the Token Serial Number." });
      }
      if (!/^[0-9]{10}$/.test(t.mobile)) {
        return jsonOut_({ ok: false, error: "Enter a valid 10-digit mobile number on every ticket." });
      }
      if (t.serialNumber < LUCKY_SERIAL_START || t.serialNumber > LUCKY_SERIAL_END) {
        return jsonOut_({
          ok: false,
          error: "Serial number " + t.serialNumber + " must be between " + LUCKY_SERIAL_START + " and " + LUCKY_SERIAL_END + ".",
        });
      }
    }

    // De-duplicate serials within this submission
    const serialNumbers = tickets.map((t) => t.serialNumber);
    const uniqueSerials = new Set(serialNumbers);
    if (uniqueSerials.size !== serialNumbers.length) {
      return jsonOut_({ ok: false, error: "Duplicate serial number selected across tickets in this submission." });
    }

    const existing = readAllLuckyEntries_();
    const existingSerials = new Set(existing.map((s) => s.serialNumber));
    const clashes = serialNumbers.filter((sn) => existingSerials.has(sn));
    if (clashes.length > 0) {
      return jsonOut_({
        ok: false,
        error: "Token(s) #" + clashes.join(", #") + " have already been taken. Please choose different number(s).",
      });
    }

    let proofUrl = "";
    try {
      proofUrl = savePaymentProof_(paymentProof, serialNumbers.join("-"));
    } catch (proofErr) {
      proofUrl = "UPLOAD_FAILED: " + proofErr.message;
    }

    const sheet = getLuckySheet_();
    const now = new Date();
    // One row per ticket — each keeps its own name/mobile/tower/flat, all
    // sharing the same payment proof link, but with ITS OWN ticket image.
    Logger.log("ticketImages received: count=%s, tickets count=%s", ticketImages.length, tickets.length);
    tickets.forEach((t, idx) => {
      let ticketImgUrl = "";
      const imgDataUrl = ticketImages[idx];
      Logger.log("Ticket idx=%s serial=%s imgDataUrl length=%s startsWith=%s",
        idx, t.serialNumber,
        imgDataUrl ? imgDataUrl.length : 0,
        imgDataUrl ? imgDataUrl.substring(0, 30) : "(empty)");
      if (imgDataUrl) {
        try {
          ticketImgUrl = saveTicketImage_(imgDataUrl, t.serialNumber);
          Logger.log("saveTicketImage_ succeeded, url=%s", ticketImgUrl);
        } catch (imgErr) {
          ticketImgUrl = "UPLOAD_FAILED: " + imgErr.message;
          Logger.log("saveTicketImage_ THREW: %s", imgErr.message);
        }
      } else {
        Logger.log("imgDataUrl was falsy/empty for idx=%s — skipping save entirely.", idx);
      }
      sheet.appendRow([now, t.name, t.mobile, t.tower, t.flat, t.serialNumber, proofUrl, ticketImgUrl]);
    });

    return jsonOut_({ ok: true, message: tickets.length + " Lucky Draw token(s) booked successfully!" });
  } catch (err) {
    return jsonOut_({ ok: false, error: "Unexpected error: " + err.message });
  } finally {
    lock.releaseLock();
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
