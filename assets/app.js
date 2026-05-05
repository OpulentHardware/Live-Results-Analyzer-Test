const DATA_URL = './data/current-event.json';
const SOURCE_URL = 'https://live.sfrautox.com/#N';

const state = {
  data: null,
  view: 'overall',
  selectedClass: 'all',
  driverIndex: [],
  compareSelections: ['', '', '']
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, '')
    .trim();
}

function setStatus(message, isError = false) {
  const el = document.getElementById('status');
  if (!el) return;

  el.textContent = message;
  el.classList.toggle('hidden', !message);
  el.style.borderColor = isError ? 'rgba(255,62,62,0.6)' : 'rgba(223,255,0,0.26)';
  el.style.color = isError ? '#ff9a9a' : 'rgba(245,245,245,0.68)';
}

async function loadData() {
  try {
    setStatus('Loading event data from GitHub Pages JSON...');

    const response = await fetch(`${DATA_URL}?v=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    state.data = await response.json();
    state.driverIndex = buildDriverIndex(state.data);

    hydrateMeta();
    buildClassFilter();
    render();
    updateDiagnostics();
    setStatus('');
  } catch (error) {
    console.error(error);
    setStatus(`Could not load local data file: ${error.message}`, true);

    const diag = document.getElementById('diagText');
    if (diag) {
      diag.textContent = `ERROR\n${error.message}\n\nExpected local file:\n${DATA_URL}`;
    }
  }
}

function hydrateMeta() {
  const meta = state.data?.meta || {};
  const eventTitle = document.getElementById('eventTitle');
  const eventDate = document.getElementById('eventDate');
  const participantCount = document.getElementById('participantCount');
  const updatedAt = document.getElementById('updatedAt');

  if (eventTitle) eventTitle.textContent = meta.title || state.data?.title || 'SFR Solo Day of Event Results';
  if (eventDate) eventDate.textContent = meta.date || state.data?.date || '—';
  if (participantCount) participantCount.textContent = meta.participants || state.data?.participants || '—';
  if (updatedAt) updatedAt.textContent = formatDate(meta.updatedAt || state.data?.updatedAt);
}

function formatDate(value) {
  if (!value || value === 'Not yet fetched') return value || '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function formatTime(value) {
  if (value === null || value === undefined || value === '') return '—';

  const num = Number(value);

  if (Number.isFinite(num)) {
    return num.toFixed(3);
  }

  return String(value);
}

function formatGap(value) {
  const num = Number(value);

  if (!Number.isFinite(num)) return '—';
  if (Math.abs(num) < 0.0005) return 'LEADER';

  return `+${num.toFixed(3)}`;
}

function buildClassFilter() {
  const select = document.getElementById('classFilter');
  if (!select) return;

  const order = state.data?.classOrder || Object.keys(state.data?.classes || {});

  select.innerHTML =
    '<option value="all">ALL CLASSES</option>' +
    order.map(cls => `<option value="${escapeHtml(cls)}">${escapeHtml(cls)}</option>`).join('');

  select.value = state.selectedClass;
}

function setView(view) {
  state.view = view;

  document.querySelectorAll('[data-view-button]').forEach(button => {
    button.classList.toggle('active', button.dataset.viewButton === view);
  });

  const classFilter = document.getElementById('classFilter');
  if (classFilter) {
    classFilter.classList.toggle('hidden', view !== 'class');
  }

  render();
}

function render() {
  if (!state.data) return;

  if (state.view === 'overall') {
    renderSimpleResults('Overall Raw Ranking', state.data.overall || [], 'BEST RAW');
    return;
  }

  if (state.view === 'pax') {
    renderSimpleResults('PAX Indexed Ranking', state.data.pax || [], 'INDEXED');
    return;
  }

  if (state.view === 'class') {
    renderClassResults();
    return;
  }

  if (state.view === 'compare') {
    renderCompare();
  }
}

function buildSubLine(row) {
  const classPart = row.classNumber || [row.cls || row.class, row.number].filter(Boolean).join(' ');
  const carPart = row.car || '';

  if (classPart && carPart) return `${classPart} · ${carPart}`;
  return classPart || carPart || '';
}

function rankClass(rank) {
  const value = Number(rank);
  return value <= 3 ? `rank-${value}` : '';
}

function getDisplayTime(row, mode = state.view) {
  if (mode === 'overall') return row.time ?? row.rawTime ?? row.bestRaw;
  if (mode === 'pax') return row.time ?? row.indexedTime ?? row.bestPax;
  return row.time ?? row.bestRaw ?? row.indexedTime ?? row.rawTime;
}

function renderPodium(rows, label) {
  const top = rows.slice(0, 3);
  if (!top.length) return '';

  return `
    <section class="podium">
      ${top.map(row => `
        <article class="podium-card">
          <div class="podium-rank">P${escapeHtml(row.rank || row.position)}</div>
          <div class="podium-name">${escapeHtml(row.driver)}</div>
          <div class="podium-sub">${escapeHtml(buildSubLine(row))}</div>
          <div class="podium-time">${escapeHtml(formatTime(getDisplayTime(row)))}</div>
          <div class="time-label">${escapeHtml(label)}</div>
        </article>
      `).join('')}
    </section>
  `;
}

function renderSimpleResults(title, rows, timeLabel) {
  const root = document.getElementById('rankings');
  if (!root) return;

  const body = rows.length ? rows.map(row => `
    <div class="result-row">
      <div class="rank ${rankClass(row.rank)}">${escapeHtml(row.rank)}</div>

      <div>
        <div class="driver-name">${escapeHtml(row.driver)}</div>
        <div class="driver-sub">${escapeHtml(buildSubLine(row))}</div>

        ${row.runs?.length ? `
          <div class="run-strip">
            ${row.runs.map(run => `<span class="run-pill">${escapeHtml(run)}</span>`).join('')}
          </div>
        ` : ''}
      </div>

      <div class="time-cell">
        <span class="time-val">${escapeHtml(formatTime(getDisplayTime(row)))}</span>
        <span class="time-label">${escapeHtml(timeLabel)}</span>
      </div>
    </div>
  `).join('') : emptyRow('No event rows found');

  root.innerHTML = `
    ${renderPodium(rows, timeLabel)}

    <section class="card">
      <div class="card-header">
        <div class="class-title">
          <div class="acr-tag">${escapeHtml(state.view.toUpperCase())}</div>
          <div class="header-main">${escapeHtml(title)}</div>
        </div>

        <div class="class-count">
          ${rows.length} SOURCE ROW${rows.length === 1 ? '' : 'S'}
        </div>
      </div>

      <div class="card-body">
        ${body}
      </div>
    </section>
  `;
}

function renderClassResults() {
  const root = document.getElementById('rankings');
  if (!root) return;

  const classes = state.data.classes || {};
  const order = state.data.classOrder || Object.keys(classes);
  const selected = state.selectedClass;
  const visible = selected === 'all' ? order : [selected];

  root.innerHTML =
    visible.map(cls => renderClassCard(cls, classes[cls] || [])).join('') ||
    renderEmptyCard('CLASS', 'No class data found');
}

function renderClassCard(cls, rows) {
  const body = rows.length ? rows.map(row => `
    <div class="result-row">
      <div class="rank ${rankClass(row.position)}">${escapeHtml(row.position)}</div>

      <div>
        <div class="driver-name">${escapeHtml(row.driver)} ${escapeHtml(row.number || '')}</div>
        <div class="driver-sub">${escapeHtml(row.car || row.className || '')}</div>

        ${row.runs?.length ? `
          <div class="run-strip">
            ${row.runs.map(run => `<span class="run-pill">${escapeHtml(run)}</span>`).join('')}
          </div>
        ` : ''}
      </div>

      <div class="time-cell">
        <span class="time-val">${escapeHtml(formatTime(row.bestRaw))}</span>
        <span class="time-label">Best Raw / PAX ${escapeHtml(formatTime(row.bestPax))}</span>
      </div>
    </div>
  `).join('') : emptyRow('No class rows found');

  return `
    <section class="card" data-class="${escapeHtml(cls)}">
      <div class="card-header">
        <div class="class-title">
          <div class="acr-tag">${escapeHtml(cls)}</div>
          <div class="header-main">Class Results</div>
        </div>

        <div class="class-count">
          ${rows.length} DRIVER${rows.length === 1 ? '' : 'S'}
        </div>
      </div>

      <div class="card-body">
        ${body}
      </div>
    </section>
  `;
}

function emptyRow(message) {
  return `
    <div class="result-row">
      <div class="rank">—</div>

      <div>
        <div class="driver-name">${escapeHtml(message)}</div>
        <div class="driver-sub">Run the GitHub Action to fetch current source data.</div>
      </div>

      <div class="time-cell">
        <span class="time-val">—</span>
        <span class="time-label">NO DATA</span>
      </div>
    </div>
  `;
}

function renderEmptyCard(tag, message) {
  return `
    <section class="card">
      <div class="card-header">
        <div class="class-title">
          <div class="acr-tag">${escapeHtml(tag)}</div>
          <div class="header-main">${escapeHtml(message)}</div>
        </div>
      </div>

      <div class="card-body">
        ${emptyRow(message)}
      </div>
    </section>
  `;
}

/* -----------------------------
   DRIVER INDEX
----------------------------- */

function buildDriverIndex(data) {
  const map = new Map();

  function rowKey(row = {}) {
    return normalizeKey(`${row.driver}|${row.number || ''}|${row.cls || row.class || ''}`);
  }

  function upsertDriver(row = {}) {
    if (!row.driver) return null;

    const key = rowKey(row);
    if (!key) return null;

    const existing = map.get(key) || {};

    const merged = {
      ...existing,
      ...row,
      driver: row.driver || existing.driver || '',
      cls: row.cls || row.class || existing.cls || existing.class || '',
      class: row.class || row.cls || existing.class || existing.cls || '',
      number: row.number || existing.number || '',
      car: row.car || existing.car || '',
      classNumber:
        row.classNumber ||
        existing.classNumber ||
        [row.cls || row.class || existing.cls || existing.class, row.number || existing.number].filter(Boolean).join(' '),

      bestRaw: row.bestRaw ?? row.rawTime ?? existing.bestRaw ?? existing.rawTime ?? null,
      bestPax: row.bestPax ?? row.indexedTime ?? existing.bestPax ?? existing.indexedTime ?? null,

      rawTime: row.rawTime ?? row.bestRaw ?? existing.rawTime ?? existing.bestRaw ?? null,
      indexedTime: row.indexedTime ?? row.bestPax ?? existing.indexedTime ?? existing.bestPax ?? null,

      overallRank: row.overallRank ?? existing.overallRank ?? null,
      paxRank: row.paxRank ?? existing.paxRank ?? null,
      classPosition: row.classPosition ?? row.position ?? existing.classPosition ?? existing.position ?? null,

      runs: row.runs?.length ? row.runs : existing.runs || []
    };

    merged.label = buildDriverLabel(merged);

    map.set(key, merged);
    return merged;
  }

  Object.entries(data.classes || {}).forEach(([cls, rows]) => {
    rows.forEach(row => {
      upsertDriver({
        ...row,
        cls,
        class: cls,
        classPosition: row.position
      });
    });
  });

  (data.overall || []).forEach(row => {
    const match = findDriverInMap(map, row);

    if (match) {
      upsertDriver({
        ...match,
        ...row,
        overallRank: row.rank,
        bestRaw: match.bestRaw ?? row.rawTime ?? row.time,
        rawTime: row.rawTime ?? row.time,
        bestPax: match.bestPax ?? row.bestPax,
        indexedTime: match.indexedTime ?? row.indexedTime
      });
    } else {
      upsertDriver({
        ...row,
        overallRank: row.rank,
        bestRaw: row.bestRaw ?? row.rawTime ?? row.time,
        rawTime: row.rawTime ?? row.time
      });
    }
  });

  (data.pax || []).forEach(row => {
    const match = findDriverInMap(map, row);

    if (match) {
      upsertDriver({
        ...match,
        ...row,
        paxRank: row.rank,
        bestPax: match.bestPax ?? row.indexedTime ?? row.time,
        indexedTime: row.indexedTime ?? row.time,
        bestRaw: match.bestRaw ?? row.bestRaw,
        rawTime: match.rawTime ?? row.rawTime
      });
    } else {
      upsertDriver({
        ...row,
        paxRank: row.rank,
        bestPax: row.bestPax ?? row.indexedTime ?? row.time,
        indexedTime: row.indexedTime ?? row.time
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const aRank = Number(a.overallRank || 9999);
    const bRank = Number(b.overallRank || 9999);

    if (aRank !== bRank) return aRank - bRank;

    return String(a.driver).localeCompare(String(b.driver));
  });
}

function findDriverInMap(map, row) {
  const rowClass = row.cls || row.class || '';
  const rowClassShort = String(rowClass).split('-').pop();

  const keys = [
    `${row.driver}|${row.number || ''}|${rowClass}`,
    `${row.driver}|${row.number || ''}|${rowClassShort}`,
    `${row.driver}|${row.number || ''}`,
    `${row.driver}`
  ].map(normalizeKey);

  return Array.from(map.values()).find(candidate => {
    const candidateKeys = [
      `${candidate.driver}|${candidate.number || ''}|${candidate.cls || candidate.class || ''}`,
      `${candidate.driver}|${candidate.number || ''}|${String(candidate.cls || candidate.class || '').split('-').pop()}`,
      `${candidate.driver}|${candidate.number || ''}`,
      `${candidate.driver}`
    ].map(normalizeKey);

    return keys.some(key => candidateKeys.includes(key));
  });
}

function buildDriverLabel(driver) {
  const classNumber = driver.classNumber || [driver.cls || driver.class, driver.number].filter(Boolean).join(' ');
  return `${driver.driver}${classNumber ? ` — ${classNumber}` : ''}`;
}

function findSelectedDriver(label) {
  const wanted = normalizeKey(label);

  if (!wanted) return null;

  return state.driverIndex.find(driver => normalizeKey(driver.label) === wanted) ||
    state.driverIndex.find(driver => normalizeKey(driver.driver) === wanted) ||
    state.driverIndex.find(driver => normalizeKey(driver.label).includes(wanted));
}

/* -----------------------------
   COMPARE VIEW
----------------------------- */

function renderCompare() {
  const root = document.getElementById('rankings');
  if (!root) return;

  const selectedDrivers = state.compareSelections
    .map(label => findSelectedDriver(label))
    .filter(Boolean);

  root.innerHTML = `
    <section class="card compare-shell">
      <div class="card-header">
        <div class="class-title">
          <div class="acr-tag">COMPARE</div>
          <div class="header-main">Driver Comparison</div>
        </div>

        <div class="class-count">
          ${selectedDrivers.length} SELECTED
        </div>
      </div>

      <div class="card-body">
        <datalist id="driverOptions">
          ${state.driverIndex.map(driver => `<option value="${escapeHtml(driver.label)}"></option>`).join('')}
        </datalist>

        <div class="compare-input-grid">
          ${[0, 1, 2].map(index => `
            <label class="compare-input-wrap">
              <span>Driver ${index + 1}</span>

              <input
                class="compare-input"
                data-compare-index="${index}"
                list="driverOptions"
                placeholder="Start typing a driver name..."
                value="${escapeHtml(state.compareSelections[index] || '')}"
              />
            </label>
          `).join('')}
        </div>

        ${selectedDrivers.length ? renderCompareDriverCards(selectedDrivers) : renderCompareEmptyState()}
        ${selectedDrivers.length >= 2 ? renderGapAnalysis(selectedDrivers) : ''}
      </div>
    </section>
  `;

  attachCompareHandlers();
}

function attachCompareHandlers() {
  document.querySelectorAll('.compare-input').forEach(input => {
    input.addEventListener('input', event => {
      const index = Number(event.target.dataset.compareIndex);
      state.compareSelections[index] = event.target.value;
    });

    input.addEventListener('change', event => {
      const index = Number(event.target.dataset.compareIndex);
      state.compareSelections[index] = event.target.value;
      renderCompare();
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.target.blur();
        renderCompare();
      }
    });
  });
}

function renderCompareEmptyState() {
  return `
    <div class="compare-empty">
      Select two or three drivers to compare best raw, best PAX, class position,
      overall rank, PAX rank, car, and runs.
    </div>
  `;
}

function renderCompareDriverCards(drivers) {
  return `
    <div class="compare-driver-grid">
      ${drivers.map(driver => `
        <article class="compare-driver-card">
          <div class="compare-driver-top">
            <div>
              <div class="compare-driver-name">${escapeHtml(driver.driver)}</div>
              <div class="compare-driver-sub">${escapeHtml(buildSubLine(driver))}</div>
            </div>

            <div class="compare-class-badge">
              ${escapeHtml(driver.cls || driver.class || '—')}
            </div>
          </div>

          <div class="compare-stat-table">
            <div class="compare-stat-row">
              <span>Best Raw</span>
              <strong>${escapeHtml(formatTime(driver.bestRaw || driver.rawTime))}</strong>
            </div>

            <div class="compare-stat-row">
              <span>Best PAX</span>
              <strong>${escapeHtml(formatTime(driver.bestPax || driver.indexedTime))}</strong>
            </div>

            <div class="compare-stat-row">
              <span>Overall Rank</span>
              <strong>${escapeHtml(driver.overallRank || '—')}</strong>
            </div>

            <div class="compare-stat-row">
              <span>PAX Rank</span>
              <strong>${escapeHtml(driver.paxRank || '—')}</strong>
            </div>

            <div class="compare-stat-row">
              <span>Class Position</span>
              <strong>${escapeHtml(driver.classPosition || '—')}</strong>
            </div>

            <div class="compare-stat-row">
              <span>Number</span>
              <strong>${escapeHtml(driver.number || '—')}</strong>
            </div>
          </div>

          ${driver.runs?.length ? `
            <div class="compare-runs">
              <div class="compare-section-label">Runs</div>

              <div class="run-strip">
                ${driver.runs.map(run => `<span class="run-pill">${escapeHtml(run)}</span>`).join('')}
              </div>
            </div>
          ` : ''}
        </article>
      `).join('')}
    </div>
  `;
}

function renderGapAnalysis(drivers) {
  const rawDrivers = drivers
    .filter(driver => Number.isFinite(Number(driver.bestRaw || driver.rawTime)))
    .map(driver => ({
      ...driver,
      compareTime: Number(driver.bestRaw || driver.rawTime)
    }))
    .sort((a, b) => a.compareTime - b.compareTime);

  const paxDrivers = drivers
    .filter(driver => Number.isFinite(Number(driver.bestPax || driver.indexedTime)))
    .map(driver => ({
      ...driver,
      compareTime: Number(driver.bestPax || driver.indexedTime)
    }))
    .sort((a, b) => a.compareTime - b.compareTime);

  return `
    <section class="gap-analysis">
      <div class="gap-header">
        <div>
          <div class="gap-kicker">Gap Analysis</div>
          <div class="gap-title">Raw and PAX</div>
        </div>

        <div class="gap-note">
          Lower time wins. Gap is shown relative to the fastest selected driver in each category.
        </div>
      </div>

      <div class="gap-grid">
        ${renderGapTable('RAW GAP', rawDrivers, 'BEST RAW')}
        ${renderGapTable('PAX GAP', paxDrivers, 'BEST PAX')}
      </div>
    </section>
  `;
}

function renderGapTable(title, drivers, timeLabel) {
  if (!drivers.length) {
    return `
      <div class="gap-table">
        <div class="gap-table-title">${escapeHtml(title)}</div>
        <div class="gap-row muted">No valid timing data.</div>
      </div>
    `;
  }

  const leaderTime = drivers[0].compareTime;

  return `
    <div class="gap-table">
      <div class="gap-table-title">${escapeHtml(title)}</div>

      ${drivers.map((driver, index) => {
        const gap = driver.compareTime - leaderTime;

        return `
          <div class="gap-row">
            <div class="gap-pos">${index + 1}</div>

            <div class="gap-driver">
              <span>${escapeHtml(driver.driver)}</span>
              <small>${escapeHtml(driver.cls || driver.class || '')} ${escapeHtml(driver.number || '')}</small>
            </div>

            <div class="gap-time">
              <span>${escapeHtml(formatTime(driver.compareTime))}</span>
              <small>${escapeHtml(timeLabel)}</small>
            </div>

            <div class="gap-delta ${Math.abs(gap) < 0.0005 ? 'leader' : ''}">
              ${escapeHtml(formatGap(gap))}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* -----------------------------
   DIAGNOSTICS
----------------------------- */

function updateDiagnostics() {
  const data = state.data || {};
  const classCounts = Object.entries(data.classes || {})
    .map(([cls, rows]) => `${cls}: ${rows.length}`)
    .join('\n');

  const lines = [
    'GITHUB PAGES DATA MODE',
    `Source: ${data.meta?.sourceUrl || data.sourceUrl || SOURCE_URL}`,
    `Updated: ${data.meta?.updatedAt || data.updatedAt || '—'}`,
    `Overall rows: ${(data.overall || []).length}`,
    `PAX rows: ${(data.pax || []).length}`,
    `Classes: ${(data.classOrder || []).length}`,
    `Driver compare index: ${state.driverIndex.length}`,
    '',
    'Class row counts:',
    classCounts || 'No classes parsed yet.',
    '',
    'Data file: ./data/current-event.json',
    'Fetcher: .github/workflows/update-results.yml'
  ];

  const diag = document.getElementById('diagText');
  if (diag) diag.textContent = lines.join('\n');
}

function toggleDiag() {
  const diag = document.getElementById('diag');
  if (diag) diag.classList.toggle('active');
}

window.setView = setView;
window.toggleDiag = toggleDiag;

window.addEventListener('DOMContentLoaded', () => {
  const viewDrawer = document.getElementById('viewDrawer');
  const viewDrawerToggle = document.getElementById('viewDrawerToggle');

  if (viewDrawerToggle && viewDrawer) {
    viewDrawerToggle.addEventListener('click', () => {
      viewDrawer.classList.toggle('active');
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        viewDrawer.classList.remove('active');
      }
    });
  }

  document.querySelectorAll('[data-view-button]').forEach(button => {
    button.addEventListener('click', () => {
      setView(button.dataset.viewButton);

      if (viewDrawer) {
        viewDrawer.classList.remove('active');
      }
    });
  });

  const classFilter = document.getElementById('classFilter');
  if (classFilter) {
    classFilter.addEventListener('change', event => {
      state.selectedClass = event.target.value;
      render();
    });
  }

  const refreshButton = document.getElementById('refreshButton');
  if (refreshButton) {
    refreshButton.addEventListener('click', () => loadData());
  }

  loadData();
});
