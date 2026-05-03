const fs = require('fs');
const path = require('path');

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11
};

function loadConfig() {
  const configPath = path.resolve(__dirname, '..', '..', 'data', 'event-sources.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function todayInNapa() {
  const label = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  return new Date(`${label}T00:00:00-07:00`);
}

function nowInNapa() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date()).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}-07:00`);
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&ldquo;/g, '"')
    .replace(/&#8221;|&rdquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function dateFromMonthDay(monthName, dayText, year) {
  const month = MONTHS[monthName.toLowerCase()];
  if (month === undefined) return null;
  return new Date(year, month, Number(dayText));
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoLocalDate(date, time) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T${time}:00-07:00`;
}

function formatDayLabel(date, baseDate) {
  const diff = Math.round((date - baseDate) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

function inferTags(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  const tags = new Set();

  if (/farmers?|market|vendor|produce|food truck|food trucks|bites|culinary|pizza|brunch|breakfast/.test(text)) tags.add('food');
  if (/family|kid|kids|children|all ages|bikefest|earth day|festival|walk|art|outdoor/.test(text)) tags.add('family');
  if (/market|bikefest|earth day|festival|pride|table|lighted art|community|river/.test(text)) tags.add('local_tradition');
  if (/music|band|concert|dj|performance/.test(text)) tags.add('music');
  if (/wine|tasting|release|sparkling|cabernet|vineyard|winery/.test(text)) tags.add('wine');
  if (/karaoke|bar|late|9-1|8-12|nightlife/.test(text)) tags.add('nightlife');

  return [...tags];
}

function scoreEvent(event, baseDate) {
  const startsAt = new Date(event.startsAt);
  const daysAway = Math.max(0, Math.round((startsAt - baseDate) / DAY_MS));
  const tags = new Set(event.tags);
  let score = 0;

  score += Math.max(0, 5 - daysAway);
  if (tags.has('local_tradition')) score += 5;
  if (tags.has('family')) score += 4;
  if (tags.has('food')) score += 3;
  if (tags.has('farmers_market')) score += 3;
  if (tags.has('music')) score += 1;
  if (tags.has('wine')) score -= 3;
  if (tags.has('nightlife')) score -= 5;
  if (/hotel|resort|meritage|release party|wine tasting/i.test(event.title)) score -= 3;
  if (/boot camp|cabernet|grand tasting|winery/i.test(event.title)) score -= 3;
  if (/bikefest|first thursday|taste of oxbow|earth day|lighted art|farmers market/i.test(event.title)) score += 3;

  if (event.recurring === false) score += 3;
  if (event.recurring && daysAway > 1) score -= 4;

  return score + event.sourceTrust;
}

function displayTime(start, end) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles'
  });
  const startLabel = fmt.format(new Date(start)).replace(':00', '');
  if (!end) return startLabel;
  const endLabel = fmt.format(new Date(end)).replace(':00', '');
  return `${startLabel}-${endLabel}`;
}

function normalizeTitle(title) {
  return title
    .replace(/^Read more\s+/i, '')
    .replace(/\s+Read more$/i, '')
    .trim();
}

function parseDoNapaText(text, source, baseDate) {
  const year = baseDate.getFullYear();
  const events = [];
  const pattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:\s*-\s*(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+)?(\d{1,2}))?\s+(.+?)(?=\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\b|Previous Image|$)/gi;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const [, monthName, dayText, endMonthName, endDayText, rawBlock] = match;
    const date = dateFromMonthDay(monthName, dayText, year);
    if (!date) continue;

    const titleMatch = rawBlock.match(/(?:###\s*)?([^.!?]+?)(?:\s+Beneath|\s+Join|\s+Celebrate|\s+Introducing|\s+The |\s+Napa |\s+Featuring|\s+Read more|$)/i);
    const title = normalizeTitle(titleMatch ? titleMatch[1] : rawBlock.slice(0, 90));
    if (!title || title.length < 4) continue;

    const endDate = endDayText
      ? dateFromMonthDay(endMonthName || monthName, endDayText, year)
      : date;
    const description = rawBlock.slice(0, 280);
    const tags = inferTags(title, description);

    events.push({
      id: `${source.id}-${slugify(`${monthName}-${dayText}-${title}`)}`,
      title,
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      placeLabel: inferPlace(title, description),
      startsAt: toIsoLocalDate(date, inferStartTime(title, description)),
      endsAt: toIsoLocalDate(endDate || date, inferEndTime(title, description)),
      tags,
      whyItMatters: eventReason(title, tags),
      sourceTrust: source.trust,
      recurring: false
    });
  }

  return events;
}

function extractFirst(block, pattern) {
  const match = block.match(pattern);
  return match ? stripHtml(match[1]).trim() : '';
}

function parseDoNapaCards(html, source, baseDate) {
  const year = baseDate.getFullYear();
  const events = [];
  const cards = html.match(/<div class="card upcoming-events-card[\s\S]*?<div class="card-footer[\s\S]*?<\/div>\s*<\/div>/gi) || [];

  for (const card of cards) {
    const dateText = extractFirst(card, /<div class="event-date[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
    const dateMatch = dateText.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})\b/);
    if (!dateMatch) continue;

    const date = dateFromMonthDay(dateMatch[1], dateMatch[2], year);
    if (!date) continue;

    const title = normalizeTitle(extractFirst(card, /<div class="event-title">[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/i));
    if (!title) continue;

    const description = extractFirst(card, /<div class="event-excerpt">([\s\S]*?)<\/div>/i);
    const hrefMatch = card.match(/<a[^>]+href="([^"]+)"[^>]*>\s*Read more\s*<\/a>/i);
    const sourceUrl = hrefMatch ? hrefMatch[1] : source.url;
    const tags = inferTags(title, description);

    events.push({
      id: `${source.id}-${slugify(`${dateMatch[1]}-${dateMatch[2]}-${title}`)}`,
      title,
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl,
      placeLabel: inferPlace(title, description),
      startsAt: toIsoLocalDate(date, inferStartTime(title, description)),
      endsAt: toIsoLocalDate(date, inferEndTime(title, description)),
      tags,
      whyItMatters: eventReason(title, tags),
      sourceTrust: source.trust,
      recurring: false
    });
  }

  return events;
}

function inferPlace(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('oxbow')) return 'Oxbow Commons';
  if (text.includes('copia')) return 'CIA at Copia';
  if (text.includes('riverfront')) return 'Napa Riverfront';
  if (text.includes('fink')) return 'The Fink';
  if (text.includes('blue note')) return 'Blue Note Napa';
  if (text.includes('downtown')) return 'Downtown Napa';
  return 'Napa';
}

function inferStartTime(title, description) {
  const text = `${title} ${description}`;
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
  if (!match) return /market|bikefest|earth day|walk/i.test(text) ? '10:00' : '17:00';
  let hour = Number(match[1]);
  const minute = match[2] || '00';
  const meridiem = match[3].toLowerCase();
  if (meridiem === 'pm' && hour !== 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function inferEndTime(title, description) {
  const text = `${title} ${description}`;
  if (/5\s*-\s*9\s*pm/i.test(text)) return '21:00';
  if (/8\s*a\.?m\.?\s*to\s*12|8:00\s*am\s*-\s*12/i.test(text)) return '12:00';
  return /market|bikefest|earth day|walk/i.test(text) ? '14:00' : '20:00';
}

function eventReason(title, tags) {
  const set = new Set(tags);
  if (/farmers market/i.test(title)) return 'Fresh food, coffee, pastries, and an easy local wander.';
  if (/bikefest/i.test(title)) return 'A free family-friendly Napa outing with music, bike activities, and Oxbow energy.';
  if (set.has('food') && set.has('family')) return 'Food plus family-friendly local energy, which is the Napkin sweet spot.';
  if (set.has('local_tradition')) return 'A real Napa community happening worth knowing about.';
  return 'A current Napa event that may make today feel a little more alive.';
}

function buildRecurringEvents(config, baseDate) {
  const events = [];
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = addDays(baseDate, offset);
    for (const event of config.recurring) {
      if (event.weekday !== date.getDay()) continue;
      if (!event.months.includes(date.getMonth() + 1)) continue;
      const source = config.sources.find(item => item.id === event.sourceId);
      events.push({
        id: `${event.id}-${date.toISOString().slice(0, 10)}`,
        title: event.title,
        sourceId: event.sourceId,
        sourceName: source?.name || 'Napa source',
        sourceUrl: event.sourceUrl,
        placeLabel: event.placeLabel,
        startsAt: toIsoLocalDate(date, event.startTime),
        endsAt: toIsoLocalDate(date, event.endTime),
        tags: event.tags,
        whyItMatters: event.whyItMatters,
        sourceTrust: source?.trust || 0.7,
        recurring: true
      });
    }
  }
  return events;
}

async function scrapeSources(config, baseDate) {
  const scraped = [];
  const calendarSources = config.sources.filter(source => source.kind === 'calendar' || source.kind === 'local_feature');

  await Promise.all(calendarSources.map(async source => {
    try {
      const response = await fetch(source.url, {
        headers: { 'User-Agent': 'Napkin local event signal bot (+private family app)' }
      });
      if (!response.ok) return;
      const html = await response.text();
      scraped.push(...parseDoNapaCards(html, source, baseDate));
      scraped.push(...parseDoNapaText(stripHtml(html), source, baseDate));
    } catch (_) {
      // Network failures should make the digest quieter, not broken.
    }
  }));

  return scraped;
}

function dedupe(events) {
  const byKey = new Map();
  for (const event of events) {
    const day = event.startsAt.slice(0, 10);
    const key = `${canonicalEventKey(event)}-${day}`;
    const previous = byKey.get(key);
    if (!previous || event.sourceTrust > previous.sourceTrust) byKey.set(key, event);
  }
  return [...byKey.values()];
}

function canonicalEventKey(event) {
  const text = `${event.title} ${event.sourceUrl}`.toLowerCase();
  if (text.includes('bikefest')) return 'napa-bikefest';
  if (text.includes('farmers market')) return 'napa-farmers-market';
  if (text.includes('first thursday')) return 'first-thursday';
  if (text.includes('taste of oxbow')) return 'taste-of-oxbow';
  return slugify(event.title);
}

function toDigestItem(event, baseDate) {
  const startsAt = new Date(event.startsAt);
  const tags = event.tags.filter(tag => !['wine', 'nightlife'].includes(tag)).slice(0, 3);
  return {
    id: event.id,
    title: event.title,
    dayLabel: formatDayLabel(startsAt, baseDate),
    timeLabel: displayTime(event.startsAt, event.endsAt),
    placeLabel: event.placeLabel,
    whyItMatters: event.whyItMatters,
    tags,
    sourceUrl: event.sourceUrl
  };
}

function selectDigestEvents(scoredEvents) {
  const selected = [];
  let recurringCount = 0;

  for (const item of scoredEvents) {
    if (item.event.recurring && recurringCount >= 1) continue;
    selected.push(item);
    if (item.event.recurring) recurringCount += 1;
    if (selected.length === 3) break;
  }

  return selected;
}

exports.handler = async () => {
  const config = loadConfig();
  const baseDate = todayInNapa();
  const now = nowInNapa();
  const recurring = buildRecurringEvents(config, baseDate);
  const scraped = await scrapeSources(config, baseDate);
  const end = addDays(baseDate, 8);

  const scored = dedupe([...recurring, ...scraped])
    .filter(event => {
      const startsAt = new Date(event.startsAt);
      const endsAt = new Date(event.endsAt || event.startsAt);
      return startsAt >= baseDate && startsAt < end && endsAt >= now;
    })
    .map(event => ({ event, score: scoreEvent(event, baseDate) }))
    .filter(item => item.score >= 5)
    .sort((a, b) => b.score - a.score || new Date(a.event.startsAt) - new Date(b.event.startsAt));

  const ranked = selectDigestEvents(scored)
    .map(item => toDigestItem(item.event, baseDate));

  const body = {
    headline: ranked.length ? 'Local Napa Radar' : 'Quiet local day',
    items: ranked,
    quietDay: ranked.length === 0,
    lastUpdated: new Date().toISOString()
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=900'
    },
    body: JSON.stringify(body)
  };
};
