import * as jwtUtil from '../jwt';

describe('jwt utility', () => {
  it('should have a signToken function', () => {
    expect(typeof jwtUtil.signToken).toBe('function');
  });

  // Add more specific tests for jwt utility functions as needed
}); 