import app from './app/app';
import { config } from './app/app.config';

app.listen(config.port, () => {
  console.log(`🚀 GetOrderStack Restaurant API running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
});
