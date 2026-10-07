// OpenNext generates this module; the exact Fallow specifier exception is verified by build:worker.
import next from './.open-next/worker.js';
export default {
 async fetch(request: Request, env: CloudflareEnv, context: ExecutionContext) {
  if(new URL(request.url).pathname === '/api/ws')return env.API.fetch(request);
  return next.fetch(request,env,context);
 },
} satisfies ExportedHandler<CloudflareEnv>;
