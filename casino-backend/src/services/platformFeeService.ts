import PlatformFee, { IPlatformFee } from '../models/platformFee';
import Transaction from '../models/transaction';
import Player from '../models/player';
import { logger } from '../utils/logger';

export class PlatformFeeService {
  private static instance: PlatformFeeService;
  private currentFeeConfig: IPlatformFee | null = null;

  private constructor() {}

  public static getInstance(): PlatformFeeService {
    if (!PlatformFeeService.instance) {
      PlatformFeeService.instance = new PlatformFeeService();
    }
    return PlatformFeeService.instance;
  }

  public async initialize() {
    try {
      // Get or create default fee configuration
      this.currentFeeConfig = await PlatformFee.findOne({ is_active: true });
      
      if (!this.currentFeeConfig) {
        this.currentFeeConfig = await PlatformFee.create({
          fee_percentage: 2,
          is_active: true,
          min_fee_amount: 0,
          max_fee_amount: 1000
        });
      }
      
      logger.info('Platform fee service initialized', { 
        fee_percentage: this.currentFeeConfig.fee_percentage 
      });
    } catch (error) {
      logger.error('Failed to initialize platform fee service', { error });
      throw error;
    }
  }

  public async calculateAndDeductFee(playerId: string, winningAmount: number): Promise<{
    netAmount: number;
    feeAmount: number;
  }> {
    try {
      if (!this.currentFeeConfig) {
        await this.initialize();
      }

      if (!this.currentFeeConfig?.is_active) {
        return { netAmount: winningAmount, feeAmount: 0 };
      }

      // Calculate fee amount
      let feeAmount = (winningAmount * this.currentFeeConfig!.fee_percentage) / 100;
      
      // Apply min/max constraints
      feeAmount = Math.max(this.currentFeeConfig!.min_fee_amount, 
                          Math.min(this.currentFeeConfig!.max_fee_amount, feeAmount));
      
      const netAmount = winningAmount - feeAmount;

      // Create fee transaction record
      await Transaction.create({
        player_id: playerId,
        amount: -feeAmount, // Negative amount as it's a deduction
        type: 'platform_fee',
        status: 'completed',
        description: `Platform fee (${this.currentFeeConfig!.fee_percentage}%)`,
        metadata: {
          original_amount: winningAmount,
          fee_percentage: this.currentFeeConfig!.fee_percentage,
          fee_amount: feeAmount
        }
      });

      // Update player's balance
      await Player.findByIdAndUpdate(playerId, {
        $inc: { balance: -feeAmount }
      });

      logger.info('Platform fee deducted', {
        playerId,
        winningAmount,
        feeAmount,
        netAmount
      });

      return { netAmount, feeAmount };
    } catch (error) {
      logger.error('Failed to calculate and deduct platform fee', {
        playerId,
        winningAmount,
        error
      });
      throw error;
    }
  }

  public async updateFeeConfig(config: Partial<IPlatformFee>) {
    try {
      const updatedConfig = await PlatformFee.findOneAndUpdate(
        { is_active: true },
        { 
          ...config,
          updated_at: new Date()
        },
        { new: true }
      );

      if (updatedConfig) {
        this.currentFeeConfig = updatedConfig;
        logger.info('Platform fee configuration updated', { config: updatedConfig });
      }

      return updatedConfig;
    } catch (error) {
      logger.error('Failed to update platform fee configuration', { error });
      throw error;
    }
  }

  public getCurrentFeeConfig(): IPlatformFee | null {
    return this.currentFeeConfig;
  }
} 