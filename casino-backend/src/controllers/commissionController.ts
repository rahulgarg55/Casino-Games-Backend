import { Request, Response } from 'express';
import * as commissionService from '../services/commissionService';
import { sendErrorResponse } from './authController';

interface CustomRequest extends Request {
  user?: {
    sub: string;
    id: string;
    role: number;
  };
}

export const setGlobalCommission = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 1) {
      return sendErrorResponse(res, 403, 'Access denied: Admin role required');
    }

    const { commission } = req.body;

    if (commission === undefined || commission === null) {
      return sendErrorResponse(res, 400, 'Commission percentage is required');
    }

    const commissionRate = parseFloat(commission);
    const tier = await commissionService.setGlobalCommission(commissionRate);

    return res.status(200).json({
      success: true,
      message: 'Global commission rate saved successfully',
      data: {
        commissionRate: tier.commissionRate,
        currency: tier.currency,
      },
    });
  } catch (error) {
    console.error('Error setting global commission:', error);
    return sendErrorResponse(
      res,
      400,
      error instanceof Error ? error.message : 'Failed to set global commission'
    );
  }
};

export const getGlobalCommission = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 1) {
      return sendErrorResponse(res, 403, 'Access denied: Admin role required');
    }

    const tier = await commissionService.getGlobalCommission();

    if (!tier) {
      return sendErrorResponse(res, 404, 'Global commission rate not found');
    }

    return res.status(200).json({
      success: true,
      message: 'Global commission rate retrieved successfully',
      data: {
        commissionRate: tier.commissionRate,
        currency: tier.currency,
      },
    });
  } catch (error) {
    console.error('Error fetching global commission:', error);
    return sendErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to retrieve global commission'
    );
  }
};