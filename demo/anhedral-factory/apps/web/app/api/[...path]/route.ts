import { getCloudflareContext } from '@opennextjs/cloudflare';
export const dynamic = 'force-dynamic';
async function forward(request: Request) {
 const { env } = getCloudflareContext();
 const api = (env as unknown as { API: { fetch(request: Request): Promise<Response> } }).API;
 return api.fetch(request);
}
export { forward as GET, forward as POST, forward as PUT };
