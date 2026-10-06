import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  siAppstore,
  siClerk,
  siCloudflare,
  siDrizzle,
  siElectron,
  siExpo,
  siHono,
  siTurborepo,
  siSqlite,
  siGithub,
  siNeon,
  siNextdotjs,
  siReact,
  siRevenuecat,
  siShadcnui,
  siStripe,
  siTailwindcss,
  siTypescript,
  siWxt,
} from 'simple-icons';

const technical = process.argv.includes('--technical');

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const outputFlag = process.argv.indexOf('--output');
const outputPath = resolve(outputFlag >= 0 && process.argv[outputFlag + 1]
  ? process.argv[outputFlag + 1]
  : resolve(repositoryRoot, `assets/anhedral-cli-init${technical ? '-technical' : ''}.svg`));
const anhedralMarkPath = resolve(repositoryRoot, 'assets/images/svg/logo-white-subtract.svg');
const anhedralMarkSource = await readFile(anhedralMarkPath, 'utf8');
const [, markViewBox = '0 0 1820 2199'] = anhedralMarkSource.match(/viewBox="([^"]+)"/) ?? [];
const [, , markWidth = '1820', markHeight = '2199'] = markViewBox.split(/\s+/).map(Number);
const markPaths = [...anhedralMarkSource.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)].map((match) => match[1]);

const W = 1920;
const H = 1660;
const palette = {
  background: '#0c1117',
  panel: '#0a1724',
  panelEnd: '#07121d',
  border: '#73777b',
  divider: '#34424e',
  text: '#f7f5f0',
  muted: '#c4c7ca',
  yellow: '#e9f600',
  lime: '#b9f500',
  cyan: '#51dce9',
  orange: '#f48120',
  red: '#ff3b3f',
  blue: '#2585f9',
  neon: '#35d6a8',
};

const svg = [];
const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function text(x, y, value, {
  size = 18,
  fill = palette.text,
  weight = 400,
  anchor = 'start',
  spacing = 0,
  italic = false,
} = {}) {
  svg.push(`<text x="${x}" y="${y}" fill="${fill}" font-family="Inter, Helvetica Neue, Arial, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${spacing}"${italic ? ' font-style="italic"' : ''}>${escapeXml(value)}</text>`);
}

function rect(x, y, width, height, {
  fill = 'url(#card-fill)', stroke = palette.border, strokeWidth = 1.15, radius = 12,
} = {}) {
  svg.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
}

function line(x1, y1, x2, y2, {
  stroke = palette.divider, width = 1, dash = '', marker = '',
} = {}) {
  svg.push(`<path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}${marker ? ` marker-end="url(#${marker})"` : ''}/>`);
}

function path(d, {
  stroke = palette.text, width = 3, dash = '', marker = 'arrow-white',
} = {}) {
  svg.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}${marker ? ` marker-end="url(#${marker})"` : ''}/>`);
}

function smoothConnector(x1, y1, x2, y2, {
  curvature = 0.46,
  ...pathOptions
} = {}) {
  const horizontalDistance = Math.abs(x2 - x1);
  const direction = Math.sign(x2 - x1) || 1;
  const controlOffset = Math.min(
    horizontalDistance / 2,
    Math.max(36, horizontalDistance * curvature),
  );

  path(
    `M ${x1} ${y1} C ${x1 + direction * controlOffset} ${y1} ${x2 - direction * controlOffset} ${y2} ${x2} ${y2}`,
    pathOptions,
  );
}

function logo(icon, x, y, size, fill) {
  const scale = size / 24;
  svg.push(`<g transform="translate(${x} ${y}) scale(${scale})"><path d="${icon.path}" fill="${fill}"/></g>`);
}

function anhedralMark(x, y, height) {
  const scale = height / markHeight;
  svg.push(`<g transform="translate(${x} ${y}) scale(${scale})">`);
  for (const d of markPaths) svg.push(`<path d="${d}" fill="${palette.text}"/>`);
  svg.push('</g>');
  return markWidth * scale;
}

function iconBox(x, y, size = 70) {
  rect(x, y, size, size, { fill: '#07121d', stroke: palette.divider, radius: 11 });
}

function customGlobe(x, y, size, stroke = palette.text) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.34;
  svg.push(`<g fill="none" stroke="${stroke}" stroke-width="3">
    <circle cx="${cx}" cy="${cy}" r="${r}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${r * 0.45}" ry="${r}"/>
    <path d="M ${cx - r} ${cy} H ${cx + r} M ${cx - r * 0.84} ${cy - r * 0.5} H ${cx + r * 0.84} M ${cx - r * 0.84} ${cy + r * 0.5} H ${cx + r * 0.84}"/>
  </g>`);
}

function customDesktop(x, y, size, stroke = palette.text) {
  svg.push(`<g fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <rect x="${x + 9}" y="${y + 9}" width="${size - 18}" height="${size - 27}" rx="3"/>
    <path d="M ${x + size / 2} ${y + size - 18} V ${y + size - 8} M ${x + size * 0.28} ${y + size - 8} H ${x + size * 0.72}"/>
  </g>`);
}

function customAppStore(x, y, size) {
  const badgeSize = size - 16;
  const badgeX = x + 8;
  const badgeY = y + 8;
  svg.push(`<rect x="${badgeX}" y="${badgeY}" width="${badgeSize}" height="${badgeSize}" rx="11" fill="url(#app-store-fill)"/>`);
  logo(siAppstore, badgeX + 9, badgeY + 9, badgeSize - 18, palette.text);
}

function customGooglePlay(x, y, size) {
  const scale = (size - 8) / 64;
  svg.push(`<g transform="translate(${x + 4} ${y + 4}) scale(${scale})" stroke-linejoin="round">
    <path d="M 9 6 L 39 32 L 9 58 Z" fill="#23d7f2"/>
    <path d="M 9 6 L 44 24.5 L 39 32 Z" fill="#2bd66f"/>
    <path d="M 39 32 L 44 24.5 L 56 30.5 Q 59 32 56 33.5 L 44 39.5 Z" fill="#ffd43b"/>
    <path d="M 9 58 L 44 39.5 L 39 32 Z" fill="#f04b55"/>
  </g>`);
}

function customChrome(x, y, size) {
  const badgeSize = size - 10;
  const badgeX = x + 5;
  const badgeY = y + 5;
  const cx = badgeX + badgeSize / 2;
  const cy = badgeY + badgeSize / 2;
  const r = badgeSize * 0.36;
  const halfR = r * 0.5;
  const highR = r * Math.sqrt(3) / 2;

  svg.push(`<rect x="${badgeX}" y="${badgeY}" width="${badgeSize}" height="${badgeSize}" rx="11" fill="${palette.text}"/>`);
  svg.push(`<path d="M ${cx} ${cy} L ${cx - halfR} ${cy - highR} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z" fill="#ea4335"/>`);
  svg.push(`<path d="M ${cx} ${cy} L ${cx + r} ${cy} A ${r} ${r} 0 0 1 ${cx - halfR} ${cy + highR} Z" fill="#fbbc04"/>`);
  svg.push(`<path d="M ${cx} ${cy} L ${cx - halfR} ${cy + highR} A ${r} ${r} 0 0 1 ${cx - halfR} ${cy - highR} Z" fill="#34a853"/>`);
  svg.push(`<circle cx="${cx}" cy="${cy}" r="${r * 0.48}" fill="${palette.text}"/>`);
  svg.push(`<circle cx="${cx}" cy="${cy}" r="${r * 0.36}" fill="#4285f4"/>`);
}

function customR2(x, y, size) {
  const cloudSize = Math.round(size * 0.42);
  logo(
    siCloudflare,
    x + 2,
    y + (size - cloudSize) / 2,
    cloudSize,
    palette.orange,
  );
  text(x + size * 0.72, y + size * 0.62, 'R2', {
    size: Math.max(11, Math.round(size * 0.34)),
    fill: palette.text,
    weight: 700,
    anchor: 'middle',
    spacing: -0.4,
  });
}

const customCardIcons = {
  globe: customGlobe, desktop: customDesktop, 'app-store': customAppStore,
  'google-play': customGooglePlay, chrome: customChrome, r2: customR2,
  ai: (x, y, size) => text(x + size / 2, y + size * 0.66, 'AI', { size: 27, weight: 600, anchor: 'middle' }),
};

function drawPairedCardIcons(boxX, boxY, boxSize, boxWidth, options) {
  const { icon, iconColor, secondIcon, secondEmbeddedIcon, secondIconColor, wideIcon, compact } = options;
  const pairedSize = wideIcon ? 36 : compact ? 23 : 38;
  const pairedInset = compact ? 5 : 6;
  logo(icon, boxX + pairedInset, boxY + (boxSize - pairedSize) / 2, pairedSize, iconColor);
  if (secondEmbeddedIcon === 'r2') {
    customR2(
      boxX + boxWidth - pairedSize - pairedInset,
      boxY + (boxSize - pairedSize) / 2,
      pairedSize,
    );
  } else {
    logo(
      secondIcon,
      boxX + boxWidth - pairedSize - pairedInset,
      boxY + (boxSize - pairedSize) / 2,
      pairedSize,
      secondIconColor,
    );
  }
}

function drawCardIcon(boxX, boxY, boxSize, boxWidth, options) {
  const { customIcon, icon, iconColor, secondIcon, secondEmbeddedIcon, secondIconColor, wideIcon, compact, iconScale } = options;
  const custom = customCardIcons[customIcon];
  if (custom) { custom(boxX, boxY, boxSize, iconColor); return; }
  if (!icon) return;
  if (secondIcon || secondEmbeddedIcon) {
    drawPairedCardIcons(boxX, boxY, boxSize, boxWidth, options);
  } else {
    const renderedIconScale = compact ? Math.min(iconScale, boxSize - 8) : iconScale;
    logo(
      icon,
      boxX + (boxSize - renderedIconScale) / 2,
      boxY + (boxSize - renderedIconScale) / 2,
      renderedIconScale,
      iconColor,
    );
  }

}

function card(x, y, width, height, {
  title,
  subtitle,
  detail = '',
  icon,
  iconColor = palette.text,
  secondIcon,
  secondIconColor = palette.text,
  secondEmbeddedIcon,
  customIcon,
  cornerIcon,
  cornerIconColor = palette.text,
  iconScale = 52,
  compact = false,
  wideIcon = false,
}) {
  rect(x, y, width, height);
  const boxSize = height - 24;
  const boxWidth = wideIcon ? 96 : boxSize;
  const boxX = x + 16;
  const boxY = y + 12;
  if (wideIcon) {
    rect(boxX, boxY, boxWidth, boxSize, {
      fill: '#07121d',
      stroke: palette.divider,
      radius: 11,
    });
  } else {
    iconBox(boxX, boxY, boxSize);
  }

  drawCardIcon(boxX, boxY, boxSize, boxWidth, { customIcon, icon, iconColor, secondIcon, secondEmbeddedIcon, secondIconColor, wideIcon, compact, iconScale });

  const dividerX = boxX + boxWidth + (compact ? 12 : 10);
  const textX = dividerX + (compact ? 20 : 24);
  line(dividerX, y + 14, dividerX, y + height - 14);
  text(textX, y + (compact ? 31 : 42), title, { size: compact ? 18 : 22, weight: 500 });
  text(textX, y + (compact ? 55 : 70), subtitle, { size: compact ? 14 : 16, fill: palette.muted });
  if (detail) text(textX, y + (compact ? 75 : 91), detail, { size: compact ? 12 : 13, fill: palette.muted });
  if (cornerIcon) logo(cornerIcon, x + width - 32, y + 15, 17, cornerIconColor);
}

function heading(x, y, width, value) {
  text(x + width / 2, y, value, {
    size: 17, fill: palette.yellow, weight: 600, anchor: 'middle', spacing: 3.2,
  });
}

function endpoint(x, y) {
  svg.push(`<circle cx="${x}" cy="${y}" r="8.5" fill="${palette.lime}" filter="url(#endpoint-glow)"/>`);
}

function dxTool(x, y, {
  icon,
  label,
  color = palette.text,
  anhedral = false,
}) {
  const width = 88;
  const height = 92;
  rect(x, y, width, height, { fill: '#07121d', stroke: palette.divider, radius: 11 });
  if (anhedral) {
    const renderedWidth = markWidth / markHeight * 34;
    anhedralMark(x + (width - renderedWidth) / 2, y + 14, 34);
  } else {
    logo(icon, x + 27, y + 14, 34, color);
  }
  text(x + width / 2, y + 72, label, {
    size: 11,
    fill: palette.muted,
    weight: 500,
    anchor: 'middle',
  });
}

svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title description">`);
svg.push(`<title id="title">${technical ? 'Anhedral Application service contracts' : 'Anhedral Init Stack'}</title>`);
svg.push('<desc id="description">Client-owned shadcn, pnpm and Turborepo monorepo. Next.js uses OpenNext on Cloudflare Workers; Hono and OpenAPI provide optional shared APIs. Select Neon with Drizzle and Hyperdrive or D1, authentication, private R2, KV, realtime, jobs, workflows, AI, email, billing, observability and analytics only when required. Dashed yellow lines show publication; white lines show application runtime and service bindings.</desc>');
svg.push(`<defs>
  <linearGradient id="card-fill" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0d1b29"/>
    <stop offset="1" stop-color="#07121d"/>
  </linearGradient>
  <linearGradient id="app-store-fill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#24c7fa"/>
    <stop offset="1" stop-color="#0878f9"/>
  </linearGradient>
  <filter id="endpoint-glow" x="-100%" y="-100%" width="300%" height="300%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="1.7"/>
  </filter>
  <marker id="arrow-white" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="${palette.text}"/></marker>
  <marker id="arrow-yellow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="${palette.yellow}"/></marker>
</defs>`);
svg.push(`<rect width="${W}" height="${H}" fill="${palette.background}"/>`);

// Official Anhedral asset plus wordmark.
const renderedMarkWidth = anhedralMark(28, 34, 58);
const brandRuleX = 28 + renderedMarkWidth + 17;
line(brandRuleX, 26, brandRuleX, 104, { stroke: palette.border, width: 1.5 });
text(brandRuleX + 22, 80, 'ANHEDRAL', { size: 27, weight: 500, spacing: 1.3 });
[
  { x: 32, value: 'Anhedral', underlineEnd: 366 },
  { x: 392, value: 'Init', underlineEnd: 506 },
  { x: 532, value: 'Stack', underlineEnd: 747 },
].forEach(({ x, value, underlineEnd }) => {
  text(x, 176, value, { size: 78, weight: 700 });
  line(x + 1, 195, underlineEnd, 195, { stroke: palette.yellow, width: 6 });
});
text(34, 240, 'Client-owned apps. Cloudflare-first. Add only what you need.', { size: 24 });
text(34, 274, 'shadcn monorepo init → pnpm + Turborepo → apps/* + packages/*', { size: 24 });

const dxToolStartX = 1187;
const dxToolY = 76;
const dxToolGap = 98;
heading(dxToolStartX, 52, 676, 'DX TOOLS');
[
  { icon: siTailwindcss, label: 'Tailwind', color: '#06b6d4' },
  { icon: siShadcnui, label: 'shadcn/ui', color: palette.text },
  { icon: siReact, label: 'RN Reusables', color: '#61dafb' },
  { icon: siTypescript, label: 'TypeScript', color: '#3178c6' },
  { icon: siTurborepo, label: 'Turborepo', color: '#ef4444' },
  { icon: siGithub, label: 'GitHub', color: palette.text },
  { label: 'Codex + Skills', anhedral: true },
].forEach((tool, index) => dxTool(dxToolStartX + index * dxToolGap, dxToolY, tool));
text(dxToolStartX, 210, 'macOS · OpenAI / Codex · Computer Use + Control Chrome', { size: 17, fill: palette.muted });
text(dxToolStartX, 240, 'GitHub Actions · Fallow audit · Cloudflare plugin + cf + API/MCP', { size: 16, fill: palette.muted });
text(dxToolStartX, 270, 'Cloudflare-first · free-first · client-owned delivery', { size: 17, fill: palette.muted });

const deployX = 54;
const deployW = 396;
const clientX = 620;
const clientW = 370;
const apiX = 1130;
const apiW = 208;
const serviceX = 1435;
const serviceW = 430;
const architectureHeadingY = 318;
const architectureCardTop = 354;

heading(deployX, architectureHeadingY, deployW, 'DEPLOY & DISTRIBUTE');
heading(clientX, architectureHeadingY, clientW, 'CLIENT SURFACES');
heading(apiX, architectureHeadingY, serviceX + serviceW - apiX, technical ? 'CLOUDFLARE SERVICE BINDINGS' : 'BACKEND + SERVICES');

const deployRows = Array.from({ length: 5 }, (_, index) => architectureCardTop + index * 206);
[
  { title: 'Web', subtitle: 'Cloudflare Workers + OpenNext', detail: technical ? 'Web-only endpoints: route handlers' : 'Vercel when explicitly selected', customIcon: 'globe' },
  { title: 'App Store', subtitle: 'iOS distribution', detail: 'EAS signed release', customIcon: 'app-store' },
  { title: 'Google Play', subtitle: 'Android distribution', detail: 'EAS signed release', customIcon: 'google-play' },
  { title: 'Browser Web Stores', subtitle: 'extension distribution', detail: 'reviewed WXT ZIP', customIcon: 'chrome' },
  { title: 'Desktop Releases', subtitle: 'macOS · Windows · Linux', detail: 'signed installers + release updates', customIcon: 'desktop', iconColor: palette.text },
].forEach((item, index) => card(deployX, deployRows[index], deployW, 102, item));

const clientRows = Array.from({ length: 4 }, (_, index) => architectureCardTop + index * 260);
[
  {
    title: 'Next.js',
    subtitle: 'shadcn/ui',
    detail: 'web product + server routes',
    icon: siNextdotjs,
    iconColor: palette.text,
    iconScale: 58,
    cornerIcon: siCloudflare,
    cornerIconColor: palette.orange,
  },
  { title: 'Expo Native', subtitle: 'React Native Reusables', detail: 'iOS + Android', icon: siExpo, iconColor: palette.text, iconScale: 58 },
  { title: 'WXT Extension', subtitle: 'Chrome · Firefox · Edge', detail: 'MV3 background + side panel', icon: siWxt, iconColor: palette.lime, iconScale: 58 },
  { title: 'Electron Desktop', subtitle: 'macOS · Windows · Linux', detail: 'shadcn/ui · GPUI / Rust by choice', icon: siElectron, iconColor: palette.cyan, iconScale: 58 },
].forEach((item, index) => card(clientX, clientRows[index], clientW, 112, item));

// Workers hosts the web runtime and optional shared API; no mandatory API app.
const apiY = architectureCardTop + 364;
const apiH = 400;
rect(apiX, apiY, apiW, apiH, { radius: 14 });
const apiIconBoxSize = 88;
const apiIconBoxX = apiX + (apiW - apiIconBoxSize) / 2;
const apiIconBoxY = apiY + 16;
iconBox(apiIconBoxX, apiIconBoxY, apiIconBoxSize);
logo(siCloudflare, apiIconBoxX + 10, apiIconBoxY + 10, 68, palette.orange);
line(apiX + 18, apiY + 128, apiX + apiW - 18, apiY + 128, { stroke: palette.divider });
text(apiX + apiW / 2, apiY + 166, 'Workers', { size: 25, weight: 500, anchor: 'middle' });
text(apiX + apiW / 2, apiY + 196, 'Next.js + OpenNext', { size: 16, fill: palette.muted, anchor: 'middle' });
logo(siHono, apiX + apiW / 2 - 16, apiY + 225, 32, palette.orange);
text(apiX + apiW / 2, apiY + 286, 'Hono + OpenAPI', { size: 19, weight: 500, anchor: 'middle' });
text(apiX + apiW / 2, apiY + 312, 'optional shared API', { size: 15, fill: palette.muted, anchor: 'middle' });
text(apiX + apiW / 2, apiY + 348, 'Web-only: route handlers', { size: 13, fill: palette.muted, anchor: 'middle' });
text(apiX + apiW / 2, apiY + 376, 'Containers when required', { size: 13, fill: palette.muted, anchor: 'middle' });

const services = [
  { title: 'Neon + Drizzle', subtitle: 'PostgreSQL via Hyperdrive', detail: 'Worker → Drizzle → Hyperdrive → Neon', icon: siNeon, iconColor: palette.neon, secondIcon: siDrizzle, secondIconColor: palette.yellow },
  { title: 'D1 + Local Data', subtitle: 'D1 + Drizzle · or local SQLite', detail: 'Choose persistence per product', icon: siSqlite, iconColor: palette.cyan },
  { title: 'Clerk / Better Auth', subtitle: 'Managed or application-owned identity', detail: 'No auth when accounts are unnecessary', icon: siClerk },
  { title: 'Stripe + RevenueCat', subtitle: 'Web billing + optional store entitlements', detail: 'Transactional, idempotent consumption', icon: siStripe, iconColor: '#635bff', secondIcon: siRevenuecat, secondIconColor: palette.red },
  { title: 'Durable Objects', subtitle: 'WebSockets · rooms · presence', detail: 'Stateful realtime coordination', icon: siCloudflare, iconColor: palette.orange },
  { title: 'Private R2', subtitle: 'Files through authorized Worker bindings', detail: 'Clients never receive R2 credentials', customIcon: 'r2' },
  { title: 'Cloudflare KV', subtitle: 'Eventually consistent cache + config', detail: 'Keep transactional state in the database', icon: siCloudflare, iconColor: palette.orange },
  { title: 'Queues + Cron Triggers', subtitle: 'Async jobs + scheduled work', detail: 'Retries · idempotency · failure handling', icon: siCloudflare, iconColor: palette.orange },
  { title: 'Cloudflare Workflows', subtitle: 'Durable multi-step processes', detail: 'Resumable steps · retries · recovery', icon: siCloudflare, iconColor: palette.orange },
  { title: 'OpenAI SDK / AI SDK', subtitle: 'AI integrations · streaming · tools', detail: 'Workers AI when advantageous', customIcon: 'ai' },
  { title: 'Domain + Mail', subtitle: 'GoDaddy broker · Cloudflare nameservers', detail: 'Cloudflare Routing + Sending / Resend alternative', icon: siCloudflare, iconColor: palette.orange },
  { title: 'Cloudflare Observability', subtitle: 'Logs · errors · traces · latency', detail: 'Sentry for additional runtime diagnostics', icon: siCloudflare, iconColor: palette.orange },
  { title: 'Basin Analytics', subtitle: 'Product events · datasets · queries', detail: 'Pipelines → R2 / PostHog when required', icon: siCloudflare, iconColor: palette.orange },
];
const serviceRows = services.map((_, index) => architectureCardTop + index * 88);
const serviceCardHeight = 80;
services.forEach((item, index) => card(serviceX, serviceRows[index], serviceW, serviceCardHeight, { ...item, compact: true }));

// Publish connections are mapped by product surface rather than by row. Expo
// intentionally fans out to both native stores; every lane meets both card
// boundaries, even when their vertical centers differ.
const publishConnections = [
  { clientIndex: 0, deployIndex: 0 },
  { clientIndex: 1, deployIndex: 1 },
  { clientIndex: 1, deployIndex: 2 },
  { clientIndex: 2, deployIndex: 3 },
  { clientIndex: 3, deployIndex: 4 },
];

publishConnections.forEach(({ clientIndex, deployIndex }) => {
  smoothConnector(
    clientX,
    clientRows[clientIndex] + 56,
    deployX + deployW,
    deployRows[deployIndex] + 51,
    {
    stroke: palette.yellow,
    dash: '10 8',
    marker: 'arrow-yellow',
    },
  );
});

// Client-to-API runtime lines.
const apiTargets = [46, 146, 246, 346].map((offset) => apiY + offset);
clientRows.forEach((row, index) => {
  const sourceY = row + 56;
  const targetY = apiTargets[index];
  smoothConnector(clientX + clientW, sourceY, apiX, targetY);
});

// Worker-to-provider or binding connections. Every capability is optional.
serviceRows.forEach((row, index) => {
  const sourceY = apiY + 12 + index * (apiH - 24) / (services.length - 1);
  const targetY = row + serviceCardHeight / 2;
  svg.push(`<g data-connection="workers-to-service-${index}">`);
  smoothConnector(apiX + apiW, sourceY, serviceX, targetY, { marker: '' });
  endpoint(serviceX, targetY);
  svg.push('</g>');
});

// One compact legend; no command, agent, or updater panels below the architecture.
const legendY = 1530;
const legendLineY = legendY + 43;
rect(126, legendY, 1668, 86, { radius: 12 });
line(246, legendLineY, 350, legendLineY, { stroke: palette.text, width: 3, marker: 'arrow-white' });
text(374, legendLineY + 7, 'application runtime flow', { size: 17, fill: palette.muted });
line(720, legendLineY, 824, legendLineY, { stroke: palette.yellow, width: 3, dash: '10 8', marker: 'arrow-yellow' });
text(848, legendLineY + 7, 'deploy / publish', { size: 17, fill: palette.muted });
line(1198, legendLineY, 1302, legendLineY, { stroke: palette.text, width: 3 });
endpoint(1302, legendLineY);
text(1332, legendLineY + 7, 'Worker binding / provider', { size: 17, fill: palette.muted });

text(W / 2, 1640, 'Select capabilities only when required · Client-owned accounts, source, infrastructure and recovery', { size: 16, fill: palette.muted, anchor: 'middle' });
svg.push('</svg>');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${svg.join('\n')}\n`, 'utf8');
console.log(`Rendered ${outputPath}`);
