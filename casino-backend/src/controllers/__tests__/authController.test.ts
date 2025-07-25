import * as authController from '../authController';
import httpMocks from 'node-mocks-http';

describe('authController.login', () => {
  it('should return 400 if username or password is missing', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {},
    });
    const res = httpMocks.createResponse();
    const next = jest.fn();

    await authController.login(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  // Add more tests for success and failure cases as needed
}); 