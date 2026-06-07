import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL || '';

  if (url.startsWith('file:')) {
    const adapter = new PrismaBetterSqlite3({ url });
    return new PrismaClient({ adapter } as any);
  }

  const pool = new Pool({ connectionString: url });
  return new PrismaClient({ adapter: new PrismaPg(pool) } as any);
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || createPrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
