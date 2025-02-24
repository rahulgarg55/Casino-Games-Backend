import express from 'express';
import bodyParser from 'body-parser';
import helmet from 'helmet';
import cors from 'cors';
import router from './routes';
import { connectDB } from './utils/db';
import validateRequest from './middlewares/validateRequest';
import session from 'express-session';
import errorHandler from './middlewares/errorHandler';
import requestLogger from './middlewares/requestLogger';
import passport from 'passport';
import './utils/passportConfig';
const app = express();
app.use(express.json());
// Security Middlewares
app.use(helmet());
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);
app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(requestLogger);
app.use(passport.initialize());
app.use(passport.session());

connectDB();

app.use('/', router);

app.use(errorHandler);

export default app;
