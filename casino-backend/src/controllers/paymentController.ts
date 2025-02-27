import { Request, Response } from 'express';
import * as paymentService from '../services/paymentService';
import * as stripeService from '../services/stripeService';
import Player from '../models/player';
import {IPlayer} from '../models/player';

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

export const handleStripeWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const payload = req.body;

  if (!sig) {
    return res.status(400).json({ error: 'No Stripe signature found' });
  }
  
  try {
    const result = await stripeService.handleStripeWebhook(payload, sig);
    res.status(200).json(result);
  } catch (error) {
    console.error('Webhook Error:', error.message);
    res.status(400).json({ error: 'Webhook Error' });
  }
};

export const createPaymentIntent = async (req: CustomRequest, res: Response) => {
  const { amount, currency } = req.body;
  const playerId = req.user!.id;

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    if (!player.stripeCustomerId) {
      const customer = await stripeService.createStripeCustomer(player);
      player.stripeCustomerId = customer.id;
      await player.save();
    }

    const paymentIntent = await stripeService.createPaymentIntent(
      amount,
      currency,
      player.stripeCustomerId,
    );

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
};