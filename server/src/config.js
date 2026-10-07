import path from 'node:path';

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  databaseUrl:
    env.DATABASE_URL ||
    `postgres://${encodeURIComponent(env.POSTGRES_USER || 'bastion')}:${encodeURIComponent(env.POSTGRES_PASSWORD || 'bastion')}@${env.POSTGRES_HOST || 'localhost'}:${env.POSTGRES_PORT || 5432}/${encodeURIComponent(env.POSTGRES_DB || 'bastion')}`,
  dataDir: path.resolve(env.DATA_DIR || './data'),
  publicDir: path.resolve(env.PUBLIC_DIR || '../client/dist'),
  sessionDays: Number(env.SESSION_DAYS || 14),
  cookieSecure: env.COOKIE_SECURE === 'true',
  trustProxy: env.TRUST_PROXY || 'loopback',
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 25),
  admin: {
    username: env.ADMIN_USERNAME || 'admin',
    password: env.ADMIN_PASSWORD || '',
    email: env.ADMIN_EMAIL || null,
  },
  seedDemo: env.SEED_DEMO_CONTENT !== 'false',
  language: env.DEFAULT_LANGUAGE === 'en' ? 'en' : 'de',
};
