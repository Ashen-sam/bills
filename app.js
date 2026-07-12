/* ============================================
   Home Bills Tracker — shared logic
   Storage: JSONBin.io (https://jsonbin.io)
   ============================================ */

// Your JSONBin master key
const JSONBIN_MASTER_KEY = "$2a$10$xe4SYiix9sgX8LBMjFHEP.MseLoNsaQUJ56NM2oA8bmhJEkPawxZi";

// Fixed bin id — every device/browser reads and writes to this SAME bin,
// so your data stays in one place instead of a new bin being created
// every time you open the app on a different device.
const JSONBIN_BIN_ID = "6a532434f5f4af5e29831063";

const JSONBIN_API = "https://api.jsonbin.io/v3/b";

// Default monthly rent amount for the annex
const DEFAULT_RENT_AMOUNT = 35000;

// The shape of a brand new bin
function emptyStore(){
  return {
    electricity: [],
    water: [],
    telephone: [],
    rent: [],
    rentConfig: { amount: DEFAULT_RENT_AMOUNT }
  };
}

/* ---------- Read / write ---------- */
async function loadStore(){
  const res = await fetch(`${JSONBIN_API}/${JSONBIN_BIN_ID}/latest`, {
    headers: { "X-Master-Key": JSONBIN_MASTER_KEY }
  });
  if (!res.ok) throw new Error("Could not load your bills (" + res.status + ")");
  const json = await res.json();
  const record = json.record || emptyStore();
  // guard against missing keys on older bins
  record.electricity = record.electricity || [];
  record.water = record.water || [];
  record.telephone = record.telephone || [];
  record.rent = record.rent || [];
  record.rentConfig = record.rentConfig || { amount: DEFAULT_RENT_AMOUNT };
  return record;
}

async function saveStore(store){
  const res = await fetch(`${JSONBIN_API}/${JSONBIN_BIN_ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": JSONBIN_MASTER_KEY
    },
    body: JSON.stringify(store)
  });
  if (!res.ok) throw new Error("Could not save your bills (" + res.status + ")");
  return res.json();
}

/* ---------- Category-level helpers ---------- */
async function addBill(category, bill){
  const store = await loadStore();
  bill.id = "b_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  store[category].push(bill);
  await saveStore(store);
  return store[category];
}

async function deleteBill(category, id){
  const store = await loadStore();
  store[category] = store[category].filter(b => b.id !== id);
  await saveStore(store);
  return store[category];
}

/* ---------- Rent helpers ----------
   Rent is tracked one entry per calendar month (keyed by monthYear,
   e.g. "2026-07") rather than an open list like the utility bills,
   since there's exactly one rent payment expected per month. */
async function addRentPayment(entry){
  const store = await loadStore();
  // replace any existing entry for that month (lets you correct a mistake)
  store.rent = store.rent.filter(b => b.monthYear !== entry.monthYear);
  entry.id = "r_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  store.rent.push(entry);
  await saveStore(store);
  return store;
}

async function deleteRentPayment(monthYear){
  const store = await loadStore();
  store.rent = store.rent.filter(b => b.monthYear !== monthYear);
  await saveStore(store);
  return store;
}

async function saveRentConfig(amount){
  const store = await loadStore();
  store.rentConfig = { amount: Number(amount) || DEFAULT_RENT_AMOUNT };
  await saveStore(store);
  return store;
}

/* ---------- Month math (used by the rent schedule) ---------- */
function monthDiff(a, b){
  // a, b are "YYYY-MM" strings. Returns b - a, in months.
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

function addMonthsToMonthStr(monthStr, n){
  const [y, m] = monthStr.split("-").map(Number);
  const idx = (y * 12 + (m - 1)) + n;
  const newY = Math.floor(idx / 12);
  const newM = (idx % 12) + 1;
  return `${newY}-${String(newM).padStart(2, "0")}`;
}

/* Builds the rolling month list for the rent schedule: always at
   least 12 months, and automatically extends further out as the
   current date approaches the end of the existing list, so the
   schedule never "runs out" of months to show. */
function getRentMonthList(startMonth){
  const currentMonth = new Date().toISOString().slice(0, 7);
  const diff = monthDiff(startMonth, currentMonth);
  const total = Math.max(12, diff + 7);
  const list = [];
  for (let i = 0; i < total; i++){
    list.push(addMonthsToMonthStr(startMonth, i));
  }
  return list;
}

/* ---------- Formatting ---------- */
function formatLKR(amount){
  const n = Number(amount) || 0;
  return "Rs. " + n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr){
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMonthYear(monthStr){
  // monthStr like "2026-07"
  if (!monthStr) return "—";
  const [y, m] = monthStr.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (isNaN(d)) return monthStr;
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function sortByDatePaidDesc(list){
  return [...list].sort((a, b) => (b.datePaid || "").localeCompare(a.datePaid || ""));
}

/* ---------- Lucide icon helper ----------
   Usage: iconTag("trash-2", "ic-16")  ->  <i data-lucide="trash-2" class="ic-16"></i>
   After inserting new icon tags into the DOM (e.g. via innerHTML),
   always call renderIcons() so Lucide swaps them for real SVGs. */
function iconTag(name, cls){
  return `<i data-lucide="${name}"${cls ? ` class="${cls}"` : ""}></i>`;
}

function renderIcons(){
  if (window.lucide && typeof window.lucide.createIcons === "function"){
    window.lucide.createIcons();
  }
}

/* ============================================
   SMS "auto-fill" parsing
   ----------------------------------------------
   iOS does not let any website read your SMS
   automatically — there is no such permission a
   browser/PWA can request. The realistic workaround:
   the user copies the payment-confirmation SMS text
   (Messages app -> long-press -> Copy) and pastes it
   here. We then pattern-match the amount and date out
   of that text so they don't have to type it manually.
   ============================================ */
function parseBillSms(text){
  if (!text || !text.trim()) return null;

  // Strip thousands separators so "5,500.00" -> "5500.00"
  const clean = text.replace(/,/g, "");

  // ---- Amount ----
  // Matches things like: "Rs. 5500.00", "LKR 5500", "Amount: 5500.00", "5500 LKR"
  let amount = null;
  let m = clean.match(/(?:rs\.?|lkr|amount(?:\s*paid)?)\s*[:\-]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
  if (!m) m = clean.match(/([0-9]+(?:\.[0-9]{1,2})?)\s*(?:rs\.?|lkr)/i);
  if (m) amount = parseFloat(m[1]);

  // ---- Date ----
  // Try a few common SMS date formats, in order of specificity
  let date = null;
  const months = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

  // 2026-07-12 or 2026/07/12
  if ((m = clean.match(/(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/))){
    date = `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
  }
  // 12-07-2026 or 12/07/2026
  else if ((m = clean.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/))){
    date = `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  }
  // 12 Jul 2026 / 12 July 2026
  else if ((m = clean.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\b/))){
    const mm = months[m[2].toLowerCase().slice(0,3)];
    if (mm) date = `${m[3]}-${String(mm).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  }
  // Jul 12, 2026 / July 12 2026
  else if ((m = clean.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(20\d{2})\b/))){
    const mm = months[m[1].toLowerCase().slice(0,3)];
    if (mm) date = `${m[3]}-${String(mm).padStart(2,"0")}-${String(m[2]).padStart(2,"0")}`;
  }

  return { amount, date };
}

/* Wires up a "Paste SMS -> auto-fill" box for a given form.
   Expects elements with ids: smsText, parseSmsBtn, parseResult,
   amountPaid, datePaid, monthYear (monthYear is optional). */
function wireSmsAutofill(){
  const btn = document.getElementById("parseSmsBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const text = document.getElementById("smsText").value;
    const result = parseBillSms(text);
    const resultEl = document.getElementById("parseResult");

    if (!result || (!result.amount && !result.date)){
      resultEl.textContent = "Couldn't find an amount or date in that text — please fill the fields in manually.";
      resultEl.className = "parse-result err";
      return;
    }

    if (result.amount != null){
      document.getElementById("amountPaid").value = result.amount;
    }
    if (result.date){
      document.getElementById("datePaid").value = result.date;
      const monthField = document.getElementById("monthYear");
      if (monthField) monthField.value = result.date.slice(0, 7);
    }

    const parts = [];
    if (result.amount != null) parts.push(formatLKR(result.amount));
    if (result.date) parts.push(formatDate(result.date));
    resultEl.textContent = "Filled in: " + parts.join(" · ");
    resultEl.className = "parse-result";
  });
}