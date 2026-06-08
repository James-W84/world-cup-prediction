import { copyFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export default function setup() {
  const root = process.cwd(); // always api/ when running vitest
  const devDb = resolve(root, 'prisma/dev.db');
  const testDb = resolve(root, 'prisma/test.db');

  if (!existsSync(devDb)) {
    throw new Error(`dev.db not found at ${devDb}. Run: cd api && npm run seed`);
  }

  copyFileSync(devDb, testDb);
}
