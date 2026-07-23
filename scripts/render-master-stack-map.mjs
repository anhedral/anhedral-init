import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  siAppstore,
  siClerk,
  siCloudflare,
  siCloudflareworkers,
  siDrizzle,
  siElectron,
  siExpo,
  siFastify,
  siGithub,
  siNeon,
  siNextdotjs,
  siReact,
  siRevenuecat,
  siShadcnui,
  siStripe,
  siTailwindcss,
  siTypescript,
  siVercel,
  siWxt,
  siZod,
} from 'simple-icons';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const outputFlag = process.argv.indexOf('--output');
const outputPath = resolve(outputFlag >= 0 && process.argv[outputFlag + 1]
  ? process.argv[outputFlag + 1]
  : resolve(repositoryRoot, 'assets/anhedral-cli-init.svg'));
const anhedralMarkPath = resolve(repositoryRoot, 'assets/images/svg/logo-white-subtract.svg');
const anhedralMarkSource = await readFile(anhedralMarkPath, 'utf8');
const ablySymbolPath = resolve(repositoryRoot, 'assets/images/svg/ably-symbol-color.svg');
const ablySymbolSource = await readFile(ablySymbolPath, 'utf8');
const [, ablySymbolContent = ''] = ablySymbolSource.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/) ?? [];
const [, markViewBox = '0 0 1820 2199'] = anhedralMarkSource.match(/viewBox="([^"]+)"/) ?? [];
const [, , markWidth = '1820', markHeight = '2199'] = markViewBox.split(/\s+/).map(Number);
const markPaths = [...anhedralMarkSource.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)].map((match) => match[1]);

const W = 1920;
const H = 1180;
const palette = {
  background: '#06111d',
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

function ablySymbol(x, y, width) {
  const scale = width / 78;
  svg.push(`<g transform="translate(${x} ${y}) scale(${scale})">${ablySymbolContent}</g>`);
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
}) {
  rect(x, y, width, height);
  const boxSize = height - 24;
  const boxX = x + 16;
  const boxY = y + 12;
  iconBox(boxX, boxY, boxSize);

  if (customIcon === 'globe') customGlobe(boxX, boxY, boxSize, iconColor);
  else if (customIcon === 'desktop') customDesktop(boxX, boxY, boxSize, iconColor);
  else if (customIcon === 'app-store') customAppStore(boxX, boxY, boxSize);
  else if (customIcon === 'google-play') customGooglePlay(boxX, boxY, boxSize);
  else if (customIcon === 'chrome') customChrome(boxX, boxY, boxSize);
  else if (customIcon === 'ably') {
    const ablyWidth = boxSize - 12;
    ablySymbol(boxX + 6, boxY + (boxSize - ablyWidth * 64 / 78) / 2, ablyWidth);
  }
  else if (icon) {
    if (secondIcon || secondEmbeddedIcon) {
      const pairedSize = compact ? 26 : 38;
      const pairedInset = compact ? 5 : 6;
      logo(icon, boxX + pairedInset, boxY + (boxSize - pairedSize) / 2, pairedSize, iconColor);
      if (secondEmbeddedIcon === 'ably') {
        ablySymbol(boxX + boxSize - pairedSize - 4, boxY + (boxSize - pairedSize * 64 / 78) / 2, pairedSize);
      } else {
        logo(
          secondIcon,
          boxX + boxSize - pairedSize - pairedInset,
          boxY + (boxSize - pairedSize) / 2,
          pairedSize,
          secondIconColor,
        );
      }
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

  const dividerX = boxX + boxSize + (compact ? 12 : 10);
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
svg.push('<title id="title">Anhedral Init Stack</title>');
svg.push('<desc id="description">A simplified architecture diagram showing DX tools, deployment destinations, four generated client surfaces, their shared Fastify API, RevenueCat and Stripe billing, Ably realtime, backend services, and a dedicated private R2 updater Worker.</desc>');
svg.push(`<defs>
  <linearGradient id="background-fill" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#071724"/>
    <stop offset=".58" stop-color="#06111d"/>
    <stop offset="1" stop-color="#030a12"/>
  </linearGradient>
  <linearGradient id="card-fill" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0d1b29"/>
    <stop offset="1" stop-color="#07121d"/>
  </linearGradient>
  <linearGradient id="app-store-fill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#24c7fa"/>
    <stop offset="1" stop-color="#0878f9"/>
  </linearGradient>
  <radialGradient id="header-glow" cx="36%" cy="0%" r="68%">
    <stop offset="0" stop-color="#12364d" stop-opacity=".52"/>
    <stop offset="1" stop-color="#06111d" stop-opacity="0"/>
  </radialGradient>
  <filter id="endpoint-glow" x="-100%" y="-100%" width="300%" height="300%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="1.7"/>
  </filter>
  <marker id="arrow-white" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="${palette.text}"/></marker>
  <marker id="arrow-yellow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="${palette.yellow}"/></marker>
</defs>`);
svg.push(`<rect width="${W}" height="${H}" fill="url(#background-fill)"/>`);
svg.push(`<rect width="${W}" height="310" fill="url(#header-glow)"/>`);

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
text(34, 240, 'One init flow for web, native apps, extensions, backend,', { size: 24 });
text(34, 274, 'storage, auth, subscriptions, and seamless desktop updates.', { size: 24 });

const dxToolStartX = 1187;
const dxToolY = 76;
const dxToolGap = 98;
heading(dxToolStartX, 52, 676, 'DX TOOLS');
[
  { icon: siTailwindcss, label: 'Tailwind', color: '#06b6d4' },
  { icon: siShadcnui, label: 'shadcn/ui', color: palette.text },
  { icon: siReact, label: 'RN Reusables', color: '#61dafb' },
  { icon: siTypescript, label: 'TypeScript', color: '#3178c6' },
  { icon: siZod, label: 'Zod', color: '#3e67b1' },
  { icon: siGithub, label: 'GitHub', color: palette.text },
  { label: 'Anhedral Skills', anhedral: true },
].forEach((tool, index) => dxTool(dxToolStartX + index * dxToolGap, dxToolY, tool));

const deployX = 54;
const deployW = 396;
const clientX = 620;
const clientW = 370;
const apiX = 1130;
const apiW = 208;
const serviceX = 1435;
const serviceW = 430;

heading(deployX, 318, deployW, 'DEPLOY & DISTRIBUTE');
heading(clientX, 318, clientW, 'CLIENT SURFACES');
heading(apiX, 318, serviceX + serviceW - apiX, 'BACKEND + SERVICES');

const deployRows = [342, 456, 570, 684, 798];
[
  { title: 'Web', subtitle: 'Vercel preview + production', detail: 'hosts web + API', customIcon: 'globe' },
  { title: 'App Store', subtitle: 'iOS distribution', detail: 'EAS signed release', customIcon: 'app-store' },
  { title: 'Google Play', subtitle: 'Android distribution', detail: 'EAS signed release', customIcon: 'google-play' },
  { title: 'Browser Web Stores', subtitle: 'extension distribution', detail: 'reviewed WXT ZIP', customIcon: 'chrome' },
  { title: 'Desktop Releases', subtitle: 'macOS · Windows · Linux', detail: 'signed installers + seamless updates', customIcon: 'desktop', iconColor: palette.text },
].forEach((item, index) => card(deployX, deployRows[index], deployW, 102, item));

const clientRows = [342, 494, 646, 798];
[
  {
    title: 'Next.js',
    subtitle: 'shadcn/ui',
    detail: 'web product + server routes',
    icon: siNextdotjs,
    iconColor: palette.text,
    iconScale: 58,
    cornerIcon: siVercel,
  },
  { title: 'Expo Native', subtitle: 'React Native Reusables', detail: 'iOS + Android', icon: siExpo, iconColor: palette.text, iconScale: 58 },
  { title: 'WXT Extension', subtitle: 'Chrome · Firefox · Edge', detail: 'MV3 background + side panel', icon: siWxt, iconColor: palette.lime, iconScale: 58 },
  { title: 'Electron Desktop', subtitle: 'macOS · Windows · Linux', detail: 'electron-updater enabled', icon: siElectron, iconColor: palette.cyan, iconScale: 58 },
].forEach((item, index) => card(clientX, clientRows[index], clientW, 112, item));

// One central API, matching the supplied simplified architecture.
rect(apiX, 474, apiW, 296, { radius: 14 });
const apiIconBoxSize = 88;
const apiIconBoxX = apiX + (apiW - apiIconBoxSize) / 2;
const apiIconBoxY = 490;
iconBox(apiIconBoxX, apiIconBoxY, apiIconBoxSize);
logo(siFastify, apiIconBoxX + 10, apiIconBoxY + 10, 68, palette.text);
logo(siVercel, apiX + apiW - 32, 490, 17, palette.text);
line(apiX + 18, 602, apiX + apiW - 18, 602, { stroke: palette.divider });
text(apiX + apiW / 2, 643, 'Fastify Backend', { size: 25, weight: 500, anchor: 'middle' });
text(apiX + apiW / 2, 675, 'API + business logic', { size: 17, fill: palette.muted, anchor: 'middle' });

const serviceRows = [342, 438, 534, 630, 726, 822, 918];
const serviceCardHeight = 88;
[
  {
    title: 'Neon + Drizzle',
    subtitle: 'Postgres + ORM',
    detail: 'reviewed migrations',
    icon: siNeon,
    iconColor: palette.neon,
    secondIcon: siDrizzle,
    secondIconColor: palette.yellow,
  },
  {
    title: 'Clerk Auth',
    subtitle: 'identity + sessions',
    detail: 'verified server-side',
    icon: siClerk,
    iconColor: palette.text,
    iconScale: 56,
  },
  {
    title: 'RevenueCat + Stripe',
    subtitle: 'subscriptions + payments',
    detail: 'billing integration + shared entitlements',
    icon: siRevenuecat,
    iconColor: palette.red,
    secondIcon: siStripe,
    secondIconColor: '#635bff',
  },
  {
    title: 'Ably Realtime',
    subtitle: 'scoped invalidations',
    detail: 'outbox → event → client refetch',
    customIcon: 'ably',
  },
  {
    title: 'Assets Worker',
    subtitle: 'PRIVATE R2 assets binding',
    detail: 'assets.example.com · authorized reads',
    icon: siCloudflareworkers,
    iconColor: palette.orange,
  },
  {
    title: 'Updater Worker',
    subtitle: 'PRIVATE R2 updates binding',
    detail: 'updates.example.com → electron-updater',
    icon: siCloudflareworkers,
    iconColor: palette.orange,
    secondIcon: siElectron,
    secondIconColor: palette.cyan,
  },
  {
    title: 'Cloudflare DNS + Vercel',
    subtitle: 'app domain: DNS-only → Vercel',
    detail: 'DNSSEC · assets/updates Worker domains',
    icon: siCloudflare,
    iconColor: palette.orange,
    secondIcon: siVercel,
    secondIconColor: palette.text,
  },
].forEach((item, index) => card(serviceX, serviceRows[index], serviceW, serviceCardHeight, { ...item, compact: true }));

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
const apiTargets = [520, 590, 660, 730];
clientRows.forEach((row, index) => {
  const sourceY = row + 56;
  const targetY = apiTargets[index];
  smoothConnector(clientX + clientW, sourceY, apiX, targetY);
});

// API-to-service lines. Billing and realtime remain separate downstream
// services, and the assets API keeps its own fifth connection.
const serviceApiSources = [500, 555, 610, 665, 720];
serviceRows.slice(0, 5).forEach((row, index) => {
  const sourceY = serviceApiSources[index];
  const targetY = row + serviceCardHeight / 2;
  smoothConnector(apiX + apiW, sourceY, serviceX, targetY, { marker: '' });
  endpoint(serviceX, targetY);
});

// One compact legend; no command, agent, or updater panels below the architecture.
const legendY = 1050;
const legendLineY = legendY + 43;
rect(126, legendY, 1668, 86, { radius: 12 });
line(246, legendLineY, 350, legendLineY, { stroke: palette.text, width: 3, marker: 'arrow-white' });
text(374, legendLineY + 7, 'runtime API flow', { size: 17, fill: palette.muted });
line(720, legendLineY, 824, legendLineY, { stroke: palette.yellow, width: 3, dash: '10 8', marker: 'arrow-yellow' });
text(848, legendLineY + 7, 'deploy / publish', { size: 17, fill: palette.muted });
line(1198, legendLineY, 1302, legendLineY, { stroke: palette.text, width: 3 });
endpoint(1302, legendLineY);
text(1332, legendLineY + 7, 'backend service connection', { size: 17, fill: palette.muted });

svg.push('</svg>');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${svg.join('\n')}\n`, 'utf8');
console.log(`Rendered ${outputPath}`);
