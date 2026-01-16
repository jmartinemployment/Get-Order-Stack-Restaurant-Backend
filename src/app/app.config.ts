export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:4200']
};
