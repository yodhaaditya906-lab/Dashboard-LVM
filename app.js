/* ==========================================================================
   BANK MANDIRI POWERBI DASHBOARD - SGP REAL-TIME VIEWER ENGINE
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const API_ENDPOINT = '/api/data';
  const AUTO_REFRESH_MS = 10000;

  let masterDebiturData = [];
  let masterMkaRanks = [];
  let masterUnitList = [];
  let kodeUnitToMkaMap = {};
  let selectedKodeUnit = 'ALL';
  let totalUsakGenuine = 0;
  let totalUreg = 0;

  // UI Elements
  const syncStatusText = document.getElementById('sync-status-text');
  const pulseDot = document.getElementById('pulse-dot');
  const nipSelect = document.getElementById('nip-mka-select');
  const selectedNameSpan = document.getElementById('selected-mka-name');
  const btnSyncNow = document.getElementById('btn-sync-now');

  // Check if string is genuine USAK (Excludes 'NON USAK')
  function isUsakGenuine(statusStr) {
    if (!statusStr) return false;
    const upper = statusStr.trim().toUpperCase();
    if (upper.includes('NON')) return false;
    return upper.includes('USAK') || upper.includes('GENUINE');
  }

  // Fetch API Endpoint from Node.js Server
  async function fetchDashboardApi() {
    pulseDot.className = 'status-pulse syncing';
    syncStatusText.textContent = 'Live Sync: Memperbarui data dari Google Sheets...';

    try {
      const response = await fetch(API_ENDPOINT, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!data || !data.debiturData || data.debiturData.length === 0) {
        return;
      }

      masterDebiturData = data.debiturData;
      masterMkaRanks = data.mkaRanks || [];
      masterUnitList = data.unitList || [];
      kodeUnitToMkaMap = data.kodeUnitToMkaMap || {};
      totalUsakGenuine = data.totalUsakGenuine || 0;
      totalUreg = data.totalUreg || 0;

      populateKodeUnitSelectOptions();
      renderLeaderboard();
      renderDebiturTable();
      renderSgpSummaryTable();

      const timeStr = new Date().toLocaleTimeString('id-ID');
      pulseDot.className = 'status-pulse';
      syncStatusText.textContent = `Live Data Active • Spreadsheet Terkoneksi (${timeStr})`;
    } catch (err) {
      console.error('Error fetching dashboard API:', err);
      pulseDot.className = 'status-pulse error';
      syncStatusText.textContent = `Sync Offline: Menampilkan data lokal (${new Date().toLocaleTimeString('id-ID')})`;
    }
  }

  // Populate Dropdown Options by Kode Unit & Nama MKA Pairs
  function populateKodeUnitSelectOptions() {
    const prevVal = nipSelect.value || 'ALL';
    nipSelect.innerHTML = '<option value="ALL">All</option>';

    const addedKeys = new Set();

    masterUnitList.forEach(item => {
      if (item.kodeUnit && item.kodeUnit.trim() !== '') {
        const key = item.kodeUnit.trim();
        const label = item.namaMka ? `${item.kodeUnit} - ${item.namaMka}` : item.kodeUnit;

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
      selectedKodeUnit = prevVal;
    } else {
      nipSelect.value = 'ALL';
      selectedKodeUnit = 'ALL';
    }
  }

  // Resolve Kode Unit Name for Header Display
  function resolveKodeUnitName(keyVal) {
    if (!keyVal || keyVal === 'ALL') return '';
    if (kodeUnitToMkaMap[keyVal]) {
      return `${keyVal} - ${kodeUnitToMkaMap[keyVal]}`;
    }

    const found = masterUnitList.find(u => u.kodeUnit === keyVal);
    if (found) return `${found.kodeUnit} - ${found.namaMka}`;

    return keyVal; // Fallback
  }

  // Render Leaderboard (Yellow Card - Rank by Kode Unit)
  function renderLeaderboard() {
    const tbody = document.getElementById('leaderboard-tbody');
    if (!tbody) return;
    let totalUsak = 0;
    tbody.innerHTML = '';

    masterMkaRanks.forEach((item, index) => {
      totalUsak += item.usakCount;
      const tr = document.createElement('tr');

      const isSelected = selectedKodeUnit !== 'ALL' && selectedKodeUnit === item.kodeUnit;

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
        const selectedKey = item.kodeUnit || item.name;
        nipSelect.value = selectedKey;
        handleFilterChange(selectedKey);
      });

      tbody.appendChild(tr);
    });

    const totalEl = document.getElementById('leaderboard-total-val');
    if (totalEl) totalEl.textContent = totalUsak;
  }

  // Render Debitur Table (8 Columns: No, Nama SGP, CIF, Nama Debitur, Rekening, Transaksi, Sales Volume, Status)
  function renderDebiturTable() {
    const tbody = document.getElementById('debitur-tbody');
    if (!tbody) return;

    let filtered = masterDebiturData;

    if (selectedKodeUnit && selectedKodeUnit !== 'ALL') {
      filtered = masterDebiturData.filter(d => d.kodeUnit === selectedKodeUnit);
    }

    let filterUsakCount = 0;
    let filterUregCount = 0;

    const totalCount = filtered.length;
    for (let idx = 0; idx < totalCount; idx++) {
      const d = filtered[idx];
      if (d.isGenuine) filterUsakCount++;
      if (d.status && d.status.toUpperCase().includes('UREG') && !d.status.toUpperCase().includes('NON')) {
        filterUregCount++;
      }
    }

    // Limit DOM rendering to top 500 rows when viewing ALL (prevents Chrome DOM buffer crashes)
    const MAX_DOM_ROWS = 500;
    const renderLimit = (selectedKodeUnit === 'ALL') ? Math.min(totalCount, MAX_DOM_ROWS) : totalCount;

    const rowsHtml = [];
    for (let idx = 0; idx < renderLimit; idx++) {
      const d = filtered[idx];

      rowsHtml.push(`
        <tr class="${d.rowStyle || 'row-dark'}">
          <td>${idx + 1}</td>
          <td>${d.sgp || '-'}</td>
          <td>${d.cif || '-'}</td>
          <td>${d.debitur || '-'}</td>
          <td>${d.rekening || '-'}</td>
          <td class="td-right">${(d.transaksi || 0).toLocaleString('id-ID')}</td>
          <td class="td-right">${(d.salesVolume || 0).toLocaleString('id-ID')}</td>
          <td class="cell-cyan-text">${d.status || '-'}</td>
        </tr>
      `);
    }

    if (selectedKodeUnit === 'ALL' && totalCount > MAX_DOM_ROWS) {
      rowsHtml.push(`
        <tr class="row-dark">
          <td colspan="8" style="text-align: center; padding: 10px; color: #38bdf8; font-style: italic;">
            Menampilkan ${MAX_DOM_ROWS.toLocaleString('id-ID')} dari ${totalCount.toLocaleString('id-ID')} total debitur. Silakan gunakan filter Kode Unit di kanan atas untuk melihat debitur spesifik.
          </td>
        </tr>
      `);
    }

    tbody.innerHTML = rowsHtml.join('');

    // Update KPI Displays if present
    const elUsak = document.getElementById('kpi-usak-val');
    const elUreg = document.getElementById('kpi-ureg-val');
    if (elUsak) elUsak.textContent = selectedKodeUnit === 'ALL' ? totalUsakGenuine : filterUsakCount;
    if (elUreg) elUreg.textContent = selectedKodeUnit === 'ALL' ? totalUreg : filterUregCount;
  }

  // Render SGP USAK Genuine Summary Matrix Table (Agustus & September)
  function renderSgpSummaryTable() {
    const tbody = document.getElementById('sgp-summary-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let filtered = masterDebiturData;

    if (selectedKodeUnit && selectedKodeUnit !== 'ALL') {
      filtered = masterDebiturData.filter(d => d.kodeUnit === selectedKodeUnit);
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
        if (d.transaksi > 0) {
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
    selectedKodeUnit = keyVal;

    if (!keyVal || keyVal === 'ALL') {
      selectedNameSpan.textContent = 'Silakan Pilih Kode Unit';
    } else {
      const resolvedName = resolveKodeUnitName(keyVal);
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
