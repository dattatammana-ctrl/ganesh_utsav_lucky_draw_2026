// Small Laddu Lucky Draw — standalone Admin (Committee) dashboard
// Reads submissions from the "LuckyDraw" Google Sheet tab via the same
// Apps Script backend (?action=admin&password=...).

let allEntries = [];
let currentPassword = "";
const LUCKY_TOTAL_TOKENS = LUCKY_SERIAL_END - LUCKY_SERIAL_START + 1; // 500

function el(id) { return document.getElementById(id); }

el("loginBtn").addEventListener("click", login);
el("adminPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});

async function login() {
  const password = el("adminPassword").value.trim();
  const loginStatus = el("loginStatus");
  loginStatus.className = "status-msg";

  if (!password) {
    loginStatus.className = "status-msg error";
    loginStatus.textContent = "Please enter the committee password.";
    return;
  }

  el("loginBtn").disabled = true;
  el("loginBtn").textContent = "Checking...";

  try {
    const res = await fetch(API_URL + "?action=admin&password=" + encodeURIComponent(password));
    const data = await res.json();

    if (data.ok) {
      currentPassword = password;
      allEntries = data.entries || [];
      el("loginCard").style.display = "none";
      el("dashboard").style.display = "block";
      renderDashboard();
    } else {
      loginStatus.className = "status-msg error";
      loginStatus.textContent = data.error || "Invalid password.";
    }
  } catch (err) {
    loginStatus.className = "status-msg error";
    loginStatus.textContent = "Network error. Please check the API_URL in config.js and try again.";
  } finally {
    el("loginBtn").disabled = false;
    el("loginBtn").textContent = "View Submissions";
  }
}

async function refreshData() {
  if (!currentPassword) return;
  el("refreshBtn").textContent = "Refreshing...";
  try {
    const res = await fetch(API_URL + "?action=admin&password=" + encodeURIComponent(currentPassword));
    const data = await res.json();
    if (data.ok) {
      allEntries = data.entries || [];
      renderDashboard();
    }
  } catch (err) {
    console.error(err);
  } finally {
    el("refreshBtn").textContent = "↻ Refresh Data";
  }
}

el("refreshBtn").addEventListener("click", refreshData);
el("searchBox").addEventListener("input", renderDashboard);
el("exportBtn").addEventListener("click", exportCsv);

function renderDashboard() {
  const query = (el("searchBox").value || "").toLowerCase();

  const filtered = allEntries.filter((s) => {
    if (!query) return true;
    return (
      String(s.name).toLowerCase().includes(query) ||
      String(s.mobile).toLowerCase().includes(query) ||
      String(s.tower).toLowerCase().includes(query) ||
      String(s.flat).toLowerCase().includes(query) ||
      String(s.serialNumber).includes(query)
    );
  });

  const bookedCount = allEntries.length;
  el("statBooked").textContent = bookedCount;
  el("statRemaining").textContent = Math.max(LUCKY_TOTAL_TOKENS - bookedCount, 0);
  el("statResidents").textContent = new Set(
    allEntries.map((s) => String(s.name).trim().toLowerCase() + "|" + String(s.mobile).trim())
  ).size;
  el("statRevenue").textContent = "₹" + (bookedCount * Number(UPI_AMOUNT || 100));

  const tbody = el("adminTableBody");
  tbody.innerHTML = "";

  filtered
    .slice()
    .sort((a, b) => a.serialNumber - b.serialNumber)
    .forEach((s, idx) => {
      const tr = document.createElement("tr");
      const ts = s.timestamp ? new Date(s.timestamp).toLocaleString() : "";
      const proofCell = s.paymentProofUrl
        ? (s.paymentProofUrl.startsWith("UPLOAD_FAILED")
            ? '<span style="color:#b5121b;">Upload failed</span>'
            : '<a href="' + escapeAttr(s.paymentProofUrl) + '" target="_blank" rel="noopener">' +
              '<img src="' + escapeAttr(toThumbUrl(s.paymentProofUrl)) + '" alt="Payment proof" class="proof-thumb" /></a>')
        : "&mdash;";
      const ticketCell = s.ticketImageUrl
        ? (s.ticketImageUrl.startsWith("UPLOAD_FAILED")
            ? '<span style="color:#b5121b;">Upload failed</span>'
            : '<a href="' + escapeAttr(s.ticketImageUrl) + '" target="_blank" rel="noopener">' +
              '<img src="' + escapeAttr(toThumbUrl(s.ticketImageUrl)) + '" alt="Ticket image" class="proof-thumb" /></a>')
        : "&mdash;";
      tr.innerHTML =
        "<td>" + (idx + 1) + "</td>" +
        "<td>" + ts + "</td>" +
        "<td>" + escapeHtml(s.name) + "</td>" +
        "<td>" + escapeHtml(s.mobile) + "</td>" +
        "<td>" + escapeHtml(s.tower) + "</td>" +
        "<td>" + escapeHtml(s.flat) + "</td>" +
        "<td>#" + String(s.serialNumber).padStart(4, "0") + "</td>" +
        "<td>" + proofCell + "</td>" +
        "<td>" + ticketCell + "</td>";
      tbody.appendChild(tr);
    });
}

function exportCsv() {
  if (!allEntries.length) return;
  const headers = ["Timestamp", "Name", "Mobile", "Tower", "Flat", "SerialNumber", "PaymentProofUrl", "TicketImageUrl"];
  const rows = allEntries
    .slice()
    .sort((a, b) => a.serialNumber - b.serialNumber)
    .map((s) => [
      s.timestamp ? new Date(s.timestamp).toLocaleString() : "",
      s.name, s.mobile, s.tower, s.flat, s.serialNumber, s.paymentProofUrl || "", s.ticketImageUrl || "",
    ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "LuckyDraw_Submissions_" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}

// Converts a Google Drive "view" URL (https://drive.google.com/file/d/FILE_ID/view?...)
// into a direct thumbnail image URL so the payment screenshot can be shown
// inline in the table instead of just a text link.
function toThumbUrl(driveUrl) {
  const match = String(driveUrl).match(/\/file\/d\/([^/]+)/);
  if (match && match[1]) {
    return "https://drive.google.com/thumbnail?id=" + match[1] + "&sz=w200";
  }
  return driveUrl; // fallback: not a recognizable Drive URL, use as-is
}
