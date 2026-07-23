import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const outputArgument = process.argv.indexOf('--output');
const outputPath = resolve(outputArgument >= 0 && process.argv[outputArgument + 1]
  ? process.argv[outputArgument + 1]
  : resolve(repositoryRoot, 'docs/anhedral-cli-init.svg'));

const W = 1800;
const H = 1120;
const C = {
  background: '#06111e', panel: '#091827', panelStrong: '#0c2030', border: '#857d73',
  divider: '#304252', text: '#f3f1ec', muted: '#aeb8c3', yellow: '#e8f500',
  cyan: '#43d8e8', orange: '#ffad2f', red: '#ff5b52', green: '#73dc8c',
};
const out = [];
const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function rect(x, y, width, height, { fill = 'none', stroke = C.border, strokeWidth = 1.2, radius = 10 } = {}) {
  out.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
}
function line(x1, y1, x2, y2, { stroke = C.divider, width = 1, dash = '', marker = '' } = {}) {
  out.push(`<path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}${marker ? ` marker-end="url(#${marker})"` : ''}/>`);
}
function path(d, { stroke = C.text, width = 2, dash = '', marker = 'arrow-white' } = {}) {
  out.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}${marker ? ` marker-end="url(#${marker})"` : ''}/>`);
}
function text(x, y, value, { size = 14, fill = C.text, weight = 400, anchor = 'start', family = 'Inter, ui-sans-serif, system-ui, sans-serif', letterSpacing = 0 } = {}) {
  out.push(`<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${esc(value)}</text>`);
}
function multiline(x, y, lines, { gap = 19, ...options } = {}) {
  lines.forEach((value, index) => text(x, y + index * gap, value, options));
}
function panel(x, y, width, height, number, title) {
  rect(x, y, width, height, { fill: C.panel, radius: 12 });
  out.push(`<circle cx="${x + 27}" cy="${y + 27}" r="16" fill="${C.yellow}"/>`);
  text(x + 27, y + 33, number, { size: 18, fill: C.background, weight: 700, anchor: 'middle' });
  text(x + 52, y + 34, title, { size: 18, fill: C.yellow, weight: 700, letterSpacing: 0.4 });
}
function card(x, y, width, height, label, { accent = C.cyan, subtitle = '', compact = false, fill = C.panelStrong } = {}) {
  rect(x, y, width, height, { fill, stroke: C.border, radius: 8 });
  rect(x + 10, y + 10, compact ? 25 : 32, height - 20, { fill: `${accent}18`, stroke: accent, radius: 6, strokeWidth: 1 });
  text(x + (compact ? 22.5 : 26), y + height / 2 + 5, label.slice(0, 1).toUpperCase(), { size: compact ? 13 : 16, fill: accent, weight: 700, anchor: 'middle' });
  const tx = x + (compact ? 44 : 52);
  text(tx, y + (subtitle ? height / 2 - 2 : height / 2 + 5), label, { size: compact ? 12 : 14, weight: 500 });
  if (subtitle) text(tx, y + height / 2 + 16, subtitle, { size: 11, fill: C.muted });
}
function pill(x, y, width, label, { accent = C.border, fill = C.panelStrong, size = 12 } = {}) {
  rect(x, y, width, 30, { fill, stroke: accent, radius: 6, strokeWidth: 1 });
  text(x + width / 2, y + 20, label, { size, anchor: 'middle', weight: 500 });
}
function sectionLabel(x, y, value, width) {
  text(x, y, value.toUpperCase(), { size: 11, fill: C.cyan, weight: 700, letterSpacing: 1.1 });
  line(x + 88, y - 4, x + width, y - 4, { stroke: C.divider });
}
function arrowLabel(x, y, value, color = C.muted) {
  text(x, y, value, { size: 10, fill: color, weight: 500, anchor: 'middle' });
}

out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title description">`);
out.push('<title id="title">Anhedral master stack map</title>');
out.push('<desc id="description">A deterministic eight-stage map of Anhedral planning, safe generation, one TypeScript workspace, connected product capabilities, cloud provisioning, generated commands, agent experience, and release operations.</desc>');
out.push(`<rect width="${W}" height="${H}" fill="${C.background}"/>`);
out.push(`<defs>
  <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>
  <marker id="arrow-white" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${C.text}"/></marker>
  <marker id="arrow-cyan" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${C.cyan}"/></marker>
  <marker id="arrow-yellow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${C.yellow}"/></marker>
  <marker id="arrow-orange" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${C.orange}"/></marker>
  <marker id="arrow-red" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${C.red}"/></marker>
</defs>`);
out.push(`<ellipse cx="900" cy="160" rx="720" ry="190" fill="#0b3046" opacity="0.22" filter="url(#soft-glow)"/>`);

path('M 26 32 L 42 18 L 42 46 Z', { stroke: C.text, width: 3, marker: '' });
line(52, 15, 52, 49, { stroke: C.border, width: 1.5 });
text(64, 39, 'ANHEDRAL', { size: 18, weight: 500, letterSpacing: 1.6 });
text(900, 49, 'One Codebase. Complete Product Infrastructure.', { size: 40, weight: 700, anchor: 'middle' });
text(900, 77, 'Plan, generate, provision, release, and operate every surface from one TypeScript workspace.', { size: 16, fill: C.muted, anchor: 'middle' });

panel(18, 96, 335, 300, '1', 'PLAN');
card(34, 140, 303, 52, 'Agent skill', { subtitle: 'recommended installation + operation', accent: C.yellow });
multiline(40, 218, ['Ask first: project name + custom domain', 'CLI: create · init · add · ui · doctor'], { size: 13, gap: 24 });
sectionLabel(40, 270, 'Surfaces', 280);
pill(40, 282, 52, 'Web'); pill(98, 282, 57, 'Mobile'); pill(161, 282, 48, 'API'); pill(215, 282, 63, 'Desktop'); pill(284, 282, 43, 'Ext');
sectionLabel(40, 335, 'Feature modules', 280);
multiline(40, 359, ['DB · Auth · Billing · Storage', 'Native subscriptions · Electron updater'], { size: 12, gap: 18 });

panel(370, 146, 220, 200, '2', 'GENERATE SAFELY');
multiline(392, 211, ['Immutable templates · SHA-256', 'Stage files · compose types', 'Ownership + provenance', 'Atomic commit · one install', 'Refuse drift + collisions'], { size: 12, gap: 25 });

panel(608, 96, 560, 300, '3', 'ONE PNPM + TURBOREPO WORKSPACE');
sectionLabel(630, 143, 'Apps', 510);
const appX = [630, 733, 836, 939, 1042];
[['Next.js', 'Web'], ['Expo', 'Mobile'], ['Fastify', 'API'], ['Electron', 'Desktop'], ['WXT', 'Extension']]
  .forEach(([label, subtitle], index) => card(appX[index], 154, 94, 72, label, { subtitle, compact: true }));
sectionLabel(630, 252, 'Cloud runtime', 510);
card(630, 263, 248, 48, 'Assets Worker', { subtitle: 'private R2 binding', compact: true });
card(890, 263, 248, 48, 'Updater Worker', { subtitle: 'private R2 binding', accent: C.orange, compact: true });
sectionLabel(630, 337, 'Shared packages', 510);
pill(630, 350, 116, 'Zod Contracts', { accent: C.cyan }); pill(754, 350, 130, 'Typed API Client', { accent: C.cyan });
pill(892, 350, 112, 'Drizzle + Neon', { accent: C.yellow }); pill(1012, 350, 126, 'Ably Realtime', { accent: C.red });

panel(1186, 96, 596, 300, '5', 'PROVISION CLOUD');
[
  ['Domain + DNSSEC', 1204, 140, 130], ['GitHub + CI', 1342, 140, 105], ['Neon', 1455, 140, 74], ['Clerk', 1537, 140, 72], ['Vercel', 1617, 140, 76], ['R2 + Workers', 1701, 140, 65],
  ['RevenueCat + Ably', 1204, 179, 150], ['EAS + stores', 1362, 179, 112], ['Chrome Store', 1482, 179, 112], ['Signing + notarization', 1602, 179, 164],
].forEach(([label, x, y, width]) => pill(x, y, width, label, { size: 11 }));
sectionLabel(1204, 236, 'DNS routes', 548);
multiline(1208, 260, ['app.example.com  ─ DNS only → Vercel', 'assets.example.com  ─ Worker domain → Assets Worker → private R2', 'updates.example.com ─ Worker domain → Updater Worker → private R2'], { size: 11, gap: 20 });
rect(1204, 320, 562, 58, { fill: '#1a230d', stroke: C.yellow, radius: 7 });
multiline(1218, 343, ['STOP: user handles sign-in, purchases, secrets, Generate/Reveal, and Submit.', 'Computer use drives consoles; lead agent owns mutations; subagents verify.'], { size: 11, gap: 18 });

path('M 353 246 L 366 246');
path('M 590 246 L 604 246', { stroke: C.yellow, width: 2.4, dash: '6 5', marker: 'arrow-yellow' });
path('M 1168 246 L 1182 246', { stroke: C.yellow, width: 2.4, dash: '6 5', marker: 'arrow-yellow' });

panel(18, 414, 1764, 360, '4', 'CONNECTED PRODUCT CAPABILITIES');
const laneY = [476, 532, 588, 644, 700, 746];
['REQUESTS', 'IDENTITY', 'BILLING + REALTIME', 'PRIVATE ASSETS', 'DESKTOP UPDATES', 'SECURITY'].forEach((label, index) => {
  text(42, laneY[index] + 6, label, { size: 11, fill: index === 4 ? C.orange : C.cyan, weight: 700, letterSpacing: 0.8 });
  if (index < 5) line(184, laneY[index] + 2, 1752, laneY[index] + 2, { stroke: C.divider, width: 0.8 });
});

pill(210, 458, 184, 'Client surfaces', { accent: C.cyan }); pill(470, 458, 186, 'Contracts + API client', { accent: C.cyan });
pill(732, 458, 142, 'Fastify API', { accent: C.text }); pill(950, 458, 138, 'Drizzle ORM', { accent: C.yellow }); pill(1164, 458, 158, 'Neon Postgres', { accent: C.cyan });
path('M 394 473 L 466 473'); path('M 656 473 L 728 473'); path('M 874 473 L 946 473'); path('M 1088 473 L 1160 473');
arrowLabel(430, 466, 'typed request'); arrowLabel(692, 466, 'validated'); arrowLabel(910, 466, 'service'); arrowLabel(1124, 466, 'query');

pill(210, 514, 160, 'Clerk Auth', { accent: C.text }); pill(470, 514, 184, 'Verified identity', { accent: C.green }); pill(732, 514, 142, 'Fastify API', { accent: C.text });
path('M 370 529 L 466 529'); path('M 654 529 L 728 529'); path('M 290 514 L 290 501 L 302 501 L 302 492');
arrowLabel(418, 522, 'session / token');

pill(210, 570, 160, 'RevenueCat', { accent: C.red }); pill(470, 570, 142, 'Fastify API', { accent: C.text });
pill(688, 570, 148, 'Neon entitlement', { accent: C.cyan }); pill(912, 570, 138, 'Ably event', { accent: C.red }); pill(1126, 570, 196, 'Clients refetch state', { accent: C.cyan });
path('M 370 585 L 466 585', { stroke: C.red, marker: 'arrow-red' }); path('M 612 585 L 684 585'); path('M 836 585 L 908 585'); path('M 1050 585 L 1122 585', { stroke: C.cyan, marker: 'arrow-cyan' });
arrowLabel(418, 578, 'signed webhook', C.red); arrowLabel(650, 578, 'commit'); arrowLabel(872, 578, 'outbox'); arrowLabel(1086, 578, 'entitlements', C.cyan);

pill(210, 626, 142, 'Fastify API', { accent: C.text }); pill(428, 626, 138, 'Client upload', { accent: C.cyan }); pill(642, 626, 152, 'PRIVATE R2', { accent: C.cyan });
pill(870, 626, 158, 'Assets Worker', { accent: C.cyan }); pill(1104, 626, 198, 'assets.example.com', { accent: C.cyan }); pill(1378, 626, 166, 'Client download', { accent: C.cyan });
path('M 352 641 L 424 641', { stroke: C.cyan, marker: 'arrow-cyan' }); path('M 566 641 L 638 641', { stroke: C.cyan, marker: 'arrow-cyan' });
path('M 794 641 L 866 641', { stroke: C.cyan, marker: 'arrow-cyan' }); path('M 1028 641 L 1100 641', { stroke: C.cyan, marker: 'arrow-cyan' }); path('M 1302 641 L 1374 641', { stroke: C.cyan, marker: 'arrow-cyan' });
arrowLabel(388, 634, 'presign'); arrowLabel(602, 634, 'signed PUT'); arrowLabel(830, 634, 'private binding'); arrowLabel(1064, 634, 'authorized GET'); arrowLabel(1338, 634, 'media');

pill(210, 682, 222, 'Signed build + metadata', { accent: C.orange }); pill(508, 682, 152, 'PRIVATE R2', { accent: C.orange }); pill(736, 682, 166, 'Updater Worker', { accent: C.orange });
pill(978, 682, 206, 'updates.example.com', { accent: C.orange }); pill(1260, 682, 246, 'electron-updater · Desktop', { accent: C.orange });
path('M 432 697 L 504 697', { stroke: C.orange, marker: 'arrow-orange' }); path('M 660 697 L 732 697', { stroke: C.orange, marker: 'arrow-orange' });
path('M 902 697 L 974 697', { stroke: C.orange, marker: 'arrow-orange' }); path('M 1184 697 L 1256 697', { stroke: C.orange, marker: 'arrow-orange' });
arrowLabel(468, 690, 'publish', C.orange); arrowLabel(696, 690, 'private binding', C.orange); arrowLabel(938, 690, 'custom domain', C.orange); arrowLabel(1220, 690, 'check + download', C.orange);
text(210, 748, 'Server-only secrets · exact CORS · rate limits + headers · Electron isolation · least privilege · private buckets', { size: 11, fill: C.muted });

panel(18, 792, 560, 276, '6', 'GENERATED COMMAND SURFACE');
[
  ['pnpm dev', 40, 838, 112], ['pnpm build', 160, 838, 112], ['pnpm typecheck', 280, 838, 132], ['pnpm verify', 420, 838, 132],
  ['pnpm db:migrate', 40, 878, 150], ['pnpm deploy:vercel:*', 198, 878, 180], ['pnpm mobile:*', 386, 878, 166],
  ['pnpm assets:proxy:*', 40, 918, 170], ['pnpm desktop:updates:*', 218, 918, 194], ['pnpm desktop:*', 420, 918, 132],
  ['pnpm extension:zip', 40, 958, 170], ['anhedral doctor', 218, 958, 160], ['add/ui --dry-run', 386, 958, 166],
].forEach(([label, x, y, width]) => pill(x, y, width, label, { size: 11 }));
text(298, 1022, 'one convenient command surface for the complete infrastructure', { size: 12, fill: C.muted, anchor: 'middle' });
text(298, 1043, 'workspace · apps · providers · releases · structure', { size: 11, fill: C.cyan, anchor: 'middle' });

panel(596, 792, 560, 276, '7', 'AGENT + DEVELOPER EXPERIENCE');
card(620, 838, 512, 44, 'SKILL.md', { subtitle: 'intake → generate → doctor → provision → verify', accent: C.yellow, compact: true });
card(620, 892, 512, 44, 'Generated control plane', { subtitle: 'manifest · env contract · docs · provider ledger', compact: true });
card(620, 946, 512, 44, 'Computer use + optional subagents', { subtitle: 'console work + read-only parallel research/verification', compact: true });
card(620, 1000, 512, 44, 'Safe stop points', { subtitle: 'credentials · Generate/Reveal · purchases · Submit', accent: C.yellow, compact: true });

panel(1174, 792, 608, 276, '8', 'VERIFY · RELEASE · OPERATE');
[
  ['Local checks + DB gate', 1198, 838, 264], ['DNS + TLS + infra + CI', 1474, 838, 284], ['Web preview + production', 1198, 886, 264], ['EAS + store releases', 1474, 886, 284],
  ['Staged desktop channels', 1198, 934, 264], ['Extension releases', 1474, 934, 284], ['Runtime tests + audits', 1198, 982, 264], ['Recovery + rollback', 1474, 982, 284],
].forEach(([label, x, y, width], index) => pill(x, y, width, label, { accent: index < 2 ? C.cyan : C.border, size: 12 }));
text(1478, 1042, 'verify the smallest scope first · never weaken a failing gate', { size: 11, fill: C.muted, anchor: 'middle' });

path('M 578 930 L 592 930'); path('M 1156 930 L 1170 930');
line(1210, 1092, 1260, 1092, { stroke: C.text, width: 2, marker: 'arrow-white' }); text(1270, 1096, 'runtime / data', { size: 10, fill: C.muted });
line(1392, 1092, 1442, 1092, { stroke: C.yellow, width: 2, dash: '6 5', marker: 'arrow-yellow' }); text(1452, 1096, 'generate / provision / release', { size: 10, fill: C.muted });
rect(1658, 1082, 20, 20, { fill: C.panelStrong, stroke: C.cyan, radius: 4 }); text(1687, 1096, 'managed resource', { size: 10, fill: C.muted });

out.push('</svg>');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${out.join('\n')}\n`, 'utf8');
console.log(`Rendered ${outputPath}`);
