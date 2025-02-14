import { Request, Response } from 'express';
import * as paymentService from '../services/paymentService';

interface CustomRequest extends Request {
  user?: {
    id: string;
    role: number;
  };
}

export const addPaymentMethod = async (req: CustomRequest, res: Response) => {
  try {
    const playerId = req.user!.id;
    const paymentMethod = await paymentService.addPaymentMethod(
      playerId,
      req.body,
    );
    res.status(201).json({
      success: true,
      message: 'Payment method added successfully',
      data: paymentMethod,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to add payment method',
    });
  }
};

export const getPaymentMethods = async (req: CustomRequest, res: Response) => {
  try {
    const playerId = req.user!.id;
    const paymentMethods = await paymentService.getPaymentMethods(playerId);
    res.status(200).json({
      success: true,
      message: 'Payment methods retrieved successfully',
      data: paymentMethods,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to retrieve payment methods',
    });
  }
};

export const updatePaymentMethod = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const paymentMethod = await paymentService.updatePaymentMethod(
      id,
      req.body,
    );
    res.status(200).json({
      success: true,
      message: 'Payment method updated successfully',
      data: paymentMethod,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to update payment method',
    });
  }
};

export const deletePaymentMethod = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    await paymentService.deletePaymentMethod(id);
    res.status(200).json({
      success: true,
      message: 'Payment method deleted successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to delete payment method',
    });
  }
};
