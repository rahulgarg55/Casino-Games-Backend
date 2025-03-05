import { Request, Response } from 'express';
import stripe from '../utils/stripeConfig';
import Player from '../models/player';
import Transaction from '../models/transaction';
import PaymentMethod from '../models/paymentMethod';
import { IPlayer } from '../models/player';
import { logger } from '../utils/logger';

interface CustomRequest extends Request {
  user?: {
    sub: string;
    id: string;
    role: number;
  };
}

export const createStripeCustomer = async (player: IPlayer) => {
  try {
    const customer = await stripe.customers.create({
      email: player.email,
      name: player.fullname,
      phone: player.phone_number,
      metadata: {
        playerId: player._id.toString(),
      },
    });
    return customer;
  } catch (error) {
    logger.error('Error creating Stripe customer:', error);
    throw new Error(`Failed to create Stripe customer: ${error.message}`);
  }
};

export const addPaymentMethod = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({
          success: false,
          error: 'Authentication required or invalid token',
        });
    }
    const playerId = req.user.id;
    const { method_type, details, is_default } = req.body;

    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    if (!player.stripeCustomerId) {
      const customer = await createStripeCustomer(player);
      player.stripeCustomerId = customer.id;
      await player.save();
    }

    let stripePaymentMethodId: string;

    if (method_type === 'credit_card') {
      if (!details.payment_method_id) {
        return res
          .status(400)
          .json({ message: 'Payment method ID required for credit_card' });
      }
      stripePaymentMethodId = details.payment_method_id;
      await stripe.paymentMethods.attach(stripePaymentMethodId, {
        customer: player.stripeCustomerId,
      });
    } else if (method_type === 'bank_transfer') {
      if (!details.payment_method_id) {
        if (!details.billing_details || !details.billing_details.name) {
          details.billing_details = { name: player.fullname || 'Unknown' };
        }
        const paymentMethod = await stripe.paymentMethods.create({
          type: 'us_bank_account',
          us_bank_account: {
            account_number: details.account_number,
            routing_number: details.routing_number,
            account_holder_type: details.account_holder_type || 'individual',
          },
          billing_details: details.billing_details,
        });
        stripePaymentMethodId = paymentMethod.id;
        await stripe.paymentMethods.attach(stripePaymentMethodId, {
          customer: player.stripeCustomerId,
        });
      } else {
        stripePaymentMethodId = details.payment_method_id;
        await stripe.paymentMethods.attach(stripePaymentMethodId, {
          customer: player.stripeCustomerId,
        });
      }
    } else if (method_type === 'paypal') {
      stripePaymentMethodId = details.paypal_id || `paypal-${Date.now()}`;
    } else {
      return res.status(400).json({ message: 'Unsupported method_type' });
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
        { is_default: false },
      );
    }

    res.status(201).json({
      message: 'Payment method added successfully',
      paymentMethod,
    });
  } catch (error) {
    logger.error('Error adding payment method:', error);
    if (error.type === 'StripeCardError') {
      res.status(400).json({ message: 'Card error', error: error.message });
    } else if (error.type === 'StripeInvalidRequestError') {
      res
        .status(400)
        .json({ message: 'Invalid request', error: error.message });
    } else {
      res
        .status(500)
        .json({
          message: 'Failed to add payment method',
          error: error.message,
        });
    }
  }
};

export const getPaymentMethods = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({
          success: false,
          error: 'Authentication required or invalid token',
        });
    }
    const playerId = req.user.id;
    const { limit = 10, starting_after } = req.query;

    const query = { player_id: playerId };
    if (starting_after) {
      query['_id'] = { $gt: starting_after };
    }

    const paymentMethods = await PaymentMethod.find(query)
      .limit(parseInt(limit as string))
      .sort({ _id: 1 });

    res.status(200).json({ paymentMethods });
  } catch (error) {
    logger.error('Error fetching payment methods:', error);
    res
      .status(500)
      .json({
        message: 'Failed to fetch payment methods',
        error: error.message,
      });
  }
};

export const updatePaymentMethod = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({
          success: false,
          error: 'Authentication required or invalid token',
        });
    }
    const playerId = req.user.id;
    const { id } = req.params;
    const { method_type, details, is_default } = req.body;

    const paymentMethod = await PaymentMethod.findOne({
      _id: id,
      player_id: playerId,
    });
    if (!paymentMethod) {
      return res.status(404).json({ message: 'Payment method not found' });
    }

    const player = await Player.findById(playerId);
    if (!player || !player.stripeCustomerId) {
      return res
        .status(400)
        .json({ message: 'Player or Stripe customer not found' });
    }

    if (paymentMethod.stripe_payment_method_id && details) {
      if (
        method_type === 'credit_card' &&
        paymentMethod.method_type === 'credit_card'
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
    }

    if (method_type) paymentMethod.method_type = method_type;
    if (details) paymentMethod.details = details;
    if (is_default !== undefined) paymentMethod.is_default = is_default;

    await paymentMethod.save();

    if (is_default) {
      await PaymentMethod.updateMany(
        { player_id: playerId, _id: { $ne: paymentMethod._id } },
        { is_default: false },
      );
    }

    res.status(200).json({
      message: 'Payment method updated successfully',
      paymentMethod,
    });
  } catch (error) {
    logger.error('Error updating payment method:', error);
    res
      .status(500)
      .json({
        message: 'Failed to update payment method',
        error: error.message,
      });
  }
};

export const deletePaymentMethod = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({
          success: false,
          error: 'Authentication required or invalid token',
        });
    }
    const playerId = req.user.id;
    const { id } = req.params;

    const paymentMethod = await PaymentMethod.findOneAndDelete({
      _id: id,
      player_id: playerId,
    });
    if (!paymentMethod) {
      return res.status(404).json({ message: 'Payment method not found' });
    }

    if (paymentMethod.stripe_payment_method_id) {
      try {
        await stripe.paymentMethods.detach(
          paymentMethod.stripe_payment_method_id,
        );
      } catch (detachError) {
        logger.warn(
          `Failed to detach Stripe payment method ${paymentMethod.stripe_payment_method_id}:`,
          detachError,
        );
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

    res.status(200).json({ message: 'Payment method deleted successfully' });
  } catch (error) {
    logger.error('Error deleting payment method:', error);
    res
      .status(500)
      .json({
        message: 'Failed to delete payment method',
        error: error.message,
      });
  }
};

export const createPaymentIntent = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({
          success: false,
          error: 'Authentication required or invalid token',
        });
    }
    const playerId = req.user.id;
    const { amount, currency } = req.body;

    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    if (!player.stripeCustomerId) {
      const customer = await createStripeCustomer(player);
      player.stripeCustomerId = customer.id;
      await player.save();
    }

    const amountInCents = Math.round(parseFloat(amount) * 100);
    const idempotencyKey = `pi-${playerId}-${Date.now()}`;

    const description = `Top-up for player ${player.fullname} (ID: ${player._id})`;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: currency.toLowerCase(),
        customer: player.stripeCustomerId,
        automatic_payment_methods: { enabled: true },
        metadata: { playerId: player._id.toString(), transactionType: 'topup' },
        description: description,
      },
      {
        idempotencyKey,
      },
    );

    const transaction = new Transaction({
      player_id: playerId,
      amount: amount,
      currency: currency,
      transaction_type: 'topup',
      payment_method: 'stripe',
      status: 'pending',
      payment_intent_id: paymentIntent.id,
    });
    await transaction.save();

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      transactionId: transaction._id,
    });
  } catch (error) {
    logger.error('Error creating payment intent:', error);
    res
      .status(500)
      .json({
        message: 'Failed to create payment intent',
        error: error.message,
      });
  }
};

export const handleStripeWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];

  try {
    logger.info('Webhook received:', {
      signature: sig,
      rawBody: req.body.toString(),
    });

    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );

    logger.info(`Processing webhook event: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;

      case 'payment_method.attached':
        logger.info(`PaymentMethod attached: ${event.data.object.id}`);
        break;

      case 'payout.paid':
        await handlePayoutSucceeded(event.data.object);
        break;

      case 'payout.failed':
        await handlePayoutFailed(event.data.object);
        break;

      case 'charge.dispute.created':
        await handleDisputeCreated(event.data.object);
        break;

      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook Error:', {
      error: error.message,
      stack: error.stack,
    });

    return res.status(400).json({
      error: `Webhook Error: ${error.message}`,
    });
  }
};

async function handlePaymentIntentSucceeded(paymentIntent) {
  try {
    logger.info(`Payment succeeded: ${paymentIntent.id}`);
    const transaction = await Transaction.findOne({
      payment_intent_id: paymentIntent.id,
    });
    if (!transaction) {
      logger.error(
        `Transaction not found for payment intent: ${paymentIntent.id}`,
      );
      return;
    }

    transaction.status = 'completed';
    transaction.completed_at = new Date();
    await transaction.save();

    if (transaction.transaction_type === 'topup') {
      await updatePlayerBalance(transaction.player_id, transaction.amount);
    }

    logger.info(`Transaction ${transaction._id} completed successfully`);
  } catch (error) {
    logger.error('Error handling payment intent succeeded:', error);
  }
}

async function handlePaymentIntentFailed(paymentIntent) {
  try {
    logger.info(`Payment failed: ${paymentIntent.id}`);
    const transaction = await Transaction.findOne({
      payment_intent_id: paymentIntent.id,
    });
    if (!transaction) {
      logger.error(
        `Transaction not found for payment intent: ${paymentIntent.id}`,
      );
      return;
    }

    transaction.status = 'failed';
    transaction.error =
      paymentIntent.last_payment_error?.message || 'Payment failed';
    await transaction.save();

    logger.info(`Transaction ${transaction._id} marked as failed`);
  } catch (error) {
    logger.error('Error handling payment intent failed:', error);
  }
}

async function handlePayoutSucceeded(payout) {
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
  } catch (error) {
    logger.error('Error handling payout succeeded:', error);
  }
}

async function handlePayoutFailed(payout) {
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

    await updatePlayerBalance(transaction.player_id, transaction.amount);
    logger.info(
      `Transaction ${transaction._id} marked as failed, balance refunded`,
    );
  } catch (error) {
    logger.error('Error handling payout failed:', error);
  }
}

async function handleDisputeCreated(dispute) {
  try {
    logger.info(`Dispute created: ${dispute.id}`);
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
  } catch (error) {
    logger.error('Error handling dispute created:', error);
  }
}

// async function getPlayerBalance(playerId) {
//   try {
//     const player = await Player.findById(playerId);
//     return player?.balance || 0;
//   } catch (error) {
//     logger.error('Error getting player balance:', error);
//     throw error;
//   }
// }

async function updatePlayerBalance(playerId, amount) {
  try {
    const player = await Player.findById(playerId);
    if (!player) {
      throw new Error('Player not found');
    }
    player.balance = (player.balance || 0) + parseFloat(amount);
    await player.save();
    return player.balance;
  } catch (error) {
    logger.error('Error updating player balance:', error);
    throw error;
  }
}

export const getTransactionHistory = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({
          success: false,
          error: 'Authentication required or invalid token',
        });
    }
    const playerId = req.user.id;
    const { limit = 50, starting_after } = req.query;

    const query = { player_id: playerId };
    if (starting_after) {
      query['_id'] = { $gt: starting_after };
    }

    const transactions = await Transaction.find(query)
      .sort({ created_at: -1 })
      .limit(parseInt(limit as string));

    res.status(200).json({
      message: 'Transaction history retrieved successfully',
      transactions,
    });
  } catch (error) {
    logger.error('Error fetching transaction history:', error);
    res
      .status(500)
      .json({
        message: 'Failed to fetch transaction history',
        error: error.message,
      });
  }
};

export const getTransactionDetail = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({
          success: false,
          error: 'Authentication required or invalid token',
        });
    }
    const playerId = req.user.id;
    const { id } = req.params;

    const transaction = await Transaction.findOne({
      _id: id,
      player_id: playerId,
    });
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(
      transaction.payment_intent_id,
      {
        expand: ['customer'],
      },
    );

    res.status(200).json({
      message: 'Transaction retrieved successfully',
      transaction,
      paymentIntent,
    });
  } catch (error) {
    logger.error('Error fetching transaction detail:', error);
    res
      .status(500)
      .json({
        message: 'Failed to fetch transaction detail',
        error: error.message,
      });
  }
};

const TEST_CARDS = {
  pm_card_visa: '4242424242424242',
  pm_card_visa_debit: '4000056655665556',
  pm_card_mastercard: '5555555555554444',
  pm_card_amex: '378282246310005',
};

export const processWithdrawal = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({ success: false, error: 'Authentication required' });
    }

    const playerId = req.user.id;
    const { amount, currency, paymentMethodId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    if (
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test'
    ) {
      if (TEST_CARDS[paymentMethodId]) {
        player.balance = 1000;
        await player.save();
      }
    }

    // Check balance
    if ((player.balance || 0) < parseFloat(amount)) {
      return res.status(400).json({
        message: 'Insufficient balance',
        currentBalance: player.balance,
        requestedAmount: amount,
      });
    }

    // Handle test payment methods
    let paymentMethod;
    if (TEST_CARDS[paymentMethodId]) {
      // Create a temporary payment method object for test cards
      paymentMethod = {
        _id: paymentMethodId,
        method_type: 'credit_card',
        stripe_payment_method_id: paymentMethodId,
        player_id: playerId,
      };
    } else {
      // Find existing payment method
      paymentMethod = await PaymentMethod.findOne({
        _id: paymentMethodId,
        player_id: playerId,
      });

      if (!paymentMethod) {
        return res.status(404).json({ message: 'Payment method not found' });
      }
    }

    // Create transaction record
    const transaction = new Transaction({
      player_id: playerId,
      amount: -Math.abs(parseFloat(amount)),
      currency: currency.toLowerCase(),
      transaction_type: 'withdrawal',
      payment_method: paymentMethod.method_type,
      payment_method_id: paymentMethod._id,
      status: 'pending',
    });
    await transaction.save();

    // Reduce player's balance
    player.balance = (player.balance || 0) - parseFloat(amount);
    await player.save();

    const amountInCents = Math.round(parseFloat(amount) * 100);

    let payoutResponse;

    try {
      if (
        process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV === 'test'
      ) {
        // Simulate successful payout for test cards
        if (TEST_CARDS[paymentMethodId]) {
          payoutResponse = {
            id: `test_po_${Date.now()}`,
            amount: amountInCents,
            currency: currency.toLowerCase(),
            status: 'pending',
          };
        }
      } else {
        // Real payout processing
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

      // Update transaction with payout details
      transaction.payment_intent_id = payoutResponse.id;
      transaction.status = payoutResponse.status;
      await transaction.save();

      res.status(200).json({
        message: 'Withdrawal processed successfully',
        transaction: transaction,
        status: payoutResponse.status,
        payoutId: payoutResponse.id,
      });
    } catch (payoutError) {
      // Rollback the transaction and balance if payout fails
      transaction.status = 'failed';
      transaction.error = payoutError.message;
      await transaction.save();

      player.balance = (player.balance || 0) + Math.abs(parseFloat(amount));
      await player.save();

      throw payoutError;
    }
  } catch (error) {
    logger.error('Error processing withdrawal:', error);
    res.status(500).json({
      message: 'Failed to process withdrawal',
      error: error.message,
    });
  }
};

// Add this helper function to validate test cards
export const validateTestCard = (cardNumber: string): boolean => {
  return Object.values(TEST_CARDS).includes(cardNumber);
};

export const getPlayerBalance = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const playerId = req.user.id;
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ message: "Player not found" });
    }
    res.status(200).json({ balance: player.balance });
  } catch (error) {
    logger.error("Error fetching player balance:", error);
    res.status(500).json({ message: "Failed to fetch balance" });
  }
};
