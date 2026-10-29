import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'pglite-server';
import { resolve } from 'node:path';

const dataDir = resolve(import.meta.dir, '../../.pglite-data');
console.log('Starting embedded PostgreSQL (PGlite) server at', dataDir);
const db = new PGlite(dataDir);
await db.waitReady;

// Ensure clean initial state
try {
  await db.exec('ROLLBACK;');
} catch {}

const server = createServer(db);

server.on('connection', (socket) => {
  socket.on('close', () => {
    db.exec('ROLLBACK;').catch(() => {});
  });
  socket.on('error', () => {
    db.exec('ROLLBACK;').catch(() => {});
  });
});

server.listen(5432, '127.0.0.1', () => {
  console.log('Embedded PostgreSQL server listening on 127.0.0.1:5432');
});
