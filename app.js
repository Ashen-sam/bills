/* ============================================
   Home Bills Tracker — shared logic
   Storage: JSONBin.io (https://jsonbin.io)
   ============================================ */

// Your JSONBin master key
const JSONBIN_MASTER_KEY = "$2a$10$xe4SYiix9sgX8LBMjFHEP.MseLoNsaQUJ56NM2oA8bmhJEkPawxZi";
const JSONBIN_API = "https://api.jsonbin.io/v3/b";

// The shape of a brand new bin
function emptyStore(){
  return { electricity: [], water: [], telephone: [] };
}

/* ---------- Bin bootstrap ---------- */
// A single JSONBin "bin" holds all three categories.
// The bin id is created once and remembered in localStorage.
async function getBinId(){
  let binId = localStorage.getItem("hbt_bin_id");
  if (binId) return binId;

  const res = await fetch(JSONBIN_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": JSONBIN_MASTER_KEY,
      "X-Bin-Name": "home-bills-tracker",
      "X-Bin-Private": "true"
    },
    body: JSON.stringify(emptyStore())
  });

  if (!res.ok) throw new Error("Could not create storage bin (" + res.status + ")");
  const json = await res.json();
  binId = json.metadata.id;
  localStorage.setItem("hbt_bin_id", binId);
  return binId;
}

/* ---------- Read / write ---------- */
async function loadStore(){
  const binId = await getBinId();
  const res = await fetch(`${JSONBIN_API}/${binId}/latest`, {
    headers: { "X-Master-Key": JSONBIN_MASTER_KEY }
  });
  if (!res.ok) throw new Error("Could not load your bills (" + res.status + ")");
  const json = await res.json();
  const record = json.record || emptyStore();
  // guard against missing keys on older bins
  record.electricity = record.electricity || [];
  record.water = record.water || [];
  record.telephone = record.telephone || [];
  return record;
}

async function saveStore(store){
  const binId = await getBinId();
  const res = await fetch(`${JSONBIN_API}/${binId}`, {
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