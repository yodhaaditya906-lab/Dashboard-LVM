/* ==========================================================================
   BANK MANDIRI POWERBI DASHBOARD - SGP REAL-TIME VIEWER ENGINE
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const API_ENDPOINT = '/api/data';
  const AUTO_REFRESH_MS = 10000;

  let masterDebiturSeptember = [];
  let masterDebiturAgustus = [];
  let masterMkaRanksSeptember = [];
  let masterMkaRanksAgustus = [];
  let masterUnitList = [];
  let kodeUnitToMkaMap = {};
  let selectedKodeUnit = 'ALL';
  let selectedMonth = 'september';
  let tableSearchQuery = '';

  let totalUsakGenuineSeptember = 0;
  let totalUregSeptember = 0;
  let totalUsakGenuineAgustus = 0;
  let totalUregAgustus = 0;

  // Excel Column-Specific Filter & Sort State
  const columnFilters = {
    sgp: null,
    cif: null,
    debitur: null,
    rekening: null,
    transaksi: null,
    salesVolume: null,
    status: null
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
    return '';
  }

  function getRowColNumericValue(d, colKey) {
    if (colKey === 'transaksi') return d.transaksi || 0;
    if (colKey === 'salesVolume') return d.salesVolume || 0;
    return 0;
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
      if (!data) return;

      masterDebiturSeptember = data.debiturDataSeptember || data.debiturData || [];
      masterDebiturAgustus = data.debiturDataAgustus || [];
      masterMkaRanksSeptember = data.mkaRanksSeptember || data.mkaRanks || [];
      masterMkaRanksAgustus = data.mkaRanksAgustus || [];

      masterUnitList = data.unitList || [];
      kodeUnitToMkaMap = data.kodeUnitToMkaMap || {};

      totalUsakGenuineSeptember = data.totalUsakGenuineSeptember || data.totalUsakGenuine || 0;
      totalUregSeptember = data.totalUregSeptember || data.totalUreg || 0;
      totalUsakGenuineAgustus = data.totalUsakGenuineAgustus || 0;
      totalUregAgustus = data.totalUregAgustus || 0;

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

    const ranks = (selectedMonth === 'agustus') ? masterMkaRanksAgustus : masterMkaRanksSeptember;
    const activeRanks = (ranks && ranks.length > 0) ? ranks : masterMkaRanksSeptember;

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

    let currentDataset = (selectedMonth === 'agustus') ? masterDebiturAgustus : masterDebiturSeptember;
    if (!currentDataset || currentDataset.length === 0) {
      currentDataset = masterDebiturSeptember;
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
               (d.status && d.status.toLowerCase().includes(tableSearchQuery));
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
      if (d.status && d.status.toUpperCase().includes('UREG') && !d.status.toUpperCase().includes('NON')) {
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
        </tr>
      `);
    }

    if (isCapped) {
      rowsHtml.push(`
        <tr class="row-dark">
          <td colspan="8" style="text-align: center; padding: 10px; color: #38bdf8;">
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
    const activeTotalUsak = (selectedMonth === 'agustus') ? totalUsakGenuineAgustus : totalUsakGenuineSeptember;
    const activeTotalUreg = (selectedMonth === 'agustus') ? totalUregAgustus : totalUregSeptember;

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

  // Render SGP USAK Genuine & UREG Summary Matrix Table (Agustus & September)
  function renderSgpSummaryTable() {
    const tbody = document.getElementById('sgp-summary-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let filteredSep = masterDebiturSeptember;
    let filteredAgus = masterDebiturAgustus;

    if (selectedKodeUnit && selectedKodeUnit !== 'ALL') {
      filteredSep = masterDebiturSeptember.filter(d => d.kodeUnit === selectedKodeUnit);
      filteredAgus = masterDebiturAgustus.filter(d => d.kodeUnit === selectedKodeUnit);
    }

    const sgpMap = {};

    // September Data
    filteredSep.forEach(d => {
      const sgpName = (d.sgp || d.namaMka || 'UNASSIGNED').trim();
      if (!sgpName || sgpName === 'UNASSIGNED') return;
      const upperSgp = sgpName.toUpperCase();
      if (!sgpMap[upperSgp]) {
        sgpMap[upperSgp] = { name: sgpName, septemberGenuine: 0, agustusGenuine: 0, septemberUreg: 0, agustusUreg: 0 };
      }
      if (d.isGenuine) {
        sgpMap[upperSgp].septemberGenuine += 1;
      }
      if (isUregStatus(d.status)) {
        sgpMap[upperSgp].septemberUreg += 1;
      }
    });

    // August Data
    filteredAgus.forEach(d => {
      const sgpName = (d.sgp || d.namaMka || 'UNASSIGNED').trim();
      if (!sgpName || sgpName === 'UNASSIGNED') return;
      const upperSgp = sgpName.toUpperCase();
      if (!sgpMap[upperSgp]) {
        sgpMap[upperSgp] = { name: sgpName, septemberGenuine: 0, agustusGenuine: 0, septemberUreg: 0, agustusUreg: 0 };
      }
      if (d.isGenuine) {
        sgpMap[upperSgp].agustusGenuine += 1;
      }
      if (isUregStatus(d.status)) {
        sgpMap[upperSgp].agustusUreg += 1;
      }
    });

    const sgpList = Object.values(sgpMap);
    sgpList.sort((a, b) => {
      if (b.septemberGenuine !== a.septemberGenuine) {
        return b.septemberGenuine - a.septemberGenuine;
      }
      if (b.agustusGenuine !== a.agustusGenuine) {
        return b.agustusGenuine - a.agustusGenuine;
      }
      if (b.septemberUreg !== a.septemberUreg) {
        return b.septemberUreg - a.septemberUreg;
      }
      return a.name.localeCompare(b.name);
    });

    let sumAgustusGenuine = 0;
    let sumSeptemberGenuine = 0;
    let sumAgustusUreg = 0;
    let sumSeptemberUreg = 0;

    if (sgpList.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" class="td-center" style="color: #666; font-style: italic;">Tidak ada SGP dengan USAK Genuine / UREG</td>`;
      tbody.appendChild(tr);
    } else {
      sgpList.forEach(item => {
        sumAgustusGenuine += item.agustusGenuine;
        sumSeptemberGenuine += item.septemberGenuine;
        sumAgustusUreg += item.agustusUreg;
        sumSeptemberUreg += item.septemberUreg;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td title="${escapeAttr(item.name)}">${item.name}</td>
          <td class="td-center">${item.agustusGenuine}</td>
          <td class="td-center">${item.septemberGenuine}</td>
          <td class="td-center">${item.agustusUreg}</td>
          <td class="td-center">${item.septemberUreg}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    const elAgustusTotal = document.getElementById('sgp-total-agustus');
    const elSeptemberTotal = document.getElementById('sgp-total-september');
    const elUregAgustusTotal = document.getElementById('sgp-total-ureg-agustus');
    const elUregSeptemberTotal = document.getElementById('sgp-total-ureg-september');

    if (elAgustusTotal) elAgustusTotal.textContent = sumAgustusGenuine;
    if (elSeptemberTotal) elSeptemberTotal.textContent = sumSeptemberGenuine;
    if (elUregAgustusTotal) elUregAgustusTotal.textContent = sumAgustusUreg;
    if (elUregSeptemberTotal) elUregSeptemberTotal.textContent = sumSeptemberUreg;
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

  if (monthSelect) {
    monthSelect.addEventListener('change', (e) => {
      selectedMonth = e.target.value;
      renderLeaderboard();
      renderDebiturTable();
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

    let baseDataset = (selectedMonth === 'agustus') ? masterDebiturAgustus : masterDebiturSeptember;
    if (!baseDataset || baseDataset.length === 0) baseDataset = masterDebiturSeptember;

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
               (d.status && d.status.toLowerCase().includes(tableSearchQuery));
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
      return a.localeCompare(b);
    });

    const isNumeric = (colKey === 'transaksi' || colKey === 'salesVolume');
    const sortAscLabel = isNumeric ? '🔼 Urutkan Terkecil ke Terbesar' : '🔼 Urutkan A ke Z';
    const sortDescLabel = isNumeric ? '🔽 Urutkan Terbesar ke Terkecil' : '🔽 Urutkan Z ke A';

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
  function exportToExcel() {
    const timestamp = new Date().toISOString().slice(0, 10);
    const unitLabel = selectedKodeUnit === 'ALL' ? 'Semua_Unit' : selectedKodeUnit;
    const filename = `Laporan_Executive_Mandiri_Merchant_${unitLabel}_${selectedMonth}_${timestamp}.csv`;

    let csvContent = "\uFEFF"; // UTF-8 BOM for Microsoft Excel compatibility

    // Header Metadata
    csvContent += `"PT BANK MANDIRI (PERSERO) TBK. - EXECUTIVE REPORT DASHBOARD MERCHANT"\n`;
    csvContent += `"Bulan Monitoring:","${selectedMonth.toUpperCase()}"\n`;
    csvContent += `"Kode Unit Filter:","${resolveKodeUnitName(selectedKodeUnit) || 'Semua Unit'}"\n`;
    csvContent += `"Tanggal Export:","${new Date().toLocaleString('id-ID')}"\n\n`;

    // Section 1: Ringkasan SGP
    csvContent += `"--- RINGKASAN USAK GENUINE & UREG PER SGP ---"\n`;
    csvContent += `"Nama SGP","USAK Genuine (Agustus)","USAK Genuine (September)","UREG (Agustus)","UREG (September)"\n`;

    const sgpRows = document.querySelectorAll('#sgp-summary-tbody tr');
    sgpRows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length === 5) {
        const name = `"${cells[0].textContent.replace(/"/g, '""')}"`;
        const agtUsak = `"${cells[1].textContent.trim()}"`;
        const sepUsak = `"${cells[2].textContent.trim()}"`;
        const agtUreg = `"${cells[3].textContent.trim()}"`;
        const sepUreg = `"${cells[4].textContent.trim()}"`;
        csvContent += `${name},${agtUsak},${sepUsak},${agtUreg},${sepUreg}\n`;
      }
    });

    const elAgtTot = document.getElementById('sgp-total-agustus')?.textContent || '0';
    const elSepTot = document.getElementById('sgp-total-september')?.textContent || '0';
    const elAgtUregTot = document.getElementById('sgp-total-ureg-agustus')?.textContent || '0';
    const elSepUregTot = document.getElementById('sgp-total-ureg-september')?.textContent || '0';
    csvContent += `"TOTAL OVERALL","${elAgtTot}","${elSepTot}","${elAgtUregTot}","${elSepUregTot}"\n\n`;

    // Section 2: Peringkat Kode Unit MKA
    csvContent += `"--- RANKING KODE UNIT - MKA ---"\n`;
    csvContent += `"Rank","Kode Unit - MKA","Jumlah USAK"\n`;
    const rankRows = document.querySelectorAll('#leaderboard-tbody tr');
    rankRows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length === 3) {
        csvContent += `"${cells[0].textContent.trim()}","${cells[1].textContent.replace(/"/g, '""')}","${cells[2].textContent.trim()}"\n`;
      }
    });
    const rankTotal = document.getElementById('leaderboard-total-val')?.textContent || '0';
    csvContent += `"TOTAL OVERALL","","${rankTotal}"\n\n`;

    // Section 3: Detail Debitur Monitoring
    csvContent += `"--- DETAIL DEBITUR MONITORING (${selectedMonth.toUpperCase()}) ---"\n`;
    csvContent += `"No","Nama SGP","CIF","Nama Debitur","Rekening","Transaksi","Sales Volume","Status"\n`;

    let currentDataset = (selectedMonth === 'agustus') ? masterDebiturAgustus : masterDebiturSeptember;
    if (!currentDataset || currentDataset.length === 0) currentDataset = masterDebiturSeptember;
    let filtered = currentDataset;
    if (selectedKodeUnit && selectedKodeUnit !== 'ALL') {
      filtered = filtered.filter(d => d.kodeUnit === selectedKodeUnit);
    }
    if (tableSearchQuery) {
      filtered = filtered.filter(d => {
        return (d.debitur && d.debitur.toLowerCase().includes(tableSearchQuery)) ||
               (d.sgp && d.sgp.toLowerCase().includes(tableSearchQuery)) ||
               (d.cif && d.cif.toLowerCase().includes(tableSearchQuery)) ||
               (d.rekening && d.rekening.toLowerCase().includes(tableSearchQuery)) ||
               (d.kodeUnit && d.kodeUnit.toLowerCase().includes(tableSearchQuery)) ||
               (d.status && d.status.toLowerCase().includes(tableSearchQuery));
      });
    }

    filtered.forEach((d, i) => {
      const sgp = `"${(d.sgp || '').replace(/"/g, '""')}"`;
      const cif = `"${(d.cif || '').replace(/"/g, '""')}"`;
      const deb = `"${(d.debitur || '').replace(/"/g, '""')}"`;
      const rek = `"${(d.rekening || '').replace(/"/g, '""')}"`;
      const trx = `"${d.transaksi || 0}"`;
      const sv = `"${d.salesVolume || 0}"`;
      const st = `"${(d.status || '').replace(/"/g, '""')}"`;
      csvContent += `"${i + 1}",${sgp},${cif},${deb},${rek},${trx},${sv},${st}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportToPdf() {
    const timestamp = new Date().toLocaleDateString('id-ID');
    const unitText = resolveKodeUnitName(selectedKodeUnit) || 'Semua Unit';

    const pdfReportEl = document.createElement('div');
    pdfReportEl.className = 'pdf-report-container';
    pdfReportEl.style.cssText = `
      padding: 24px;
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #ffffff;
      color: #0f172a;
      width: 780px;
      box-sizing: border-box;
    `;

    pdfReportEl.innerHTML = `
      <div style="border-bottom: 3px solid #003D79; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h1 style="color: #003D79; font-size: 20px; font-weight: 800; margin: 0;">PT BANK MANDIRI (PERSERO) TBK.</h1>
          <h2 style="color: #FFB700; font-size: 13px; font-weight: 700; margin: 4px 0 0 0; text-transform: uppercase;">Executive Summary Report - Merchant Dashboard</h2>
        </div>
        <div style="text-align: right; font-size: 11px; color: #64748b;">
          <div><strong>Tanggal Laporan:</strong> ${timestamp}</div>
          <div><strong>Periode:</strong> ${selectedMonth.toUpperCase()}</div>
          <div><strong>Kode Unit:</strong> ${escapeAttr(unitText)}</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px;">
        <div style="background: #f8fafc; border: 1.5px solid #003D79; border-radius: 6px; padding: 12px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: 600;">TOTAL USAK GENUINE</div>
          <div style="font-size: 22px; font-weight: 800; color: #003D79; margin-top: 4px;">
            ${selectedMonth === 'agustus' ? totalUsakGenuineAgustus : totalUsakGenuineSeptember}
          </div>
        </div>
        <div style="background: #fff8ea; border: 1.5px solid #FFB700; border-radius: 6px; padding: 12px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: 600;">TOTAL UREG</div>
          <div style="font-size: 22px; font-weight: 800; color: #ea7200; margin-top: 4px;">
            ${selectedMonth === 'agustus' ? totalUregAgustus : totalUregSeptember}
          </div>
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <h3 style="font-size: 13px; color: #003D79; border-left: 4px solid #FFB700; padding-left: 8px; margin-bottom: 8px;">Ringkasan Kinerja SGP (USAK Genuine & UREG)</h3>
        ${document.querySelector('.sgp-summary-card')?.outerHTML || ''}
      </div>

      <div style="margin-bottom: 16px;">
        <h3 style="font-size: 13px; color: #003D79; border-left: 4px solid #FFB700; padding-left: 8px; margin-bottom: 8px;">Top Ranking Unit MKA</h3>
        ${document.querySelector('.leaderboard-card-yellow')?.outerHTML || ''}
      </div>

      <div style="font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 20px;">
        PT Bank Mandiri (Persero) Tbk. Berizin dan Diawasi oleh Otoritas Jasa Keuangan (OJK) dan Bank Indonesia (BI), Serta Merupakan Peserta Penjaminan LPS.
      </div>
    `;

    document.body.appendChild(pdfReportEl);

    if (window.html2pdf) {
      const opt = {
        margin:       0.4,
        filename:     `Laporan_Executive_Mandiri_Merchant_${selectedMonth}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
      };

      window.html2pdf().set(opt).from(pdfReportEl).save().then(() => {
        document.body.removeChild(pdfReportEl);
      }).catch(err => {
        console.error('PDF export error:', err);
        document.body.removeChild(pdfReportEl);
        window.print();
      });
    } else {
      document.body.removeChild(pdfReportEl);
      window.print();
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
