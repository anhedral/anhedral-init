declare module '*/.open-next/worker.js' {
  const worker: { fetch(request: Request, env: CloudflareEnv, context: ExecutionContext): Promise<Response> };
  export default worker;
}
