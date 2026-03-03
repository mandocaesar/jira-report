import { PrismaClient } from '@prisma/client';

// PrismaClient singleton pattern for Next.js
// Prevents multiple instances in development (hot reload)
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

// Only initialize Prisma if database URL is configured
const isDatabaseConfigured = Boolean(process.env.POSTGRES_PRISMA_URL);

export const prisma = isDatabaseConfigured
    ? (globalForPrisma.prisma ??
        new PrismaClient({
            log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
        }))
    : null;

if (process.env.NODE_ENV !== 'production' && prisma) {
    globalForPrisma.prisma = prisma;
}

// Helper to check if database is available
export const isDatabaseAvailable = () => isDatabaseConfigured && prisma !== null;
