import { Response } from 'express';

export const sendSuccessResponse = (res: Response, data: any, message: string = 'Success') => {
  res.status(200).json({
    success: true,
    message,
    data,
  });
};

export const sendErrorResponse = (res: Response, statusCode: number, message: string) => {
  res.status(statusCode).json({
    success: false,
    message,
  });
}; 