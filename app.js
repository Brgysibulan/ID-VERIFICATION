const API_URL = 'https://script.google.com/macros/s/AKfycbzFOY5ul78Q-VOrb_-eXUKjiQdFvv1bckhJ-GQL3EqEB87KgyYHbPTguIX8OepgWUUKkg/exec';

const $ = (id) => document.getElementById(id);
const searchForm = $('searchForm');
const controlInput = $('controlInput');
const scanBtn = $('scanBtn');
const scannerCard = $('scannerCard');
const closeScanner = $('closeScanner');
const scannerMessage = $('scannerMessage');
const resultCard = $('resultCard');
const statusBadge = $('statusBadge');
const resultTitle = $('resultTitle');
const resultMessage = $('resultMessage');
const details = $('details');
const verifyAnother = $('verifyAnother');

let scanner = null;
let scannerRunning = false;

function normalize(value) {
  return String(value ?? '').trim();
}

function parseDate(record) {
  const month = normalize(record['EXPIRATION DATE MONTH'] || record['EXPIRATION MONTH']);
  const day = normalize(record['EXPIRATION DATE DAY'] || record['EXPIRATION DAY']);
  const year = normalize(record['EXPIRATION DATE YEAR'] || record['EXPIRATION YEAR']);
  if (!month || !day || !year) return null;
  const months = {JANUARY:0,FEBRUARY:1,MARCH:2,APRIL:3,MAY:4,JUNE:5,JULY:6,AUGUST:7,SEPTEMBER:8,OCTOBER:9,NOVEMBER:10,DECEMBER:11};
  const m = months[month.toUpperCase()];
  if (m === undefined) return null;
  const d = new Date(Number(year), m, Number(day), 23, 59, 59);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getStatus(record) {
  const raw = normalize(record['STATUS']).toUpperCase();
  if (raw === 'INACTIVE') return 'inactive';
  const expiration = parseDate(record);
  if (expiration && expiration < new Date()) return 'expired';
  if (raw === 'ACTIVE') return 'active';
  return raw ? raw.toLowerCase() : 'invalid';
}

function showResult(data, requestedControl) {
  resultCard.classList.remove('hidden');
  const record = data.record || {};

  if (!data.verified) {
    statusBadge.className = 'status-badge status-invalid';
    statusBadge.textContent = 'INVALID ID';
    resultTitle.textContent = 'ID Not Found';
    resultMessage.textContent = `No record was found for control number ${requestedControl}.`;
    details.innerHTML = '';
    return;
  }

  const status = getStatus(record);
  const map = {
    active: ['status-active','VALID / VERIFIED','ID is active and verified.'],
    inactive: ['status-inactive','INACTIVE ID','This ID is currently marked inactive.'],
    expired: ['status-expired','EXPIRED ID','The expiration date has already passed.'],
    invalid: ['status-invalid','INVALID ID','The record status could not be verified.']
  };
  const [cls, label, message] = map[status] || map.invalid;
  statusBadge.className = `status-badge ${cls}`;
  statusBadge.textContent = label;
  resultTitle.textContent = 'Verification Result';
  resultMessage.textContent = message;

  const fields = [
    ['Control Number', record['CONTROL NUMBER']],
    ['Name', [record['FIRST NAME'],record['MIDDLE NAME'],record['SURE NAME'] || record['SURNAME']].filter(Boolean).join(' ')],
    ['Designation', record['DESIGNATION']],
    ['Date Acquired', [record['DATE ACQUIRED MONTH'],record['DATE ACQUIRED DAY'],record['DATE ACQUIRED YEAR']].filter(Boolean).join(' ')],
    ['Expiration Date', [record['EXPIRATION DATE MONTH'],record['EXPIRATION DATE DAY'],record['EXPIRATION DATE YEAR']].filter(Boolean).join(' ')],
    ['Database Status', record['STATUS']]
  ];
  details.innerHTML = fields.map(([label,value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(normalize(value) || '—')}</dd></div>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

async function verify(control) {
  const value = normalize(control);
  if (!value) return;
  resultCard.classList.remove('hidden');
  statusBadge.className = 'status-badge';
  statusBadge.textContent = 'CHECKING…';
  resultTitle.textContent = 'Verifying ID';
  resultMessage.textContent = 'Connecting to the official verification database…';
  details.innerHTML = '';

  try {
    const response = await fetch(`${API_URL}?control=${encodeURIComponent(value)}`, {cache:'no-store'});
    const data = await response.json();
    if (!data.success && !data.verified) throw new Error(data.message || 'Verification service error');
    showResult(data, value);
  } catch (error) {
    statusBadge.className = 'status-badge status-invalid';
    statusBadge.textContent = 'ERROR';
    resultTitle.textContent = 'Verification Unavailable';
    resultMessage.textContent = error.message || 'Please try again.';
    details.innerHTML = '';
  }
}

async function startScanner() {
  scannerCard.classList.remove('hidden');
  scannerMessage.textContent = 'Starting camera…';
  if (!window.Html5Qrcode) {
    scannerMessage.textContent = 'QR scanner library is still loading. Try again in a moment.';
    return;
  }
  scanner = scanner || new Html5Qrcode('reader');
  try {
    await scanner.start({facingMode:'environment'}, {fps:10,qrbox:{width:250,height:250}}, async (decodedText) => {
      if (!scannerRunning) return;
      scannerRunning = false;
      const value = extractControl(decodedText);
      await stopScanner();
      controlInput.value = value;
      await verify(value);
    }, () => {});
    scannerRunning = true;
    scannerMessage.textContent = 'Point the camera at the ID QR code.';
  } catch (error) {
    scannerMessage.textContent = 'Camera could not start. Check browser camera permission.';
  }
}

function extractControl(text) {
  try {
    const url = new URL(text);
    const control = url.searchParams.get('control');
    if (control) return control;
  } catch (_) {}
  return normalize(text);
}

async function stopScanner() {
  if (scanner && scannerRunning) {
    try { await scanner.stop(); } catch (_) {}
  }
  scannerRunning = false;
  scannerCard.classList.add('hidden');
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  verify(controlInput.value);
});
scanBtn.addEventListener('click', startScanner);
closeScanner.addEventListener('click', stopScanner);
verifyAnother.addEventListener('click', () => {
  resultCard.classList.add('hidden');
  controlInput.focus();
});

const initialControl = new URLSearchParams(location.search).get('control');
if (initialControl) {
  controlInput.value = initialControl;
  verify(initialControl);
}
