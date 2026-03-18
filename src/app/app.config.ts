const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Allowed origins for CORS - trim whitespace from env var values
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : [
    'http://localhost:4200',
    'http://localhost:4201',
    'http://localhost:8081',
    'http://localhost:8082',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:8082',
    // Production deployments
    'https://getorderstack.com',
    'https://www.getorderstack.com',
    // Vercel deployments (exact match only — no wildcards)
    'https://get-order-stack-restaurant-mobile-j.vercel.app',
    'https://get-order-stack-restaurant-mobile.vercel.app',
  ];

// Dynamic CORS origin checker
const corsOriginChecker = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  // Requests with no origin (mobile apps, Postman, server-to-server):
  // In production, reject to prevent anonymous cross-origin access.
  // In development, allow for Postman / cURL / mobile testing.
  if (!origin) {
    callback(null, !IS_PRODUCTION);
    return;
  }

  // Check if origin is in allowed list (exact match only)
  if (allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  // Reject all other origins
  callback(null, false);
};

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  corsOrigins: corsOriginChecker,
};
