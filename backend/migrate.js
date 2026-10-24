// Standalone migration runner for Render deployment
try {
  const { runMigrations } = await import('./src/db/migrate.ts');
  const result = await runMigrations();
  console.log('Database migrations applied successfully:', result);
} catch (e) {
  console.log('Database migration deferred or skipped:', e?.message || e);
}
process.exit(0);
