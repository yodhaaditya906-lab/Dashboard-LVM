const fs = require('fs');
const path = require('path');
const https = require('https');

const CONFIG_FILE = path.join(process.cwd(), 'config.json');

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
  if (!rawRows || rawRows.length === 0) return {};

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

    if (kodeUnitInput && kodeUnitInput.length > 0) {
      currentKodeUnit = kodeUnitInput;
    }
    if (namaMkaInput && namaMkaInput.length > 0) {
      currentNamaMka = namaMkaInput;
    }
    if (namaSgpInput && namaSgpInput.length > 0) {
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

    // Kode Unit Aggregation
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

const http = require('http');

function fetchHttpsText(targetUrl) {
  return new Promise((resolve, reject) => {
    const request = (urlStr) => {
      const lib = urlStr.startsWith('https') ? https : http;
      lib.get(urlStr, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirectUrl = res.headers.location;
          if (redirectUrl.startsWith('/')) {
            const parsed = new URL(urlStr);
            redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
          }
          return request(redirectUrl);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(body));
      }).on('error', reject);
    };
    request(targetUrl);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  const config = getConfig();
  const csvTarget = getCsvUrl(config.googleSheetUrl);

  try {
    if (!csvTarget.startsWith('http')) {
      const localPath = path.join(process.cwd(), 'data.csv');
      const localCsv = fs.readFileSync(localPath, 'utf8');
      const parsed = processRawCsv(localCsv);
      return res.status(200).json(parsed);
    }

    const csvText = await fetchHttpsText(csvTarget);
    const parsed = processRawCsv(csvText);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Error fetching CSV from remote:', err.message);
    try {
      const localPath = path.join(process.cwd(), 'data.csv');
      const localCsv = fs.readFileSync(localPath, 'utf8');
      const parsed = processRawCsv(localCsv);
      return res.status(200).json(parsed);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse data' });
    }
  }
};
module.exports.processRawCsv = processRawCsv;
