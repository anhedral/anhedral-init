// OpenNext generates this JavaScript module during build.
// @ts-ignore OpenNext generates the module at build time; it is absent in a clean checkout.
import next from './.open-next/worker.js';
export default {
 async fetch(request: Request, env: CloudflareEnv, context: ExecutionContext) {
  if(new URL(request.url).pathname === '/api/ws')return env.API.fetch(request);
  return next.fetch(request,env,context);
 },
} satisfies ExportedHandler<CloudflareEnv>;
