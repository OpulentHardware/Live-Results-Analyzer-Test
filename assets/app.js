const DATA_URL = './data/current-event.json';
const SOURCE_URL = 'https://live.sfrautox.com/#N';

const state = {
  data: null,
  view: 'overall',
  selectedClass: 'all'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setStatus(message, isError = false) {
  const el = document.getElementById('status');
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

    hydrateMeta();
    buildClassFilter();
    render();
    updateDiagnostics();
    setStatus('');
  } catch (error) {
    console.error(error);
    setStatus(`Could not load local data file: ${error.message}`, true);
    document.getElementById('diagText').textContent = `ERROR\n${error.message}\n\nExpected local file:\n${DATA_URL}`;
  }
}

function hydrateMeta() {
  const meta = state.data?.meta || {};
  document.getElementById('eventTitle').textContent = meta.title || state.data?.title || 'SFR Solo Day of Event Results';
  document.getElementById('eventDate').textContent = meta.date || state.data?.date || '—';
  document.getElementById('participantCount').textContent = meta.participants || state.data?.participants || '—';
  document.getElementById('updatedAt').textContent = formatDate(meta.updatedAt || state.data?.updatedAt);
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

function buildClassFilter() {
  const select = document.getElementById('classFilter');
  const order = state.data?.classOrder || Object.keys(state.data?.classes || {});

  select.innerHTML =
    '<option value="all">ALL CLASSES</option>' +
    order.map(cls => `<option value="${escapeHtml(cls)}">${escapeHtml(cls)}</option>`).join('');
}

function setView(view) {
  state.view = view;

  document.querySelectorAll('[data-view-button]').forEach(button => {
    button.classList.toggle('active', button.dataset.viewButton === view);
  });

  document.getElementById('classFilter').classList.toggle('hidden', view !== 'class');

  render();
}

function render() {
  if (!state.data) return;

  if (state.view === 'overall') {
    renderSimpleResults('Overall Raw Ranking', state.data.overall || [], 'BEST RAW');
  }

  if (state.view === 'pax') {
    renderSimpleResults('PAX Indexed Ranking', state.data.pax || [], 'INDEXED');
  }

  if (state.view === 'class') {
    renderClassResults();
  }
}

function buildSubLine(row) {
  const classPart = row.classNumber || [row.cls || row.class, row.number].filter(Boolean).join(' ');
  const carPart = row.car || '';

  if (classPart && carPart) return `${classPart} · ${carPart}`;
  return classPart || carPart || '';
}

function renderPodium(rows, label) {
  const top = rows.slice(0, 3);
  if (!top.length) return '';

  return `<section class="podium">${top.map(row => `
    <article class="podium-card">
      <div class="podium-rank">P${escapeHtml(row.rank || row.position)}</div>
      <div class="podium-name">${escapeHtml(row.driver)}</div>
      <div class="podium-sub">${escapeHtml(buildSubLine(row))}</div>
      <div class="podium-time">${escapeHtml(formatTime(row.time || row.bestRaw || row.indexedTime))}</div>
      <div class="time-label">${escapeHtml(label)}</div>
    </article>`).join('')}</section>`;
}

function renderSimpleResults(title, rows, timeLabel) {
  const root = document.getElementById('rankings');

  const body = rows.length ? rows.map(row => `
    <div class="result-row">
      <div class="rank ${row.rank <= 3 ? `rank-${row.rank}` : ''}">${escapeHtml(row.rank)}</div>
      <div>
        <div class="driver-name">${escapeHtml(row.driver)}</div>
        <div class="driver-sub">${escapeHtml(buildSubLine(row))}</div>
        ${row.runs?.length ? `<div class="run-strip">${row.runs.map(run => `<span class="run-pill">${escapeHtml(run)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="time-cell">
        <span class="time-val">${escapeHtml(formatTime(row.time || row.indexedTime || row.rawTime))}</span>
        <span class="time-label">${escapeHtml(timeLabel)}</span>
      </div>
    </div>`).join('') : emptyRow('No event rows found');

  root.innerHTML = `${renderPodium(rows, timeLabel)}
    <section class="card">
      <div class="card-header">
        <div class="class-title">
          <div class="acr-tag">${state.view.toUpperCase()}</div>
          <div class="header-main">${escapeHtml(title)}</div>
        </div>
        <div class="class-count">${rows.length} SOURCE ROW${rows.length === 1 ? '' : 'S'}</div>
      </div>
      <div class="card-body">${body}</div>
    </section>`;
}

function renderClassResults() {
  const root = document.getElementById('rankings');
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
      <div class="rank ${row.position <= 3 ? `rank-${row.position}` : ''}">${escapeHtml(row.position)}</div>
      <div>
        <div class="driver-name">${escapeHtml(row.driver)} ${escapeHtml(row.number || '')}</div>
        <div class="driver-sub">${escapeHtml(row.car || row.className || '')}</div>
        ${row.runs?.length ? `<div class="run-strip">${row.runs.map(run => `<span class="run-pill">${escapeHtml(run)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="time-cell">
        <span class="time-val">${escapeHtml(formatTime(row.bestRaw))}</span>
        <span class="time-label">Best Raw / PAX ${escapeHtml(formatTime(row.bestPax))}</span>
      </div>
    </div>`).join('') : emptyRow('No class rows found');

  return `<section class="card" data-class="${escapeHtml(cls)}">
    <div class="card-header">
      <div class="class-title">
        <div class="acr-tag">${escapeHtml(cls)}</div>
        <div class="header-main">Class Results</div>
      </div>
      <div class="class-count">${rows.length} DRIVER${rows.length === 1 ? '' : 'S'}</div>
    </div>
    <div class="card-body">${body}</div>
  </section>`;
}

function emptyRow(message) {
  return `<div class="result-row">
    <div class="rank">—</div>
    <div>
      <div class="driver-name">${escapeHtml(message)}</div>
      <div class="driver-sub">Run the GitHub Action to fetch current source data.</div>
    </div>
    <div class="time-cell">
      <span class="time-val">—</span>
      <span class="time-label">NO DATA</span>
    </div>
  </div>`;
}

function renderEmptyCard(tag, message) {
  return `<section class="card">
    <div class="card-header">
      <div class="class-title">
        <div class="acr-tag">${escapeHtml(tag)}</div>
        <div class="header-main">${escapeHtml(message)}</div>
      </div>
    </div>
    <div class="card-body">${emptyRow(message)}</div>
  </section>`;
}

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
    '',
    'Class row counts:',
    classCounts || 'No classes parsed yet.',
    '',
    'Data file: ./data/current-event.json',
    'Fetcher: .github/workflows/update-results.yml'
  ];

  document.getElementById('diagText').textContent = lines.join('\n');
}

function toggleDiag() {
  document.getElementById('diag').classList.toggle('active');
}

window.setView = setView;
window.toggleDiag = toggleDiag;

window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-view-button]').forEach(button => {
    button.addEventListener('click', () => setView(button.dataset.viewButton));
  });

  document.getElementById('classFilter').addEventListener('change', event => {
    state.selectedClass = event.target.value;
    render();
  });

  document.getElementById('refreshButton').addEventListener('click', () => loadData());

  loadData();
});
