const fs = require('fs');
const path = require('path');

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
    googleSheetUrl: 'https://docs.google.com/spreadsheets/d/13FmV77rpzxhgmR06W4qYnv2chhhfRpVZEY4KQgkSORg/edit?usp=sharing'
  };
}

function getCsvUrl(inputUrl) {
  if (!inputUrl || inputUrl === 'data.csv') return 'data.csv';
  const match = inputUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
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

function isUsakGenuine(usakStr) {
  if (!usakStr) return false;
  const upper = usakStr.trim().toUpperCase();
  if (upper.includes('NON')) return false;
  return upper === 'USAK' || upper.includes('GENUINE');
}

function isUreg(uregStr) {
  if (!uregStr) return false;
  return uregStr.trim().toUpperCase().includes('UREG');
}

function processRawCsv(csvText) {
  const rawRows = parseCsv(csvText);
  if (!rawRows || rawRows.length === 0) return {};

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

    if (!cif && !debitur && !namaMkaInput && !nipMkaInput) return;

    if (namaMkaInput && namaMkaInput.length > 0) {
      currentNamaMka = namaMkaInput;
    }
    if (nipMkaInput && nipMkaInput.length > 0) {
      currentNipMka = nipMkaInput;
    }

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

  return {
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

    const response = await fetch(csvTarget);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csvText = await response.text();
    const parsed = processRawCsv(csvText);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Error fetching CSV:', err);
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
