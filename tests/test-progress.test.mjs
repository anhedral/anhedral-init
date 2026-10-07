import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { readProjectProgress, reportProjectProgress, projectFingerprint, evaluateProjectProgress, validateProgressReport } from '../dist/progress.js';
const at = new Date().toISOString();
function observation(fingerprint, milestone = 'tested', outcome = 'failed') { return { capability:'next', milestone, outcome, source:'agent', observedAt:at, evidence:'Production request succeeded but ownership check failed', configurationFingerprint:fingerprint, accountRef:'client-a' }; }
function fixture() { const root=mkdtempSync(path.join(tmpdir(),'anhedral-progress-')); writeFileSync(path.join(root,'anhedral.setup.json'),'{}'); return root; }
test('progress persists distinct milestones, environments and discovery routes without changing requirements', () => {
 const root=fixture(); try {
 const setup=readFileSync(path.join(root,'anhedral.setup.json'),'utf8'), fingerprint=projectFingerprint(root);
 assert.equal(readProjectProgress(root),null);
 const first=reportProjectProgress(root,{revision:0,environment:'production',observations:[observation(fingerprint,'deployed','passed'),observation(fingerprint)],discovery:[{provider:'cloudflare',route:'plugin',check:'authorized',source:'agent',outcome:'passed',observedAt:at,expiresAt:new Date(Date.parse(at)+1000).toISOString(),evidence:'OAuth org confirmed',accountRef:'client-a'},{provider:'cloudflare',route:'cli',check:'local-working',source:'agent',outcome:'failed',observedAt:at,expiresAt:new Date(Date.parse(at)+1000).toISOString(),evidence:'CLI login unavailable'}],liveUrl:'https://example.com'});
 assert.equal(first.environments[0].observations.length,2);
 assert.equal(first.environments[0].observations.find(o=>o.milestone==='tested').outcome,'failed');
 assert.equal(first.environments[0].discovery.length,2);
 assert.throws(()=>reportProjectProgress(root,{revision:0,environment:'preview'}),/conflict/);
 reportProjectProgress(root,{revision:1,environment:'preview',observations:[{...observation(fingerprint),accountRef:'client-b'}]});
 assert.equal(readProjectProgress(root).environments.length,2);
 assert.equal(readFileSync(path.join(root,'anhedral.setup.json'),'utf8'),setup);
 assert.equal(projectFingerprint(root),fingerprint);
 mkdirSync(path.join(root,'src'));
 writeFileSync(path.join(root,'src','index.ts'),'export const app = 1;');
 assert.notEqual(projectFingerprint(root), fingerprint, 'source changes invalidate observations');
 const sourceFingerprint=projectFingerprint(root);
 writeFileSync(path.join(root,'src','index.ts'),'export const app = 2;');
 assert.notEqual(projectFingerprint(root), sourceFingerprint);
 const beforeSecrets=projectFingerprint(root);
 writeFileSync(path.join(root,'.env'),'TOKEN=private');
 writeFileSync(path.join(root,'src','credentials.ts'),'export const credential = \"private\";');
 assert.equal(projectFingerprint(root), beforeSecrets, 'secret files are excluded');
 writeFileSync(path.join(root,'package.json'),'{}');
 const evaluated=evaluateProjectProgress(readProjectProgress(root),projectFingerprint(root),Date.parse(at)+2000);
 assert.ok(evaluated.environments[0].observations.every(o=>o.stale));
 assert.ok(evaluated.environments[0].discovery.every(o=>o.stale));
 const child=spawnSync(process.execPath,['dist/bin.js','progress','show',root,'--json'],{encoding:'utf8'});
 assert.equal(child.status,0,child.stderr); assert.equal(JSON.parse(child.stdout).revision,2);
 } finally {rmSync(root,{recursive:true,force:true});}
});
test('progress rejects credentials, unsafe URLs, reserved environments and symlink writes',()=>{
 const root=fixture(); try {
 for (const bad of [{environment:'constructor'},{nextAction:'DATABASE_URL=postgres://user:pass@db/test'},{liveUrl:'https://user:pass@example.com'},{previewUrl:'http://evil.example'},{liveUrl:'https://example.com?token=private'},{unknown:true}]) assert.throws(()=>validateProgressReport({revision:0,environment:'default',...bad}));
 const outside=path.join(root,'outside');writeFileSync(outside,'keep');symlinkSync(outside,path.join(root,'anhedral.progress.json'));
 assert.throws(()=>reportProjectProgress(root,{revision:0,environment:'default'}),/regular files/);
 assert.equal(readFileSync(outside,'utf8'),'keep');
 assert.equal(existsSync(path.join(root,'.anhedral-progress.lock')),false,'failed writes release their lock');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('two process writers cannot silently overwrite the same revision',async()=>{
 const root=fixture(); try {
 const code=`import {reportProjectProgress} from ${JSON.stringify(new URL('../dist/progress.js',import.meta.url).href)}; try {reportProjectProgress(process.argv[1],{revision:0,environment:process.argv[2]});} catch {process.exitCode=1;}`;
 const run=env=>new Promise(resolve=>{const child=spawn(process.execPath,['--input-type=module','-e',code,root,env],{stdio:'ignore'});child.on('exit',resolve);});
 const results=await Promise.all([run('preview'),run('production')]);assert.deepEqual(results.sort(),[0,1]);assert.equal(readProjectProgress(root).revision,1);
 } finally{rmSync(root,{recursive:true,force:true});}
});
test('omission preserves optional fields and null explicitly clears persisted fields',()=>{
 const root=fixture(); try {
 reportProjectProgress(root,{revision:0,environment:'default',nextAction:'Verify product flow',previewUrl:'http://localhost:3000',liveUrl:'https://example.com'});
 const preserved=reportProjectProgress(root,{revision:1,environment:'default',blockers:[]});
 assert.equal(preserved.environments[0].nextAction,'Verify product flow');
 const cleared=reportProjectProgress(root,{revision:2,environment:'default',nextAction:null,previewUrl:null,liveUrl:null});
 for(const field of ['nextAction','previewUrl','liveUrl']) assert.equal(field in cleared.environments[0],false);
 assert.deepEqual(readProjectProgress(root),cleared);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('lockfile drift accepts a bounded large lockfile and rejects oversized input',()=>{
 const root=fixture();try{
 const before=projectFingerprint(root);writeFileSync(path.join(root,'pnpm-lock.yaml'),'# dependencies\n'.repeat(30000));
 const withLock=projectFingerprint(root);assert.notEqual(withLock,before);
 writeFileSync(path.join(root,'pnpm-lock.yaml'),'# changed\n'.repeat(30000));assert.notEqual(projectFingerprint(root),withLock);
 writeFileSync(path.join(root,'pnpm-lock.yaml'),'x'.repeat(2097153));assert.throws(()=>projectFingerprint(root),/size limit/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('resume recovers a confirmed crashed writer and never steals a live or unknown lock',async()=>{
 const root=fixture(); let child;try{
 const lock=path.join(root,'.anhedral-progress.lock');
 const code=`import {openSync,writeFileSync,fsyncSync} from 'node:fs';import {hostname} from 'node:os';const fd=openSync(process.argv[1],'wx',0o600);writeFileSync(fd,JSON.stringify({pid:process.pid,hostname:hostname(),createdAt:'1999-01-01T00:00:00Z'}));fsyncSync(fd);process.stdout.write('ready');setInterval(()=>{},1000);`;
 child=spawn(process.execPath,['--input-type=module','-e',code,lock],{stdio:['ignore','pipe','inherit']});
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error(`writer exited ${code}`)));});
 const liveLock=readFileSync(lock,'utf8');assert.throws(()=>reportProjectProgress(root,{revision:0,environment:'default'}),/busy/);assert.equal(readFileSync(lock,'utf8'),liveLock);
 const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await exited;
 assert.equal(reportProjectProgress(root,{revision:0,environment:'default'}).revision,1,'dead writer recovered without timeout');
 assert.equal(existsSync(lock),false);assert.equal(existsSync(`${lock}.recovery`),false);
 writeFileSync(lock,JSON.stringify({pid:'unknown'}),{mode:0o600});assert.throws(()=>reportProjectProgress(root,{revision:1,environment:'default'}),/unknown/);assert.equal(readFileSync(lock,'utf8'),'{"pid":"unknown"}');
 }finally{if(child?.exitCode===null&&child?.signalCode===null) child.kill();rmSync(root,{recursive:true,force:true});}
});

test('Wrangler generated declarations are excluded but authored declarations detect source drift',()=>{
 const root=fixture();try{
 mkdirSync(path.join(root,'apps','web'),{recursive:true});
 const before=projectFingerprint(root);
 for(const name of ['cloudflare-env.d.ts','worker-configuration.d.ts']) writeFileSync(path.join(root,'apps','web',name),'/* generated */'.repeat(50000));
 assert.equal(projectFingerprint(root),before,'large conventional generated declarations do not invalidate checks');
 writeFileSync(path.join(root,'apps','web','application.d.ts'),'declare const app: string;');
 assert.notEqual(projectFingerprint(root),before,'hand-authored declaration files remain source');
 }finally{rmSync(root,{recursive:true,force:true});}
});
