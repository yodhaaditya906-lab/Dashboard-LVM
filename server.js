const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8081;
const PUBLIC_DIR = __dirname;
const CONFIG_FILE = path.join(__dirname, 'config.json');

// In-Memory Cache
let cachedData = {
  lastUpdated: null,
  debiturData: [],
  mkaRanks: [],
  nipList: [],
  nipToNameMap: {},
  nameToNipsMap: {},
  totalUsakGenuine: 0,
  totalUreg: 0
};

// Helper: Read Config
function getConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading config.json:', e);
  }
  return {
    googleSheetUrl: 'data.csv',
    refreshIntervalSeconds: 10
  };
}

// Convert Google Sheet URL to CSV URL
function getCsvUrl(inputUrl) {
  if (!inputUrl || inputUrl === 'data.csv') return 'data.csv';
  const match = inputUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
  }
  if (inputUrl.includes('pub?output=csv')) return inputUrl;
  return inputUrl;
}

// CSV Parser
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

// Check if USAK Genuine (Excludes NON USAK)
function isUsakGenuine(usakStr) {
  if (!usakStr) return false;
  const upper = usakStr.trim().toUpperCase();
  if (upper.includes('NON')) return false;
  return upper === 'USAK' || upper.includes('GENUINE');
}

// Check if UREG
function isUreg(uregStr) {
  if (!uregStr) return false;
  return uregStr.trim().toUpperCase().includes('UREG');
}

// Fetch Google Sheets Data Server-Side
function fetchAndSyncGoogleSheets() {
  const config = getConfig();
  const csvTarget = getCsvUrl(config.googleSheetUrl);

  if (csvTarget === 'data.csv' || !csvTarget.startsWith('http')) {
    try {
      const localCsv = fs.readFileSync(path.join(__dirname, 'data.csv'), 'utf8');
      processRawCsv(localCsv);
    } catch (e) {
      console.error('Error reading local data.csv:', e);
    }
    return;
  }

  // Fetch over HTTPS
  https.get(csvTarget, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      https.get(res.headers.location, (redRes) => {
        let body = '';
        redRes.on('data', chunk => body += chunk);
        redRes.on('end', () => processRawCsv(body));
      }).on('error', err => console.error('Redirect fetch error:', err));
      return;
    }

    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => processRawCsv(body));
  }).on('error', (err) => {
    console.error('HTTPS fetch error for Google Sheets:', err.message);
    try {
      const localCsv = fs.readFileSync(path.join(__dirname, 'data.csv'), 'utf8');
      processRawCsv(localCsv);
    } catch (e) {}
  });
}

// Process Raw CSV Rows into Clean JSON Structure with Block Forward-Fill Logic
function processRawCsv(csvText) {
  const rawRows = parseCsv(csvText);
  if (!rawRows || rawRows.length === 0) return;

  const debiturData = [];
  const mkaMap = {};
  const nipToNameMap = {};
  const nameToNipsMap = {};
  const nipList = [];
  const addedNips = new Set();

  let genuineCount = 0;
  let uregCount = 0;

  let currentNamaMka = '';
  let currentNipMka = '';

  // Single-pass Block Parser with Forward-Filling
  rawRows.forEach((row) => {
    const getVal = (...keys) => {
      for (let k of keys) {
        if (row[k.toLowerCase()] !== undefined) return row[k.toLowerCase()].trim();
      }
      return '';
    };

    const cif = getVal('cif', 'kode_cif');
    const debitur = getVal('nama debitur', 'debitur', 'nama');
    const namaMkaInput = getVal('nama mka', 'mka');
    const nipMkaInput = getVal('nip mka', 'nip');

    // Skip empty trailing rows from Google Sheets
    if (!cif && !debitur && !namaMkaInput && !nipMkaInput) return;

    // FORWARD-FILL BLOCK RULE:
    // When a new Nama MKA appears, update currentNamaMka block context!
    if (namaMkaInput && namaMkaInput.length > 0) {
      currentNamaMka = namaMkaInput;
    }

    // When a new NIP MKA appears, update currentNipMka context!
    if (nipMkaInput && nipMkaInput.length > 0) {
      currentNipMka = nipMkaInput;
    }

    // Register NIP <-> MKA Name Relationship
    if (currentNamaMka && currentNipMka) {
      const upperName = currentNamaMka.toUpperCase();
      nipToNameMap[currentNipMka] = currentNamaMka;

      if (!nameToNipsMap[upperName]) {
        nameToNipsMap[upperName] = [];
      }
      if (!nameToNipsMap[upperName].includes(currentNipMka)) {
        nameToNipsMap[upperName].push(currentNipMka);
      }

      if (!addedNips.has(currentNipMka)) {
        addedNips.add(currentNipMka);
        nipList.push({ nip: currentNipMka, name: currentNamaMka });
      }
    }

    const no = parseInt(getVal('no', 'no.')) || (debiturData.length + 1);
    const sgp = getVal('nama sgp', 'sgp') || '';
    const frek = parseInt(getVal('frekuensi 30 hari', 'frek_30days', 'frek')) || 0;
    const sv = parseInt(getVal('sales volume 30 hari', 'sv_30days', 'sv')) || 0;
    const gap = parseInt(getVal('gap transaksi', 'gap')) || 0;
    const ureg = getVal('ureg lvm', 'ureg') || 'UREG';
    const usak = getVal('usak lvm', 'usak') || 'NON USAK';

    const isGenuine = isUsakGenuine(usak);
    if (isGenuine) genuineCount++;
    if (isUreg(ureg)) uregCount++;

    let rowStyle = 'row-dark';
    if (debiturData.length % 3 === 1) rowStyle = 'row-dark-blue';
    if (debiturData.length % 3 === 2) rowStyle = 'row-bright-blue';

    debiturData.push({
      no,
      nipMka: currentNipMka,
      namaMka: currentNamaMka,
      cif,
      debitur,
      sgp,
      frek,
      sv,
      gap,
      ureg,
      usak,
      isGenuine,
      rowStyle
    });

    // MKA Leaderboard Stats Aggregation (Grouped by MKA Name)
    const mkaKey = currentNamaMka || sgp || 'UNASSIGNED';
    if (mkaKey !== 'UNASSIGNED') {
      const upperKey = mkaKey.toUpperCase();
      if (!mkaMap[upperKey]) {
        mkaMap[upperKey] = {
          name: mkaKey,
          nips: nameToNipsMap[upperKey] || (currentNipMka ? [currentNipMka] : []),
          usakCount: 0
        };
      }
      if (currentNipMka && !mkaMap[upperKey].nips.includes(currentNipMka)) {
        mkaMap[upperKey].nips.push(currentNipMka);
      }
      if (isGenuine) {
        mkaMap[upperKey].usakCount += 1;
      }
    }
  });

  const mkaList = Object.values(mkaMap);
  mkaList.sort((a, b) => b.usakCount - a.usakCount);
  const mkaRanks = mkaList.map((item, idx) => ({
    rank: idx + 1,
    nips: item.nips,
    name: item.name,
    usakCount: item.usakCount
  }));

  cachedData = {
    lastUpdated: new Date().toISOString(),
    debiturData,
    mkaRanks,
    nipList,
    nipToNameMap,
    nameToNipsMap,
    totalUsakGenuine: genuineCount,
    totalUreg: uregCount
  };
}

// Initial Sync & Interval (10s)
fetchAndSyncGoogleSheets();
setInterval(fetchAndSyncGoogleSheets, 10000);

const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.csv': 'text/csv; charset=UTF-8'
};

const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(url.parse(req.url).pathname);

  // API Endpoint for Dashboard
  if (pathname === '/api/data') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify(cachedData));
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Mandiri Merchant Dashboard running at http://localhost:${PORT}/`);
  console.log(`📊 Live Google Sheets Server-Side Sync active from config.json`);
});
