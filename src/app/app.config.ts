// Allowed origins for CORS
const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
  'http://localhost:4200',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:8082',
  // Vercel deployments
  'https://get-order-stack-restaurant-mobile-j.vercel.app',
  'https://get-order-stack-restaurant-mobile.vercel.app',
];

// Dynamic CORS origin checker - allows Expo dev servers and listed origins
const corsOriginChecker = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  // Allow requests with no origin (mobile apps, Postman, etc.)
  if (!origin) {
    callback(null, true);
    return;
  }

  // Check if origin is in allowed list
  if (allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  // Allow Expo development servers (*.exp.direct)
  if (origin.endsWith('.exp.direct')) {
    callback(null, true);
    return;
  }

  // Allow any Vercel preview deployments
  if (origin.includes('vercel.app')) {
    callback(null, true);
    return;
  }

  // Reject other origins
  callback(new Error('Not allowed by CORS'));
};

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  corsOrigins: corsOriginChecker,
};
