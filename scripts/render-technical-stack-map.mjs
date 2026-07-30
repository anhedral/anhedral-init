import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  siApple,
  siClerk,
  siCloudflare,
  siDocker,
  siElectron,
  siExpo,
  siFastify,
  siGithub,
  siGoogleplay,
  siLetsencrypt,
  siNeon,
  siNextdotjs,
  siNginx,
  siPostgresql,
  siRevenuecat,
  siVercel,
  siZod,
} from 'simple-icons';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const outputFlag = process.argv.indexOf('--output');
const outputPath = resolve(outputFlag >= 0 && process.argv[outputFlag + 1]
  ? process.argv[outputFlag + 1]
  : resolve(repositoryRoot, 'assets/anhedral-cli-init-technical.svg'));
const markSource = await readFile(
  resolve(repositoryRoot, 'assets/images/svg/logo-white-subtract.svg'),
  'utf8',
);
const [, markViewBox = '0 0 1820 2199'] = markSource.match(/viewBox="([^"]+)"/) ?? [];
const [, , markWidth = 1820, markHeight = 2199] = markViewBox.split(/\s+/).map(Number);
const markPaths = [...markSource.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)]
  .map((match) => match[1]);

const W = 4000;
const H = 5000;
const p = {
  background: '#0b1016',
  zone: '#0b1721',
  zoneAlt: '#0a141d',
  panel: '#0d1c28',
  panelStrong: '#102534',
  border: '#52616d',
  divider: '#2b3c49',
  text: '#f7f5f0',
  muted: '#b9c0c6',
  faint: '#71808b',
  cyan: '#51dce9',
  blue: '#65a9ff',
  purple: '#bd9aff',
  orange: '#f58a34',
  lime: '#b9f500',
  yellow: '#e9f600',
  green: '#54d58a',
  red: '#ff7188',
};

const backgrounds = [];
const edges = [];
const cards = [];
const labels = [];
const nodeBounds = [];
const edgeLabelBounds = [];
const routeBounds = [];

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function text(layer, x, y, value, {
  size = 18,
  fill = p.text,
  weight = 400,
  anchor = 'start',
  family = 'Inter, Helvetica Neue, Arial, sans-serif',
  spacing = 0,
} = {}) {
  layer.push(
    `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}" ` +
    `font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${spacing}">${escapeXml(value)}</text>`,
  );
}

function multiline(layer, x, y, values, {
  size = 16,
  fill = p.muted,
  weight = 400,
  lineHeight = 23,
  family = 'SFMono-Regular, Menlo, Consolas, monospace',
  anchor = 'start',
} = {}) {
  values.forEach((value, index) => text(layer, x, y + index * lineHeight, value, {
    size,
    fill,
    weight,
    family,
    anchor,
  }));
}

function rect(layer, x, y, width, height, {
  fill = p.panel,
  stroke = p.border,
  radius = 18,
  strokeWidth = 1.5,
  dash = '',
} = {}) {
  layer.push(
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ` +
    `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"` +
    `${dash ? ` stroke-dasharray="${dash}"` : ''}/>`,
  );
}

function icon(layer, definition, x, y, size, fill = p.text) {
  const scale = size / 24;
  layer.push(
    `<g transform="translate(${x} ${y}) scale(${scale})"><path d="${definition.path}" fill="${fill}"/></g>`,
  );
}

function anhedralMark(x, y, height, fill = p.text) {
  const scale = height / markHeight;
  cards.push(`<g transform="translate(${x} ${y}) scale(${scale})">`);
  markPaths.forEach((pathData) => cards.push(`<path d="${pathData}" fill="${fill}"/>`));
  cards.push('</g>');
  return markWidth * scale;
}

function pill(x, y, value, color) {
  const width = value.length * 9.1 + 28;
  rect(cards, x, y, width, 34, {
    fill: p.panelStrong,
    stroke: color,
    radius: 10,
    strokeWidth: 1.4,
  });
  text(labels, x + width / 2, y + 23, value, {
    size: 13,
    fill: color,
    weight: 700,
    anchor: 'middle',
    spacing: 0.4,
  });
  return width;
}

function zone({
  x,
  y,
  width,
  height,
  title: titleValue,
  subtitle,
  accent,
  fill = p.zone,
  badge = '',
}) {
  rect(backgrounds, x, y, width, height, {
    fill,
    stroke: p.divider,
    radius: 26,
    strokeWidth: 1.7,
  });
  backgrounds.push(`<rect x="${x}" y="${y}" width="8" height="${height}" rx="4" fill="${accent}"/>`);
  text(labels, x + 34, y + 48, titleValue, { size: 25, weight: 700 });
  text(labels, x + 34, y + 78, subtitle, { size: 15, fill: p.muted });
  if (badge) {
    const badgeWidth = badge.length * 8.4 + 24;
    rect(cards, x + width - badgeWidth - 26, y + 24, badgeWidth, 31, {
      fill: p.panelStrong,
      stroke: accent,
      radius: 9,
    });
    text(labels, x + width - badgeWidth / 2 - 26, y + 45, badge, {
      size: 12,
      fill: accent,
      weight: 700,
      anchor: 'middle',
    });
  }
}

function node({
  id,
  x,
  y,
  width,
  height,
  title: titleValue,
  subtitle = '',
  lines = [],
  icon: iconDefinition,
  iconColor = p.text,
  accent = p.cyan,
  tag = '',
  dashed = false,
}) {
  nodeBounds.push({
    id,
    x,
    y,
    width,
    height,
    title: titleValue,
    subtitle,
    lines,
    hasIcon: Boolean(iconDefinition),
  });
  rect(cards, x, y, width, height, {
    fill: p.panel,
    stroke: accent,
    radius: 17,
    strokeWidth: 1.7,
    dash: dashed ? '9 7' : '',
  });
  cards.push(`<rect x="${x}" y="${y}" width="7" height="${height}" rx="3.5" fill="${accent}"/>`);
  let titleX = x + 24;
  if (iconDefinition) {
    icon(cards, iconDefinition, x + 24, y + 25, 40, iconColor);
    titleX = x + 82;
  }
  text(labels, titleX, y + 44, titleValue, { size: 22, weight: 650 });
  if (subtitle) text(labels, titleX, y + 72, subtitle, { size: 15, fill: p.muted });
  multiline(labels, x + 24, y + (subtitle ? 108 : 76), lines, {
    size: 14.3,
    lineHeight: 22,
  });
  if (tag) {
    const tagWidth = Math.max(62, tag.length * 8 + 22);
    const tagX = x + width - tagWidth - 18;
    const estimatedTitleEnd = titleX + titleValue.length * 12;
    const tagY = estimatedTitleEnd > tagX - 14 ? y + height - 47 : y + 18;
    rect(cards, tagX, tagY, tagWidth, 29, {
      fill: p.panelStrong,
      stroke: p.divider,
      radius: 9,
    });
    text(labels, x + width - tagWidth / 2 - 18, tagY + 20, tag, {
      size: 11.5,
      fill: p.muted,
      weight: 700,
      anchor: 'middle',
      spacing: 0.5,
    });
  }
  cards.push(`<metadata data-node="${escapeXml(id)}"/>`);
}

function route(id, points, {
  color = p.cyan,
  width = 3,
  dash = '',
  end = 'arrow-cyan',
  start = '',
} = {}) {
  routeBounds.push({ id, points });
  const d = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  edges.push(
    `<path data-connection="${escapeXml(id)}" d="${d}" fill="none" stroke="${color}" ` +
    `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"` +
    `${dash ? ` stroke-dasharray="${dash}"` : ''}` +
    `${start ? ` marker-start="url(#${start})"` : ''}` +
    `${end ? ` marker-end="url(#${end})"` : ''}/>`,
  );
}

function edgeLabel(x, y, titleValue, detail, color = p.text, anchor = 'middle') {
  const longest = Math.max(titleValue.length * 8.5, detail.length * 7.2);
  const width = Math.min(610, Math.max(170, longest + 28));
  edgeLabelBounds.push({
    id: titleValue,
    x: anchor === 'middle' ? x - width / 2 : x,
    y: y - 24,
    width,
    height: detail ? 52 : 32,
  });
  rect(cards, anchor === 'middle' ? x - width / 2 : x, y - 24, width, detail ? 52 : 32, {
    fill: p.background,
    stroke: p.divider,
    radius: 9,
    strokeWidth: 1,
  });
  text(labels, anchor === 'middle' ? x : x + 12, y - 4, titleValue, {
    size: 13.5,
    fill: color,
    weight: 700,
    anchor,
  });
  if (detail) text(labels, anchor === 'middle' ? x : x + 12, y + 17, detail, {
    size: 12,
    fill: p.muted,
    anchor,
  });
}

function rectanglesOverlap(a, b, padding = 0) {
  return a.x < b.x + b.width + padding
    && a.x + a.width > b.x - padding
    && a.y < b.y + b.height + padding
    && a.y + a.height > b.y - padding;
}

function segmentCrossesCard([x1, y1], [x2, y2], card, inset = 8) {
  const left = card.x + inset;
  const right = card.x + card.width - inset;
  const top = card.y + inset;
  const bottom = card.y + card.height - inset;
  if (y1 === y2) {
    return y1 > top && y1 < bottom
      && Math.max(Math.min(x1, x2), left) < Math.min(Math.max(x1, x2), right);
  }
  if (x1 === x2) {
    return x1 > left && x1 < right
      && Math.max(Math.min(y1, y2), top) < Math.min(Math.max(y1, y2), bottom);
  }
  return false;
}

function auditLayout() {
  const problems = [];
  for (let index = 0; index < nodeBounds.length; index += 1) {
    const current = nodeBounds[index];
    const titleInset = current.hasIcon ? 106 : 48;
    if (current.title.length * 11.2 > current.width - titleInset) {
      problems.push(`title in node "${current.id}" has insufficient horizontal space`);
    }
    if (current.subtitle.length * 7.6 > current.width - titleInset) {
      problems.push(`subtitle in node "${current.id}" has insufficient horizontal space`);
    }
    for (const lineValue of current.lines) {
      if (lineValue.length * 8.5 > current.width - 48) {
        problems.push(`content line in node "${current.id}" has insufficient horizontal space`);
        break;
      }
    }
    for (let otherIndex = index + 1; otherIndex < nodeBounds.length; otherIndex += 1) {
      const other = nodeBounds[otherIndex];
      if (rectanglesOverlap(current, other, 14)) {
        problems.push(`nodes "${current.id}" and "${other.id}" crowd each other`);
      }
    }
  }
  for (let index = 0; index < edgeLabelBounds.length; index += 1) {
    const current = edgeLabelBounds[index];
    for (const card of nodeBounds) {
      if (rectanglesOverlap(current, card, 8)) {
        problems.push(`edge label "${current.id}" crowds node "${card.id}"`);
      }
    }
    for (let otherIndex = index + 1; otherIndex < edgeLabelBounds.length; otherIndex += 1) {
      const other = edgeLabelBounds[otherIndex];
      if (rectanglesOverlap(current, other, 10)) {
        problems.push(`edge labels "${current.id}" and "${other.id}" crowd each other`);
      }
    }
  }
  for (const connection of routeBounds) {
    for (let index = 1; index < connection.points.length; index += 1) {
      for (const card of nodeBounds) {
        if (segmentCrossesCard(connection.points[index - 1], connection.points[index], card)) {
          problems.push(`route "${connection.id}" crosses node "${card.id}"`);
        }
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`Technical map layout audit failed:\n- ${[...new Set(problems)].join('\n- ')}`);
  }
}

function note(x, y, width, titleValue, lines, accent) {
  rect(cards, x, y, width, 66 + lines.length * 22, {
    fill: p.panelStrong,
    stroke: accent,
    radius: 14,
  });
  text(labels, x + 20, y + 30, titleValue, { size: 15, fill: accent, weight: 700 });
  multiline(labels, x + 20, y + 55, lines, {
    size: 13.2,
    lineHeight: 21,
    family: 'Inter, Helvetica Neue, Arial, sans-serif',
  });
}

const markerDefinitions = [
  ['cyan', p.cyan],
  ['blue', p.blue],
  ['purple', p.purple],
  ['orange', p.orange],
  ['lime', p.lime],
  ['yellow', p.yellow],
  ['green', p.green],
  ['white', p.text],
];
const defs = [];
for (const [id, color] of markerDefinitions) {
  defs.push(
    `<marker id="arrow-${id}" markerWidth="11" markerHeight="11" refX="10" refY="5.5" orient="auto">` +
    `<path d="M0,0 L11,5.5 L0,11 Z" fill="${color}"/></marker>`,
  );
  defs.push(
    `<marker id="arrow-start-${id}" markerWidth="11" markerHeight="11" refX="1" refY="5.5" orient="auto">` +
    `<path d="M11,0 L0,5.5 L11,11 Z" fill="${color}"/></marker>`,
  );
}

backgrounds.push(`<rect width="${W}" height="${H}" fill="${p.background}"/>`);

// Header
const markRenderedWidth = anhedralMark(70, 52, 66);
cards.push(
  `<path d="M ${70 + markRenderedWidth + 22} 44 L ${70 + markRenderedWidth + 22} 134" ` +
  `stroke="${p.border}" stroke-width="1.5"/>`,
);
text(labels, 70 + markRenderedWidth + 50, 103, 'ANHEDRAL', {
  size: 31,
  weight: 650,
  spacing: 1.6,
});
text(labels, 70, 208, 'Anhedral Init — Technical Communication Map', {
  size: 58,
  weight: 750,
});
text(labels, 72, 252, 'One connected topology: callers, trust boundaries, protocols, state authority, and delivery control planes', {
  size: 21,
  fill: p.muted,
});
pill(3160, 66, 'RUNTIME COMMUNICATION', p.cyan);
pill(3482, 66, 'DEPLOY / CONTROL', p.yellow);
text(labels, 3918, 170, 'Arrow points to the receiver  ·  double-ended = request/response  ·  dashed = deploy or configuration', {
  size: 14,
  fill: p.muted,
  anchor: 'end',
});

// The continuous application topology.
zone({
  x: 70, y: 330, width: 3860, height: 1820,
  title: 'CONNECTED APPLICATION RUNTIME',
  subtitle: 'Shared packages compile into the applications; DNS resolves hosts; neither is a network hop.',
  accent: p.cyan,
  badge: 'DEFAULT MANAGED PATH',
});

// Runtime connections are drawn first, then cards sit above them.
route('clients-to-fastify', [[800, 890], [1080, 890], [1080, 810], [1370, 810]], {
  color: p.cyan,
  end: 'arrow-cyan',
  start: 'arrow-start-cyan',
});
route('clients-to-clerk', [[500, 620], [500, 470], [3020, 470], [3020, 540]], {
  color: p.purple,
  end: 'arrow-purple',
  start: 'arrow-start-purple',
});
route('fastify-to-clerk', [[2030, 700], [2250, 700], [2250, 650], [2760, 650]], {
  color: p.purple,
  end: 'arrow-purple',
  start: 'arrow-start-purple',
});
route('fastify-to-postgres', [[1700, 1010], [1700, 1260]], {
  color: p.blue,
  end: 'arrow-blue',
  start: 'arrow-start-blue',
});
route('revenuecat-webhook-to-fastify', [[2760, 1110], [2420, 1110], [2420, 900], [2030, 900]], {
  color: p.orange,
  end: 'arrow-orange',
});
route('fastify-to-revenuecat-rest', [[2030, 840], [2340, 840], [2340, 1050], [2760, 1050]], {
  color: p.cyan,
  end: 'arrow-cyan',
  start: 'arrow-start-cyan',
});
route('purchase-surfaces-to-revenuecat', [[3370, 1130], [3270, 1130]], {
  color: p.orange,
  end: 'arrow-orange',
  start: 'arrow-start-orange',
});
route('fastify-to-ably-rest', [[2030, 960], [2520, 960], [2520, 1515], [2760, 1515]], {
  color: p.purple,
  end: 'arrow-purple',
  start: 'arrow-start-purple',
});
route('ably-to-clients', [[2760, 1580], [2460, 1580], [2460, 2070], [500, 2070], [500, 1160]], {
  color: p.purple,
  end: 'arrow-purple',
});
route('cron-to-fastify', [[1370, 1910], [1210, 1910], [1210, 950], [1370, 950]], {
  color: p.yellow,
  dash: '10 8',
  end: 'arrow-yellow',
});

text(labels, 150, 430, 'AUTHENTICATED APPLICATION API', {
  size: 15,
  fill: p.cyan,
  weight: 750,
  spacing: 1.1,
});
text(labels, 2760, 430, 'BILLING RECONCILIATION + REALTIME INVALIDATION', {
  size: 15,
  fill: p.purple,
  weight: 750,
  spacing: 1.1,
});
edgeLabel(1060, 835, 'HTTPS JSON request / response', 'Authorization: Bearer <JWT> · Zod contracts', p.cyan);
edgeLabel(1660, 449, 'Clerk client SDK', 'session lifecycle · OAuth/deep links · getToken()', p.purple);
edgeLabel(2390, 624, 'server-side verification', '@clerk/fastify · secret key never enters clients', p.purple);
edgeLabel(1700, 1150, 'Drizzle SQL', 'pooled DATABASE_URL · transactional application state', p.blue);
edgeLabel(2390, 1085, 'signed provider webhook', 'RevenueCat → POST /webhooks/revenuecat', p.orange);
edgeLabel(2340, 808, 'subscriber REST lookup', 'server-only RC_SECRET_API_KEY', p.cyan);
edgeLabel(3430, 905, 'purchase + restore', 'StoreKit / Play Billing / optional Stripe Checkout', p.orange);
edgeLabel(2510, 1490, 'Ably REST', 'publish invalidation + createTokenRequest', p.purple);
edgeLabel(1810, 2035, 'private:users:<id> invalidation', 'event tells clients to refetch; payload is never entitlement truth', p.purple);
edgeLabel(1210, 1748, 'scheduled internal routes', 'Bearer CRON_SECRET · cleanup and outbox flush', p.yellow);

node({
  id: 'generated-clients',
  x: 150, y: 620, width: 650, height: 540,
  title: 'Generated client surfaces',
  subtitle: 'untrusted runtimes',
  lines: [
    'Next.js App Router on Vercel',
    'Expo iOS / Android',
    'WXT MV3 extension',
    'Electron renderer + narrow preload IPC',
    '',
    '@shared/contracts validates network data',
    '@shared/api-client performs typed HTTP',
    'shared packages are code, not deployed services',
  ],
  icon: siNextdotjs,
  accent: p.cyan,
  tag: 'CLIENTS',
});
icon(cards, siExpo, 206, 1030, 28, p.text);
icon(cards, siElectron, 246, 1030, 28, p.cyan);
icon(cards, siZod, 286, 1030, 28, p.blue);

node({
  id: 'fastify-api',
  x: 1370, y: 620, width: 660, height: 390,
  title: 'Fastify API',
  subtitle: 'Vercel service · authorization and orchestration boundary',
  lines: [
    'GET /health · /ready · /auth/me · /items',
    'GET|POST /subscriptions/* · RevenueCat webhook',
    'POST /realtime/token · internal outbox flush',
    'POST /storage/uploads · confirm · signed read URL',
    'exact CORS · rate limits · structured errors',
    'secrets and provider credentials remain here',
  ],
  icon: siFastify,
  accent: p.cyan,
  tag: 'SERVER',
});
node({
  id: 'postgres',
  x: 1370, y: 1260, width: 660, height: 300,
  title: 'Neon Postgres + Drizzle',
  subtitle: 'authoritative application state',
  lines: [
    'items · subscriptions + revision',
    'uploads · webhook_events · realtime_outbox',
    'claim leases + duplicate guards + reviewed migrations',
    'RevenueCat remains subscription authority; this is the app projection',
  ],
  icon: siNeon,
  iconColor: '#00e599',
  accent: p.blue,
  tag: 'STATE',
});
node({
  id: 'vercel-cron',
  x: 1370, y: 1830, width: 630, height: 170,
  title: 'Vercel Cron',
  subtitle: 'scheduler only',
  lines: ['*/5 outbox flush · daily storage cleanup', 'Fastify performs the work and reports success/failure'],
  icon: siVercel,
  accent: p.yellow,
  tag: 'CONTROL',
});
node({
  id: 'clerk',
  x: 2760, y: 540, width: 510, height: 230,
  title: 'Clerk',
  subtitle: 'identity authority',
  lines: [
    'client session + token refresh',
    'API derives authoritative userId after verification',
    'publishable key in clients · secret only on server',
  ],
  icon: siClerk,
  accent: p.purple,
  tag: 'IDENTITY',
});
node({
  id: 'revenuecat',
  x: 2760, y: 950, width: 510, height: 300,
  title: 'RevenueCat',
  subtitle: 'subscription authority',
  lines: [
    'native/store transactions and optional web checkout',
    'signed webhook initiates reconciliation',
    'REST subscriber record resolves current entitlement',
    'Stripe Checkout: product integration',
    'not generated substrate',
  ],
  icon: siRevenuecat,
  iconColor: '#f25a5a',
  accent: p.orange,
  tag: 'BILLING',
});
node({
  id: 'purchase-surfaces',
  x: 3370, y: 1010, width: 450, height: 220,
  title: 'Purchase surfaces',
  subtitle: 'native stores + configured web checkout',
  lines: ['Clerk user ID becomes RevenueCat app user ID', 'StoreKit · Play Billing · Stripe (optional)'],
  icon: siExpo,
  accent: p.orange,
  tag: 'CLIENT',
});
node({
  id: 'ably',
  x: 2760, y: 1410, width: 590, height: 260,
  title: 'Ably',
  subtitle: 'scoped event transport, never state authority',
  lines: [
    'server REST publish + auth.createTokenRequest',
    '1 h subscribe token · private:users:<id>',
    'signed-in clients receive invalidation then refetch Fastify',
  ],
  accent: p.purple,
  tag: 'EVENTS',
});
note(150, 1320, 650, 'ROUTING, NOT A MIDDLEBOX', [
  'Cloudflare app.<domain> is DNS-only → Vercel.',
  'Mobile, extension, and desktop call the configured API URL directly.',
  'DNS resolution is omitted from request arrows to avoid implying proxying.',
], p.orange);

// Storage and Workflows connect back to the same Fastify boundary above.
zone({
  x: 70, y: 2210, width: 1885, height: 970,
  title: 'PRIVATE R2 ASSET STORAGE',
  subtitle: 'Fastify authorizes metadata; clients transfer bytes using narrowly scoped signed URLs.',
  accent: p.lime,
});
route('fastify-to-storage-service', [[1370, 980], [1100, 980], [1100, 2170], [560, 2170], [560, 2400]], {
  color: p.cyan,
  end: 'arrow-cyan',
  start: 'arrow-start-cyan',
});
route('storage-service-to-r2', [[870, 2505], [1130, 2505]], {
  color: p.lime,
  end: 'arrow-lime',
  start: 'arrow-start-lime',
});
route('client-direct-to-r2', [[520, 2850], [520, 3000], [1320, 3000], [1320, 2670]], {
  color: p.lime,
  end: 'arrow-lime',
  start: 'arrow-start-lime',
});
route('r2-to-assets-proxy', [[1510, 2505], [1570, 2505]], {
  color: p.lime,
  end: 'arrow-lime',
  start: 'arrow-start-lime',
});
route('reader-to-assets-proxy', [[1745, 2900], [1745, 2670]], {
  color: p.cyan,
  end: 'arrow-cyan',
  start: 'arrow-start-cyan',
});
edgeLabel(560, 2148, 'same Fastify server boundary', 'JWT + Zod + ownership checks', p.cyan);
edgeLabel(1000, 2478, 'S3 API', 'presign · HEAD · COPY · DELETE', p.lime);
edgeLabel(820, 3025, 'direct PUT / signed private GET', 'short TTL · exact length/type · bucket CORS', p.lime);
edgeLabel(1555, 2308, 'ASSETS binding', 'in-process R2 request / response', p.lime);
edgeLabel(1745, 2845, 'public GET / HEAD', 'known confirmed key · Range · ETag', p.cyan);
node({
  id: 'storage-service',
  x: 250, y: 2400, width: 620, height: 280,
  title: 'Fastify storage service',
  subtitle: 'metadata authorization + lifecycle',
  lines: [
    'create upload → signed staging PUT',
    'confirm → HEAD, validate, COPY, DELETE',
    'owner-only read → signed GET',
    'Postgres records quota, owner, status, and cleanup cursor',
  ],
  icon: siFastify,
  accent: p.cyan,
  tag: 'SERVER',
});
node({
  id: 'application-r2',
  x: 1130, y: 2350, width: 380, height: 320,
  title: 'Private Cloudflare R2',
  subtitle: 'application assets bucket',
  lines: [
    'storage/staging/<user>/…',
    'storage/confirmed/<user>/<id>…',
    'r2.dev + bucket custom domain disabled',
    'R2 S3 keys exist only in Fastify',
  ],
  icon: siCloudflare,
  iconColor: p.orange,
  accent: p.lime,
  tag: 'OBJECTS',
});
node({
  id: 'assets-private-proxy',
  x: 1570, y: 2350, width: 350, height: 320,
  title: 'assets-private-proxy',
  subtitle: 'Worker Custom Domain',
  lines: [
    'assets.<domain>',
    'only storage/confirmed/*',
    'no listing · no staging',
    'ASSETS binding is read-only policy',
  ],
  icon: siCloudflare,
  iconColor: p.orange,
  accent: p.orange,
  tag: 'WORKER',
});
node({
  id: 'asset-reader',
  x: 1545, y: 2900, width: 375, height: 180,
  title: 'Known-key reader',
  subtitle: 'public delivery path',
  lines: ['unguessable confirmed object key', 'private owner reads bypass this', 'via a signed R2 URL'],
  accent: p.cyan,
  tag: 'READER',
});
node({
  id: 'storage-client',
  x: 120, y: 2760, width: 400, height: 180,
  title: 'Authenticated client',
  subtitle: 'signed URL holder',
  lines: ['metadata and authorization stay', 'on Fastify', 'bytes move directly between client and R2'],
  accent: p.cyan,
  tag: 'CLIENT',
});

zone({
  x: 2025, y: 2210, width: 1905, height: 970,
  title: 'CLOUDFLARE DURABLE WORKFLOWS',
  subtitle: 'A service-authenticated control Worker starts persisted execution of product-owned steps.',
  accent: p.orange,
});
route('fastify-to-workflows-control', [[2030, 980], [2160, 980], [2160, 2130], [2270, 2130], [2270, 2400]], {
  color: p.cyan,
  end: 'arrow-cyan',
  start: 'arrow-start-cyan',
});
route('control-worker-to-workflow', [[2780, 2520], [2990, 2520]], {
  color: p.orange,
  end: 'arrow-orange',
  start: 'arrow-start-orange',
});
route('workflow-to-downstream', [[3450, 2670], [3450, 2880]], {
  color: p.cyan,
  end: 'arrow-cyan',
  start: 'arrow-start-cyan',
});
edgeLabel(2270, 2148, 'trusted HTTPS JSON', 'Bearer WORKFLOW_API_TOKEN (32+) · never a client credential', p.cyan);
edgeLabel(2885, 2310, 'APPLICATION_WORKFLOW binding', 'create · status · sendEvent', p.orange);
edgeLabel(3450, 2838, 'step.do() side effects', 'idempotent HTTP / Postgres / R2 / email / queues', p.cyan);
node({
  id: 'workflows-control-worker',
  x: 2140, y: 2400, width: 640, height: 300,
  title: 'Workflows control Worker',
  subtitle: 'service gateway · no-store responses',
  lines: [
    'POST /instances',
    'GET /instances/:id',
    'POST /instances/:id/events/:type',
    '64 KiB JSON · safe IDs · hashed token comparison',
  ],
  icon: siCloudflare,
  iconColor: p.orange,
  accent: p.orange,
  tag: 'WORKER',
});
node({
  id: 'application-workflow',
  x: 2990, y: 2350, width: 700, height: 320,
  title: 'ApplicationWorkflow instance',
  subtitle: 'Cloudflare-persisted execution of user-owned src/workflow.ts',
  lines: [
    'event.payload → validated parameters',
    'stable step names · serializable results',
    'retry limit 5 · delay 10 s · exponential backoff',
    'sleep / waitForEvent · status / output / events',
    'instance ID is idempotency key; business state lives elsewhere',
  ],
  icon: siCloudflare,
  iconColor: p.orange,
  accent: p.lime,
  tag: 'DURABLE',
});
node({
  id: 'workflow-downstream',
  x: 3020, y: 2880, width: 640, height: 190,
  title: 'Downstream product systems',
  subtitle: 'explicit integrations added by the application',
  lines: ['persist business outcomes outside Workflow retention', 'each retryable step must make its side effects idempotent'],
  accent: p.cyan,
  tag: 'PRODUCT',
  dashed: true,
});

// Release path and infrastructure use dashed arrows; they do not masquerade as runtime traffic.
zone({
  x: 70, y: 3240, width: 1885, height: 1110,
  title: 'SIGNED DESKTOP UPDATE CHANNEL',
  subtitle: 'CI writes immutable artifacts first and mutable channel metadata last; devices only read.',
  accent: p.blue,
});
route('github-to-electron-builder', [[450, 3590], [500, 3590]], {
  color: p.yellow, dash: '11 9', end: 'arrow-yellow',
});
route('electron-builder-to-publisher', [[850, 3590], [970, 3590]], {
  color: p.yellow, dash: '11 9', end: 'arrow-yellow',
});
route('publisher-to-updates-r2', [[1350, 3590], [1460, 3590]], {
  color: p.yellow, dash: '11 9', end: 'arrow-yellow',
});
route('updates-r2-to-worker', [[1640, 3745], [1640, 3970]], {
  color: p.lime, end: 'arrow-lime', start: 'arrow-start-lime',
});
route('updater-worker-to-electron', [[1350, 4090], [1020, 4090], [1020, 3970]], {
  color: p.cyan, end: 'arrow-cyan', start: 'arrow-start-cyan',
});
edgeLabel(475, 3390, 'build', 'matching OS runner', p.yellow);
edgeLabel(910, 3390, 'signed release files', 'DMG/ZIP · EXE · AppImage/DEB', p.yellow);
edgeLabel(1405, 3390, 'ordered R2 upload', 'artifact → blockmap → latest[-mac|-linux].yml', p.yellow);
edgeLabel(1640, 3850, 'UPDATES binding', 'private bucket request / response', p.lime);
edgeLabel(1185, 4060, 'HTTPS GET / HEAD', 'Range · ETag · OS signature validation', p.cyan);
node({
  id: 'github-actions-desktop',
  x: 140, y: 3480, width: 310, height: 220,
  title: 'GitHub Actions',
  subtitle: 'macOS · Windows · Linux',
  lines: ['protected signing secrets', 'release verification gates'],
  icon: siGithub,
  accent: p.yellow,
  tag: 'CI',
});
node({
  id: 'electron-builder',
  x: 500, y: 3480, width: 350, height: 220,
  title: 'electron-builder',
  subtitle: 'native packaged app',
  lines: ['signed / notarized outputs', 'x64 · arm64 · blockmaps · YAML'],
  icon: siElectron,
  iconColor: p.cyan,
  accent: p.blue,
  tag: 'SIGNED',
});
node({
  id: 'publish-updates',
  x: 970, y: 3480, width: 380, height: 220,
  title: 'publish-updates.mjs',
  subtitle: 'allowlisted publisher',
  lines: ['immutable files first', 'channel metadata last', 'no R2 credentials in app'],
  accent: p.yellow,
  tag: 'OPS',
});
node({
  id: 'updates-r2',
  x: 1460, y: 3480, width: 390, height: 265,
  title: 'Private updates R2',
  subtitle: 'separate release bucket',
  lines: ['releases/<platform>/<arch>/…', 'r2.dev and direct bucket domain disabled', 'CI is the only writer'],
  icon: siCloudflare,
  iconColor: p.orange,
  accent: p.lime,
  tag: 'OBJECTS',
});
node({
  id: 'desktop-updater-worker',
  x: 1350, y: 3970, width: 500, height: 240,
  title: 'desktop-updater Worker',
  subtitle: 'updates.<domain> Custom Domain',
  lines: ['read-only releases/* · workers.dev disabled', '206 ranges · conditional 304 · immutable cache'],
  icon: siCloudflare,
  iconColor: p.orange,
  accent: p.orange,
  tag: 'WORKER',
});
node({
  id: 'electron-main',
  x: 530, y: 3970, width: 490, height: 240,
  title: 'Electron main process',
  subtitle: 'electron-updater enabled',
  lines: ['metadata discovery → download → restart/install', 'OS validates the signed artifact before installation'],
  icon: siElectron,
  iconColor: p.cyan,
  accent: p.cyan,
  tag: 'DEVICE',
});

zone({
  x: 2025, y: 3240, width: 1905, height: 1110,
  title: 'DEPLOYMENT, DNS + OPTIONAL SELF-HOSTED TOPOLOGY',
  subtitle: 'Dashed arrows change provider configuration. The lower route replaces managed Neon for that deployment.',
  accent: p.yellow,
  badge: 'OPT-IN SELF-HOSTED',
});
route('github-to-vercel', [[2360, 3580], [2470, 3580]], {
  color: p.yellow, dash: '11 9', end: 'arrow-yellow',
});
route('github-to-wrangler', [[2360, 3620], [2400, 3620], [2400, 3795], [2470, 3795]], {
  color: p.yellow, dash: '11 9', end: 'arrow-yellow',
});
route('github-to-eas', [[2360, 3660], [2380, 3660], [2380, 3975], [2470, 3975]], {
  color: p.yellow, dash: '11 9', end: 'arrow-yellow',
});
route('dns-to-vercel', [[3210, 3580], [2770, 3580]], {
  color: p.yellow, dash: '11 9', end: 'arrow-yellow',
});
route('selfhost-dns-to-nginx', [[2410, 4245], [2500, 4245]], {
  color: p.yellow, dash: '9 7', end: 'arrow-yellow',
});
route('nginx-to-fastify-container', [[2900, 4245], [3050, 4245]], {
  color: p.cyan, end: 'arrow-cyan', start: 'arrow-start-cyan',
});
route('fastify-container-to-postgres', [[3450, 4245], [3530, 4245]], {
  color: p.blue, end: 'arrow-blue', start: 'arrow-start-blue',
});
edgeLabel(2415, 3390, 'deploy web + API', 'Vercel Services + production environment', p.yellow);
edgeLabel(2990, 3390, 'DNS-only → Vercel', 'app.<domain> resolves to the managed runtime', p.yellow);
edgeLabel(2455, 4110, 'A / AAAA', 'approved DNS change', p.yellow);
edgeLabel(2975, 4110, 'HTTPS :443', 'reverse proxy to private app port', p.cyan);
edgeLabel(3490, 4110, 'private DATABASE_URL', 'no published database port', p.blue);
node({
  id: 'github-control',
  x: 2110, y: 3480, width: 250, height: 230,
  title: 'GitHub CI',
  subtitle: 'pnpm source + CI',
  lines: ['build · test', 'release · deploy'],
  icon: siGithub,
  accent: p.yellow,
  tag: 'CONTROL',
});
node({
  id: 'vercel-control',
  x: 2470, y: 3480, width: 300, height: 180,
  title: 'Vercel',
  subtitle: 'web + Fastify Services',
  lines: ['preview / production env', 'crons + logs'],
  icon: siVercel,
  accent: p.yellow,
  tag: 'DEPLOY',
});
node({
  id: 'wrangler-control',
  x: 2470, y: 3720, width: 300, height: 150,
  title: 'Wrangler',
  subtitle: 'Workers + bindings',
  lines: ['secrets · custom domains'],
  icon: siCloudflare,
  iconColor: p.orange,
  accent: p.yellow,
  tag: 'DEPLOY',
});
node({
  id: 'eas-control',
  x: 2470, y: 3900, width: 300, height: 150,
  title: 'EAS + stores',
  subtitle: 'native delivery',
  lines: ['credentials · builds · review'],
  icon: siExpo,
  accent: p.yellow,
  tag: 'MOBILE',
});
icon(cards, siApple, 2716, 4010, 20, p.text);
icon(cards, siGoogleplay, 2744, 4010, 20, '#34a853');
node({
  id: 'cloudflare-dns',
  x: 3210, y: 3480, width: 600, height: 180,
  title: 'Cloudflare DNS + Custom Domains',
  subtitle: 'routing and managed edge TLS',
  lines: ['app.<domain> DNS-only → Vercel', 'assets/updates Custom Domains → their Workers'],
  icon: siCloudflare,
  iconColor: p.orange,
  accent: p.yellow,
  tag: 'EDGE',
});
node({
  id: 'selfhost-dns',
  x: 2110, y: 4160, width: 300, height: 170,
  title: 'Cloudflare DNS',
  subtitle: 'A / AAAA',
  icon: siCloudflare,
  iconColor: p.orange,
  accent: p.yellow,
  tag: 'DNS',
  dashed: true,
});
node({
  id: 'nginx-certbot',
  x: 2500, y: 4160, width: 400, height: 170,
  title: 'Nginx + Certbot',
  subtitle: 'Ubuntu host ingress',
  lines: ['managed TLS · UFW · Fail2ban'],
  icon: siNginx,
  iconColor: '#009639',
  accent: p.yellow,
  tag: 'TLS',
  dashed: true,
});
icon(cards, siLetsencrypt, 2840, 4288, 21, p.yellow);
node({
  id: 'fastify-container',
  x: 3050, y: 4160, width: 400, height: 170,
  title: 'Fastify container',
  subtitle: 'Docker Compose',
  lines: ['PORT 8787 on private network', 'same application routes/contracts'],
  icon: siDocker,
  iconColor: '#2496ed',
  accent: p.cyan,
  tag: 'APP',
  dashed: true,
});
node({
  id: 'postgres-container',
  x: 3530, y: 4160, width: 350, height: 170,
  title: 'PostgreSQL',
  subtitle: 'selected state authority',
  lines: ['reviewed migrations', 'off-host encrypted backup runbook'],
  icon: siPostgresql,
  iconColor: p.blue,
  accent: p.blue,
  tag: 'STATE',
  dashed: true,
});

// Compact contract catalog: factual guardrails, not another disconnected flow diagram.
zone({
  x: 70, y: 4400, width: 3860, height: 430,
  title: 'COMPLETE SERVICE CONTRACT CATALOG',
  subtitle: 'Authority and trust rules that disambiguate the arrows above.',
  accent: p.green,
});
const catalogColumns = [
  {
    x: 140,
    title: 'IDENTITY + API',
    color: p.cyan,
    lines: [
      'Clerk owns identity; Fastify verifies and derives userId.',
      'Fastify owns authorization, validation, and orchestration.',
      '@shared packages are compiled code with no runtime authority.',
    ],
  },
  {
    x: 1090,
    title: 'STATE + BILLING + EVENTS',
    color: p.purple,
    lines: [
      'RevenueCat owns subscription truth; Postgres stores the app projection.',
      'Postgres owns items, uploads, outbox, and processed webhook records.',
      'Ably transports invalidation only; clients refetch authoritative state.',
    ],
  },
  {
    x: 2040,
    title: 'OBJECTS + WORKFLOWS',
    color: p.lime,
    lines: [
      'Private R2 stores bytes; Fastify and Workers enforce access policy.',
      'APPLICATION_WORKFLOW persists orchestration, not business authority.',
      'WORKFLOW_API_TOKEN, R2 S3 keys, and provider secrets remain server-side.',
    ],
  },
  {
    x: 2990,
    title: 'DELIVERY + OPERATIONS',
    color: p.yellow,
    lines: [
      'DNS resolves names; Vercel and Workers terminate runtime requests.',
      'Desktop CI writes; updater Worker and Electron devices only read.',
      'Self-hosted PostgreSQL replaces Neon only for the selected deployment.',
    ],
  },
];
for (const column of catalogColumns) {
  rect(cards, column.x, 4510, 820, 230, {
    fill: p.panel,
    stroke: column.color,
    radius: 15,
  });
  text(labels, column.x + 24, 4550, column.title, {
    size: 16,
    fill: column.color,
    weight: 750,
    spacing: 0.6,
  });
  multiline(labels, column.x + 24, 4590, column.lines, {
    size: 14.2,
    lineHeight: 48,
    family: 'Inter, Helvetica Neue, Arial, sans-serif',
  });
}

// Footer legend
rect(backgrounds, 70, 4900, 3860, 70, {
  fill: p.panelStrong,
  stroke: p.divider,
  radius: 14,
});
route('legend-request-response', [[120, 4935], [220, 4935]], {
  color: p.cyan, end: 'arrow-cyan', start: 'arrow-start-cyan',
});
text(labels, 245, 4941, 'request / response', { size: 14, fill: p.muted });
route('legend-event', [[600, 4935], [700, 4935]], {
  color: p.purple, end: 'arrow-purple',
});
text(labels, 725, 4941, 'webhook / event / invalidation', { size: 14, fill: p.muted });
route('legend-object', [[1210, 4935], [1310, 4935]], {
  color: p.lime, end: 'arrow-lime', start: 'arrow-start-lime',
});
text(labels, 1335, 4941, 'object or binding request / response', { size: 14, fill: p.muted });
route('legend-control', [[2030, 4935], [2130, 4935]], {
  color: p.yellow, dash: '10 8', end: 'arrow-yellow',
});
text(labels, 2155, 4941, 'deployment / control plane', { size: 14, fill: p.muted });
text(labels, 3880, 4941, 'Dashed card = opt-in or explicit product integration', {
  size: 14,
  fill: p.muted,
  anchor: 'end',
});

auditLayout();

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title description">`,
  '<title id="title">Anhedral Init Technical Communication Map</title>',
  '<desc id="description">A spacious connected architecture map showing exact request, response, event, storage, workflow, deployment, desktop-update, DNS, and optional self-hosted communication paths.</desc>',
  '<defs>',
  ...defs,
  '</defs>',
  ...backgrounds,
  ...edges,
  ...cards,
  ...labels,
  '</svg>',
  '',
].join('\n');

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, svg, 'utf8');
console.log(`Rendered ${outputPath}`);
