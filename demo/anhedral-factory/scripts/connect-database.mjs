import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(path.join(root,'provisioning.json'),'utf8'));
function command(bin,args,options={}) {
 const result=spawnSync(bin,args,{encoding:'utf8',cwd:root,...options});
 if(result.status!==0)throw new Error(`${bin} failed. Check its authentication and permissions; credentials are not printed by this script.`);
 return result.stdout;
}
function connectionString(){
 if(process.env.DATABASE_URL)return process.env.DATABASE_URL;
 return command('neonctl',['connection-string',manifest.neon.branchId,'--project-id',manifest.neon.projectId,'--no-analytics']).trim();
}
async function cf(method,resource,body){
 if(!process.env.CLOUDFLARE_API_TOKEN)throw new Error('Set CLOUDFLARE_API_TOKEN using an existing authorized token.');
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${manifest.cloudflareAccount.id}/${resource}`,{method,headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const result=await response.json();
 validate(response,result,method,resource);
 return result.result;
}
function validate(response,result,method,resource){
 if(!response.ok||!result.success)throw new Error(`Cloudflare ${method} ${resource} failed (${response.status}); no credentials were logged.`);
}
function configure(id){
 for(const app of ['api','workflows']){
  const file=path.join(root,`apps/${app}/wrangler.jsonc`);const config=JSON.parse(readFileSync(file,'utf8'));
  config.hyperdrive[0].id=id;writeFileSync(file,JSON.stringify(config,null,2)+'\n');
 }
}
async function ensureHyperdrive(url){
 const existing=await cf('GET','hyperdrive/configs');
 let hyperdrive=existing.find(item=>item.name==='anhedral-factory-example-database');
 if(!hyperdrive)hyperdrive=await cf('POST','hyperdrive/configs',{name:'anhedral-factory-example-database',origin:{scheme:'postgres',host:url.hostname,port:Number(url.port||5432),database:url.pathname.slice(1),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password)},caching:{disabled:true},origin_connection_limit:10});
 return hyperdrive;
}
async function ensureAuthSecret(){
 const secrets=await cf('GET','workers/scripts/anhedral-factory-example-api/secrets');
 // The API uses only the Hyperdrive binding at runtime. DATABASE_URL is never uploaded to the web app.
 if(!secrets.some(item=>item.name==='BETTER_AUTH_SECRET')){
  const secret=process.env.BETTER_AUTH_SECRET||randomBytes(32).toString('base64url');
  command('pnpm',['exec','wrangler','secret','put','BETTER_AUTH_SECRET'],{cwd:path.join(root,'apps/api'),input:secret+'\n'});
 }
}
async function main(){
 const url=new URL(connectionString());
 if(url.hostname.includes('-pooler'))throw new Error('Use the direct Neon connection: Hyperdrive supplies pooling and migrations need a direct connection.');
 const hyperdrive=await ensureHyperdrive(url);
 configure(hyperdrive.id);
 command('pnpm',['exec','drizzle-kit','migrate'],{cwd:path.join(root,'packages/db'),env:{...process.env,DATABASE_URL:url.toString()}});
 command('pnpm',['exec','wrangler','deploy'],{cwd:path.join(root,'apps/api')});
 await ensureAuthSecret();
 manifest.hyperdrive={id:hyperdrive.id,state:'created; caching disabled'};
 manifest.neon.state='connected; Drizzle migration applied';
 manifest.workers.api.state='deployed; private; auth secret configured';
 writeFileSync(path.join(root,'provisioning.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('Database migrated, Hyperdrive connected, and API auth secret configured. Deploy Workers in the README order.');
}
await main();
