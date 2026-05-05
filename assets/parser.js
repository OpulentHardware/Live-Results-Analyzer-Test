function cleanLine(line) {
  return String(line || '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  const num = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

function isTime(value) {
  const num = toNumber(value);
  return num !== null && num >= 20 && num <= 120;
}

function formatTime(value) {
  const num = toNumber(value);
  return isTime(num) ? Number(num.toFixed(3)) : null;
}

function parseMeta(lines, options = {}) {
  const participantsLine = lines.find(line => /^Participants:/i.test(line));
  const dateLine = lines.find(line => /^Date:/i.test(line));
  const titleLine = lines.find(line => /Live Results/i.test(line));

  return {
    title: titleLine || 'SFR Live Results',
    date: dateLine ? dateLine.replace(/^Date:\s*/i, '').trim() : '',
    participants: participantsLine ? toNumber(participantsLine.replace(/^Participants:\s*/i, '')) : null,
    sourceUrl: options.sourceUrl || 'https://live.sfrautox.com/#N',
    updatedAt: options.updatedAt || new Date().toISOString(),
    status: 'ok'
  };
}

function parseRankingRow(line, mode = 'overall') {
  const cleaned = cleanLine(line);

  const match = cleaned.match(
    /^(\d+)\s+(.+?)\s+([A-Z0-9]+(?:-[A-Z0-9]+)?)\s+(#[A-Za-z0-9]+)\s+(\d+(?:\.\d+)?)$/
  );

  if (!match) return null;

  const rank = Number(match[1]);
  const driver = match[2].trim();
  const cls = match[3].trim();
  const number = match[4].trim();
  const time = formatTime(match[5]);

  if (!time) return null;

  return {
    rank,
    position: rank,
    driver,
    class: cls,
    cls,
    number,
    classNumber: `${cls} ${number}`,
    time,
    rawTime: mode === 'overall' ? time : null,
    indexedTime: mode === 'pax' ? time : null,
    car: '',
    runs: []
  };
}

function parseOverallAndPax(lines) {
  const overall = [];
  const pax = [];
  let section = '';

  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (!cleaned) continue;

    if (/^\[\[OVERALL_VIEW\]\]$/i.test(cleaned)) {
      section = '';
      continue;
    }

    if (/^\[\[PAX_VIEW\]\]$/i.test(cleaned)) {
      section = '';
      continue;
    }

    if (/^\[\[CLASS_VIEW\]\]$/i.test(cleaned)) {
      section = '';
      continue;
    }

    if (/^Overall$/i.test(cleaned)) {
      section = 'overall';
      continue;
    }

    if (/^PAX$/i.test(cleaned)) {
      section = 'pax';
      continue;
    }

    if (/^Class$/i.test(cleaned) || /^SELECT CLASS/i.test(cleaned)) {
      section = '';
      continue;
    }

    if (/^Rank Driver/i.test(cleaned)) continue;
    if (/^Overall Class PAX$/i.test(cleaned)) continue;
    if (/^Participants:/i.test(cleaned)) continue;
    if (/^Date:/i.test(cleaned)) continue;
    if (/Live Results/i.test(cleaned)) continue;

    if (section === 'overall') {
      const row = parseRankingRow(cleaned, 'overall');
      if (row) overall.push(row);
    }

    if (section === 'pax') {
      const row = parseRankingRow(cleaned, 'pax');
      if (row) pax.push(row);
    }
  }

  return { overall, pax };
}

const KNOWN_CLASSES = new Set([
  'AS', 'BS', 'CS', 'DS', 'ES', 'FS', 'GS', 'HS',
  'SS', 'SST',
  'AST', 'BST', 'CST', 'DST',
  'ST1', 'ST2', 'STL', 'STR', 'STS', 'STX', 'STU', 'STH',
  'CAM', 'CAMC', 'CAMS', 'CAMT',
  'EVX',
  'XA', 'XB', 'XS',
  'M', 'P',
  'SM', 'SMF', 'SSM',
  'SP', 'SPL',
  'S1', 'S2', 'S3', 'S4',
  'X', 'N', 'NS'
]);

function looksLikeClassHeader(line) {
  return KNOWN_CLASSES.has(cleanLine(line).toUpperCase());
}

function isNoise(line) {
  const cleaned = cleanLine(line);

  return (
    !cleaned ||
    /^Participants:/i.test(cleaned) ||
    /^Date:/i.test(cleaned) ||
    /Live Results/i.test(cleaned) ||
    /^Overall Class PAX$/i.test(cleaned) ||
    /^Overall$/i.test(cleaned) ||
    /^PAX$/i.test(cleaned) ||
    /^Class$/i.test(cleaned) ||
    /^SELECT CLASS/i.test(cleaned) ||
    /^(Rank|Pos|Position)\s+Driver/i.test(cleaned) ||
    /^\[\[.+\]\]$/.test(cleaned)
  );
}

function isRunLine(line) {
  const cleaned = cleanLine(line);

  return (
    /^\d{2,3}\.\d{3}(?:\s*\+\s*\d+)?(?:\s+(DNF|DNS|RRN|OFF|DSQ))?$/i.test(cleaned) ||
    /^(DNF|DNS|RRN|OFF|DSQ)$/i.test(cleaned)
  );
}

function parseRunLine(line) {
  const cleaned = cleanLine(line);
  const statusOnly = cleaned.match(/^(DNF|DNS|RRN|OFF|DSQ)$/i);

  if (statusOnly) {
    return {
      display: statusOnly[1].toUpperCase(),
      raw: null,
      cones: 0,
      dnf: /^DNF$/i.test(statusOnly[1]),
      status: statusOnly[1].toUpperCase(),
      official: null
    };
  }

  const match = cleaned.match(/^(\d{2,3}\.\d{3})(?:\s*\+\s*(\d+))?(?:\s+(DNF|DNS|RRN|OFF|DSQ))?$/i);
  if (!match) return { display: cleaned, raw: null, cones: 0, dnf: false, status: '', official: null };

  const raw = formatTime(match[1]);
  const cones = match[2] ? Number(match[2]) : 0;
  const status = match[3] ? match[3].toUpperCase() : '';
  const dnf = status === 'DNF';

  return {
    display: cleaned,
    raw,
    cones,
    dnf,
    status,
    official: raw !== null && !dnf ? Number((raw + cones * 2).toFixed(3)) : null
  };
}

function splitDriverNumberCar(leftText) {
  const cleaned = cleanLine(leftText);

  const match = cleaned.match(/^(.*?)\s+(#[A-Za-z0-9]+)\s+(.+)$/);

  if (match) {
    return {
      driver: match[1].trim(),
      number: match[2].trim(),
      car: match[3].trim()
    };
  }

  return {
    driver: cleaned,
    number: '',
    car: ''
  };
}

function parseClassStartLine(line, currentClass) {
  const cleaned = cleanLine(line);

  const startMatch = cleaned.match(/^(\d+)\s+(.+)$/);
  if (!startMatch) return null;

  const position = Number(startMatch[1]);
  if (!Number.isInteger(position) || position < 1 || position > 999) return null;

  const rest = startMatch[2].trim();
  const tokens = rest.split(' ');

  const timeIndexes = [];
  tokens.forEach((token, index) => {
    if (isTime(token)) timeIndexes.push(index);
  });

  if (timeIndexes.length < 2) return null;

  const bestRawIndex = timeIndexes[timeIndexes.length - 2];
  const bestPaxIndex = timeIndexes[timeIndexes.length - 1];

  const bestRaw = formatTime(tokens[bestRawIndex]);
  const bestPax = formatTime(tokens[bestPaxIndex]);

  if (!bestRaw || !bestPax) return null;

  const leftTokens = tokens.slice(0, bestRawIndex);
  const { driver, number, car } = splitDriverNumberCar(leftTokens.join(' '));

  if (!driver) return null;

  return {
    position,
    rank: position,
    driver,
    class: currentClass,
    cls: currentClass,
    number,
    car,
    classNumber: number ? `${currentClass} ${number}` : currentClass,
    bestRaw,
    bestPax,
    rawTime: bestRaw,
    indexedTime: bestPax,
    time: bestRaw,
    runs: []
  };
}

function parseClasses(lines) {
  const classes = {};
  const classOrder = [];

  let inClassView = false;
  let afterClassTableHeader = false;
  let currentClass = '';
  let currentRow = null;

  function pushCurrentRow() {
    if (!currentClass || !currentRow) return;
    if (!classes[currentClass]) classes[currentClass] = [];
    classes[currentClass].push(currentRow);
    currentRow = null;
  }

  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (!cleaned) continue;

    if (/^\[\[CLASS_VIEW\]\]$/i.test(cleaned)) {
      inClassView = true;
      afterClassTableHeader = false;
      currentClass = '';
      currentRow = null;
      continue;
    }

    if (!inClassView) continue;

    if (/^Position\s+Driver\s+Car\s+Best Raw\s+Best Pax\s+Raw Times$/i.test(cleaned)) {
      afterClassTableHeader = true;
      currentClass = '';
      pushCurrentRow();
      continue;
    }

    if (!afterClassTableHeader) continue;

    if (looksLikeClassHeader(cleaned)) {
      pushCurrentRow();
      currentClass = cleaned.toUpperCase();

      if (!classes[currentClass]) classes[currentClass] = [];
      if (!classOrder.includes(currentClass)) classOrder.push(currentClass);

      continue;
    }

    if (isNoise(cleaned)) continue;
    if (!currentClass) continue;

    const startRow = parseClassStartLine(cleaned, currentClass);

    if (startRow) {
      pushCurrentRow();
      currentRow = startRow;
      continue;
    }

    if (currentRow && isRunLine(cleaned)) {
      currentRow.runs.push(parseRunLine(cleaned));
      continue;
    }
  }

  pushCurrentRow();

  Object.keys(classes).forEach(cls => {
    if (!classes[cls].length) {
      delete classes[cls];
    } else {
      classes[cls].sort((a, b) => a.position - b.position);
    }
  });

  return {
    classes,
    classOrder: classOrder.filter(cls => classes[cls]?.length)
  };
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, '')
    .trim();
}

function buildClassLookup(classes) {
  const lookup = new Map();

  Object.values(classes || {}).forEach(rows => {
    rows.forEach(row => {
      const keys = [
        `${row.cls}|${row.number}|${row.driver}`,
        `${row.class}|${row.number}|${row.driver}`,
        `${row.number}|${row.driver}`,
        `${row.driver}`
      ];

      keys.forEach(key => {
        lookup.set(normalizeKey(key), row);
      });
    });
  });

  return lookup;
}

function enrichRankingRowsWithCars(rows, classes) {
  const lookup = buildClassLookup(classes);

  return rows.map(row => {
    const keys = [
      `${row.cls}|${row.number}|${row.driver}`,
      `${row.class}|${row.number}|${row.driver}`,
      `${row.number}|${row.driver}`,
      `${row.driver}`
    ];

    const match = keys
      .map(key => lookup.get(normalizeKey(key)))
      .find(Boolean);

    return {
      ...row,
      car: match?.car || row.car || '',
      bestRaw: match?.bestRaw ?? row.bestRaw ?? row.rawTime ?? null,
      bestPax: match?.bestPax ?? row.bestPax ?? row.indexedTime ?? null,
      runs: match?.runs || row.runs || []
    };
  });
}

export function parseSfrLiveText(sourceText, options = {}) {
  const lines = String(sourceText || '')
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const meta = parseMeta(lines, options);
  const parsedRankings = parseOverallAndPax(lines);
  const parsedClasses = parseClasses(lines);

  const classes = parsedClasses.classes;
  const classOrder = parsedClasses.classOrder;

  const overall = enrichRankingRowsWithCars(parsedRankings.overall, classes);
  const pax = enrichRankingRowsWithCars(parsedRankings.pax, classes);

  return {
    status: 'ok',
    sourceUrl: meta.sourceUrl,
    updatedAt: meta.updatedAt,

    event: meta,
    meta,
    title: meta.title,
    date: meta.date,
    participants: meta.participants,

    overall,
    pax,
    classes,
    classOrder,

    diagnostics: {
      sourceLineCount: lines.length,
      overallRows: overall.length,
      paxRows: pax.length,
      classGroups: Object.keys(classes).length,
      classRows: Object.fromEntries(
        Object.entries(classes).map(([cls, rows]) => [cls, rows.length])
      )
    }
  };
}

export default parseSfrLiveText;
