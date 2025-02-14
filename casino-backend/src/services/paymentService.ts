import PaymentMethod from '../models/paymentMethod';
import { IPaymentMethod } from '../models/paymentMethod';

export const addPaymentMethod = async (
  playerId: string,
  data: Partial<IPaymentMethod>,
) => {
  const paymentMethod = new PaymentMethod({
    player_id: playerId,
    ...data,
  });
  await paymentMethod.save();
  return paymentMethod;
};

export const getPaymentMethods = async (playerId: string) => {
  const paymentMethods = await PaymentMethod.find({ player_id: playerId });
  return paymentMethods;
};

export const updatePaymentMethod = async (
  paymentMethodId: string,
  data: Partial<IPaymentMethod>,
) => {
  const paymentMethod = await PaymentMethod.findByIdAndUpdate(
    paymentMethodId,
    { $set: data },
    { new: true },
  );
  return paymentMethod;
};

export const deletePaymentMethod = async (paymentMethodId: string) => {
  await PaymentMethod.findByIdAndDelete(paymentMethodId);
  return { message: 'Payment method deleted successfully' };
};
