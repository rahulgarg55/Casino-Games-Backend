import { Request, Response } from 'express';
import { PlatformFeeService } from '../services/platformFeeService';
import { verifyAdmin } from '../utils/jwt';
import { logger } from '../utils/logger';

interface CustomRequest extends Request {
  user?: {
    id: string;
    role: number;
  };
}

const platformFeeService = PlatformFeeService.getInstance();

export const getPlatformFeeConfig = async (req: CustomRequest, res: Response) => {
  try {
    const config = platformFeeService.getCurrentFeeConfig();
    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    logger.error('Error getting platform fee config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get platform fee configuration',
    });
  }
};

export const updatePlatformFeeConfig = async (req: CustomRequest, res: Response) => {
  try {
    if (req.user?.role !== 1) { // 1 is ADMIN role
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access',
      });
    }

    const { fee_percentage, is_active, min_fee_amount, max_fee_amount } = req.body;

    const updatedConfig = await platformFeeService.updateFeeConfig({
      fee_percentage,
      is_active,
      min_fee_amount,
      max_fee_amount
    });

    res.json({
      success: true,
      data: updatedConfig
    });
  } catch (error) {
    logger.error('Failed to update platform fee config', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update platform fee configuration'
    });
  }
};

export const calculateFee = async (req: CustomRequest, res: Response) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount'
      });
    }

    const config = platformFeeService.getCurrentFeeConfig();
    if (!config) {
      return res.status(500).json({
        success: false,
        error: 'Platform fee configuration not found'
      });
    }

    const feeAmount = (amount * config.fee_percentage) / 100;
    const netAmount = amount - feeAmount;

    res.json({
      success: true,
      data: {
        original_amount: amount,
        fee_percentage: config.fee_percentage,
        fee_amount: feeAmount,
        net_amount: netAmount
      }
    });
  } catch (error) {
    logger.error('Failed to calculate platform fee', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to calculate platform fee'
    });
  }
}; 