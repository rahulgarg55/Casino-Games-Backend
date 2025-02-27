import stripe from '../utils/stripeConfig';
import { Stripe } from 'stripe';
import Player from '../models/player';
import { IPlayer } from '../models/player';

export const createStripeCustomer = async (player: IPlayer) => {
  const customer = await stripe.customers.create({
    email: player.email,
    name: player.fullname,
    phone: player.phone_number,
    metadata: {
      playerId: player._id.toString(),
    },
  });

  return customer;
};

export const createPaymentIntent = async (amount: number, currency: string, customerId: string) => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
    customer: customerId,
    automatic_payment_methods: {
      enabled: true,
    },
  });

  return paymentIntent;
};
export const handleStripeWebhook = async (payload: Buffer | string, sig: string): Promise<{ received: boolean }> => {
    try {
      const event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET!) as Stripe.Event;
      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          console.log('Payment succeeded:', paymentIntent.id);
          // Add business logic (e.g., update database)
          break;
        case 'payment_intent.payment_failed':
          const failedPaymentIntent = event.data.object as Stripe.PaymentIntent;
          console.log('Payment failed:', failedPaymentIntent.id);
          // Add failure handling logic
          break;
        default:
          console.log(`Unhandled event type ${event.type}`);
      }
      return { received: true };
    } catch (error) {
      console.error('Webhook Error:', error.message);
      throw error;
    }
  };