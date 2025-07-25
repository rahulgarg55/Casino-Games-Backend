import express from 'express';
import request from 'supertest';
import Joi from 'joi';
import { validateBody } from '../validateRequest';

describe('validateBody middleware', () => {
  const app = express();
  app.use(express.json());

  const schema = Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).required(),
  });

  app.post('/test-login', validateBody(schema), (req, res) => {
    res.status(200).json({ success: true });
  });

  it('should return 200 for valid input', async () => {
    const res = await request(app)
      .post('/test-login')
      .send({ username: 'user123', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 400 for invalid input', async () => {
    const res = await request(app)
      .post('/test-login')
      .send({ username: 'u', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
}); 