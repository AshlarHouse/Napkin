const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(repoRoot, 'data', 'restaurants-master.csv');
const outputPath = path.join(repoRoot, 'spots.json');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some(value => value.trim() !== '')) rows.push(row);
  }

  return rows;
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseBoolean(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return ['true', 'yes', '1', 'y'].includes(normalized);
}

function parseNumber(value, fallback = 0) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJsonField(value, fallback, label, restaurantName) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Invalid ${label} JSON for "${restaurantName}": ${error.message}`);
  }
}

function normalizeRestaurant(record) {
  const name = record.name.trim();
  if (!name) throw new Error('Every row must include a name.');

  const id = (record.id || '').trim() || slugify(name);
  const cuisine = record.cuisine.trim();
  const address = record.address.trim();
  const note = record.note.trim();
  const speedRating = (record.speedRating || 'Medium').trim();
  const specialRule = (record.specialRule || '').trim() || null;
  const photo = (record.photo || '').trim();
  const price = Math.max(1, Math.min(4, parseNumber(record.price, 1)));

  return {
    id,
    name,
    cuisine,
    type: parseJsonField(record.type, [], 'type', name),
    price,
    romeOk: parseBoolean(record.romeOk),
    takeout: parseBoolean(record.takeout),
    speedRating,
    hours: parseJsonField(record.hours, {}, 'hours', name),
    address,
    note,
    lineWarning: parseBoolean(record.lineWarning),
    closedDays: parseJsonField(record.closedDays, [], 'closedDays', name),
    specialRule,
    cravingMatch: parseJsonField(record.cravingMatch, [], 'cravingMatch', name),
    photo,
    delivery: parseBoolean(record.delivery),
    dineIn: parseBoolean(record.dineIn || 'true'),
    familyFriendly: parseBoolean(record.familyFriendly || 'true'),
    outdoorSeating: parseBoolean(record.outdoorSeating),
    neighborhood: (record.neighborhood || '').trim(),
    phone: (record.phone || '').trim(),
    website: (record.website || '').trim(),
    lat: parseNumber(record.lat, null),
    lng: parseNumber(record.lng, null),
    priorityScore: parseNumber(record.priorityScore, 0),
    lastVerified: (record.lastVerified || '').trim(),
    status: (record.status || 'active').trim()
  };
}

function main() {
  const csv = fs.readFileSync(sourcePath, 'utf8');
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    throw new Error('The master CSV needs a header row and at least one restaurant row.');
  }

  const [header, ...body] = rows;
  const records = body.map((row, index) => {
    const record = {};
    header.forEach((column, columnIndex) => {
      record[column] = row[columnIndex] || '';
    });

    try {
      return normalizeRestaurant(record);
    } catch (error) {
      throw new Error(`Row ${index + 2}: ${error.message}`);
    }
  });

  const activeRecords = records.filter(record => record.status === 'active');
  fs.writeFileSync(outputPath, JSON.stringify(activeRecords, null, 2) + '\n');
  console.log(`Built ${activeRecords.length} active restaurants into ${path.relative(repoRoot, outputPath)} (${records.length - activeRecords.length} skipped).`);
}

main();
