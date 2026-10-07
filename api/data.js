const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const CONFIG_FILE = path.join(process.cwd(), 'config.json');
const LOCAL_CSV_FILE = path.join(process.cwd(), 'data.csv');
const LOCAL_CSV_SEPTEMBER = path.join(process.cwd(), 'data_september.csv');
const LOCAL_CSV_AGUSTUS = path.join(process.cwd(), 'data_agustus.csv');
const LOCAL_CSV_OKTOBER = path.join(process.cwd(), 'data_oktober.csv');

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
    googleSheetUrl: 'https://docs.google.com/spreadsheets/d/1p7YcnAdVNSZjYZ5oyu6hUmMNkyOlfVzSErJGe84lmfc/edit?usp=sharing'
  };
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
  if (!csvText) return [];
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
  if (upper.includes('NON')) return false;
  if (isUsakGenuine(statusStr)) return false;
  return true;
}

const INDO_MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function formatIndonesianDate(str, fallback = '-') {
  if (!str || str === '-' || str.trim() === '') return fallback;
  const s = str.trim();
  const parts = s.split(/[\/\-]/);
  if (parts.length === 3) {
    let d, m, y;
    if (parts[0].length === 4) {
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      d = parseInt(parts[2], 10);
    } else {
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      y = parseInt(parts[2], 10);
    }
    if (!isNaN(d) && m >= 0 && m < 12 && !isNaN(y)) {
      return `${d} ${INDO_MONTH_NAMES[m]} ${y}`;
    }
  }
  return s;
}

function processRawCsv(csvText, monthContext = '') {
  if (!csvText) return null;
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
    const taggingInput = getVal('tagging', 'tag', 'keterangan_pipeline', 'pipeline');
    const tanggalInput = getVal('tanggal', 'tgl', 'date', 'tgl_transaksi', 'tgl_update', 'tanggal_data', 'periode', 'tgl debitur');
    let fallbackTanggal = '-';
    const lowerContext = (monthContext || '').toLowerCase();
    if (lowerContext.includes('agus')) fallbackTanggal = '31 Agustus 2026';
    else if (lowerContext.includes('okt')) fallbackTanggal = '31 Oktober 2026';
    else if (lowerContext.includes('sep')) fallbackTanggal = '30 September 2026';
    else fallbackTanggal = '30 September 2026';

    const tanggal = formatIndonesianDate(tanggalInput, fallbackTanggal);
    const tagging = taggingInput || tanggal;

    if (!cif && !debitur && !kodeUnitInput && !namaSgpInput) return;

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
      tagging,
      tanggal: tagging,
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

function buildPayload(parsedSeptember, parsedAgustus, parsedOktober = null) {
  const masterUnitMap = {};
  const masterUnitList = [];
  const kodeUnitToMkaMap = {};

  if (parsedSeptember && parsedSeptember.unitList) {
    parsedSeptember.unitList.forEach(u => {
      if (!masterUnitMap[u.kodeUnit]) {
        masterUnitMap[u.kodeUnit] = u;
        masterUnitList.push(u);
      }
      kodeUnitToMkaMap[u.kodeUnit] = u.namaMka;
    });
  }

  if (parsedAgustus && parsedAgustus.unitList) {
    parsedAgustus.unitList.forEach(u => {
      if (!masterUnitMap[u.kodeUnit]) {
        masterUnitMap[u.kodeUnit] = u;
        masterUnitList.push(u);
      }
      if (!kodeUnitToMkaMap[u.kodeUnit]) {
        kodeUnitToMkaMap[u.kodeUnit] = u.namaMka;
      }
    });
  }

  if (parsedOktober && parsedOktober.unitList) {
    parsedOktober.unitList.forEach(u => {
      if (!masterUnitMap[u.kodeUnit]) {
        masterUnitMap[u.kodeUnit] = u;
        masterUnitList.push(u);
      }
      if (!kodeUnitToMkaMap[u.kodeUnit]) {
        kodeUnitToMkaMap[u.kodeUnit] = u.namaMka;
      }
    });
  }

  return {
    lastUpdated: new Date().toISOString(),
    // September
    debiturDataSeptember: parsedSeptember ? parsedSeptember.debiturData : [],
    mkaRanksSeptember: parsedSeptember ? parsedSeptember.mkaRanks : [],
    totalUsakGenuineSeptember: parsedSeptember ? parsedSeptember.totalUsakGenuine : 0,
    totalUregSeptember: parsedSeptember ? parsedSeptember.totalUreg : 0,

    // Agustus
    debiturDataAgustus: parsedAgustus ? parsedAgustus.debiturData : [],
    mkaRanksAgustus: parsedAgustus ? parsedAgustus.mkaRanks : [],
    totalUsakGenuineAgustus: parsedAgustus ? parsedAgustus.totalUsakGenuine : 0,
    totalUregAgustus: parsedAgustus ? parsedAgustus.totalUreg : 0,

    // Oktober
    debiturDataOktober: parsedOktober ? parsedOktober.debiturData : [],
    mkaRanksOktober: parsedOktober ? parsedOktober.mkaRanks : [],
    totalUsakGenuineOktober: parsedOktober ? parsedOktober.totalUsakGenuine : 0,
    totalUregOktober: parsedOktober ? parsedOktober.totalUreg : 0,
    hasOktober: Boolean(parsedOktober && parsedOktober.debiturData && parsedOktober.debiturData.length > 0),

    // Fallbacks
    debiturData: parsedSeptember ? parsedSeptember.debiturData : [],
    mkaRanks: parsedSeptember ? parsedSeptember.mkaRanks : [],
    totalUsakGenuine: parsedSeptember ? parsedSeptember.totalUsakGenuine : 0,
    totalUreg: parsedSeptember ? parsedSeptember.totalUreg : 0,

    unitList: masterUnitList,
    kodeUnitToMkaMap
  };
}

async function fetchDualMonthData() {
  const docId = '1p7YcnAdVNSZjYZ5oyu6hUmMNkyOlfVzSErJGe84lmfc';
  // Data Master September (gid: 1977494811) and Data Master Agustus (gid: 2105617517)
  const urlSeptember = `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv&gid=1977494811`;
  const urlAgustus = `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv&gid=2105617517`;

  const [csvSeptember, csvAgustus, csvOktober] = await Promise.all([
    fetchHttpsText(urlSeptember, 30000).catch(err => {
      console.warn('Error fetching September sheet:', err.message);
      return fs.existsSync(LOCAL_CSV_SEPTEMBER) ? fs.readFileSync(LOCAL_CSV_SEPTEMBER, 'utf8') : '';
    }),
    fetchHttpsText(urlAgustus, 30000).catch(err => {
      console.warn('Error fetching Agustus sheet:', err.message);
      return fs.existsSync(LOCAL_CSV_AGUSTUS) ? fs.readFileSync(LOCAL_CSV_AGUSTUS, 'utf8') : '';
    }),
    fs.existsSync(LOCAL_CSV_OKTOBER)
      ? Promise.resolve(fs.readFileSync(LOCAL_CSV_OKTOBER, 'utf8'))
      : Promise.resolve('')
  ]);

  if (csvSeptember) {
    fs.writeFile(LOCAL_CSV_SEPTEMBER, csvSeptember, 'utf8', () => {});
    fs.writeFile(LOCAL_CSV_FILE, csvSeptember, 'utf8', () => {});
  }
  if (csvAgustus) {
    fs.writeFile(LOCAL_CSV_AGUSTUS, csvAgustus, 'utf8', () => {});
  }

  const parsedSeptember = processRawCsv(csvSeptember, 'september');
  const parsedAgustus = processRawCsv(csvAgustus, 'agustus');
  const parsedOktober = csvOktober ? processRawCsv(csvOktober, 'oktober') : null;

  return buildPayload(parsedSeptember, parsedAgustus, parsedOktober);
}

function loadLocalCache() {
  try {
    let csvSep = '';
    let csvAgus = '';
    let csvOkt = '';

    if (fs.existsSync(LOCAL_CSV_SEPTEMBER)) {
      csvSep = fs.readFileSync(LOCAL_CSV_SEPTEMBER, 'utf8');
    } else if (fs.existsSync(LOCAL_CSV_FILE)) {
      csvSep = fs.readFileSync(LOCAL_CSV_FILE, 'utf8');
    }

    if (fs.existsSync(LOCAL_CSV_AGUSTUS)) {
      csvAgus = fs.readFileSync(LOCAL_CSV_AGUSTUS, 'utf8');
    }

    if (fs.existsSync(LOCAL_CSV_OKTOBER)) {
      csvOkt = fs.readFileSync(LOCAL_CSV_OKTOBER, 'utf8');
    }

    if (csvSep || csvAgus || csvOkt) {
      const parsedSep = processRawCsv(csvSep, 'september');
      const parsedAgus = processRawCsv(csvAgus, 'agustus');
      const parsedOkt = csvOkt ? processRawCsv(csvOkt, 'oktober') : null;
      const payload = buildPayload(parsedSep, parsedAgus, parsedOkt);
      inMemoryCache = payload;
      return payload;
    }
  } catch (e) {
    console.error('Error reading local cache:', e);
  }
  return null;
}

function triggerBackgroundSync() {
  if (isSyncing) return;
  const now = Date.now();
  if (now - lastSyncTime < CACHE_TTL_MS) return;

  isSyncing = true;
  fetchDualMonthData()
    .then(payload => {
      if (payload && (payload.debiturDataSeptember.length > 0 || payload.debiturDataAgustus.length > 0)) {
        inMemoryCache = payload;
        lastSyncTime = Date.now();
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
  if (inMemoryCache && (inMemoryCache.debiturDataSeptember.length > 0 || inMemoryCache.debiturData.length > 0)) {
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
  try {
    const payload = await fetchDualMonthData();
    if (payload) {
      inMemoryCache = payload;
      lastSyncTime = Date.now();
      return sendJsonResponse(res, 200, payload);
    }
  } catch (err) {
    console.error('Cold fetch error:', err.message);
  }

  return sendJsonResponse(res, 500, { error: 'Failed to load data' });
};
module.exports.processRawCsv = processRawCsv;
