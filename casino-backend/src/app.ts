import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import router from './routes';
import { connectDB } from './utils/db';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import * as paymentController from './controllers/paymentController';
import passport from 'passport';
import './utils/passportConfig';
import winston, { format } from 'winston';
import expressWinston from 'express-winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import dotenv from 'dotenv';
import path from 'path';
import { I18n } from 'i18n';

const translationPath = path.resolve(process.cwd(), 'src/translation');

const i18n = new I18n({
  locales: ['en', 'mt', 'pt', 'id', 'fil', 'vi', 'ko', 'th'],
  directory: translationPath,
  defaultLocale: 'en',
});

dotenv.config();

const app = express();
app.set('trust proxy', 1);

const logLevel = process.env.NODE_ENV === 'production' ? 'warn' : 'info';
const logger = winston.createLogger({
  level: logLevel,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.colorize(),
    format.printf(
      ({
        timestamp,
        level,
        message,
        meta,
      }: {
        timestamp: string;
        level: string;
        message: string;
        meta?: {
          req: { method: string; url: string };
          res: { statusCode: number };
          responseTime: number;
        };
      }) => {
        if (meta?.req) {
          return `${timestamp} ${level}: ${message} - ${meta.req.method} ${meta.req.url} - Status: ${meta?.res?.statusCode ?? 0} - ${meta.responseTime}ms`;
        }
        return `${timestamp} ${level}: ${message}`;
      },
    ),
  ),
  transports: [
    new winston.transports.Console(),
    new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
    }),
  ],
});

app.use(i18n.init);
app.use(function (req, res, next) {
  i18n.setLocale(req, req.headers['accept-language']);
  next();
});

app.use(
  expressWinston.logger({
    winstonInstance: logger,
    meta: true,
    msg: 'HTTP {{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
    expressFormat: false,
    colorize: true,
  }),
);

app.use((req, res, next) => {
  console.log('Authorization header:', req.headers.authorization);
  next();
});

// Stripe webhook endpoint
app.post(
  '/auth/stripe/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.handleStripeWebhook,
);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://static.sumsub.com', "'unsafe-inline'"],
      frameSrc: ["'self'", 'https://api.sumsub.com'],
      connectSrc: ["'self'", 'https://api.sumsub.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Stripe-Signature', 'x-payload-signature'],
    credentials: true,
  }),
);

app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 24 * 60 * 60,
      autoRemove: 'native',
    }),
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'strict'
    },
  }),
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(passport.initialize());
app.use(passport.session());

const initializeApp = async () => {
  try {
    await connectDB();
    logger.info('Database connected successfully');

    await paymentController.seedPaymentConfigs();
    logger.info('Payment configurations seeded successfully');
  } catch (error) {
    logger.error('Failed to initialize application', { error });
    process.exit(1);
  }
};

initializeApp();
app.use('/', router);

app.use(
  expressWinston.errorLogger({
    winstonInstance: logger,
  }),
);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.log('======err====', err);
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Something went wrong!' });
});

export default app;