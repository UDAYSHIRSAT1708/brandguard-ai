import app from './app';
import { env } from './config/env';
import { connectDB, disconnectDB } from './config/db';

async function startServer() {
  try {
    console.log('🚀 Starting BrandGuard AI Application Backend...');
    await connectDB();

    // Seeding is decoupled, strictly gated behind ALLOW_AUTO_SEED, and prohibited in production
    const { User } = await import('./models/User');
    const userCount = await User.countDocuments();
    if (userCount === 0 && env.ALLOW_AUTO_SEED) {
      if (env.NODE_ENV === 'production') {
        console.warn('⚠️ ALLOW_AUTO_SEED is enabled, but auto-seeding is strictly prohibited in production mode. Database remains unseeded.');
      } else {
        console.log('🌱 ALLOW_AUTO_SEED enabled (dev): Initializing baseline demo seed...');
        const { seedDatabase } = await import('./utils/seed');
        await seedDatabase();
      }
    } else if (userCount === 0) {
      console.log('ℹ️ Database is empty and ready for initialization. Run "npm run bootstrap:admin" to configure your initial administrator account.');
    }

    const server = app.listen(env.PORT, () => {
      console.log(`✅ Backend server listening on http://localhost:${env.PORT}`);
      console.log(`📡 Connected to AI Service at: ${env.AI_SERVICE_URL}`);
      console.log(`🌐 Allowed Frontend Origin: ${env.FRONTEND_URL}`);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectDB();
        console.log('Server and database connections terminated.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (err: any) {
    console.error('Fatal error during backend startup:', err.message);
    process.exit(1);
  }
}

// In local execution (node server.js or ts-node-dev), start the server
// In serverless environments (Vercel / AWS Lambda), do not call app.listen()
if (process.env.VERCEL !== '1' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export default app;
