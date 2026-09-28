const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const CONFIG_FILE = path.join(process.cwd(), 'config.json');
const LOCAL_CSV_FILE = path.join(process.cwd(), 'data.csv');

let inMemoryCache = null;
let lastSyncTime = 0;
let isSyncing = false;
const CACHE_TTL_MS = 30000; // 30 seconds TTL

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading config.json:', e);
  }
  return {
    googleSheetUrl: 'https://docs.google.com/spreadsheets/d/1p7YcnAdVNSZjYZ5oyu6hUmMNkyOlfVzSErJGe84lmfc/edit?usp=sharing',
    sheetName: 'Detail Debitur'
  };
}

function getCsvUrl(inputUrl) {
  if (!inputUrl || inputUrl === 'data.csv') return 'data.csv';
  const match = inputUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&sheet=Detail%20Debitur`;
  }
  if (inputUrl.includes('pub?output=csv')) return inputUrl;
  return inputUrl;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.replace(/^"|"$/g, ''));
  return result;
}

function parseCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0) continue;

    const rowObj = {};
    headers.forEach((h, idx) => {
      const cleanHeader = h.trim().toLowerCase();
      rowObj[cleanHeader] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    rows.push(rowObj);
  }
  return rows;
}

function isUsakGenuine(statusStr) {
  if (!statusStr) return false;
  const upper = statusStr.trim().toUpperCase();
  if (upper.includes('NON')) return false;
  return upper.includes('USAK') || upper.includes('GENUINE');
}

function isUreg(statusStr) {
  if (!statusStr) return false;
  const upper = statusStr.trim().toUpperCase();
  return upper.includes('UREG') && !upper.includes('NON');
}

function processRawCsv(csvText) {
  const rawRows = parseCsv(csvText);
  if (!rawRows || rawRows.length === 0) return null;

  const debiturData = [];
  const unitMap = {};
  const kodeUnitToMkaMap = {};
  const unitList = [];
  const addedUnits = new Set();

  let genuineCount = 0;
  let uregCount = 0;

  let currentKodeUnit = '';
  let currentNamaMka = '';
  let currentNamaSgp = '';

  rawRows.forEach((row) => {
    const getVal = (...keys) => {
      for (let k of keys) {
        if (row[k.toLowerCase()] !== undefined) return row[k.toLowerCase()].trim();
      }
      return '';
    };

    const kodeUnitInput = getVal('kode unit', 'unit');
    const namaMkaInput = getVal('nama mka', 'mka');
    const namaSgpInput = getVal('nama sgp', 'sgp');
    const cif = getVal('cif', 'kode_cif');
    const debitur = getVal('nama debitur', 'debitur', 'nama');
    const rekening = getVal('rekening', 'no_rekening', 'rek');
    const transaksi = parseInt(getVal('transaksi', 'frekuensi_30days', 'frek_30days', 'frek')) || 0;
    const salesVolume = parseInt(getVal('sales volume', 'sv_30days', 'sv', 'volume')) || 0;
    const status = getVal('status', 'ureg_lvm', 'usak_lvm') || 'NON UREG';

    if (!cif && !debitur && !kodeUnitInput && !namaSgpInput) return;

    // HIERARCHICAL FORWARD-FILL BLOCK RULE:
    // Reset child context (MKA & SGP) whenever a parent block (Kode Unit) changes!
    if (kodeUnitInput && kodeUnitInput.length > 0) {
      currentKodeUnit = kodeUnitInput;
      currentNamaMka = namaMkaInput || '';
      currentNamaSgp = namaSgpInput || '';
    } else if (namaMkaInput && namaMkaInput.length > 0) {
      currentNamaMka = namaMkaInput;
      currentNamaSgp = namaSgpInput || '';
    } else if (namaSgpInput && namaSgpInput.length > 0) {
      currentNamaSgp = namaSgpInput;
    }

    if (currentKodeUnit) {
      kodeUnitToMkaMap[currentKodeUnit] = currentNamaMka || currentKodeUnit;
      if (!addedUnits.has(currentKodeUnit)) {
        addedUnits.add(currentKodeUnit);
        unitList.push({
          kodeUnit: currentKodeUnit,
          namaMka: currentNamaMka || currentKodeUnit
        });
      }
    }

    const isGenuine = isUsakGenuine(status);
    if (isGenuine) genuineCount++;
    if (isUreg(status)) uregCount++;

    let rowStyle = 'row-dark';
    if (debiturData.length % 3 === 1) rowStyle = 'row-dark-blue';
    if (debiturData.length % 3 === 2) rowStyle = 'row-bright-blue';

    debiturData.push({
      no: debiturData.length + 1,
      kodeUnit: currentKodeUnit,
      namaMka: currentNamaMka,
      sgp: currentNamaSgp || 'UNASSIGNED',
      cif,
      debitur,
      rekening: rekening || '-',
      transaksi,
      salesVolume,
      status,
      isGenuine,
      rowStyle
    });

    const unitKey = currentKodeUnit || 'UNASSIGNED';
    if (unitKey !== 'UNASSIGNED') {
      if (!unitMap[unitKey]) {
        unitMap[unitKey] = {
          kodeUnit: unitKey,
          name: currentNamaMka ? `${unitKey} - ${currentNamaMka}` : unitKey,
          namaMka: currentNamaMka,
          usakCount: 0
        };
      }
      if (isGenuine) {
        unitMap[unitKey].usakCount += 1;
      }
    }
  });

  const unitRankList = Object.values(unitMap);
  unitRankList.sort((a, b) => b.usakCount - a.usakCount);
  const mkaRanks = unitRankList.map((item, idx) => ({
    rank: idx + 1,
    kodeUnit: item.kodeUnit,
    name: item.name,
    namaMka: item.namaMka,
    usakCount: item.usakCount
  }));

  return {
    lastUpdated: new Date().toISOString(),
    debiturData,
    mkaRanks,
    unitList,
    kodeUnitToMkaMap,
    totalUsakGenuine: genuineCount,
    totalUreg: uregCount
  };
}

function fetchHttpsText(targetUrl, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let timer;
    const request = (urlStr) => {
      let parsed;
      try {
        parsed = new URL(urlStr);
      } catch (e) {
        return reject(e);
      }
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.get(urlStr, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirectUrl = res.headers.location;
          if (redirectUrl.startsWith('/')) {
            redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
          }
          return request(redirectUrl);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (timer) clearTimeout(timer);
          resolve(body);
        });
      });
      req.on('error', (err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      });
      timer = setTimeout(() => {
        req.destroy();
        reject(new Error('Fetch timeout'));
      }, timeoutMs);
    };
    request(targetUrl);
  });
}

function loadLocalCache() {
  try {
    if (fs.existsSync(LOCAL_CSV_FILE)) {
      const localCsv = fs.readFileSync(LOCAL_CSV_FILE, 'utf8');
      const parsed = processRawCsv(localCsv);
      if (parsed && parsed.debiturData && parsed.debiturData.length > 0) {
        inMemoryCache = parsed;
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading local data.csv cache:', e);
  }
  return null;
}

function triggerBackgroundSync() {
  if (isSyncing) return;
  const now = Date.now();
  if (now - lastSyncTime < CACHE_TTL_MS) return;

  isSyncing = true;
  const config = getConfig();
  const csvTarget = getCsvUrl(config.googleSheetUrl);

  if (!csvTarget.startsWith('http')) {
    isSyncing = false;
    return;
  }

  fetchHttpsText(csvTarget, 10000)
    .then(csvText => {
      const parsed = processRawCsv(csvText);
      if (parsed && parsed.debiturData && parsed.debiturData.length > 0) {
        inMemoryCache = parsed;
        lastSyncTime = Date.now();
        fs.writeFile(LOCAL_CSV_FILE, csvText, 'utf8', () => {});
      }
    })
    .catch(err => {
      console.warn('Background sync warning (using cached data):', err.message);
    })
    .finally(() => {
      isSyncing = false;
    });
}

function sendJsonResponse(res, statusCode, data) {
  if (typeof res.status === 'function') {
    return res.status(statusCode).json(data);
  }
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=15, stale-while-revalidate=30'
  });
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  if (typeof res.setHeader === 'function') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
  }

  // 1. If memory cache is available, serve immediately (0ms)
  if (inMemoryCache && inMemoryCache.debiturData && inMemoryCache.debiturData.length > 0) {
    triggerBackgroundSync();
    return sendJsonResponse(res, 200, inMemoryCache);
  }

  // 2. Otherwise load local file cache (3ms)
  const localData = loadLocalCache();
  if (localData) {
    triggerBackgroundSync();
    return sendJsonResponse(res, 200, localData);
  }

  // 3. Cold start: fetch remote synchronously with timeout
  const config = getConfig();
  const csvTarget = getCsvUrl(config.googleSheetUrl);

  try {
    const csvText = await fetchHttpsText(csvTarget, 8000);
    const parsed = processRawCsv(csvText);
    if (parsed) {
      inMemoryCache = parsed;
      lastSyncTime = Date.now();
      fs.writeFile(LOCAL_CSV_FILE, csvText, 'utf8', () => {});
      return sendJsonResponse(res, 200, parsed);
    }
  } catch (err) {
    console.error('Cold fetch error:', err.message);
  }

  return sendJsonResponse(res, 500, { error: 'Failed to load data' });
};
module.exports.processRawCsv = processRawCsv;
