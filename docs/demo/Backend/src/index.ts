import { buildApp } from './app.js';

async function main() {
  const fastify = await buildApp();
  const PORT = fastify.env?.PORT ?? 0;
  if (!Number.isFinite(PORT) || Number(PORT) <= 0) {
    throw new Error(`PORT must be set and be a positive number. Got: ${PORT}`);
  }
  await fastify.listen({ port: Number(PORT), host: '0.0.0.0' });
  fastify.log.info({ msg: '[startup]', addr: `http://0.0.0.0:${PORT}` });
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
