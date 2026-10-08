/* ==========================================================================
   BANK MANDIRI POWERBI DASHBOARD - SGP REAL-TIME VIEWER ENGINE
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const API_ENDPOINT = '/api/data';
  const AUTO_REFRESH_MS = 10000;

  let masterDebiturSeptember = [];
  let masterDebiturAgustus = [];
  let masterDebiturOktober = [];
  let masterMkaRanksSeptember = [];
  let masterMkaRanksAgustus = [];
  let masterMkaRanksOktober = [];
  let masterUnitList = [];
  let kodeUnitToMkaMap = {};
  let selectedKodeUnit = 'ALL';
  let selectedMonth = 'oktober';
  let tableSearchQuery = '';

  let totalUsakGenuineSeptember = 0;
  let totalUregSeptember = 0;
  let totalUsakGenuineAgustus = 0;
  let totalUregAgustus = 0;
  let totalUsakGenuineOktober = 0;
  let totalUregOktober = 0;

  // Excel Column-Specific Filter & Sort State
  const columnFilters = {
    sgp: null,
    cif: null,
    debitur: null,
    rekening: null,
    transaksi: null,
    salesVolume: null,
    status: null,
    tagging: null,
    tanggal: null
  };

  const columnSort = {
    colKey: null,
    direction: null
  };

  let activePopupColKey = null;
  const filterPopupEl = document.getElementById('column-filter-popup');

  function getRowColValue(d, colKey) {
    if (colKey === 'sgp') return d.sgp || '-';
    if (colKey === 'cif') return d.cif || '-';
    if (colKey === 'debitur') return d.debitur || '-';
    if (colKey === 'rekening') return d.rekening || '-';
    if (colKey === 'transaksi') return (d.transaksi || 0).toLocaleString('id-ID');
    if (colKey === 'salesVolume') return (d.salesVolume || 0).toLocaleString('id-ID');
    if (colKey === 'status') return d.status || '-';
    if (colKey === 'tagging' || colKey === 'tanggal') return d.tagging || d.tanggal || '-';
    return '';
  }

  function getRowColNumericValue(d, colKey) {
    if (colKey === 'transaksi') return d.transaksi || 0;
    if (colKey === 'salesVolume') return d.salesVolume || 0;
    return 0;
  }

  const indoMonthMap = {
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'mei': 4, 'may': 4, 'jun': 5,
    'jul': 6, 'agu': 7, 'agt': 7, 'aug': 7, 'sep': 8, 'okt': 9, 'oct': 9,
    'nov': 10, 'des': 11, 'dec': 11
  };

  function parseFlexibleDate(s) {
    if (!s || s === '-' || typeof s !== 'string') return 0;
    const str = s.trim();
    const slashParts = str.split(/[\/\-]/);
    if (slashParts.length === 3) {
      if (slashParts[0].length === 4) {
        return new Date(parseInt(slashParts[0]), parseInt(slashParts[1]) - 1, parseInt(slashParts[2])).getTime() || 0;
      }
      return new Date(parseInt(slashParts[2]), parseInt(slashParts[1]) - 1, parseInt(slashParts[0])).getTime() || 0;
    }
    const spaceParts = str.split(/\s+/);
    if (spaceParts.length === 3) {
      const day = parseInt(spaceParts[0], 10);
      const mStr = spaceParts[1].substring(0, 3).toLowerCase();
      const month = indoMonthMap[mStr] !== undefined ? indoMonthMap[mStr] : 0;
      const year = parseInt(spaceParts[2], 10);
      return new Date(year, month, day).getTime() || 0;
    }
    return Date.parse(str) || 0;
  }

  // UI Elements
  const syncStatusText = document.getElementById('sync-status-text');
  const pulseDot = document.getElementById('pulse-dot');
  const nipSelect = document.getElementById('nip-mka-select');
  const monthSelect = document.getElementById('month-select');
  const selectedNameSpan = document.getElementById('selected-mka-name');
  const btnSyncNow = document.getElementById('btn-sync-now');
  const unitSearchInput = document.getElementById('unit-search-input');
  const debiturSearchInput = document.getElementById('debitur-search-input');

  // Helper: USAK (USAK Genuine & USAK Non Genuine)
  function isUsak(statusStr) {
    if (!statusStr) return false;
    return String(statusStr).trim().toUpperCase().includes('USAK');
  }

  // Check if string is genuine USAK (Excludes 'NON USAK')
  function isUsakGenuine(statusStr) {
    if (!statusStr) return false;
    const upper = String(statusStr).trim().toUpperCase();
    if (upper.includes('NON')) return false;
    return upper.includes('USAK') || upper.includes('GENUINE');
  }

  // Helper: UREG (Prioritas 1 s/d 5 atau UREG, bukan NON UREG dan bukan USAK)
  function isUregStatus(statusStr) {
    if (!statusStr) return false;
    const upper = String(statusStr).trim().toUpperCase();
    if (upper.includes('NON UREG') || upper.includes('NON-UREG')) return false;
    if (upper.includes('USAK')) return false;
    return upper.includes('PRIORITAS') || upper.includes('UREG');
  }

  // Helper: Non UREG
  function isNonUregStatus(statusStr) {
    if (!statusStr) return false;
    const upper = String(statusStr).trim().toUpperCase();
    return upper.includes('NON UREG') || upper.includes('NON-UREG');
  }

  // Fetch API Endpoint from Node.js Server
  async function fetchDashboardApi() {
    pulseDot.className = 'status-pulse syncing';
    syncStatusText.textContent = 'Live Sync: Memperbarui data dari Google Sheets...';

    try {
      const response = await fetch(API_ENDPOINT, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!data) return;

      masterDebiturSeptember = data.debiturDataSeptember || data.debiturData || [];
      masterDebiturAgustus = data.debiturDataAgustus || [];
      masterDebiturOktober = data.debiturDataOktober || [];
      masterMkaRanksSeptember = data.mkaRanksSeptember || data.mkaRanks || [];
      masterMkaRanksAgustus = data.mkaRanksAgustus || [];
      masterMkaRanksOktober = data.mkaRanksOktober || [];

      masterUnitList = data.unitList || [];
      kodeUnitToMkaMap = data.kodeUnitToMkaMap || {};

      totalUsakGenuineSeptember = data.totalUsakGenuineSeptember || data.totalUsakGenuine || 0;
      totalUregSeptember = data.totalUregSeptember || data.totalUreg || 0;
      totalUsakGenuineAgustus = data.totalUsakGenuineAgustus || 0;
      totalUregAgustus = data.totalUregAgustus || 0;
      totalUsakGenuineOktober = data.totalUsakGenuineOktober || 0;
      totalUregOktober = data.totalUregOktober || 0;

      populateKodeUnitSelectOptions();
      renderLeaderboard();
      renderDebiturTable();
      renderSgpSummaryTable();
      renderDashboardUsakChart();

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
    const prevVal = nipSelect.value || selectedKodeUnit || 'ALL';
    const filterQuery = unitSearchInput ? unitSearchInput.value.trim().toLowerCase() : '';
    nipSelect.innerHTML = '<option value="ALL">All</option>';

    const addedKeys = new Set();

    masterUnitList.forEach(item => {
      if (item.kodeUnit && item.kodeUnit.trim() !== '') {
        const key = item.kodeUnit.trim();
        let mkaName = item.namaMka ? item.namaMka.trim() : '';
        if (mkaName.length > 24) {
          mkaName = mkaName.substring(0, 22) + '...';
        }
        const label = mkaName ? `${key} - ${mkaName}` : key;

        if (filterQuery && !label.toLowerCase().includes(filterQuery)) {
          return;
        }

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
    } else if (prevVal === 'ALL') {
      nipSelect.value = 'ALL';
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

  function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Render Leaderboard (Yellow Card - Rank by Kode Unit)
  function renderLeaderboard() {
    const tbody = document.getElementById('leaderboard-tbody');
    if (!tbody) return;
    let totalUsak = 0;
    tbody.innerHTML = '';

    const ranks = (selectedMonth === 'agustus')
      ? masterMkaRanksAgustus
      : (selectedMonth === 'oktober' ? masterMkaRanksOktober : masterMkaRanksSeptember);
    const activeRanks = (ranks && ranks.length > 0)
      ? ranks
      : (selectedMonth === 'oktober' ? masterMkaRanksOktober : masterMkaRanksSeptember);

    activeRanks.forEach((item, index) => {
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
        <td title="${escapeAttr(item.name)}">${item.name}</td>
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

    let currentDataset = (selectedMonth === 'agustus')
      ? masterDebiturAgustus
      : (selectedMonth === 'oktober' ? masterDebiturOktober : masterDebiturSeptember);
    if (!currentDataset || currentDataset.length === 0) {
      currentDataset = (selectedMonth === 'oktober') ? masterDebiturOktober : masterDebiturSeptember;
    }

    let filtered = currentDataset;

    // 1. Filter by Selected Kode Unit
    if (selectedKodeUnit && selectedKodeUnit !== 'ALL') {
      filtered = filtered.filter(d => d.kodeUnit === selectedKodeUnit);
    }

    // 2. Filter by Main Search Bar
    if (tableSearchQuery && tableSearchQuery.length > 0) {
      filtered = filtered.filter(d => {
        return (d.debitur && d.debitur.toLowerCase().includes(tableSearchQuery)) ||
               (d.sgp && d.sgp.toLowerCase().includes(tableSearchQuery)) ||
               (d.cif && d.cif.toLowerCase().includes(tableSearchQuery)) ||
               (d.rekening && d.rekening.toLowerCase().includes(tableSearchQuery)) ||
               (d.kodeUnit && d.kodeUnit.toLowerCase().includes(tableSearchQuery)) ||
               (d.status && d.status.toLowerCase().includes(tableSearchQuery)) ||
               (d.tagging && d.tagging.toLowerCase().includes(tableSearchQuery)) ||
               (d.tanggal && d.tanggal.toLowerCase().includes(tableSearchQuery));
      });
    }

    // 3. Filter by Column-Specific Checkboxes (Excel Filter)
    Object.keys(columnFilters).forEach(colKey => {
      const allowedSet = columnFilters[colKey];
      if (allowedSet instanceof Set) {
        filtered = filtered.filter(d => {
          const val = getRowColValue(d, colKey);
          return allowedSet.has(val);
        });
      }
    });

    // 4. Sort by Column (Excel Sort)
    if (columnSort.colKey && columnSort.direction) {
      const { colKey, direction } = columnSort;
      const isAsc = direction === 'asc';

      filtered = [...filtered].sort((a, b) => {
        if (colKey === 'transaksi' || colKey === 'salesVolume') {
          const valA = getRowColNumericValue(a, colKey);
          const valB = getRowColNumericValue(b, colKey);
          return isAsc ? valA - valB : valB - valA;
        } else if (colKey === 'tanggal') {
          const dateA = parseFlexibleDate(a.tanggal);
          const dateB = parseFlexibleDate(b.tanggal);
          return isAsc ? dateA - dateB : dateB - dateA;
        } else {
          const strA = getRowColValue(a, colKey);
          const strB = getRowColValue(b, colKey);
          return isAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
        }
      });
    }

    // Update Filter Active Indicators on Table Header Buttons
    document.querySelectorAll('.col-filter-btn').forEach(btn => {
      const colKey = btn.dataset.col;
      const isFiltered = columnFilters[colKey] instanceof Set;
      const isSorted = columnSort.colKey === colKey;
      if (isFiltered || isSorted) {
        btn.classList.add('active');
        btn.textContent = isSorted ? (columnSort.direction === 'asc' ? '▲' : '▼') : '▼';
      } else {
        btn.classList.remove('active');
        btn.textContent = '▼';
      }
    });

    let filterUsakCount = 0;
    let filterUregCount = 0;

    const totalCount = filtered.length;
    for (let idx = 0; idx < totalCount; idx++) {
      const d = filtered[idx];
      if (d.isGenuine) filterUsakCount++;
      if (isUregStatus(d.status)) {
        filterUregCount++;
      }
    }

    // Limit DOM rendering to top 80 rows on mobile / 300 on desktop (prevents mobile CPU/RAM lag)
    const isMobileDevice = window.innerWidth <= 768;
    const DEFAULT_CAP = isMobileDevice ? 80 : 300;
    const currentMaxDom = window._debiturDomCap || DEFAULT_CAP;
    const isCapped = totalCount > currentMaxDom;
    const renderLimit = isCapped ? currentMaxDom : totalCount;

    const rowsHtml = [];
    for (let idx = 0; idx < renderLimit; idx++) {
      const d = filtered[idx];

      const sgpText = d.sgp || '-';
      const cifText = d.cif || '-';
      const debText = d.debitur || '-';
      const rekText = d.rekening || '-';
      const stText = d.status || '-';
      const tagText = d.tagging || d.tanggal || '-';
      const tagClass = tagText.toLowerCase().includes('terdata') ? 'cell-tagging-terdata' : 'cell-tagging-tidak';

      rowsHtml.push(`
        <tr class="${d.rowStyle || 'row-dark'}">
          <td>${idx + 1}</td>
          <td title="${escapeAttr(sgpText)}">${sgpText}</td>
          <td title="${escapeAttr(cifText)}">${cifText}</td>
          <td title="${escapeAttr(debText)}">${debText}</td>
          <td title="${escapeAttr(rekText)}">${rekText}</td>
          <td class="td-right">${(d.transaksi || 0).toLocaleString('id-ID')}</td>
          <td class="td-right">${(d.salesVolume || 0).toLocaleString('id-ID')}</td>
          <td class="cell-cyan-text" title="${escapeAttr(stText)}">${stText}</td>
          <td class="${tagClass}" title="${escapeAttr(tagText)}">${tagText}</td>
        </tr>
      `);
    }

    if (isCapped) {
      rowsHtml.push(`
        <tr class="row-dark">
          <td colspan="9" style="text-align: center; padding: 10px; color: #38bdf8;">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
              <span>Menampilkan <strong>${renderLimit.toLocaleString('id-ID')}</strong> dari <strong>${totalCount.toLocaleString('id-ID')}</strong> debitur (${selectedMonth.toUpperCase()}).</span>
              <button id="btn-load-more-debitur" style="background: #0284c7; color: #fff; border: none; padding: 6px 16px; border-radius: 4px; font-weight: 700; cursor: pointer; font-size: 12px; margin-top: 2px;">
                ⚡ Muat 100 Data Lagi (${(totalCount - renderLimit).toLocaleString('id-ID')} tersisa)
              </button>
            </div>
          </td>
        </tr>
      `);
    }

    tbody.innerHTML = rowsHtml.join('');

    const btnLoadMore = document.getElementById('btn-load-more-debitur');
    if (btnLoadMore) {
      btnLoadMore.addEventListener('click', () => {
        window._debiturDomCap = (window._debiturDomCap || DEFAULT_CAP) + 100;
        renderDebiturTable();
      });
    }

    // Update KPI Displays if present
    const elUsak = document.getElementById('kpi-usak-val');
    const elUreg = document.getElementById('kpi-ureg-val');
    const activeTotalUsak = (selectedMonth === 'agustus') ? totalUsakGenuineAgustus : (selectedMonth === 'oktober' ? totalUsakGenuineOktober : totalUsakGenuineSeptember);
    const activeTotalUreg = (selectedMonth === 'agustus') ? totalUregAgustus : (selectedMonth === 'oktober' ? totalUregOktober : totalUregSeptember);

    const hasAnyActiveFilter = (selectedKodeUnit !== 'ALL' || tableSearchQuery || columnSort.colKey || Object.values(columnFilters).some(v => v !== null));

    if (elUsak) elUsak.textContent = !hasAnyActiveFilter ? activeTotalUsak : filterUsakCount;
    if (elUreg) elUreg.textContent = !hasAnyActiveFilter ? activeTotalUreg : filterUregCount;
  }

  // Helper to test if status is UREG (All statuses EXCEPT 'NON UREG' / 'NON...' and EXCEPT 'USAK Genuine')
  function isUregStatus(statusStr) {
    if (!statusStr) return false;
    const upper = statusStr.trim().toUpperCase();
    if (upper.includes('NON')) return false;
    if (isUsakGenuine(statusStr)) return false;
    return true;
  }

  // Render SGP USAK Genuine & UREG Summary Matrix Table (Agustus, September & Oktober)
  function renderSgpSummaryTable() {
    const tbody = document.getElementById('sgp-summary-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let filteredSep = masterDebiturSeptember;
    let filteredAgus = masterDebiturAgustus;
    let filteredOkt = masterDebiturOktober;

    if (selectedKodeUnit && selectedKodeUnit !== 'ALL') {
      filteredSep = masterDebiturSeptember.filter(d => d.kodeUnit === selectedKodeUnit);
      filteredAgus = masterDebiturAgustus.filter(d => d.kodeUnit === selectedKodeUnit);
      filteredOkt = masterDebiturOktober.filter(d => d.kodeUnit === selectedKodeUnit);
    }

    const sgpMap = {};

    function ensureSgp(name) {
      if (!name || name === 'UNASSIGNED') return null;
      const upper = name.toUpperCase();
      if (!sgpMap[upper]) {
        sgpMap[upper] = {
          name,
          agustusGenuine: 0,
          septemberGenuine: 0,
          oktoberGenuine: 0,
          agustusUreg: 0,
          septemberUreg: 0,
          oktoberUreg: 0
        };
      }
      return sgpMap[upper];
    }

    // Oktober Data
    filteredOkt.forEach(d => {
      const sgpName = (d.sgp || d.namaMka || 'UNASSIGNED').trim();
      const item = ensureSgp(sgpName);
      if (!item) return;
      if (d.isGenuine) item.oktoberGenuine += 1;
      if (isUregStatus(d.status)) item.oktoberUreg += 1;
    });

    // September Data
    filteredSep.forEach(d => {
      const sgpName = (d.sgp || d.namaMka || 'UNASSIGNED').trim();
      const item = ensureSgp(sgpName);
      if (!item) return;
      if (d.isGenuine) item.septemberGenuine += 1;
      if (isUregStatus(d.status)) item.septemberUreg += 1;
    });

    // August Data
    filteredAgus.forEach(d => {
      const sgpName = (d.sgp || d.namaMka || 'UNASSIGNED').trim();
      const item = ensureSgp(sgpName);
      if (!item) return;
      if (d.isGenuine) item.agustusGenuine += 1;
      if (isUregStatus(d.status)) item.agustusUreg += 1;
    });

    const sgpList = Object.values(sgpMap);
    sgpList.sort((a, b) => {
      if (b.oktoberGenuine !== a.oktoberGenuine) {
        return b.oktoberGenuine - a.oktoberGenuine;
      }
      if (b.septemberGenuine !== a.septemberGenuine) {
        return b.septemberGenuine - a.septemberGenuine;
      }
      if (b.agustusGenuine !== a.agustusGenuine) {
        return b.agustusGenuine - a.agustusGenuine;
      }
      if (b.oktoberUreg !== a.oktoberUreg) {
        return b.oktoberUreg - a.oktoberUreg;
      }
      return a.name.localeCompare(b.name);
    });

    let sumAgustusGenuine = 0;
    let sumSeptemberGenuine = 0;
    let sumOktoberGenuine = 0;
    let sumAgustusUreg = 0;
    let sumSeptemberUreg = 0;
    let sumOktoberUreg = 0;

    if (sgpList.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" class="td-center" style="color: #666; font-style: italic;">Tidak ada SGP dengan USAK Genuine / UREG</td>`;
      tbody.appendChild(tr);
    } else {
      sgpList.forEach(item => {
        sumAgustusGenuine += item.agustusGenuine;
        sumSeptemberGenuine += item.septemberGenuine;
        sumOktoberGenuine += item.oktoberGenuine;
        sumAgustusUreg += item.agustusUreg;
        sumSeptemberUreg += item.septemberUreg;
        sumOktoberUreg += item.oktoberUreg;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td title="${escapeAttr(item.name)}">${item.name}</td>
          <td class="td-center">${item.agustusGenuine}</td>
          <td class="td-center">${item.septemberGenuine}</td>
          <td class="td-center">${item.oktoberGenuine}</td>
          <td class="td-center">${item.agustusUreg}</td>
          <td class="td-center">${item.septemberUreg}</td>
          <td class="td-center">${item.oktoberUreg}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    const elAgustusTotal = document.getElementById('sgp-total-agustus');
    const elSeptemberTotal = document.getElementById('sgp-total-september');
    const elOktoberTotal = document.getElementById('sgp-total-oktober');
    const elUregAgustusTotal = document.getElementById('sgp-total-ureg-agustus');
    const elUregSeptemberTotal = document.getElementById('sgp-total-ureg-september');
    const elUregOktoberTotal = document.getElementById('sgp-total-ureg-oktober');

    if (elAgustusTotal) elAgustusTotal.textContent = sumAgustusGenuine;
    if (elSeptemberTotal) elSeptemberTotal.textContent = sumSeptemberGenuine;
    if (elOktoberTotal) elOktoberTotal.textContent = sumOktoberGenuine;
    if (elUregAgustusTotal) elUregAgustusTotal.textContent = sumAgustusUreg;
    if (elUregSeptemberTotal) elUregSeptemberTotal.textContent = sumSeptemberUreg;
    if (elUregOktoberTotal) elUregOktoberTotal.textContent = sumOktoberUreg;
  }

  let sgpChartInstance = null;
  let debtorDonutChartInstance = null;

  // 1. CHART PERBANDINGAN: GRAFIK BATANG USAK GENUINE PER SGP (DYNAMIC BY MONTH)
  function renderSgpComparisonChart() {
    const canvas = document.getElementById('sgp-comparison-chart');
    if (!canvas) return;

    if (sgpChartInstance) {
      sgpChartInstance.destroy();
      sgpChartInstance = null;
    }

    if (!window.Chart) return;

    let filteredCurr = (selectedMonth === 'oktober') ? masterDebiturOktober : (selectedMonth === 'agustus' ? masterDebiturAgustus : masterDebiturSeptember);
    let filteredPrev = (selectedMonth === 'oktober') ? masterDebiturSeptember : masterDebiturAgustus;
    let prevName = (selectedMonth === 'oktober') ? 'September' : 'Agustus';
    let currName = (selectedMonth === 'oktober') ? 'Oktober' : (selectedMonth === 'agustus' ? 'Agustus' : 'September');
    let prevShort = (selectedMonth === 'oktober') ? 'Sep' : 'Agt';
    let currShort = (selectedMonth === 'oktober') ? 'Okt' : (selectedMonth === 'agustus' ? 'Agt' : 'Sep');
    let unitLabel = 'Semua Unit';

    if (selectedKodeUnit && selectedKodeUnit !== 'ALL') {
      filteredCurr = filteredCurr.filter(d => d.kodeUnit === selectedKodeUnit);
      filteredPrev = filteredPrev.filter(d => d.kodeUnit === selectedKodeUnit);
      unitLabel = resolveKodeUnitName(selectedKodeUnit);
    }

    // Agregasi USAK Genuine per SGP
    const sgpMap = {};

    filteredCurr.forEach(d => {
      const rawName = (d.sgp || d.namaMka || '').trim();
      if (!rawName || rawName === 'UNASSIGNED' || rawName.toUpperCase() === 'NULL') return;
      const key = rawName.toUpperCase();
      if (!sgpMap[key]) {
        sgpMap[key] = { name: rawName, prevGenuine: 0, currGenuine: 0 };
      }
      if (d.isGenuine) {
        sgpMap[key].currGenuine += 1;
      }
    });

    filteredPrev.forEach(d => {
      const rawName = (d.sgp || d.namaMka || '').trim();
      if (!rawName || rawName === 'UNASSIGNED' || rawName.toUpperCase() === 'NULL') return;
      const key = rawName.toUpperCase();
      if (!sgpMap[key]) {
        sgpMap[key] = { name: rawName, prevGenuine: 0, currGenuine: 0 };
      }
      if (d.isGenuine) {
        sgpMap[key].prevGenuine += 1;
      }
    });

    let sgpList = Object.values(sgpMap).filter(item => item.currGenuine > 0 || item.prevGenuine > 0);

    // Urutkan berdasarkan current Genuine terbanyak, lalu previous
    sgpList.sort((a, b) => {
      if (b.currGenuine !== a.currGenuine) {
        return b.currGenuine - a.currGenuine;
      }
      return b.prevGenuine - a.prevGenuine;
    });

    // Total Overall untuk Badges Header
    let totalPrevVal = 0;
    let totalCurrVal = 0;
    if (selectedKodeUnit && selectedKodeUnit !== 'ALL') {
      totalPrevVal = filteredPrev.filter(d => d.isGenuine).length;
      totalCurrVal = filteredCurr.filter(d => d.isGenuine).length;
    } else {
      totalPrevVal = (selectedMonth === 'oktober') ? totalUsakGenuineSeptember : totalUsakGenuineAgustus;
      totalCurrVal = (selectedMonth === 'oktober') ? totalUsakGenuineOktober : (selectedMonth === 'agustus' ? totalUsakGenuineAgustus : totalUsakGenuineSeptember);
    }

    const totalDelta = totalCurrVal - totalPrevVal;
    const totalPct = totalPrevVal > 0 ? ((totalDelta / totalPrevVal) * 100).toFixed(1) : (totalDelta > 0 ? '+100' : '0');

    // Update Header Badges
    const badgeAgt = document.getElementById('sgp-badge-val-agt');
    const badgeSep = document.getElementById('sgp-badge-val-sep');
    const badgeLblPrev = document.getElementById('sgp-badge-lbl-prev');
    const badgeLblCurr = document.getElementById('sgp-badge-lbl-curr');
    const badgeGrowthVal = document.getElementById('sgp-badge-growth-val');
    const badgeGrowthChip = document.getElementById('sgp-badge-growth-chip');
    const subtitleEl = document.getElementById('sgp-chart-subtitle');

    if (badgeLblPrev) badgeLblPrev.textContent = `${prevShort}:`;
    if (badgeLblCurr) badgeLblCurr.textContent = `${currShort}:`;
    if (badgeAgt) badgeAgt.textContent = totalPrevVal.toLocaleString('id-ID');
    if (badgeSep) badgeSep.textContent = totalCurrVal.toLocaleString('id-ID');

    if (badgeGrowthVal && badgeGrowthChip) {
      const sign = totalDelta >= 0 ? '+' : '';
      badgeGrowthVal.textContent = `${sign}${totalDelta.toLocaleString('id-ID')} (${sign}${totalPct}%)`;
      badgeGrowthChip.className = totalDelta >= 0 ? 'badge-growth' : 'badge-growth negative';
    }

    if (subtitleEl) {
      if (selectedKodeUnit && selectedKodeUnit !== 'ALL') {
        subtitleEl.textContent = `${prevName} vs ${currName} • ${unitLabel}`;
      } else {
        subtitleEl.textContent = `${prevName} vs ${currName} • Top 10 SGP Nasional`;
      }
    }

    // Pilih item untuk ditampilkan (Top 10 jika Semua Unit, atau semua SGP pada unit terpilih)
    const chartItems = (selectedKodeUnit && selectedKodeUnit !== 'ALL') ? sgpList.slice(0, 15) : sgpList.slice(0, 10);

    const labels = chartItems.map(item => {
      if (item.name.length > 13) {
        return item.name.substring(0, 11) + '..';
      }
      return item.name;
    });

    const valPrev = chartItems.map(item => item.prevGenuine);
    const valCurr = chartItems.map(item => item.currGenuine);

    const maxVal = Math.max(...valPrev, ...valCurr, 1);
    const yMax = Math.ceil(maxVal * 1.25);

    const ctx = canvas.getContext('2d');
    sgpChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels.length > 0 ? labels : ['Tidak Ada Data'],
        datasets: [
          {
            label: prevName,
            data: labels.length > 0 ? valPrev : [0],
            backgroundColor: 'rgba(56, 189, 248, 0.85)', // Sky Blue
            borderColor: '#0284c7',
            borderWidth: 1.2,
            borderRadius: 4,
            barPercentage: 0.8,
            categoryPercentage: 0.72
          },
          {
            label: currName,
            data: labels.length > 0 ? valCurr : [0],
            backgroundColor: 'rgba(239, 68, 68, 0.85)', // Coral Red
            borderColor: '#b91c1c',
            borderWidth: 1.2,
            borderRadius: 4,
            barPercentage: 0.8,
            categoryPercentage: 0.72
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 350 },
        layout: {
          padding: { top: 22, right: 10, bottom: 2, left: 4 }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              color: '#e2e8f0',
              font: {
                family: "'Segoe UI', 'Inter', sans-serif",
                size: 10.5,
                weight: '600'
              },
              padding: 8
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#f8fafc',
            bodyColor: '#cbd5e1',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 9,
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                return chartItems[idx] ? chartItems[idx].name : '';
              },
              label: (context) => {
                const month = context.dataset.label || '';
                const val = (context.raw || 0).toLocaleString('id-ID');
                return ` ${month}: ${val} debitur`;
              },
              afterBody: (items) => {
                const idx = items[0].dataIndex;
                const item = chartItems[idx];
                if (!item) return '';
                const diff = item.septemberGenuine - item.agustusGenuine;
                const pct = item.agustusGenuine > 0 ? ((diff / item.agustusGenuine) * 100).toFixed(1) : (diff > 0 ? '+100' : '0');
                const sign = diff >= 0 ? '+' : '';
                const arrow = diff >= 0 ? '▲' : '▼';
                return `\n${arrow} Pertumbuhan: ${sign}${diff} debitur (${sign}${pct}%)`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: yMax,
            ticks: {
              color: '#94a3b8',
              font: {
                family: "'Segoe UI', 'Inter', sans-serif",
                size: 10,
                weight: 'bold'
              },
              callback: (value) => Number.isInteger(value) ? value : ''
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.06)'
            }
          },
          x: {
            ticks: {
              color: '#94a3b8',
              font: {
                family: "'Segoe UI', 'Inter', sans-serif",
                size: 9.5,
                weight: '600'
              },
              maxRotation: 25,
              minRotation: 0
            },
            grid: { display: false }
          }
        }
      },
      plugins: [{
        id: 'barValueLabels',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          chart.data.datasets.forEach((dataset, datasetIdx) => {
            const meta = chart.getDatasetMeta(datasetIdx);
            if (!meta || meta.hidden) return;
            meta.data.forEach((bar, idx) => {
              const val = dataset.data[idx];
              if (typeof val === 'number' && val > 0) {
                ctx.save();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 9.5px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
                ctx.shadowBlur = 3;
                ctx.fillText(val.toString(), bar.x, bar.y - 3);
                ctx.restore();
              }
            });
          });
        }
      }]
    });
  }

  // 2. CHART KOMPOSISI DEBITUR: DONUT CHART RASIO USAK vs UREG vs NON UREG
  function renderDebtorCompositionDonutChart() {
    const canvas = document.getElementById('debtor-composition-chart');
    if (!canvas) return;

    if (debtorDonutChartInstance) {
      debtorDonutChartInstance.destroy();
      debtorDonutChartInstance = null;
    }

    if (!window.Chart) return;

    const activeMonth = selectedMonth || 'september';
    const monthName = activeMonth === 'agustus' ? 'Agustus' : (activeMonth === 'oktober' ? 'Oktober' : 'September');

    const activeList = (activeMonth === 'agustus')
      ? masterDebiturAgustus
      : (activeMonth === 'oktober' ? masterDebiturOktober : masterDebiturSeptember);

    let usakCount = 0;
    let uregCount = 0;
    let nonUregCount = 0;

    const listToCount = (selectedKodeUnit && selectedKodeUnit !== 'ALL')
      ? (activeList || []).filter(d => d.kodeUnit === selectedKodeUnit)
      : (activeList || []);

    listToCount.forEach(d => {
      const s = d.status || '';
      if (isUsak(s)) {
        usakCount++;
      } else if (isUregStatus(s)) {
        uregCount++;
      } else if (isNonUregStatus(s)) {
        nonUregCount++;
      }
    });

    const totalDebitur = usakCount + uregCount + nonUregCount;
    const usakPct = totalDebitur > 0 ? ((usakCount / totalDebitur) * 100).toFixed(1) : '0';
    const uregPct = totalDebitur > 0 ? ((uregCount / totalDebitur) * 100).toFixed(1) : '0';
    const nonUregPct = totalDebitur > 0 ? ((nonUregCount / totalDebitur) * 100).toFixed(1) : '0';

    // Update Header & Stats Panel
    const subtitleEl = document.getElementById('donut-chart-subtitle');
    const badgeTotal = document.getElementById('donut-badge-val-total');
    const statUsakVal = document.getElementById('donut-stat-count-usak');
    const statUsakPct = document.getElementById('donut-stat-pct-usak');
    const statUregVal = document.getElementById('donut-stat-count-ureg');
    const statUregPct = document.getElementById('donut-stat-pct-ureg');
    const statNonUregVal = document.getElementById('donut-stat-count-non-ureg');
    const statNonUregPct = document.getElementById('donut-stat-pct-non-ureg');

    if (subtitleEl) subtitleEl.textContent = `Rasio USAK, UREG & Non UREG • ${monthName}`;
    if (badgeTotal) badgeTotal.textContent = totalDebitur.toLocaleString('id-ID');
    if (statUsakVal) statUsakVal.textContent = usakCount.toLocaleString('id-ID');
    if (statUsakPct) statUsakPct.textContent = `${usakPct}%`;
    if (statUregVal) statUregVal.textContent = uregCount.toLocaleString('id-ID');
    if (statUregPct) statUregPct.textContent = `${uregPct}%`;
    if (statNonUregVal) statNonUregVal.textContent = nonUregCount.toLocaleString('id-ID');
    if (statNonUregPct) statNonUregPct.textContent = `${nonUregPct}%`;

    const ctx = canvas.getContext('2d');
    debtorDonutChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['USAK', 'UREG', 'Non UREG'],
        datasets: [{
          data: totalDebitur > 0 ? [usakCount, uregCount, nonUregCount] : [1],
          backgroundColor: totalDebitur > 0 ? ['#38bdf8', '#f59e0b', '#64748b'] : ['rgba(255, 255, 255, 0.1)'],
          borderColor: totalDebitur > 0 ? ['#0284c7', '#d97706', '#475569'] : ['rgba(255, 255, 255, 0.15)'],
          borderWidth: 2,
          hoverBackgroundColor: ['#7dd3fc', '#fbbf24', '#94a3b8'],
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        animation: { duration: 350 },
        layout: { padding: 4 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#f8fafc',
            bodyColor: '#cbd5e1',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 8,
            callbacks: {
              label: (context) => {
                if (totalDebitur === 0) return ' Tidak ada debitur';
                const label = context.label || '';
                const val = (context.raw || 0).toLocaleString('id-ID');
                const pct = totalDebitur > 0 ? ((context.raw / totalDebitur) * 100).toFixed(1) : 0;
                return ` ${label}: ${val} debitur (${pct}%)`;
              }
            }
          }
        }
      },
      plugins: [{
        id: 'donutCenterText',
        afterDraw(chart) {
          const { ctx, chartArea } = chart;
          if (!chartArea) return;
          const centerX = (chartArea.left + chartArea.right) / 2;
          const centerY = (chartArea.top + chartArea.bottom) / 2;

          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Center Total Value
          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 15px "Segoe UI", "Inter", sans-serif';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
          ctx.shadowBlur = 3;
          ctx.fillText(totalDebitur.toLocaleString('id-ID'), centerX, centerY - 6);

          // Center Subtitle
          ctx.fillStyle = '#94a3b8';
          ctx.font = '600 9px "Segoe UI", "Inter", sans-serif';
          ctx.fillText('Total Debitur', centerX, centerY + 9);

          ctx.restore();
        }
      }]
    });
  }

  // Wrapper function to render both charts
  function renderDashboardCharts() {
    renderSgpComparisonChart();
    renderDebtorCompositionDonutChart();
  }

  const renderDashboardUsakChart = renderDashboardCharts;

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
    renderDashboardCharts();
  }

  btnSyncNow.addEventListener('click', () => {
    fetchDashboardApi();
  });

  nipSelect.addEventListener('change', (e) => {
    handleFilterChange(e.target.value);
  });

  if (monthSelect) {
    monthSelect.addEventListener('change', (e) => {
      selectedMonth = e.target.value;
      renderLeaderboard();
      renderDebiturTable();
      renderDashboardCharts();
    });
  }

  const unitAutocompleteList = document.getElementById('unit-autocomplete-list');

  function renderUnitAutocompleteSuggestions() {
    if (!unitSearchInput || !unitAutocompleteList) return;

    const query = unitSearchInput.value.trim().toLowerCase();
    if (!query || query.length === 0) {
      unitAutocompleteList.innerHTML = '';
      unitAutocompleteList.classList.add('hidden');
      return;
    }

    const matches = [];
    const addedKeys = new Set();

    masterUnitList.forEach(item => {
      if (item.kodeUnit && item.kodeUnit.trim() !== '') {
        const key = item.kodeUnit.trim();
        const label = item.namaMka ? `${item.kodeUnit} - ${item.namaMka}` : item.kodeUnit;

        if (label.toLowerCase().includes(query) && !addedKeys.has(key)) {
          addedKeys.add(key);
          matches.push({ key, label });
        }
      }
    });

    if (matches.length === 0) {
      unitAutocompleteList.innerHTML = '<div class="autocomplete-item" style="color: #94a3b8; font-style: italic; cursor: default;">Tidak ada unit ditemukan</div>';
      unitAutocompleteList.classList.remove('hidden');
      return;
    }

    const itemsHtml = matches.map(m => `
      <div class="autocomplete-item" data-value="${escapeAttr(m.key)}" title="${escapeAttr(m.label)}">
        ${m.label}
      </div>
    `).join('');

    unitAutocompleteList.innerHTML = itemsHtml;
    unitAutocompleteList.classList.remove('hidden');
  }

  if (unitAutocompleteList) {
    unitAutocompleteList.addEventListener('click', (e) => {
      const itemEl = e.target.closest('.autocomplete-item');
      if (itemEl && itemEl.dataset.value) {
        const selectedVal = itemEl.dataset.value;
        nipSelect.value = selectedVal;
        handleFilterChange(selectedVal);
        unitAutocompleteList.classList.add('hidden');
      }
    });
  }

  // Debounce Helper for Mobile & Desktop Performance
  function debounce(fn, delay = 150) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  if (unitSearchInput) {
    const debouncedUnitSearch = debounce(() => {
      populateKodeUnitSelectOptions();
      renderUnitAutocompleteSuggestions();
    }, 120);

    unitSearchInput.addEventListener('input', debouncedUnitSearch);

    unitSearchInput.addEventListener('focus', () => {
      if (unitSearchInput.value.trim().length > 0) {
        renderUnitAutocompleteSuggestions();
      }
    });
  }

  if (debiturSearchInput) {
    const debouncedDebiturSearch = debounce((e) => {
      tableSearchQuery = e.target.value.trim().toLowerCase();
      renderDebiturTable();
    }, 150);

    debiturSearchInput.addEventListener('input', (e) => {
      tableSearchQuery = e.target.value.trim().toLowerCase();
      debouncedDebiturSearch(e);
    });
  }

  // ==========================================================================
  // EXCEL COLUMN FILTER POPUP ENGINE
  // ==========================================================================
  function openColumnFilterPopup(colKey, anchorBtn) {
    if (!filterPopupEl) return;

    activePopupColKey = colKey;

    let baseDataset = (selectedMonth === 'agustus')
      ? masterDebiturAgustus
      : (selectedMonth === 'oktober' ? masterDebiturOktober : masterDebiturSeptember);
    if (!baseDataset || baseDataset.length === 0) {
      baseDataset = (selectedMonth === 'oktober') ? masterDebiturOktober : masterDebiturSeptember;
    }

    if (selectedKodeUnit && selectedKodeUnit !== 'ALL') {
      baseDataset = baseDataset.filter(d => d.kodeUnit === selectedKodeUnit);
    }

    if (tableSearchQuery) {
      baseDataset = baseDataset.filter(d => {
        return (d.debitur && d.debitur.toLowerCase().includes(tableSearchQuery)) ||
               (d.sgp && d.sgp.toLowerCase().includes(tableSearchQuery)) ||
               (d.cif && d.cif.toLowerCase().includes(tableSearchQuery)) ||
               (d.rekening && d.rekening.toLowerCase().includes(tableSearchQuery)) ||
               (d.kodeUnit && d.kodeUnit.toLowerCase().includes(tableSearchQuery)) ||
               (d.status && d.status.toLowerCase().includes(tableSearchQuery)) ||
               (d.tagging && d.tagging.toLowerCase().includes(tableSearchQuery)) ||
               (d.tanggal && d.tanggal.toLowerCase().includes(tableSearchQuery));
      });
    }

    // Filter by other active column filters (except current colKey)
    Object.keys(columnFilters).forEach(otherKey => {
      if (otherKey !== colKey && columnFilters[otherKey] instanceof Set) {
        const allowedSet = columnFilters[otherKey];
        baseDataset = baseDataset.filter(d => allowedSet.has(getRowColValue(d, otherKey)));
      }
    });

    // Count distinct values
    const valueCounts = {};
    baseDataset.forEach(d => {
      const val = getRowColValue(d, colKey);
      valueCounts[val] = (valueCounts[val] || 0) + 1;
    });

    const distinctValues = Object.keys(valueCounts).sort((a, b) => {
      if (colKey === 'transaksi' || colKey === 'salesVolume') {
        const numA = parseInt(a.replace(/\./g, '')) || 0;
        const numB = parseInt(b.replace(/\./g, '')) || 0;
        return numB - numA;
      }
      if (colKey === 'tanggal') {
        return parseFlexibleDate(b) - parseFlexibleDate(a);
      }
      return a.localeCompare(b);
    });

    const isNumeric = (colKey === 'transaksi' || colKey === 'salesVolume');
    const isDate = (colKey === 'tanggal');
    const sortAscLabel = isNumeric ? '🔼 Urutkan Terkecil ke Terbesar' : (isDate ? '🔼 Urutkan Tanggal Terlama ke Terbaru' : '🔼 Urutkan A ke Z');
    const sortDescLabel = isNumeric ? '🔽 Urutkan Terbesar ke Terkecil' : (isDate ? '🔽 Urutkan Tanggal Terbaru ke Terlama' : '🔽 Urutkan Z ke A');

    const currentSort = (columnSort.colKey === colKey) ? columnSort.direction : null;
    const currentFilterSet = columnFilters[colKey];

    filterPopupEl.innerHTML = `
      <div class="excel-filter-sort-section">
        <button class="excel-filter-sort-btn ${currentSort === 'asc' ? 'active' : ''}" data-sort="asc">
          ${sortAscLabel}
        </button>
        <button class="excel-filter-sort-btn ${currentSort === 'desc' ? 'active' : ''}" data-sort="desc">
          ${sortDescLabel}
        </button>
      </div>
      <div class="excel-filter-divider"></div>
      <input type="text" class="excel-filter-search-box" id="popup-search-box" placeholder="Cari nilai...">
      <div class="excel-filter-list" id="popup-checkbox-list-container">
        <!-- Rendered instantly via helper -->
      </div>
      <div class="excel-filter-footer">
        <button class="excel-filter-action-btn excel-filter-btn-clear" id="popup-btn-clear">Hapus Filter</button>
        <button class="excel-filter-action-btn excel-filter-btn-apply" id="popup-btn-apply">Terapkan</button>
      </div>
    `;

    // Position popup directly under the target TH header cell with zero empty space gap (position: fixed)
    const thCell = anchorBtn.closest('th') || anchorBtn;
    const thRect = thCell.getBoundingClientRect();
    const POPUP_WIDTH = Math.max(220, Math.min(260, thRect.width + 40));

    filterPopupEl.style.width = `${POPUP_WIDTH}px`;
    filterPopupEl.style.top = `${thRect.bottom + 2}px`;

    // Left align directly with the left edge of the column header TH cell (fixed viewport coordinates)
    let popupLeft = thRect.left;

    // If popup would overflow viewport right edge, align right edge of popup to TH cell right edge
    if (popupLeft + POPUP_WIDTH > window.innerWidth - 10) {
      popupLeft = thRect.right - POPUP_WIDTH;
    }

    if (popupLeft < 10) popupLeft = 10;
    filterPopupEl.style.left = `${popupLeft}px`;

    filterPopupEl.classList.remove('hidden');

    // Helper to render checkbox items (max 150 for 0ms instant speed)
    function renderPopupCheckboxList(filterSearchText = '') {
      const checkboxContainer = document.getElementById('popup-checkbox-list-container');
      if (!checkboxContainer) return;

      const query = filterSearchText.toLowerCase().trim();
      const filteredDistinct = query 
        ? distinctValues.filter(val => val.toLowerCase().includes(query))
        : distinctValues;

      const MAX_ITEMS = 150;
      const isCapped = filteredDistinct.length > MAX_ITEMS;
      const visibleValues = isCapped ? filteredDistinct.slice(0, MAX_ITEMS) : filteredDistinct;

      let html = `
        <label class="excel-filter-item">
          <input type="checkbox" id="popup-select-all" ${!currentFilterSet ? 'checked' : ''}>
          <span class="excel-filter-item-text" style="font-weight: 700; color: #ffffff;">(Pilih Semua)</span>
        </label>
      `;

      html += visibleValues.map(val => {
        const isChecked = !currentFilterSet || currentFilterSet.has(val);
        return `
          <label class="excel-filter-item" data-val="${escapeAttr(val)}">
            <input type="checkbox" class="popup-item-cb" data-val="${escapeAttr(val)}" ${isChecked ? 'checked' : ''}>
            <span class="excel-filter-item-text" title="${escapeAttr(val)}">${escapeAttr(val)}</span>
            <span class="excel-filter-item-count">(${valueCounts[val]})</span>
          </label>
        `;
      }).join('');

      if (isCapped) {
        html += `
          <div style="font-size: 10px; color: #38bdf8; font-style: italic; padding: 4px; text-align: center;">
            Menampilkan 150 dari ${filteredDistinct.length} nilai. Ketik di pencarian untuk menyempitkan.
          </div>
        `;
      }

      checkboxContainer.innerHTML = html;

      // Re-bind select all
      const selectAllCb = document.getElementById('popup-select-all');
      if (selectAllCb) {
        selectAllCb.addEventListener('change', (e) => {
          const checked = e.target.checked;
          checkboxContainer.querySelectorAll('.popup-item-cb').forEach(cb => {
            cb.checked = checked;
          });
        });
      }
    }

    renderPopupCheckboxList('');

    const searchBox = document.getElementById('popup-search-box');
    searchBox.addEventListener('input', (e) => {
      renderPopupCheckboxList(e.target.value);
    });

    filterPopupEl.querySelectorAll('.excel-filter-sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = btn.dataset.sort;
        if (columnSort.colKey === colKey && columnSort.direction === dir) {
          columnSort.colKey = null;
          columnSort.direction = null;
        } else {
          columnSort.colKey = colKey;
          columnSort.direction = dir;
        }
        renderDebiturTable();
        closeColumnFilterPopup();
      });
    });

    document.getElementById('popup-btn-clear').addEventListener('click', () => {
      columnFilters[colKey] = null;
      if (columnSort.colKey === colKey) {
        columnSort.colKey = null;
        columnSort.direction = null;
      }
      renderDebiturTable();
      closeColumnFilterPopup();
    });

    document.getElementById('popup-btn-apply').addEventListener('click', () => {
      const selectedSet = new Set();
      const checkboxContainer = document.getElementById('popup-checkbox-list-container');
      const itemCbs = checkboxContainer ? checkboxContainer.querySelectorAll('.popup-item-cb') : [];
      
      let totalChecked = 0;
      itemCbs.forEach(cb => {
        if (cb.checked) {
          selectedSet.add(cb.dataset.val);
          totalChecked++;
        }
      });

      const selectAllCb = document.getElementById('popup-select-all');
      if ((selectAllCb && selectAllCb.checked) || selectedSet.size === distinctValues.length) {
        columnFilters[colKey] = null;
      } else {
        columnFilters[colKey] = selectedSet;
      }

      renderDebiturTable();
      closeColumnFilterPopup();
    });
  }

  function closeColumnFilterPopup() {
    if (filterPopupEl) {
      filterPopupEl.classList.add('hidden');
      activePopupColKey = null;
    }
  }

  document.addEventListener('click', (e) => {
    if (unitAutocompleteList && !e.target.closest('.unit-search-wrapper')) {
      unitAutocompleteList.classList.add('hidden');
    }

    const btn = e.target.closest('.col-filter-btn');
    if (btn) {
      e.stopPropagation();
      const colKey = btn.dataset.col;
      if (activePopupColKey === colKey && filterPopupEl && !filterPopupEl.classList.contains('hidden')) {
        closeColumnFilterPopup();
      } else {
        openColumnFilterPopup(colKey, btn);
      }
      return;
    }

    if (filterPopupEl && !e.target.closest('#column-filter-popup')) {
      closeColumnFilterPopup();
    }
  });

  // ==========================================================================
  // EXPORT ENGINE (EXCEL CSV & EXECUTIVE PDF REPORT)
  // ==========================================================================
  // --------------------------------------------------------------------------
  // CHART GENERATORS FOR EXCEL EXPORT (HIGH-RES CANVAS & CHART.JS)
  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // DUAL PIVOT-STYLE COMPARISON CHARTS (UREG & USAK GENUINE: AGT vs SEP)
  // Matching User Reference Image: Two Side-by-Side PivotCharts
  // --------------------------------------------------------------------------
  function generateDualComparisonChartImage(valUsakPrev, valUsakCurr, valUregPrev, valUregCurr, labelPrev = 'September', labelCurr = 'Oktober') {
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 960;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');

        // Clean white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Axis scaling with fixed step 100 as requested by user
        function getAxisRange(val1, val2) {
          const v1 = Math.max(0, val1 || 0);
          const v2 = Math.max(0, val2 || 0);
          const minVal = Math.min(v1, v2);
          const maxVal = Math.max(v1, v2);

          if (minVal === 0 && maxVal === 0) {
            return { min: 0, max: 500, step: 100 };
          }

          // Step fixed at 100 (kelipatan 100)
          const step = (maxVal >= 100) ? 100 : 10;

          // Round baseline down to multiple of 100 with 1 step buffer below
          let baseline = Math.floor(minVal / step) * step - step;
          if (baseline < 0) baseline = 0;

          // Round ceil up to multiple of 100 with 1 step buffer above
          let ceil = Math.ceil(maxVal / step) * step + step;

          // Ensure at least 4 steps for clear, balanced grid visibility
          while ((ceil - baseline) / step < 4) {
            if (baseline >= step) {
              baseline -= step;
            } else {
              ceil += step;
            }
          }

          return { min: baseline, max: ceil, step: step };
        }

        // Draw grey beveled PivotTable filter/value buttons
        function drawPivotBadge(bx, by, text) {
          ctx.font = '600 11px Calibri, "Segoe UI", Arial, sans-serif';
          const textWidth = ctx.measureText(text).width;
          const bw = textWidth + 16;
          const bh = 22;

          const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
          grad.addColorStop(0, '#ECECEC');
          grad.addColorStop(1, '#D5D5D5');
          ctx.fillStyle = grad;
          ctx.fillRect(bx, by, bw, bh);

          ctx.strokeStyle = '#ADADAD';
          ctx.lineWidth = 1;
          ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

          ctx.fillStyle = '#262626';
          ctx.textAlign = 'center';
          ctx.fillText(text, bx + bw / 2, by + 15);
          return bw;
        }

        // Draw individual PivotChart Card
        function drawPivotCard(cx, cy, cWidth, cHeight, cfg) {
          // Card outer border
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(cx, cy, cWidth, cHeight);
          ctx.strokeStyle = '#C8C8C8';
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + 0.5, cy + 0.5, cWidth - 1, cHeight - 1);

          // Top Pivot Badges
          const b1w = drawPivotBadge(cx + 12, cy + 12, cfg.badge1);
          drawPivotBadge(cx + 12 + b1w + 6, cy + 12, cfg.badge2);

          // Plot Area Dimensions
          const plotLeft = cx + 60;
          const plotRight = cx + 315;
          const plotTop = cy + 52;
          const plotBottom = cy + 290;
          const plotWidth = plotRight - plotLeft;
          const plotHeight = plotBottom - plotTop;

          const { min, max, step } = getAxisRange(cfg.val1, cfg.val2);
          const numSteps = Math.max(1, Math.round((max - min) / step));

          // Horizontal Gridlines & Y-Axis Labels
          ctx.strokeStyle = '#E0E0E0';
          ctx.lineWidth = 1;
          for (let i = 0; i <= numSteps; i++) {
            const v = min + i * step;
            const py = plotBottom - (i / numSteps) * plotHeight;

            ctx.beginPath();
            ctx.moveTo(plotLeft, py);
            ctx.lineTo(plotRight, py);
            ctx.stroke();

            ctx.fillStyle = '#595959';
            ctx.font = '10.5px Calibri, "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(v.toLocaleString('id-ID'), plotLeft - 6, py + 3.5);
          }

          // Axis Baseline Lines
          ctx.strokeStyle = '#BFBFBF';
          ctx.beginPath();
          ctx.moveTo(plotLeft, plotTop);
          ctx.lineTo(plotLeft, plotBottom);
          ctx.lineTo(plotRight, plotBottom);
          ctx.stroke();

          // Grouped Bars
          const plotCenterX = (plotLeft + plotRight) / 2;
          const barWidth = 38;
          const bar1X = plotCenterX - barWidth - 1;
          const bar2X = plotCenterX + 1;

          const denom = (max - min) || 1;
          const h1 = Math.max(0, ((cfg.val1 - min) / denom) * plotHeight);
          const h2 = Math.max(0, ((cfg.val2 - min) / denom) * plotHeight);

          // Bar 1 (Previous - Classic Excel Blue)
          ctx.fillStyle = '#4472C4';
          ctx.fillRect(bar1X, plotBottom - h1, barWidth, h1);

          // Bar 2 (Current - Classic Excel Red/Maroon)
          ctx.fillStyle = '#C00000';
          ctx.fillRect(bar2X, plotBottom - h2, barWidth, h2);

          // Value labels above bars for crisp comparison
          ctx.fillStyle = '#262626';
          ctx.font = 'bold 11px Calibri, "Segoe UI", Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(cfg.val1.toLocaleString('id-ID'), bar1X + barWidth / 2, Math.max(plotTop + 12, plotBottom - h1 - 5));
          ctx.fillText(cfg.val2.toLocaleString('id-ID'), bar2X + barWidth / 2, Math.max(plotTop + 12, plotBottom - h2 - 5));

          // X-Axis Category label "Total"
          ctx.fillStyle = '#595959';
          ctx.font = '11px Calibri, "Segoe UI", Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Total', plotCenterX, plotBottom + 18);

          // Legend Box on the Right
          const legX = plotRight + 14;
          const legY = cy + 130;
          const legW = cWidth - (legX - cx) - 12;

          // Header badge 'Values'
          const gradV = ctx.createLinearGradient(legX, legY, legX, legY + 20);
          gradV.addColorStop(0, '#ECECEC');
          gradV.addColorStop(1, '#D5D5D5');
          ctx.fillStyle = gradV;
          ctx.fillRect(legX, legY, legW, 20);
          ctx.strokeStyle = '#ADADAD';
          ctx.strokeRect(legX + 0.5, legY + 0.5, legW - 1, 19);

          ctx.fillStyle = '#262626';
          ctx.font = '600 11px Calibri, "Segoe UI", Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('Values', legX + 8, legY + 14);

          // Legend Item 1 (Previous Month)
          const item1Y = legY + 28;
          ctx.fillStyle = '#4472C4';
          ctx.fillRect(legX + 2, item1Y, 10, 10);
          ctx.fillStyle = '#262626';
          ctx.font = '10px Calibri, "Segoe UI", Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(cfg.legend1Line1, legX + 16, item1Y + 9);
          if (cfg.legend1Line2) {
            ctx.fillText(cfg.legend1Line2, legX + 16, item1Y + 21);
          }

          // Legend Item 2 (Current Month)
          const item2Y = legY + (cfg.legend1Line2 ? 54 : 44);
          ctx.fillStyle = '#C00000';
          ctx.fillRect(legX + 2, item2Y, 10, 10);
          ctx.fillStyle = '#262626';
          ctx.font = '10px Calibri, "Segoe UI", Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(cfg.legend2Line1, legX + 16, item2Y + 9);
          if (cfg.legend2Line2) {
            ctx.fillText(cfg.legend2Line2, legX + 16, item2Y + 21);
          }
        }

        // 1. Draw Left Card: Perbandingan UREG
        drawPivotCard(10, 10, 465, 340, {
          badge1: `Sum of UREG (${labelPrev})`,
          badge2: `Sum of UREG (${labelCurr})`,
          val1: valUregPrev,
          val2: valUregCurr,
          legend1Line1: 'Sum of UREG',
          legend1Line2: `(${labelPrev})`,
          legend2Line1: 'Sum of UREG',
          legend2Line2: `(${labelCurr})`
        });

        // 2. Draw Right Card: Perbandingan USAK Genuine
        drawPivotCard(485, 10, 465, 340, {
          badge1: `Sum of USAK Genuine (${labelPrev})`,
          badge2: `Sum of USAK Genuine (${labelCurr})`,
          val1: valUsakPrev,
          val2: valUsakCurr,
          legend1Line1: 'Sum of USAK Genuine',
          legend1Line2: `(${labelPrev})`,
          legend2Line1: 'Sum of USAK Genuine',
          legend2Line2: `(${labelCurr})`
        });

        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        console.warn('Failed to generate dual comparison chart:', err);
        resolve(null);
      }
    });
  }

  function generateMkaChartImage(mkaList) {
    return new Promise((resolve) => {
      try {
        const topItems = (mkaList || []).slice(0, 6);
        if (topItems.length === 0) return resolve(null);

        const canvas = document.createElement('canvas');
        canvas.width = 960;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');

        const labels = topItems.map(item => {
          let n = item.name || '-';
          return n.length > 24 ? n.substring(0, 22) + '…' : n;
        });

        if (window.Chart) {
          const chart = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: labels,
              datasets: [
                {
                  label: 'Jumlah USAK Genuine',
                  data: topItems.map(i => i.usak),
                  backgroundColor: '#D97706',
                  borderRadius: 4
                }
              ]
            },
            options: {
              responsive: false,
              animation: false,
              indexAxis: 'y',
              layout: { padding: { top: 16, right: 28, bottom: 16, left: 16 } },
              plugins: {
                title: {
                  display: true,
                  text: 'Top Ranking Unit MKA - Kontribusi USAK Genuine',
                  font: { size: 15, weight: 'bold', family: 'Segoe UI' },
                  color: '#92400E',
                  padding: { bottom: 12 }
                },
                legend: { display: false }
              },
              scales: {
                x: {
                  beginAtZero: true,
                  grid: { color: '#E2E8F0' },
                  ticks: { font: { size: 10, family: 'Segoe UI' }, color: '#64748B' }
                },
                y: {
                  grid: { display: false },
                  ticks: { font: { size: 11, weight: '600', family: 'Segoe UI' }, color: '#1E293B' }
                }
              }
            },
            plugins: [{
              id: 'customBg',
              beforeDraw: (c) => {
                const cctx = c.ctx;
                cctx.save();
                cctx.globalCompositeOperation = 'destination-over';
                cctx.fillStyle = '#FFFFFF';
                cctx.fillRect(0, 0, c.width, c.height);
                cctx.restore();
              }
            }]
          });

          const dataUrl = canvas.toDataURL('image/png');
          chart.destroy();
          resolve(dataUrl);
        } else {
          drawCanvasMkaChartFallback(canvas, topItems);
          resolve(canvas.toDataURL('image/png'));
        }
      } catch (err) {
        console.warn('Failed to generate MKA chart:', err);
        resolve(null);
      }
    });
  }

  // ==========================================================================
  // EXPORT ENGINE (EXCEL WITH EMBEDDED CHARTS & EXECUTIVE PDF REPORT)
  // ==========================================================================
  async function exportToExcel() {
    const btnExportExcel = document.getElementById('btn-export-excel');
    const originalBtnText = btnExportExcel ? btnExportExcel.innerHTML : '';
    if (btnExportExcel) {
      btnExportExcel.disabled = true;
      btnExportExcel.innerHTML = '<span>⏳</span> Membuat Excel & Grafik...';
    }

    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      const unitLabel = selectedKodeUnit === 'ALL' ? 'Semua_Unit' : selectedKodeUnit;
      const filename = `Laporan_Executive_Mandiri_Merchant_${unitLabel}_${selectedMonth}_${timestamp}.xlsx`;

      // ------------------------------------------------------------------------
      // DATA COLLECTION
      // ------------------------------------------------------------------------
      const sgpData = [];
      const sgpRows = document.querySelectorAll('#sgp-summary-tbody tr');
      sgpRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 7) {
          sgpData.push({
            name: cells[0].textContent.trim(),
            agustusGenuine: parseInt(cells[1].textContent.trim()) || 0,
            septemberGenuine: parseInt(cells[2].textContent.trim()) || 0,
            oktoberGenuine: parseInt(cells[3].textContent.trim()) || 0,
            agustusUreg: parseInt(cells[4].textContent.trim()) || 0,
            septemberUreg: parseInt(cells[5].textContent.trim()) || 0,
            oktoberUreg: parseInt(cells[6].textContent.trim()) || 0
          });
        }
      });

      const elAgtTot = parseInt(document.getElementById('sgp-total-agustus')?.textContent) || 0;
      const elSepTot = parseInt(document.getElementById('sgp-total-september')?.textContent) || 0;
      const elOktTot = parseInt(document.getElementById('sgp-total-oktober')?.textContent) || 0;
      const elAgtUregTot = parseInt(document.getElementById('sgp-total-ureg-agustus')?.textContent) || 0;
      const elSepUregTot = parseInt(document.getElementById('sgp-total-ureg-september')?.textContent) || 0;
      const elOktUregTot = parseInt(document.getElementById('sgp-total-ureg-oktober')?.textContent) || 0;

      const mkaData = [];
      const rankRows = document.querySelectorAll('#leaderboard-tbody tr');
      rankRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 3) {
          mkaData.push({
            rank: parseInt(cells[0].textContent.trim()) || cells[0].textContent.trim(),
            name: cells[1].textContent.trim(),
            usak: parseInt(cells[2].textContent.trim()) || 0
          });
        }
      });
      const rankTotal = parseInt(document.getElementById('leaderboard-total-val')?.textContent) || 0;

      let currentDataset = (selectedMonth === 'agustus')
        ? masterDebiturAgustus
        : (selectedMonth === 'oktober' ? masterDebiturOktober : masterDebiturSeptember);
      if (!currentDataset || currentDataset.length === 0) currentDataset = masterDebiturOktober;
      let filteredDebitur = currentDataset;
      if (selectedKodeUnit && selectedKodeUnit !== 'ALL') {
        filteredDebitur = filteredDebitur.filter(d => d.kodeUnit === selectedKodeUnit);
      }
      if (tableSearchQuery) {
        filteredDebitur = filteredDebitur.filter(d => {
          return (d.debitur && d.debitur.toLowerCase().includes(tableSearchQuery)) ||
                 (d.sgp && d.sgp.toLowerCase().includes(tableSearchQuery)) ||
                 (d.cif && d.cif.toLowerCase().includes(tableSearchQuery)) ||
                 (d.rekening && d.rekening.toLowerCase().includes(tableSearchQuery)) ||
                 (d.kodeUnit && d.kodeUnit.toLowerCase().includes(tableSearchQuery)) ||
                 (d.status && d.status.toLowerCase().includes(tableSearchQuery)) ||
                 (d.tagging && d.tagging.toLowerCase().includes(tableSearchQuery)) ||
                 (d.tanggal && d.tanggal.toLowerCase().includes(tableSearchQuery));
        });
      }

      // ------------------------------------------------------------------------
      // MODERN EXCELJS ENGINE WITH FORMATTING & EMBEDDED CHARTS
      // ------------------------------------------------------------------------
      if (window.ExcelJS) {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'PT Bank Mandiri (Persero) Tbk.';
        workbook.created = new Date();

        // SHEET 1: RINGKASAN EXECUTIVE
        const ws1 = workbook.addWorksheet('Ringkasan Executive', {
          views: [{ showGridLines: true }]
        });

        // Set column widths across A-G
        ws1.columns = [
          { key: 'colA', width: 28 }, // Nama SGP
          { key: 'colB', width: 18 }, // USAK Agt
          { key: 'colC', width: 18 }, // USAK Sep
          { key: 'colD', width: 18 }, // USAK Okt
          { key: 'colE', width: 16 }, // UREG Agt
          { key: 'colF', width: 16 }, // UREG Sep
          { key: 'colG', width: 16 }  // UREG Okt
        ];

        // Title Header
        const titleCell = ws1.getCell('A1');
        titleCell.value = 'PT BANK MANDIRI (PERSERO) TBK.';
        titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF003D79' } };

        const subCell = ws1.getCell('A2');
        subCell.value = 'EXECUTIVE SUMMARY REPORT - DASHBOARD LVM MERCHANT';
        subCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFD97706' } };

        const metaCell1 = ws1.getCell('A3');
        metaCell1.value = `Bulan Monitoring: ${selectedMonth.toUpperCase()}   |   Kode Unit: ${resolveKodeUnitName(selectedKodeUnit) || 'Semua Unit'}`;
        metaCell1.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF475569' } };

        const metaCell2 = ws1.getCell('A4');
        metaCell2.value = `Tanggal Export: ${new Date().toLocaleString('id-ID')}`;
        metaCell2.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF64748B' } };

        // ----------------------------------------------------------------------
        // 1. DUAL COMPARISON CHARTS: UREG & USAK GENUINE
        // ----------------------------------------------------------------------
        const prevLbl = (selectedMonth === 'oktober') ? 'September' : 'Agustus';
        const currLbl = (selectedMonth === 'oktober') ? 'Oktober' : 'September';
        const prevUsakTot = (selectedMonth === 'oktober') ? elSepTot : elAgtTot;
        const currUsakTot = (selectedMonth === 'oktober') ? elOktTot : elSepTot;
        const prevUregTot = (selectedMonth === 'oktober') ? elSepUregTot : elAgtUregTot;
        const currUregTot = (selectedMonth === 'oktober') ? elOktUregTot : elSepUregTot;

        const dualChartImg = await generateDualComparisonChartImage(prevUsakTot, currUsakTot, prevUregTot, currUregTot, prevLbl, currLbl);
        if (dualChartImg) {
          const chartId = workbook.addImage({
            base64: dualChartImg,
            extension: 'png'
          });
          ws1.addImage(chartId, {
            tl: { col: 0, row: 5 }, // Kolom A, Baris 6 (0-indexed: row 5)
            ext: { width: 850, height: 320 }
          });
        }

        // Table 1 Section Header (Baris 25, di bawah grafik SGP)
        const sec1Cell = ws1.getCell('A25');
        sec1Cell.value = 'RINGKASAN USAK GENUINE & UREG PER SGP';
        sec1Cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF003D79' } };

        // Table 1 Columns Header (Baris 26)
        const sgpHeaders = [
          'Nama SGP',
          'USAK Genuine (Agustus)',
          'USAK Genuine (September)',
          'USAK Genuine (Oktober)',
          'UREG (Agustus)',
          'UREG (September)',
          'UREG (Oktober)'
        ];
        const headerRow = ws1.getRow(26);
        headerRow.height = 28;
        sgpHeaders.forEach((h, i) => {
          const cell = headerRow.getCell(i + 1);
          cell.value = h;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003D79' } };
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF002D5A' } },
            left: { style: 'thin', color: { argb: 'FF002D5A' } },
            bottom: { style: 'thin', color: { argb: 'FF002D5A' } },
            right: { style: 'thin', color: { argb: 'FF002D5A' } }
          };
        });

        // Table 1 Data Rows (Mulai Baris 27)
        let curRow = 27;
        sgpData.forEach((item, idx) => {
          const row = ws1.getRow(curRow);
          row.height = 20;
          const isZebra = idx % 2 === 1;
          const bgColor = isZebra ? 'FFF8FAFC' : 'FFFFFFFF';

          const c1 = row.getCell(1); c1.value = item.name; c1.alignment = { vertical: 'middle', horizontal: 'left' };
          const c2 = row.getCell(2); c2.value = item.agustusGenuine; c2.numFmt = '#,##0'; c2.alignment = { vertical: 'middle', horizontal: 'center' };
          const c3 = row.getCell(3); c3.value = item.septemberGenuine; c3.numFmt = '#,##0'; c3.alignment = { vertical: 'middle', horizontal: 'center' };
          const c4 = row.getCell(4); c4.value = item.oktoberGenuine; c4.numFmt = '#,##0'; c4.alignment = { vertical: 'middle', horizontal: 'center' };
          const c5 = row.getCell(5); c5.value = item.agustusUreg; c5.numFmt = '#,##0'; c5.alignment = { vertical: 'middle', horizontal: 'center' };
          const c6 = row.getCell(6); c6.value = item.septemberUreg; c6.numFmt = '#,##0'; c6.alignment = { vertical: 'middle', horizontal: 'center' };
          const c7 = row.getCell(7); c7.value = item.oktoberUreg; c7.numFmt = '#,##0'; c7.alignment = { vertical: 'middle', horizontal: 'center' };

          for (let c = 1; c <= 7; c++) {
            const cell = row.getCell(c);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
          }
          curRow++;
        });

        // Table 1 Total Row
        const totRow = ws1.getRow(curRow);
        totRow.height = 24;
        totRow.getCell(1).value = 'TOTAL OVERALL';
        totRow.getCell(2).value = elAgtTot; totRow.getCell(2).numFmt = '#,##0';
        totRow.getCell(3).value = elSepTot; totRow.getCell(3).numFmt = '#,##0';
        totRow.getCell(4).value = elOktTot; totRow.getCell(4).numFmt = '#,##0';
        totRow.getCell(5).value = elAgtUregTot; totRow.getCell(5).numFmt = '#,##0';
        totRow.getCell(6).value = elSepUregTot; totRow.getCell(6).numFmt = '#,##0';
        totRow.getCell(7).value = elOktUregTot; totRow.getCell(7).numFmt = '#,##0';

        for (let c = 1; c <= 7; c++) {
          const cell = totRow.getCell(c);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF003D79' } };
          cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF003D79' } },
            bottom: { style: 'double', color: { argb: 'FF003D79' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
        }
        const endSgpRow = curRow;

        // ----------------------------------------------------------------------
        // 2. GRAFIK KONTRIBUSI MKA (DITEMPATKAN DI ATAS TABEL MKA)
        // ----------------------------------------------------------------------
        const mkaChartStartRow = endSgpRow + 2;
        const mkaChartImg = await generateMkaChartImage(mkaData);
        if (mkaChartImg) {
          const mkaChartId = workbook.addImage({
            base64: mkaChartImg,
            extension: 'png'
          });
          ws1.addImage(mkaChartId, {
            tl: { col: 0, row: mkaChartStartRow - 1 }, // Kolom A (0-indexed)
            ext: { width: 780, height: 300 }
          });
        }

        // Table 2: Ranking Kode Unit - MKA (Di bawah Grafik MKA)
        const mkaTableStartRow = mkaChartStartRow + 17;
        const sec2Cell = ws1.getCell(`A${mkaTableStartRow}`);
        sec2Cell.value = 'RANKING KODE UNIT - MKA';
        sec2Cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFD97706' } };

        const mkaHeaders = ['Rank', 'Kode Unit - MKA', 'Jumlah USAK'];
        const mkaHeaderRow = ws1.getRow(mkaTableStartRow + 1);
        mkaHeaderRow.height = 26;
        mkaHeaders.forEach((h, i) => {
          const cell = mkaHeaderRow.getCell(i + 1);
          cell.value = h;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFB45309' } },
            left: { style: 'thin', color: { argb: 'FFB45309' } },
            bottom: { style: 'thin', color: { argb: 'FFB45309' } },
            right: { style: 'thin', color: { argb: 'FFB45309' } }
          };
        });

        let curMkaRow = mkaTableStartRow + 2;
        mkaData.forEach((item, idx) => {
          const row = ws1.getRow(curMkaRow);
          row.height = 20;
          const isZebra = idx % 2 === 1;
          const bgColor = isZebra ? 'FFFFFBEB' : 'FFFFFFFF';

          const c1 = row.getCell(1); c1.value = item.rank; c1.alignment = { vertical: 'middle', horizontal: 'center' };
          const c2 = row.getCell(2); c2.value = item.name; c2.alignment = { vertical: 'middle', horizontal: 'left' };
          const c3 = row.getCell(3); c3.value = item.usak; c3.numFmt = '#,##0'; c3.alignment = { vertical: 'middle', horizontal: 'center' };

          for (let c = 1; c <= 3; c++) {
            const cell = row.getCell(c);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
          }
          curMkaRow++;
        });

        // MKA Total Row
        const mkaTotRow = ws1.getRow(curMkaRow);
        mkaTotRow.height = 24;
        mkaTotRow.getCell(1).value = '';
        mkaTotRow.getCell(2).value = 'TOTAL OVERALL';
        mkaTotRow.getCell(3).value = rankTotal;
        mkaTotRow.getCell(3).numFmt = '#,##0';

        for (let c = 1; c <= 3; c++) {
          const cell = mkaTotRow.getCell(c);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF92400E' } };
          cell.alignment = { vertical: 'middle', horizontal: c === 2 ? 'left' : 'center' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD97706' } },
            bottom: { style: 'double', color: { argb: 'FFD97706' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
        }

        // SHEET 2: DATA DETAIL DEBITUR
        const ws2 = workbook.addWorksheet('Data Detail Debitur', {
          views: [{ showGridLines: true }]
        });

        ws2.columns = [
          { key: 'no', width: 8 },
          { key: 'sgp', width: 28 },
          { key: 'cif', width: 16 },
          { key: 'debitur', width: 32 },
          { key: 'rekening', width: 18 },
          { key: 'transaksi', width: 14 },
          { key: 'salesVolume', width: 18 },
          { key: 'status', width: 20 },
          { key: 'tagging', width: 26 }
        ];

        const debHeader = ws2.getRow(1);
        debHeader.height = 28;
        const debCols = ['No', 'Nama SGP', 'CIF', 'Nama Debitur', 'Rekening', 'Transaksi', 'Sales Volume', 'Status', 'Tagging'];
        debCols.forEach((h, i) => {
          const cell = debHeader.getCell(i + 1);
          cell.value = h;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002D5A' } };
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF001A36' } },
            bottom: { style: 'thin', color: { argb: 'FF001A36' } },
            left: { style: 'thin', color: { argb: 'FF001A36' } },
            right: { style: 'thin', color: { argb: 'FF001A36' } }
          };
        });

        filteredDebitur.forEach((d, i) => {
          const r = ws2.getRow(i + 2);
          r.height = 19;
          const isZebra = i % 2 === 1;
          const bg = isZebra ? 'FFF8FAFC' : 'FFFFFFFF';

          r.getCell(1).value = i + 1; r.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
          r.getCell(2).value = d.sgp || '-'; r.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
          r.getCell(3).value = d.cif || '-'; r.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
          r.getCell(4).value = d.debitur || '-'; r.getCell(4).alignment = { vertical: 'middle', horizontal: 'left' };
          r.getCell(5).value = d.rekening || '-'; r.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
          r.getCell(6).value = d.transaksi || 0; r.getCell(6).numFmt = '#,##0'; r.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
          r.getCell(7).value = d.salesVolume || 0; r.getCell(7).numFmt = '#,##0'; r.getCell(7).alignment = { vertical: 'middle', horizontal: 'right' };
          r.getCell(8).value = d.status || '-'; r.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' };
          r.getCell(9).value = d.tagging || d.tanggal || '-'; r.getCell(9).alignment = { vertical: 'middle', horizontal: 'center' };

          for (let c = 1; c <= 9; c++) {
            const cell = r.getCell(c);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
          }
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      // ------------------------------------------------------------------------
      // FALLBACK TO SHEETJS IF EXCELJS NOT LOADED
      // ------------------------------------------------------------------------
      const summaryData = [
        ["PT BANK MANDIRI (PERSERO) TBK. - EXECUTIVE REPORT DASHBOARD MERCHANT"],
        ["Bulan Monitoring:", selectedMonth.toUpperCase()],
        ["Kode Unit Filter:", resolveKodeUnitName(selectedKodeUnit) || 'Semua Unit'],
        ["Tanggal Export:", new Date().toLocaleString('id-ID')],
        [],
        ["--- RINGKASAN USAK GENUINE & UREG PER SGP ---"],
        ["Nama SGP", "USAK Genuine (Agustus)", "USAK Genuine (September)", "UREG (Agustus)", "UREG (September)"]
      ];
      sgpData.forEach(item => {
        summaryData.push([item.name, item.agustusGenuine, item.septemberGenuine, item.agustusUreg, item.septemberUreg]);
      });
      summaryData.push(["TOTAL OVERALL", elAgtTot, elSepTot, elAgtUregTot, elSepUregTot]);
      summaryData.push([]);
      summaryData.push(["--- RANKING KODE UNIT - MKA ---"]);
      summaryData.push(["Rank", "Kode Unit - MKA", "Jumlah USAK"]);
      mkaData.forEach(item => {
        summaryData.push([item.rank, item.name, item.usak]);
      });
      summaryData.push(["TOTAL OVERALL", "", rankTotal]);

      const debiturAoa = [
        ["No", "Nama SGP", "CIF", "Nama Debitur", "Rekening", "Transaksi", "Sales Volume", "Status", "Tagging"]
      ];
      filteredDebitur.forEach((d, i) => {
        debiturAoa.push([
          i + 1, d.sgp || '-', d.cif || '-', d.debitur || '-', d.rekening || '-',
          d.transaksi || 0, d.salesVolume || 0, d.status || '-', d.tagging || d.tanggal || '-'
        ]);
      });

      if (window.XLSX) {
        const wb = XLSX.utils.book_new();
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        const wsDebitur = XLSX.utils.aoa_to_sheet(debiturAoa);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Ringkasan Executive");
        XLSX.utils.book_append_sheet(wb, wsDebitur, "Data Detail Debitur");
        XLSX.writeFile(wb, filename);
      }
    } catch (err) {
      console.error('Export Excel error:', err);
      alert('Terjadi kendala saat export Excel: ' + err.message);
    } finally {
      if (btnExportExcel) {
        btnExportExcel.disabled = false;
        btnExportExcel.innerHTML = originalBtnText || '<span>📊</span> Export Excel';
      }
    }
  }

  async function exportToPdf() {
    const btnExportPdf = document.getElementById('btn-export-pdf');
    const originalBtnHtml = btnExportPdf ? btnExportPdf.innerHTML : '';
    if (btnExportPdf) {
      btnExportPdf.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses PDF...';
      btnExportPdf.disabled = true;
    }

    try {
      // 1. Ensure charts are rendered
      if (!sgpChartInstance || !debtorDonutChartInstance) {
        renderDashboardCharts();
      }

      // Ensure canvas frames are fully rendered
      if (sgpChartInstance && typeof sgpChartInstance.update === 'function') {
        sgpChartInstance.update('none');
      }
      if (debtorDonutChartInstance && typeof debtorDonutChartInstance.update === 'function') {
        debtorDonutChartInstance.update('none');
      }

      // Helper to capture canvas with crisp opaque dark navy background
      function getCanvasImageWithBg(canvas, bgColor = '#0c182c') {
        if (!canvas || !canvas.width || !canvas.height) return '';
        try {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          const ctx = tempCanvas.getContext('2d');
          if (!ctx) return canvas.toDataURL('image/png');
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
          ctx.drawImage(canvas, 0, 0);
          return tempCanvas.toDataURL('image/png', 1.0);
        } catch (err) {
          console.warn('Canvas export capture fallback:', err);
          return canvas.toDataURL ? canvas.toDataURL('image/png') : '';
        }
      }

      const timestamp = new Date().toLocaleDateString('id-ID');
      const unitText = resolveKodeUnitName(selectedKodeUnit) || 'Semua Unit';

      const sgpCanvas = document.getElementById('sgp-comparison-chart');
      const donutCanvas = document.getElementById('debtor-composition-chart');
      const sgpImgData = getCanvasImageWithBg(sgpCanvas, '#0c182c');
      const donutImgData = getCanvasImageWithBg(donutCanvas, '#0c182c');

      // 2. Capture Text Labels and Stats from DOM
      const pdfSgpSubtitle = document.getElementById('sgp-chart-subtitle')?.textContent || 'Agustus vs September • Kenaikan/Penurunan per SGP';
      const pdfSgpLblPrev = document.getElementById('sgp-badge-lbl-prev')?.textContent || 'Sep:';
      const pdfSgpLblCurr = document.getElementById('sgp-badge-lbl-curr')?.textContent || 'Okt:';
      const pdfSgpAgt = document.getElementById('sgp-badge-val-agt')?.textContent || '0';
      const pdfSgpSep = document.getElementById('sgp-badge-val-sep')?.textContent || '0';
      const pdfSgpGrowth = document.getElementById('sgp-badge-growth-val')?.textContent || '+0';

      const pdfDonutSubtitle = document.getElementById('donut-chart-subtitle')?.textContent || 'Rasio USAK, UREG & Non UREG';
      const pdfDonutTotal = document.getElementById('donut-badge-val-total')?.textContent || '0';
      const pdfUsakVal = document.getElementById('donut-stat-count-usak')?.textContent || '0';
      const pdfUsakPct = document.getElementById('donut-stat-pct-usak')?.textContent || '0%';
      const pdfUregVal = document.getElementById('donut-stat-count-ureg')?.textContent || '0';
      const pdfUregPct = document.getElementById('donut-stat-pct-ureg')?.textContent || '0%';
      const pdfNonUregVal = document.getElementById('donut-stat-count-non-ureg')?.textContent || '0';
      const pdfNonUregPct = document.getElementById('donut-stat-pct-non-ureg')?.textContent || '0%';

      const pdfReportEl = document.createElement('div');
      pdfReportEl.className = 'pdf-report-container';
      pdfReportEl.style.cssText = `
        padding: 20px 24px;
        font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
        background-color: #ffffff;
        color: #0f172a;
        width: 720px;
        box-sizing: border-box;
      `;

      // Build structured HTML using robust tables for 100% html2pdf compatibility
      pdfReportEl.innerHTML = `
        <!-- HEADER -->
        <div style="border-bottom: 3px solid #003D79; padding-bottom: 12px; margin-bottom: 14px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="vertical-align: middle;">
                <h1 style="color: #003D79; font-size: 19px; font-weight: 800; margin: 0; line-height: 1.2;">PT BANK MANDIRI (PERSERO) TBK.</h1>
                <h2 style="color: #FFB700; font-size: 12.5px; font-weight: 700; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 0.5px;">Executive Summary Report - Merchant Dashboard</h2>
              </td>
              <td style="text-align: right; vertical-align: middle; font-size: 10.5px; color: #64748b; line-height: 1.5; white-space: nowrap;">
                <div><strong>Tanggal Laporan:</strong> ${timestamp}</div>
                <div><strong>Periode:</strong> ${selectedMonth.toUpperCase()}</div>
                <div><strong>Kode Unit:</strong> ${escapeAttr(unitText)}</div>
              </td>
            </tr>
          </table>
        </div>

        <!-- 3 KPI METRIC CARDS -->
        <table style="width: 100%; border-collapse: separate; border-spacing: 10px 0; table-layout: fixed; margin-bottom: 16px;">
          <tr>
            <td style="background-color: #f0f9ff; border: 1.5px solid #0284c7; border-radius: 6px; padding: 10px 8px; text-align: center;">
              <div style="font-size: 10px; color: #0369a1; font-weight: 700; letter-spacing: 0.5px;">TOTAL USAK</div>
              <div style="font-size: 20px; font-weight: 800; color: #0284c7; margin-top: 3px;">${pdfUsakVal}</div>
              <div style="font-size: 9px; color: #0284c7; font-weight: 600; margin-top: 2px;">${pdfUsakPct} dari Total Debitur</div>
            </td>
            <td style="background-color: #fffbeb; border: 1.5px solid #d97706; border-radius: 6px; padding: 10px 8px; text-align: center;">
              <div style="font-size: 10px; color: #b45309; font-weight: 700; letter-spacing: 0.5px;">TOTAL UREG</div>
              <div style="font-size: 20px; font-weight: 800; color: #d97706; margin-top: 3px;">${pdfUregVal}</div>
              <div style="font-size: 9px; color: #b45309; font-weight: 600; margin-top: 2px;">${pdfUregPct} dari Total Debitur</div>
            </td>
            <td style="background-color: #f8fafc; border: 1.5px solid #64748b; border-radius: 6px; padding: 10px 8px; text-align: center;">
              <div style="font-size: 10px; color: #475569; font-weight: 700; letter-spacing: 0.5px;">TOTAL NON UREG</div>
              <div style="font-size: 20px; font-weight: 800; color: #475569; margin-top: 3px;">${pdfNonUregVal}</div>
              <div style="font-size: 9px; color: #64748b; font-weight: 600; margin-top: 2px;">${pdfNonUregPct} dari Total Debitur</div>
            </td>
          </tr>
        </table>

        <!-- VISUAL INSIGHTS CHARTS SECTION (BULLETPROOF TABLE LAYOUT FOR HTML2PDF) -->
        <div style="margin-bottom: 18px; page-break-inside: avoid; break-inside: avoid;">
          <h3 style="font-size: 12.5px; color: #003D79; border-left: 4px solid #FFB700; padding-left: 8px; margin: 0 0 10px 0; font-weight: 700;">
            Grafik Visual Pertumbuhan & Komposisi Debitur
          </h3>
          <table style="width: 100%; border-collapse: separate; border-spacing: 10px 0; table-layout: fixed;">
            <tr>
              <!-- Card 1: Perbandingan USAK Genuine Bar Chart -->
              <td style="width: 59%; vertical-align: top; background-color: #0c182c; border: 1.5px solid #1e3a6a; border-radius: 8px; padding: 12px; box-sizing: border-box;">
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
                  <tr>
                    <td style="vertical-align: middle;">
                      <div style="color: #ffffff; font-size: 11.5px; font-weight: 700;">Perbandingan USAK Genuine</div>
                      <div style="color: #94a3b8; font-size: 9px; margin-top: 2px;">${escapeAttr(pdfSgpSubtitle)}</div>
                    </td>
                    <td style="text-align: right; vertical-align: middle; white-space: nowrap;">
                      <span style="font-size: 9px; color: #e2e8f0; display: inline-block; margin-right: 8px;">
                        <span style="display: inline-block; width: 7.5px; height: 7.5px; border-radius: 2px; background-color: #38bdf8; margin-right: 4px; vertical-align: middle;"></span>${escapeAttr(pdfSgpLblPrev)} <strong style="color: #ffffff;">${pdfSgpAgt}</strong>
                      </span>
                      <span style="font-size: 9px; color: #e2e8f0; display: inline-block; margin-right: 8px;">
                        <span style="display: inline-block; width: 7.5px; height: 7.5px; border-radius: 2px; background-color: #ef4444; margin-right: 4px; vertical-align: middle;"></span>${escapeAttr(pdfSgpLblCurr)} <strong style="color: #ffffff;">${pdfSgpSep}</strong>
                      </span>
                      <span style="color: #34d399; font-weight: 800; font-size: 9.5px; display: inline-block;">${pdfSgpGrowth}</span>
                    </td>
                  </tr>
                </table>
                <div style="text-align: center; min-height: 185px; padding: 2px 0;">
                  ${sgpImgData ? `<img src="${sgpImgData}" style="width: 100%; height: auto; max-height: 195px; object-fit: contain; display: block; margin: 0 auto; border-radius: 4px;" />` : '<div style="color: #94a3b8; font-size: 11px; padding: 40px 0;">Grafik tidak tersedia</div>'}
                </div>
              </td>

              <!-- Card 2: Komposisi Debitur Donut Chart -->
              <td style="width: 41%; vertical-align: top; background-color: #0c182c; border: 1.5px solid #1e3a6a; border-radius: 8px; padding: 12px; box-sizing: border-box;">
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
                  <tr>
                    <td style="vertical-align: middle;">
                      <div style="color: #ffffff; font-size: 11.5px; font-weight: 700;">Komposisi Debitur</div>
                      <div style="color: #94a3b8; font-size: 9px; margin-top: 2px;">${escapeAttr(pdfDonutSubtitle)}</div>
                    </td>
                    <td style="text-align: right; vertical-align: middle; white-space: nowrap;">
                      <span style="font-size: 9px; color: #e2e8f0; display: inline-block;">
                        Total: <strong style="color: #ffffff;">${pdfDonutTotal}</strong>
                      </span>
                    </td>
                  </tr>
                </table>

                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="width: 53%; text-align: center; vertical-align: middle; padding: 4px 2px;">
                      ${donutImgData ? `<img src="${donutImgData}" style="width: 100%; max-width: 135px; height: auto; max-height: 160px; object-fit: contain; display: block; margin: 0 auto; border-radius: 4px;" />` : '<div style="color: #94a3b8; font-size: 11px; padding: 40px 0;">Grafik tidak tersedia</div>'}
                    </td>
                    <td style="width: 47%; vertical-align: middle; padding-left: 6px;">
                      <div style="background-color: #16243d; border-left: 3px solid #38bdf8; border-radius: 4px; padding: 5px 7px; margin-bottom: 5px;">
                        <div style="font-size: 8px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">USAK</div>
                        <div style="font-size: 11px; font-weight: 800; color: #f8fafc; margin-top: 1px;">${pdfUsakVal} <span style="font-size: 8.5px; color: #38bdf8; font-weight: 700;">(${pdfUsakPct})</span></div>
                      </div>
                      <div style="background-color: #16243d; border-left: 3px solid #f59e0b; border-radius: 4px; padding: 5px 7px; margin-bottom: 5px;">
                        <div style="font-size: 8px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">UREG</div>
                        <div style="font-size: 11px; font-weight: 800; color: #f8fafc; margin-top: 1px;">${pdfUregVal} <span style="font-size: 8.5px; color: #f59e0b; font-weight: 700;">(${pdfUregPct})</span></div>
                      </div>
                      <div style="background-color: #16243d; border-left: 3px solid #94a3b8; border-radius: 4px; padding: 5px 7px;">
                        <div style="font-size: 8px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">Non UREG</div>
                        <div style="font-size: 11px; font-weight: 800; color: #f8fafc; margin-top: 1px;">${pdfNonUregVal} <span style="font-size: 8.5px; color: #cbd5e1; font-weight: 700;">(${pdfNonUregPct})</span></div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>

        <!-- TOP RANKING LEADERBOARD TABLE (BAGIAN AWAL - TOP 10 BESAR) -->
        <div style="margin-bottom: 22px; page-break-inside: avoid; break-inside: avoid;">
          <h3 style="font-size: 12.5px; color: #003D79; border-left: 4px solid #FFB700; padding-left: 8px; margin: 0 0 8px 0; font-weight: 700;">
            Top 10 Ranking Unit MKA
          </h3>
          ${document.querySelector('.leaderboard-card-yellow')?.outerHTML || ''}
        </div>

        <!-- LAMPIRAN (PAGE BREAK KE HALAMAN BARU) -->
        <div style="page-break-before: always; break-before: page; margin-top: 24px;"></div>

        <!-- RINGKASAN KINERJA SGP TABLE (LAMPIRAN) -->
        <div style="margin-bottom: 20px;">
          <div style="border-bottom: 2px solid #003D79; padding-bottom: 6px; margin-bottom: 12px;">
            <h3 style="font-size: 13px; color: #003D79; margin: 0; font-weight: 800; text-transform: uppercase;">
              LAMPIRAN: Ringkasan Kinerja SGP (USAK Genuine & UREG)
            </h3>
            <div style="font-size: 9.5px; color: #64748b; margin-top: 3px;">
              Detail perolehan debitur per SGP untuk periode ${selectedMonth.toUpperCase()}
            </div>
          </div>
          ${document.querySelector('.sgp-summary-card')?.outerHTML || ''}
        </div>

        <!-- FOOTER -->
        <div style="font-size: 9.5px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 16px;">
          PT Bank Mandiri (Persero) Tbk. Berizin dan Diawasi oleh Otoritas Jasa Keuangan (OJK) dan Bank Indonesia (BI), Serta Merupakan Peserta Penjaminan LPS.
        </div>
      `;

      // Filter only Top 10 rows for Leaderboard in the PDF
      const pdfLeaderboardTbody = pdfReportEl.querySelector('#leaderboard-tbody');
      let top10Total = 0;
      if (pdfLeaderboardTbody) {
        const rows = Array.from(pdfLeaderboardTbody.querySelectorAll('tr'));
        rows.forEach((row, idx) => {
          if (idx >= 10) {
            row.remove();
          } else {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
              const numVal = parseInt(cells[2].textContent.replace(/\D/g, '') || '0', 10);
              top10Total += numVal;
            }
          }
        });
      }

      // Update footer total in Top 10 Leaderboard
      const pdfLeaderboardTfoot = pdfReportEl.querySelector('.leaderboard-table tfoot');
      if (pdfLeaderboardTfoot) {
        const labelCell = pdfLeaderboardTfoot.querySelector('td:first-child');
        const valCell = pdfLeaderboardTfoot.querySelector('#leaderboard-total-val') || pdfLeaderboardTfoot.querySelector('.total-cell');
        if (labelCell) labelCell.textContent = 'Total Top 10';
        if (valCell) valCell.textContent = top10Total.toLocaleString('id-ID');
      }

      // Ensure cloned tables show all rows without scrolling/clipping in PDF, and expand to 100% width
      pdfReportEl.querySelectorAll('.sgp-table-wrapper, .leaderboard-table-container').forEach(el => {
        el.style.maxHeight = 'none';
        el.style.overflow = 'visible';
        el.style.width = '100%';
      });

      pdfReportEl.querySelectorAll('.sgp-summary-card, .leaderboard-card-yellow').forEach(el => {
        el.style.width = '100%';
        el.style.maxWidth = '100%';
        el.style.boxSizing = 'border-box';
        el.style.boxShadow = 'none';
      });

      pdfReportEl.querySelectorAll('.sgp-summary-table, .leaderboard-table').forEach(el => {
        el.style.width = '100%';
      });

      // Avoid slicing table rows across page boundaries
      pdfReportEl.querySelectorAll('tr').forEach(tr => {
        tr.style.pageBreakInside = 'avoid';
        tr.style.breakInside = 'avoid';
      });

      document.body.appendChild(pdfReportEl);

      // Wait for all images inside pdfReportEl to decode/load before passing to html2pdf
      const imgElements = Array.from(pdfReportEl.querySelectorAll('img'));
      await Promise.all(imgElements.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 300);
        });
      }));

      // Extra short delay for browser to finish layout reflow
      await new Promise(r => setTimeout(r, 120));

      if (window.html2pdf) {
        const opt = {
          margin:       [0.3, 0.3, 0.3, 0.3],
          filename:     `Laporan_Executive_Mandiri_Merchant_${selectedMonth}.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true, logging: false },
          jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
          pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
        };

        await window.html2pdf().set(opt).from(pdfReportEl).save();
      } else {
        window.print();
      }

    } catch (err) {
      console.error('PDF export error:', err);
      alert('Terjadi kesalahan saat membuat file PDF: ' + (err.message || err));
    } finally {
      const container = document.querySelector('.pdf-report-container');
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      if (btnExportPdf) {
        btnExportPdf.innerHTML = originalBtnHtml;
        btnExportPdf.disabled = false;
      }
    }
  }

  const btnExportExcel = document.getElementById('btn-export-excel');
  if (btnExportExcel) btnExportExcel.addEventListener('click', exportToExcel);

  const btnExportPdf = document.getElementById('btn-export-pdf');
  if (btnExportPdf) btnExportPdf.addEventListener('click', exportToPdf);

  const debiturTableContainer = document.querySelector('.debitur-table-container');
  if (debiturTableContainer) {
    debiturTableContainer.addEventListener('scroll', closeColumnFilterPopup, { passive: true });
  }
  window.addEventListener('scroll', closeColumnFilterPopup, { passive: true });

  // Initial Fetch & Start Polling Timer (10s)
  fetchDashboardApi();
  setInterval(fetchDashboardApi, AUTO_REFRESH_MS);
});
