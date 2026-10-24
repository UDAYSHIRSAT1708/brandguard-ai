import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';

describe('Health and System Endpoints', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('GET /api/health returns 200 with database check details', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body.checks.database.status).toBe('connected');
    expect(res.body.checks.database.readyState).toBe(1);
    expect(res.body).toHaveProperty('environment');
  });

  it('GET /api/unknown-route returns structured 404 error without stack leak', async () => {
    const res = await request(app).get('/api/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Route not found');
  });
});
