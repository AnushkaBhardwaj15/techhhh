import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'pglite-server';
import { resolve } from 'node:path';

const dataDir = resolve(import.meta.dir, '../../.pglite-data');
console.log('Starting embedded PostgreSQL (PGlite) server at', dataDir);
const db = new PGlite(dataDir);
await db.waitReady;

const server = createServer(db);

server.listen(5432, '127.0.0.1', () => {
  console.log('Embedded PostgreSQL server listening on 127.0.0.1:5432');
});
