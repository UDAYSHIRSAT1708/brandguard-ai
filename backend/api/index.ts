import app from '../src/app';
import { connectDB } from '../src/config/db';

export default async function handler(req: any, res: any) {
  try {
    await connectDB();
  } catch (err) {
    // Health check endpoint will inspect the connection status directly
  }
  return app(req, res);
}
