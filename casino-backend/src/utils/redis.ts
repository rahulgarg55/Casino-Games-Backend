// import Redis from 'ioredis';

// const redisClient = new Redis(
//   process.env.REDIS_URL || 'redis://localhost:6379',
// );

// // Generic cache helper functions
// export const getCache = async (key: string) => {
//   try {
//     const data = await redisClient.get(key);
//     return data ? JSON.parse(data) : null;
//   } catch (error) {
//     console.error('Redis get error:', error);
//     return null;
//   }
// };

// export const setCache = async (key: string, value: any, expireTime = 3600) => {
//   try {
//     await redisClient.setex(key, expireTime, JSON.stringify(value));
//   } catch (error) {
//     console.error('Redis set error:', error);
//   }
// };

// export const deleteCache = async (key: string) => {
//   try {
//     await redisClient.del(key);
//   } catch (error) {
//     console.error('Redis delete error:', error);
//   }
// };

// export const clearCache = async (pattern: string) => {
//   try {
//     const keys = await redisClient.keys(pattern);
//     if (keys.length > 0) {
//       await redisClient.del(keys);
//     }
//   } catch (error) {
//     console.error('Redis clear error:', error);
//   }
// };

// export const rateLimiter = (requestsPerHour: number) => {
//   return async (req: any, res: any, next: any) => {
//     const ip = req.ip;
//     const key = `ratelimit:${ip}`;

//     try {
//       const requests = await redisClient.incr(key);

//       if (requests === 1) {
//         await redisClient.expire(key, 3600); // 1 hour
//       }

//       if (requests > requestsPerHour) {
//         return res.status(429).json({
//           success: false,
//           error: 'Too many requests, please try again later',
//         });
//       }

//       next();
//     } catch (error) {
//       console.error('Rate limiter error:', error);
//       next();
//     }
//   };
// };

// export const createRedisStore = (session: any) => {
//   const RedisStore = require('connect-redis').default;
//   return new RedisStore({ client: redisClient });
// };

// export default redisClient;

// // Cache keys
// export const CACHE_KEYS = {
//   PLAYER: (id: string) => `player:${id}`,
//   PLAYER_BALANCE: (id: string) => `player:balance:${id}`,
//   GAMES_LIST: (page: number, limit: number) => `games:list:${page}:${limit}`,
//   GAME_DETAILS: (id: string) => `game:${id}`,
//   NOTIFICATIONS: (page: number) => `notifications:${page}`,
//   PAYMENT_METHODS: (playerId: string) => `payment:methods:${playerId}`,
// };
