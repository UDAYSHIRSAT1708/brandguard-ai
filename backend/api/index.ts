import app from '../src/app';
import { connectDB } from '../src/config/db';

export default async function handler(req: any, res: any) {
  // Preflight requests do not require database connectivity
  if (req.method !== 'OPTIONS') {
    try {
      await connectDB();
    } catch {
      // Health check and database middleware inspect connection status directly
    }
  }
  return app(req, res);
}
