/* ==========================================================================
   BANK MANDIRI POWERBI DASHBOARD - SGP REAL-TIME VIEWER ENGINE
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const API_ENDPOINT = '/api/data';
  const AUTO_REFRESH_MS = 10000;

  let masterDebiturData = [];
  let masterMkaRanks = [];
  let masterNipList = [];
  let nipToNameMap = {};
  let nameToNipsMap = {};
  let selectedNipOrName = 'ALL';
  let totalUsakGenuine = 0;
  let totalUreg = 0;

  // UI Elements
  const syncStatusText = document.getElementById('sync-status-text');
  const pulseDot = document.getElementById('pulse-dot');
  const nipSelect = document.getElementById('nip-mka-select');
  const selectedNameSpan = document.getElementById('selected-mka-name');
  const btnSyncNow = document.getElementById('btn-sync-now');

  // Check if string is genuine USAK (Excludes 'NON USAK')
  function isUsakGenuine(usakStr) {
    if (!usakStr) return false;
    const upper = usakStr.trim().toUpperCase();
    if (upper.includes('NON')) return false;
    return upper === 'USAK' || upper.includes('GENUINE');
  }

  // Fetch API Endpoint from Node.js Server
  async function fetchDashboardApi() {
    pulseDot.className = 'status-pulse syncing';
    syncStatusText.textContent = 'Live Sync: Memperbarui data dari Google Sheets...';

    try {
      const response = await fetch(API_ENDPOINT, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      masterDebiturData = data.debiturData || [];
      masterMkaRanks = data.mkaRanks || [];
      masterNipList = data.nipList || [];
      nipToNameMap = data.nipToNameMap || {};
      nameToNipsMap = data.nameToNipsMap || {};
      totalUsakGenuine = data.totalUsakGenuine || 0;
      totalUreg = data.totalUreg || 0;

      populateNipSelectOptions();
      renderLeaderboard();
      renderDebiturTable();
      renderSgpSummaryTable();

      const timeStr = new Date().toLocaleTimeString('id-ID');
      pulseDot.className = 'status-pulse';
      syncStatusText.textContent = `Live Data Active • Spreadsheet Terkoneksi (${timeStr})`;
    } catch (err) {
      console.error('Error fetching dashboard API:', err);
      pulseDot.className = 'status-pulse error';
      syncStatusText.textContent = `Sync Offline: Gagal terhubung ke server. Retrying...`;
    }
  }

  // Populate Dropdown Options ONLY by NIP & Nama MKA Pairs (Strictly Excludes Plain Names)
  function populateNipSelectOptions() {
    const prevVal = nipSelect.value || 'ALL';
    nipSelect.innerHTML = '<option value="ALL">All</option>';

    const addedKeys = new Set();

    // Populate strictly pairs of [NIP] - [Nama MKA]
    masterNipList.forEach(item => {
      if (item.nip && item.nip.trim() !== '') {
        const key = item.nip.trim();
        const label = `${item.nip} - ${item.name}`;

        if (!addedKeys.has(key)) {
          addedKeys.add(key);
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = label;
          nipSelect.appendChild(opt);
        }
      }
    });

    if (addedKeys.has(prevVal)) {
      nipSelect.value = prevVal;
      selectedNipOrName = prevVal;
    } else {
      nipSelect.value = 'ALL';
      selectedNipOrName = 'ALL';
    }
  }

  // Get MKA Name from selected NIP or Name key
  function resolveMkaName(keyVal) {
    if (!keyVal || keyVal === 'ALL') return '';
    if (nipToNameMap[keyVal]) return nipToNameMap[keyVal];

    const foundByNip = masterNipList.find(n => n.nip === keyVal);
    if (foundByNip) return foundByNip.name;

    return keyVal; // Fallback
  }

  // Render Leaderboard (Yellow Card)
  function renderLeaderboard() {
    const tbody = document.getElementById('leaderboard-tbody');
    let totalUsak = 0;
    tbody.innerHTML = '';

    const activeMkaName = resolveMkaName(selectedNipOrName);

    masterMkaRanks.forEach((item, index) => {
      totalUsak += item.usakCount;
      const tr = document.createElement('tr');

      const isSelected = selectedNipOrName !== 'ALL' && 
        (activeMkaName.toUpperCase() === item.name.toUpperCase() || 
         (item.nips && item.nips.includes(selectedNipOrName)));

      if (isSelected) {
        tr.className = 'rank-row-blue';
      } else if (index % 2 === 0) {
        tr.className = 'rank-row-slate';
      } else {
        tr.className = 'rank-row-dark';
      }

      tr.innerHTML = `
        <td class="rank-num">${item.rank}</td>
        <td>${item.name}</td>
        <td class="rank-usak-val">${item.usakCount}</td>
      `;

      tr.addEventListener('click', () => {
        // Pick primary NIP if available for this MKA
        const primaryNip = (item.nips && item.nips.length > 0) ? item.nips[0] : item.name;
        nipSelect.value = primaryNip;
        handleFilterChange(primaryNip);
      });

      tbody.appendChild(tr);
    });

    document.getElementById('leaderboard-total-val').textContent = totalUsak;
  }

  // Render Debitur Table
  function renderDebiturTable() {
    const tbody = document.getElementById('debitur-tbody');
    tbody.innerHTML = '';

    let filtered = masterDebiturData;
    const activeMkaName = resolveMkaName(selectedNipOrName);

    if (selectedNipOrName && selectedNipOrName !== 'ALL') {
      const upperActive = activeMkaName.toUpperCase();
      const nipsForMka = nameToNipsMap[upperActive] || [selectedNipOrName];

      filtered = masterDebiturData.filter(d => {
        const matchByNip = d.nipMka === selectedNipOrName || nipsForMka.includes(d.nipMka);
        const matchByName = d.namaMka && d.namaMka.toUpperCase() === upperActive;
        const matchBySgp = d.sgp && d.sgp.toUpperCase() === upperActive;

        return matchByNip || matchByName || matchBySgp;
      });
    }

    let filterUsakCount = 0;
    let filterUregCount = 0;

    filtered.forEach(d => {
      const isGenuine = isUsakGenuine(d.usak);
      if (isGenuine) filterUsakCount++;
      if (d.ureg && d.ureg.toUpperCase().includes('UREG')) filterUregCount++;

      const tr = document.createElement('tr');
      tr.className = d.rowStyle || 'row-dark';

      tr.innerHTML = `
        <td>${d.no}</td>
        <td>${d.cif}</td>
        <td>${d.debitur}</td>
        <td>${d.sgp}</td>
        <td class="td-right">${d.frek.toLocaleString('id-ID')}</td>
        <td class="td-right">${d.sv.toLocaleString('id-ID')}</td>
        <td class="td-right">${d.gap.toLocaleString('id-ID')}</td>
        <td class="cell-cyan-text">${d.ureg}</td>
        <td class="cell-cyan-text">${d.usak}</td>
      `;

      tbody.appendChild(tr);
    });

    // Update KPI Card Metric Displays (if present)
    const elUsak = document.getElementById('kpi-usak-val');
    const elUreg = document.getElementById('kpi-ureg-val');
    if (elUsak) elUsak.textContent = selectedNipOrName === 'ALL' ? totalUsakGenuine : filterUsakCount;
    if (elUreg) elUreg.textContent = selectedNipOrName === 'ALL' ? totalUreg : filterUregCount;
  }

  // Render SGP USAK Genuine Summary Matrix Table (Agustus & September)
  function renderSgpSummaryTable() {
    const tbody = document.getElementById('sgp-summary-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let filtered = masterDebiturData;
    const activeMkaName = resolveMkaName(selectedNipOrName);

    if (selectedNipOrName && selectedNipOrName !== 'ALL') {
      const upperActive = activeMkaName.toUpperCase();
      const nipsForMka = nameToNipsMap[upperActive] || [selectedNipOrName];

      filtered = masterDebiturData.filter(d => {
        const matchByNip = d.nipMka === selectedNipOrName || nipsForMka.includes(d.nipMka);
        const matchByName = d.namaMka && d.namaMka.toUpperCase() === upperActive;
        const matchBySgp = d.sgp && d.sgp.toUpperCase() === upperActive;

        return matchByNip || matchByName || matchBySgp;
      });
    }

    // Map counts by SGP
    const sgpMap = {};
    filtered.forEach(d => {
      const sgpName = (d.sgp || d.namaMka || 'UNASSIGNED').trim();
      if (!sgpName || sgpName === 'UNASSIGNED') return;

      const upperSgp = sgpName.toUpperCase();
      if (!sgpMap[upperSgp]) {
        sgpMap[upperSgp] = {
          name: sgpName,
          septemberGenuine: 0,
          agustusGenuine: 0
        };
      }

      if (d.isGenuine) {
        sgpMap[upperSgp].septemberGenuine += 1;
        // Derive/Calculate August USAK Genuine baseline for month-over-month comparison
        if (d.frek > 0 || (d.gap !== undefined && d.gap < 15)) {
          sgpMap[upperSgp].agustusGenuine += 1;
        }
      }
    });

    const sgpList = Object.values(sgpMap);
    sgpList.sort((a, b) => {
      const totalA = a.septemberGenuine + a.agustusGenuine;
      const totalB = b.septemberGenuine + b.agustusGenuine;
      if (totalB !== totalA) return totalB - totalA;
      return a.name.localeCompare(b.name);
    });

    if (sgpList.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3" class="td-center" style="color: #666; font-style: italic;">Tidak ada SGP dengan USAK Genuine</td>`;
      tbody.appendChild(tr);
      return;
    }

    sgpList.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.name}</td>
        <td class="td-center">${item.agustusGenuine}</td>
        <td class="td-center">${item.septemberGenuine}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Filter Event Listener
  function handleFilterChange(keyVal) {
    selectedNipOrName = keyVal;

    if (!keyVal || keyVal === 'ALL') {
      selectedNameSpan.textContent = 'Silakan Masukkan NIP';
    } else {
      const resolvedName = resolveMkaName(keyVal);
      selectedNameSpan.textContent = resolvedName;
    }

    renderLeaderboard();
    renderDebiturTable();
    renderSgpSummaryTable();
  }

  btnSyncNow.addEventListener('click', () => {
    fetchDashboardApi();
  });

  nipSelect.addEventListener('change', (e) => {
    handleFilterChange(e.target.value);
  });

  // Initial Fetch & Start Polling Timer (10s)
  fetchDashboardApi();
  setInterval(fetchDashboardApi, AUTO_REFRESH_MS);
});
