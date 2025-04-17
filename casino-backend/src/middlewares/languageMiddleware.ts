import { Request, Response, NextFunction } from 'express';
import { server_messages } from '../utils/server_messages';

interface LanguageRequest extends Request {
  language?: keyof typeof server_messages;
}

const languageMiddleware = (
  req: LanguageRequest,
  res: Response,
  next: NextFunction,
): void => {
  const headerLang = req.headers['language'] as keyof typeof server_messages;

  if (headerLang && server_messages[headerLang]) {
    req.language = headerLang;
  } else {
    req.language = 'en';
  }

  next();
};

export default languageMiddleware;
