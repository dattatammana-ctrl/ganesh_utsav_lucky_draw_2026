// Standalone config for the Small Laddu Lucky Draw site.
// This is fully independent from any other event/site.

// Paste your deployed Google Apps Script Web App URL here after deployment.
const API_URL = "https://script.google.com/macros/s/AKfycbzkYkFtMk6lXSKnKcb2UKyN6fMHbWpXSkPE79qvsXEIzCbtUMxvedZXNcjBHmeeY_Qh/exec";

// UPI payment settings
const UPI_ID = "8884501914@icici";
const UPI_PAYEE_NAME = "Pradeep Kumar Associates";
const UPI_AMOUNT = "100";

// Lucky Draw serial number range
const LUCKY_SERIAL_START = 501;
const LUCKY_SERIAL_END = 1000;

// Committee/admin dashboard password — MUST match ADMIN_PASSWORD in
// apps-script/Code.gs (doGet -> action==="admin"). Change both together.
const ADMIN_PASSWORD = "Ganesh2026";
