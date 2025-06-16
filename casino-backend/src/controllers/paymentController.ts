import { Request, Response } from 'express';
import stripe from '../utils/stripeConfig';
import Player from '../models/player';
import Transaction from '../models/transaction';
import PaymentMethod from '../models/paymentMethod';
import PaymentConfig from '../models/paymentConfig';
import { Affiliate, IAffiliate } from '../models/affiliate';
import Notification, { NotificationType } from '../models/notification';
import { sendErrorResponse } from './authController';
import { IPlayer } from '../models/player';
import { logger } from '../utils/logger';
import Stripe from 'stripe';

interface CustomRequest extends Request {
  user?: {
    sub: string;
    id: string;
    role: number;
  };
}

export const createStripeCustomer = async (
  player: any,
): Promise<Stripe.Customer> => {
  try {
    const customerParams: Stripe.CustomerCreateParams = {
      email: player.email,
      name: player.fullname,
      phone: player.phone_number,
      metadata: {
        playerId: player._id.toString(),
        platform: 'Basta Casino',
      },
    };

    const customer = await stripe.customers.create(customerParams);
    return customer;
  } catch (error: any) {
    logger.error('Stripe Customer Creation Error', {
      error: error.message,
      code: error.code,
      type: error.type,
      playerId: player._id,
    });
    throw new Error(`Stripe Customer Creation Failed: ${error.message}`);
  }
};

async function updatePlayerBalance(
  playerId: string,
  amount: number,
): Promise<number> {
  try {
    const player = await Player.findById(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    const newBalance = (player.balance || 0) + amount;
    if (newBalance < 0) {
      throw new Error('Insufficient balance');
    }

    player.balance = newBalance;
    await player.save();

    logger.info(`Updated balance for player ${playerId}: ${player.balance}`);
    return player.balance;
  } catch (error: any) {
    logger.error('Error updating player balance:', {
      playerId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

export const addPaymentMethod = async (
  req: CustomRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: (req as any).__('AUTHENTICATION_REQUIRED'),
      });
      return;
    }

    const playerId = req.user.id;
    const { method_type, details, is_default = false } = req.body;
    console.log('method_type :>> ', method_type);
    console.log('details :>> ', details);

    if (!method_type || !details) {
      res.status(400).json({
        success: false,
        message: (req as any).__('METHODTYPE_DETAILS_REQUIRED'),
      });
      return;
    }

    const player = await Player.findById(playerId);
    if (!player) {
      res.status(404).json({
        success: false,
        message:  (req as any).__('PLAYER_NOT_FOUND'),
      });
      return;
    }

    if (!player.stripeCustomerId) {
      const customer = await createStripeCustomer(player);
      player.stripeCustomerId = customer.id;
      await player.save();
    }

    let stripePaymentMethodId: string;

    switch (method_type.toLowerCase()) {
      case 'credit_card':
        if (!details.payment_method_id) {
          res.status(400).json({
            success: false,
            message: (req as any).__('PAYMENTID_REQUIRED_CARD'),
          });
          return;
        }

        const attachedMethod = await stripe.paymentMethods.attach(
          details.payment_method_id,
          { customer: player.stripeCustomerId },
        );
        stripePaymentMethodId = attachedMethod.id;
        break;

      case 'bank_transfer':
        if (!details.payment_method_id) {
          if (!details.account_number || !details.routing_number) {
            res.status(400).json({
              success: false,
              message: (req as any).__('ACCOUNT_ROUTING_REQUIRED'),
            });
            return;
          }

          const paymentMethod = await stripe.paymentMethods.create({
            type: 'us_bank_account',
            us_bank_account: {
              account_number: details.account_number,
              routing_number: details.routing_number,
              account_holder_type: details.account_holder_type || 'individual',
            },
            billing_details: details.billing_details || {
              name: player.fullname || 'Unknown',
            },
          });

          stripePaymentMethodId = paymentMethod.id;
        } else {
          stripePaymentMethodId = details.payment_method_id;
        }

        await stripe.paymentMethods.attach(stripePaymentMethodId, {
          customer: player.stripeCustomerId,
        });
        break;

      case 'paypal':
        stripePaymentMethodId = details.paypal_id || `paypal-${Date.now()}`;
        break;

      default:
        res.status(400).json({
          success: false,
          message: (req as any).__('UNSUPPORTED_METHOD'),
        });
        return;
    }

    const paymentMethod = new PaymentMethod({
      player_id: playerId,
      method_type,
      details,
      is_default,
      stripe_payment_method_id: stripePaymentMethodId,
    });

    await paymentMethod.save();

    if (is_default) {
      await PaymentMethod.updateMany(
        { player_id: playerId, _id: { $ne: paymentMethod._id } },
        { $set: { is_default: false } },
      );
    }

    res.status(201).json({
      success: true,
      message:  (req as any).__('PAYMENTMETHOD_ADDED'),
      paymentMethod: {
        id: paymentMethod._id,
        method_type: paymentMethod.method_type,
        is_default: paymentMethod.is_default,
        last4: method_type === 'credit_card' ? details.card?.last4 : undefined,
        brand: method_type === 'credit_card' ? details.card?.brand : undefined,
      },
    });
  } catch (error: any) {
    logger.error('Error adding payment method:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });

    res.status(error.type === 'StripeCardError' ? 400 : 500).json({
      success: false,
      message:
        error.type === 'StripeCardError'
          ? 'Card error'
          : (req as any).__('FAILED_ADD_PAYMENTMETHOD'),
      error: error.message,
    });
  }
};

export const getPaymentMethods = async (
  req: CustomRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: (req as any).__('AUTHENTICATION_REQUIRED'),
      });
      return;
    }

    const playerId = req.user.id;
    const { limit = '10', starting_after } = req.query;

    const parsedLimit = parseInt(limit as string);
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      res.status(400).json({
        success: false,
        error:  (req as any).__('INVALID_LIMIT_PARM'),
      });
      return;
    }

    const query: any = { player_id: playerId };
    if (starting_after) {
      query._id = { $gt: starting_after };
    }

    const paymentMethods = await PaymentMethod.find(query)
      .limit(parsedLimit)
      .sort({ _id: 1 });

    res.status(200).json({
      success: true,
      paymentMethods: paymentMethods.map((method) => ({
        id: method._id,
        method_type: method.method_type,
        is_default: method.is_default,
        created_at: method.created_at,
        last4:
          method.method_type === 'credit_card'
            ? method.details?.card?.last4
            : undefined,
        brand:
          method.method_type === 'credit_card'
            ? method.details?.card?.brand
            : undefined,
      })),
    });
  } catch (error: any) {
    logger.error('Error fetching payment methods:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    res.status(500).json({
      success: false,
      message: (req as any).__('FAILED_FETCH_PAYMENTMETHOD'),
      error: error.message,
    });
  }
};

export const updatePaymentMethod = async (
  req: CustomRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: (req as any).__('AUTHENTICATION_REQUIRED'),
      });
      return;
    }

    const playerId = req.user.id;
    const { id } = req.params;
    const { method_type, details, is_default } = req.body;

    const paymentMethod = await PaymentMethod.findOne({
      _id: id,
      player_id: playerId,
    });
    if (!paymentMethod) {
      res.status(404).json({
        success: false,
        message: (req as any).__('PAYMENT_METHOD_NOT_FOUND'),
      });
      return;
    }

    const player = await Player.findById(playerId);
    if (!player || !player.stripeCustomerId) {
      res.status(400).json({
        success: false,
        message:  (req as any).__('PLAYERS_STRIPE_CUST_NOT_FOUND'),
      });
      return;
    }

    if (
      paymentMethod.stripe_payment_method_id &&
      details &&
      method_type === 'credit_card'
    ) {
      await stripe.paymentMethods.update(
        paymentMethod.stripe_payment_method_id,
        {
          card: {
            exp_month: details.exp_month || paymentMethod.details.exp_month,
            exp_year: details.exp_year || paymentMethod.details.exp_year,
          },
        },
      );
    }

    if (method_type) paymentMethod.method_type = method_type;
    if (details) paymentMethod.details = details;
    if (is_default !== undefined) paymentMethod.is_default = is_default;

    await paymentMethod.save();

    if (is_default) {
      await PaymentMethod.updateMany(
        { player_id: playerId, _id: { $ne: paymentMethod._id } },
        { $set: { is_default: false } },
      );
    }

    res.status(200).json({
      success: true,
      message: (req as any).__('PAYMENTMETHOD_UPDATED'),
      paymentMethod: {
        id: paymentMethod._id,
        method_type: paymentMethod.method_type,
        is_default: paymentMethod.is_default,
      },
    });
  } catch (error: any) {
    logger.error('Error updating payment method:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      paymentMethodId: req.params.id,
    });
    res.status(500).json({
      success: false,
      message: (req as any).__('FAILED_UPDATE_PAYMENTMETHOD'),
      error: error.message,
    });
  }
};

export const deletePaymentMethod = async (
  req: CustomRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: (req as any).__('AUTHENTICATION_REQUIRED'),
      });
      return;
    }

    const playerId = req.user.id;
    const { id } = req.params;

    const paymentMethod = await PaymentMethod.findOneAndDelete({
      _id: id,
      player_id: playerId,
    });
    if (!paymentMethod) {
      res.status(404).json({
        success: false,
        message: (req as any).__('PAYMENT_METHOD_NOT_FOUND'),
      });
      return;
    }

    if (paymentMethod.stripe_payment_method_id) {
      try {
        await stripe.paymentMethods.detach(
          paymentMethod.stripe_payment_method_id,
        );
      } catch (detachError: any) {
        logger.warn('Failed to detach Stripe payment method:', {
          error: detachError.message,
          paymentMethodId: paymentMethod._id,
        });
      }
    }

    if (paymentMethod.is_default) {
      const anotherPaymentMethod = await PaymentMethod.findOne({
        player_id: playerId,
      });
      if (anotherPaymentMethod) {
        anotherPaymentMethod.is_default = true;
        await anotherPaymentMethod.save();
      }
    }

    res.status(200).json({
      success: true,
      message:(req as any).__('PAYMENTMETHOD_DELETED'),
    });
  } catch (error: any) {
    logger.error('Error deleting payment method:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      paymentMethodId: req.params.id,
    });
    res.status(500).json({
      success: false,
      message: (req as any).__('FAILED_DELETE_PAYMENT'),
      error: error.message,
    });
  }
};

export const createPaymentIntent = async (
  req: CustomRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res
        .status(401)
        .json({ success: false,  error: (req as any).__('AUTHENTICATION_REQUIRED') });
      return;
    }

    const playerId = req.user.id;
    const { amount, currency, payment_method_id, description } = req.body;

    if (!amount || !currency) {
      res
        .status(400)
        .json({ success: false, error: (req as any).__('AMOUNT_CURR_REQUIRED') });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res
        .status(400)
        .json({ success: false, error: (req as any).__('AMOUNT_MUST_POS')  });
      return;
    }

    const player = await Player.findById(playerId);
    if (!player) {
      res.status(404).json({ success: false, message: (req as any).__('PLAYER_NOT_FOUND') });
      return;
    }

    // Validate email format with stricter regex
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!player.email || !emailRegex.test(player.email)) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid email format. Please update your email address to a valid format before making a payment.' 
      });
      return;
    }

    if (player.email.includes('+@') || player.email.startsWith('@') || player.email.endsWith('@')) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid email format. Please update your email address to a valid format before making a payment.' 
      });
      return;
    }

    let customerId = player.stripeCustomerId;
    if (!customerId) {
      const customer = await createStripeCustomer(player);
      customerId = customer.id;
      player.stripeCustomerId = customerId;
      await player.save();
    }

    const amountInCents = Math.round(parsedAmount * 100);
    const idempotencyKey = `pi-${playerId}-${Date.now()}`;
    const paymentDescription =
      description || `Topup from ${player.fullname || 'customer'}`;

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountInCents,
      currency: currency.toLowerCase(),
      customer: customerId,
      description: paymentDescription,
      metadata: {
        playerId: player._id.toString(),
        transactionType: 'topup',
        platform: 'Basta Casino',
      },
      automatic_payment_methods: {
        enabled: !payment_method_id,
      },
    };

    if (payment_method_id) {
      paymentIntentParams.payment_method = payment_method_id;
    }

    let stripeAccount = null;
    if (player.stripeConnectedAccountId) {
      stripeAccount = player.stripeConnectedAccountId;
      paymentIntentParams.on_behalf_of = stripeAccount;
      paymentIntentParams.application_fee_amount = Math.round(
        amountInCents * 0.1,
      );
    }

    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentParams,
      {
        idempotencyKey,
        ...(stripeAccount && { stripeAccount }),
      },
    );

    const mapStripeStatusToTransactionStatus = (
      stripeStatus: string,
    ): 'pending' | 'completed' | 'failed' | 'cancelled' | 'disputed' => {
      switch (stripeStatus) {
        case 'requires_payment_method':
        case 'requires_confirmation':
        case 'requires_action':
        case 'requires_capture':
          return 'pending';
        case 'succeeded':
          return 'completed';
        case 'canceled':
          return 'cancelled';
        case 'processing':
        case 'requires_payment_method_update':
          return 'pending';
        default:
          return 'pending';
      }
    };

    const transaction = new Transaction({
      player_id: playerId,
      amount: parsedAmount,
      currency: currency.toLowerCase(),
      transaction_type: 'topup',
      payment_method: 'stripe',
      status: mapStripeStatusToTransactionStatus(paymentIntent.status),
      payment_intent_id: paymentIntent.id,
    });
    await transaction.save();

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      transactionId: transaction._id,
      stripeAccountId: stripeAccount,
      amount: parsedAmount,
      currency: currency.toLowerCase(),
      status: paymentIntent.status,
      requiresAction: paymentIntent.status === 'requires_action',
      nextAction: paymentIntent.next_action
        ? { type: paymentIntent.next_action.type, ...paymentIntent.next_action }
        : null,
    });
  } catch (error: any) {
    logger.error('Error creating payment intent:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      requestBody: req.body,
    });

    const statusCode =
      error.type === 'StripeInvalidRequestError'
        ? 400
        : error.type === 'StripeCardError'
          ? 402
          : 500;

    res.status(statusCode).json({
      success: false,
      message:  (req as any).__('FAILED_PAYMENT_INTENT'),
      error: error.message,
      ...(error.code && { code: error.code }),
      ...(error.type && { type: error.type }),
    });
  }
};

export const handleStripeWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error('Stripe webhook secret not configured');
    res.status(500).json({ error: 'Webhook secret not configured' });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    logger.error('Webhook signature verification failed:', err.message);
    res.status(400).json({ error: `Webhook Error: ${err.message}` });
    return;
  }

  logger.info(`Processing Stripe event: ${event.type}`);

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent,
        );
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(
          event.data.object as Stripe.PaymentIntent,
        );
        break;
      case 'payment_intent.requires_action':
        await handlePaymentIntentRequiresAction(
          event.data.object as Stripe.PaymentIntent,
        );
        break;
      case 'charge.succeeded':
        await handleChargeSucceeded(event.data.object as Stripe.Charge);
        break;
      case 'charge.failed':
        await handleChargeFailed(event.data.object as Stripe.Charge);
        break;
      case 'payment_method.attached':
        logger.info(
          `Payment method attached: ${(event.data.object as Stripe.PaymentMethod).id}`,
        );
        break;
      case 'payout.paid':
        await handlePayoutSucceeded(event.data.object as Stripe.Payout);
        break;
      case 'payout.failed':
        await handlePayoutFailed(event.data.object as Stripe.Payout);
        break;
      case 'charge.dispute.created':
        await handleDisputeCreated(event.data.object as Stripe.Dispute);
        break;
      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    logger.error('Error processing webhook event:', {
      eventType: event.type,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'Failed to process webhook event' });
  }
};

async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  try {
    logger.info(`PaymentIntent succeeded: ${paymentIntent.id}`);

    const transaction = await Transaction.findOne({
      payment_intent_id: paymentIntent.id,
    });
    if (!transaction) {
      logger.error(
        `Transaction not found for PaymentIntent: ${paymentIntent.id}`,
      );
      return;
    }

    const retrievedIntent = await stripe.paymentIntents.retrieve(
      paymentIntent.id,
      {
        expand: ['charges'],
      },
    );

    transaction.status = 'completed';
    transaction.completed_at = new Date();
    transaction.stripe_charge_id = retrievedIntent.latest_charge as string;
    await transaction.save();

    if (transaction.transaction_type === 'topup') {
      await updatePlayerBalance(
        transaction.player_id.toString(),
        transaction.amount,
      );
    } else if (transaction.transaction_type === 'win') {
      const player = await Player.findById(transaction.player_id);
      if (player && player.referredBy) {
        const affiliate = await Affiliate.findById(player.referredBy);
        if (affiliate) {
          // Calculate 2% commission
          const commission = transaction.amount * 0.02;
          transaction.affiliateId = affiliate._id;
          transaction.affiliateCommission = commission;
          await transaction.save();

          affiliate.totalEarnings = (affiliate.totalEarnings || 0) + commission;
          affiliate.pendingEarnings =
            (affiliate.pendingEarnings || 0) + commission;
          await affiliate.save();

          const notification = new Notification({
            type: NotificationType.AFFILIATE_COMMISSION,
            message: `Earned ${commission.toFixed(2)} ${transaction.currency} commission from player ${player.username || 'Anonymous'}'s win`,
            user_id: affiliate._id,
            metadata: {
              playerId: player._id,
              transactionId: transaction._id,
              amount: commission,
              currency: transaction.currency,
            },
          });
          await notification.save();

          logger.info(
            `Affiliate ${affiliate.email} earned ${commission} commission from player ${player._id}`,
          );
        }
      }
    }

    logger.info(`Transaction ${transaction._id} completed successfully`);
  } catch (error: any) {
    logger.error('Error handling payment intent succeeded:', {
      paymentIntentId: paymentIntent.id,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

async function handlePaymentIntentFailed(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  try {
    logger.info(`PaymentIntent failed: ${paymentIntent.id}`);

    const transaction = await Transaction.findOne({
      payment_intent_id: paymentIntent.id,
    });
    if (!transaction) {
      logger.error(
        `Transaction not found for PaymentIntent: ${paymentIntent.id}`,
      );
      return;
    }

    transaction.status = 'failed';
    transaction.error =
      paymentIntent.last_payment_error?.message || 'Payment failed';
    await transaction.save();

    logger.info(`Transaction ${transaction._id} marked as failed`);
  } catch (error: any) {
    logger.error('Error handling payment intent failed:', {
      paymentIntentId: paymentIntent.id,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

async function handlePaymentIntentRequiresAction(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  try {
    logger.info(`PaymentIntent requires action: ${paymentIntent.id}`);

    const transaction = await Transaction.findOne({
      payment_intent_id: paymentIntent.id,
    });
    if (!transaction) {
      logger.error(
        `Transaction not found for PaymentIntent: ${paymentIntent.id}`,
      );
      return;
    }

    transaction.status = 'pending';
    await transaction.save();

    logger.info(`Transaction ${transaction._id} requires customer action`);
  } catch (error: any) {
    logger.error('Error handling payment intent requires action:', {
      paymentIntentId: paymentIntent.id,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

async function handleChargeSucceeded(charge: Stripe.Charge): Promise<void> {
  try {
    logger.info(`Charge succeeded: ${charge.id}`);
  } catch (error: any) {
    logger.error('Error handling charge succeeded:', {
      chargeId: charge.id,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

async function handleChargeFailed(charge: Stripe.Charge): Promise<void> {
  try {
    logger.info(`Charge failed: ${charge.id}`);

    const transaction = await Transaction.findOne({
      stripe_charge_id: charge.id,
    });
    if (transaction) {
      transaction.status = 'failed';
      transaction.error = charge.failure_message || 'Charge failed';
      await transaction.save();
    }
  } catch (error: any) {
    logger.error('Error handling charge failed:', {
      chargeId: charge.id,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

async function handlePayoutSucceeded(payout: Stripe.Payout): Promise<void> {
  try {
    logger.info(`Payout succeeded: ${payout.id}`);

    const transaction = await Transaction.findOne({
      payment_intent_id: payout.id,
    });
    if (!transaction) {
      logger.error(`Transaction not found for payout: ${payout.id}`);
      return;
    }

    transaction.status = 'completed';
    transaction.completed_at = new Date();
    await transaction.save();

    logger.info(
      `Withdrawal transaction ${transaction._id} completed successfully`,
    );
  } catch (error: any) {
    logger.error('Error handling payout succeeded:', {
      payoutId: payout.id,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

async function handlePayoutFailed(payout: Stripe.Payout): Promise<void> {
  try {
    logger.info(`Payout failed: ${payout.id}`);

    const transaction = await Transaction.findOne({
      _id: payout.metadata.transactionId,
    });
    if (!transaction) {
      logger.error(`Transaction not found for payout: ${payout.id}`);
      return;
    }

    transaction.status = 'failed';
    transaction.error = payout.failure_message || 'Payout failed';
    await transaction.save();

    await updatePlayerBalance(
      transaction.player_id.toString(),
      Math.abs(transaction.amount),
    );

    logger.info(`Transaction ${transaction._id} failed, balance refunded`);
  } catch (error: any) {
    logger.error('Error handling payout failed:', {
      payoutId: payout.id,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

async function handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  try {
    logger.info(`Dispute created: ${dispute.id}`);

    if (typeof dispute.payment_intent !== 'string') {
      logger.error(`Invalid payment_intent type for dispute: ${dispute.id}`);
      return;
    }

    const transaction = await Transaction.findOne({
      payment_intent_id: dispute.payment_intent,
    });
    if (!transaction) {
      logger.error(`Transaction not found for dispute: ${dispute.id}`);
      return;
    }

    transaction.status = 'disputed';
    transaction.dispute_id = dispute.id;
    await transaction.save();

    logger.info(`Transaction ${transaction._id} marked as disputed`);
  } catch (error: any) {
    logger.error('Error handling dispute created:', {
      disputeId: dispute.id,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

export const getTransactionHistory = async (
  req: CustomRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: (req as any).__('AUTHENTICATION_REQUIRED'),
      });
      return;
    }

    const playerId = req.user.id;
    const { limit = '50', starting_after } = req.query;

    const parsedLimit = parseInt(limit as string);
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      res.status(400).json({
        success: false,
        error: (req as any).__('INVALID_LIMIT_PARM'),
      });
      return;
    }

    const query: any = { player_id: playerId };
    if (starting_after) {
      query._id = { $gt: starting_after };
    }

    const transactions = await Transaction.find(query)
      .sort({ created_at: -1 })
      .limit(parsedLimit);

    res.status(200).json({
      success: true,
      message:(req as any).__('TRANSACTION_HISTORY_FOUND'),
      transactions: transactions.map((tx) => ({
        id: tx._id,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        transaction_type: tx.transaction_type,
        created_at: tx.created_at,
        completed_at: tx.completed_at,
      })),
    });
  } catch (error: any) {
    logger.error('Error fetching transaction history:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    res.status(500).json({
      success: false,
      message:(req as any).__('FAILED_FETCH_TRANSCATION_HISTORY'),
      error: error.message,
    });
  }
};

export const getTransactionDetail = async (
  req: CustomRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: (req as any).__('AUTHENTICATION_REQUIRED'),
      });
      return;
    }

    const playerId = req.user.id;
    const { id } = req.params;

    const transaction = await Transaction.findOne({
      _id: id,
      player_id: playerId,
    });
    if (!transaction) {
      res.status(404).json({
        success: false,
        message: (req as any).__('TRANSACTION_NOT_FOUND'),
      });
      return;
    }

    let paymentIntent: Stripe.Response<Stripe.PaymentIntent> | undefined;
    if (transaction.payment_intent_id) {
      try {
        paymentIntent = await stripe.paymentIntents.retrieve(
          transaction.payment_intent_id,
          { expand: ['customer'] },
        );
      } catch (error: any) {
        logger.warn('Failed to retrieve payment intent:', {
          paymentIntentId: transaction.payment_intent_id,
          error: error.message,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: (req as any).__('TRANSACTION_FOUND'),
      transaction: {
        id: transaction._id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        transaction_type: transaction.transaction_type,
        created_at: transaction.created_at,
        completed_at: transaction.completed_at,
        error: transaction.error,
      },
      paymentIntent: paymentIntent
        ? {
            id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: paymentIntent.status,
            payment_method: paymentIntent.payment_method,
            customer: paymentIntent.customer,
          }
        : null,
    });
  } catch (error: any) {
    logger.error('Error fetching transaction detail:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      transactionId: req.params.id,
    });
    res.status(500).json({
      success: false,
      message: (req as any).__('FAILED_FETCH_TRANSACTION'),
      error: error.message,
    });
  }
};

export const getPlayerBalance = async (
  req: CustomRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: (req as any).__('AUTHENTICATION_REQUIRED'),
      });
      return;
    }

    const playerId = req.user.id;
    const player = await Player.findById(playerId);
    if (!player) {
      res.status(404).json({
        success: false,
        message: (req as any).__('PLAYER_NOT_FOUND'),
      });
      return;
    }

    res.status(200).json({
      success: true,
      balance: player.balance || 0,
    });
  } catch (error: any) {
    logger.error('Error fetching player balance:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    res.status(500).json({
      success: false,
      message: (req as any).__('FAILED_FETCH_BALANCE'),
      error: error.message,
    });
  }
};

export const getStripeConfig = async (
  req: CustomRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: (req as any).__('AUTHENTICATION_REQUIRED'),
      });
      return;
    }

    const playerId = req.user.id;
    const player = await Player.findById(playerId);
    if (!player) {
      res.status(404).json({
        success: false,
        message:(req as any).__('PLAYER_NOT_FOUND'),
      });
      return;
    }

    if (!process.env.STRIPE_PUBLISHABLE_KEY) {
      throw new Error((req as any).__('STRIPE_CONFIG_MISSING'));
    }

    res.status(200).json({
      success: true,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      stripeAccountId: player.stripeConnectedAccountId || null,
    });
  } catch (error: any) {
    logger.error('Error fetching Stripe config:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    res.status(500).json({
      success: false,
      error: (req as any).__('FAILED_STRIPE_CONFIG'),
      details: error.message,
    });
  }
};

export const processWithdrawal = async (
  req: CustomRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: (req as any).__('AUTHENTICATION_REQUIRED'),
      });
      return;
    }

    const playerId = req.user.id;
    const { amount, currency, paymentMethodId } = req.body;

    if (!amount || !currency || !paymentMethodId) {
      res.status(400).json({
        success: false,
        message: (req as any).__('AMOUNT_CURRENCY_PAYMENT_METHODID_REQUIRED'),
      });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({
        success: false,
        message:  (req as any).__('INVALID_AMOUNT'),
      });
      return;
    }

    const player = await Player.findById(playerId);
    if (!player) {
      res.status(404).json({
        success: false,
        message: (req as any).__('PLAYER_NOT_FOUND'),
      });
      return;
    }

    if ((player.balance || 0) < parsedAmount) {
      res.status(400).json({
        success: false,
        message: (req as any).__('INSUFF_BALANCE'),
        currentBalance: player.balance,
        requestedAmount: parsedAmount,
      });
      return;
    }

    let paymentMethod;
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test'
    ) {
      const TEST_CARDS = {
        pm_card_visa: '4242424242424242',
        pm_card_visa_debit: '4000056655665556',
        pm_card_mastercard: '5555555555554444',
        pm_card_amex: '378282246310005',
      };

      if (TEST_CARDS[paymentMethodId as keyof typeof TEST_CARDS]) {
        paymentMethod = {
          _id: paymentMethodId,
          method_type: 'credit_card',
          stripe_payment_method_id: paymentMethodId,
          player_id: playerId,
        };
        player.balance = 1000;
        await player.save();
      }
    }

    if (!paymentMethod) {
      paymentMethod = await PaymentMethod.findOne({
        _id: paymentMethodId,
        player_id: playerId,
      });

      if (!paymentMethod) {
        res.status(404).json({
          success: false,
          message: (req as any).__('PAYMENT_METHOD_NOT_FOUND'),
        });
        return;
      }
    }

    const transaction = new Transaction({
      player_id: playerId,
      amount: -parsedAmount,
      currency: currency.toLowerCase(),
      transaction_type: 'withdrawal',
      payment_method: paymentMethod.method_type,
      payment_method_id: paymentMethod._id,
      status: 'pending',
    });
    await transaction.save();

    await updatePlayerBalance(playerId, -parsedAmount);

    const amountInCents = Math.round(parsedAmount * 100);
    let payoutResponse;

    try {
      if (
        process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV === 'test'
      ) {
        payoutResponse = {
          id: `test_po_${Date.now()}`,
          amount: amountInCents,
          currency: currency.toLowerCase(),
          status: 'pending',
        };
      } else {
        payoutResponse = await stripe.payouts.create({
          amount: amountInCents,
          currency: currency.toLowerCase(),
          method: 'standard',
          source_type: 'card',
          metadata: {
            playerId: player._id.toString(),
            transactionId: transaction._id.toString(),
          },
        });
      }

      transaction.payment_intent_id = payoutResponse.id;
      transaction.status =
        payoutResponse.status === 'paid' ? 'completed' : 'pending';
      await transaction.save();

      res.status(200).json({
        success: true,
        message: (req as any).__('WITHDRAWAL_PROCESSED'),
        transaction: {
          id: transaction._id,
          amount: transaction.amount,
          status: transaction.status,
        },
        payoutId: payoutResponse.id,
      });
    } catch (payoutError: any) {
      transaction.status = 'failed';
      transaction.error = payoutError.message;
      await transaction.save();

      await updatePlayerBalance(playerId, parsedAmount);

      logger.error('Payout failed:', {
        error: payoutError.message,
        stack: payoutError.stack,
        transactionId: transaction._id,
      });

      throw payoutError;
    }
  } catch (error: any) {
    logger.error('Error processing withdrawal:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    res.status(500).json({
      success: false,
      message: (req as any).__('FAILED_PROCESS_WITHDRAWAL'),
      error: error.message,
    });
  }
};

export const seedPaymentConfigs = async () => {
  const initialConfigs = [
    {
      paymentMethodId: 1,
      name: 'stripe',
      config: {
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
        STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
        STRIPE_TEST_SECRET_KEY: process.env.STRIPE_TEST_SECRET_KEY || '',
        STRIPE_TEST_PUBLISHABLE_KEY:
          process.env.STRIPE_TEST_PUBLISHABLE_KEY || '',
        STRIPE_TEST_WEBHOOK_SECRET:
          process.env.STRIPE_TEST_WEBHOOK_SECRET || '',
      },
      mode: 'test',
      isActive: true,
    },
    {
      paymentMethodId: 2,
      name: 'bastapay',
      config: {
        BASTAPAY_API_KEY: process.env.BASTAPAY_API_KEY || '',
        BASTAPAY_SECRET: process.env.BASTAPAY_SECRET || '',
        BASTAPAY_TEST_API_KEY: process.env.BASTAPAY_TEST_API_KEY || '',
        BASTAPAY_TEST_SECRET: process.env.BASTAPAY_TEST_SECRET || '',
      },
      mode: 'test',
      isActive: false,
    },
  ];

  for (const config of initialConfigs) {
    await PaymentConfig.findOneAndUpdate(
      { paymentMethodId: config.paymentMethodId },
      { $set: config },
      { upsert: true, new: true },
    );
  }
};

export const getPaymentConfigs = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 1) {
      return sendErrorResponse(res, 403, (req as any).__('ADMIN_ACCESS_REQUIRED'));
    }

    const paymentConfigs = await PaymentConfig.find().select('-__v');

    res.status(200).json({
      success: true,
      message: (req as any).__('PAYMENT_CONFIGURATIONS_RETRIEVED_SUCCESSFULLY'),
      data: paymentConfigs.map((config) => ({
        id: config._id,
        paymentMethodId: config.paymentMethodId,
        name: config.name,
        config: config.config,
        mode: config.mode,
        isActive: config.isActive,
      })),
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        : (req as any).__('FAILED_TO_RETRIEVE_PAYMENT_CONFIGURATIONS'),
    );
  }
};

export const getPaymentConfig = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 1) {
      return sendErrorResponse(res, 403, (req as any).__('ADMIN_ACCESS_REQUIRED'));
    }

    const { id } = req.params;
    const paymentConfig = await PaymentConfig.findById(id).select('-__v');

    if (!paymentConfig) {
      return sendErrorResponse(res, 404,  (req as any).__('PAYMENT_CONFIGURATION_NOT_FOUND'));
    }

    res.status(200).json({
      success: true,
      message:  (req as any).__('PAYMENT_CONFIGURATIONS_RETRIEVED_SUCCESSFULLY'),
      data: {
        id: paymentConfig._id,
        paymentMethodId: paymentConfig.paymentMethodId,
        name: paymentConfig.name,
        config: paymentConfig.config,
        mode: paymentConfig.mode,
        isActive: paymentConfig.isActive,
      },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message 
        :(req as any).__('FAILED_TO_RETRIEVE_PAYMENT_CONFIGURATIONS'),
    );
  }
};

export const updatePaymentConfig = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    if (!req.user || req.user.role !== 1) {
      return sendErrorResponse(res, 403, (req as any).__('ADMIN_ACCESS_REQUIRED'));
    }

    const { id } = req.params;
    const { config, mode, isActive } = req.body;

    const paymentConfig = await PaymentConfig.findById(id);
    if (!paymentConfig) {
      return sendErrorResponse(res, 404,  (req as any).__('PAYMENT_CONFIGURATION_NOT_FOUND'));
    }

    if (config) paymentConfig.config = config;
    if (mode && ['test', 'live'].includes(mode)) paymentConfig.mode = mode;
    if (typeof isActive === 'boolean') paymentConfig.isActive = isActive;

    await paymentConfig.save();

    res.status(200).json({
      success: true,
      message:  (req as any).__('PAYMENT_CONFIGURATION_UPDATED_SUCCESSFULLY'),
      data: {
        id: paymentConfig._id,
        paymentMethodId: paymentConfig.paymentMethodId,
        name: paymentConfig.name,
        config: paymentConfig.config,
        mode: paymentConfig.mode,
        isActive: paymentConfig.isActive,
      },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        :  (req as any).__('FAILED_TO_UPDATE_PAYMENT_CONFIGURATION'),
    );
  }
};

export const deletePaymentConfig = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    if (!req.user || req.user.role !== 1) {
       return sendErrorResponse(res, 403, (req as any).__('ADMIN_ACCESS_REQUIRED'));
    }

    const { id } = req.params;
    const paymentConfig = await PaymentConfig.findByIdAndDelete(id);

    if (!paymentConfig) {
      return sendErrorResponse(res, 404,  (req as any).__('PAYMENT_CONFIGURATION_NOT_FOUND'));
    }

    res.status(200).json({
      success: true,
      message: (req as any).__('PAYMENT_CONFIGURATION_DELETED_SUCCESSFULLY'),
      data: { id },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        :  (req as any).__('FAILED_TO_DELETE_PAYMENT_CONFIGURATION'),
    );
  }
};
