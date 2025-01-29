import express from 'express';
import bodyParser from 'body-parser';
import helmet from 'helmet';
import cors from 'cors';
import router from './routes';
import { connectDB } from './utils/db';
import validateRequest from './middlewares/validateRequest';
import errorHandler from './middlewares/errorHandler';
import requestLogger from './middlewares/requestLogger';

const app = express();

// Security Middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(requestLogger);

connectDB();

app.use('/', router);

app.use(errorHandler);

export default app;