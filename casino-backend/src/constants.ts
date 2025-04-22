export const STATUS = {
  ACTIVE: 1,
  INACTIVE: 0,
  BANNED: 2,
};

export const VERIFICATION = {
  VERIFIED: 1,
  UNVERIFIED: 0,
};

export const TWO_FA = {
  ENABLED: 1,
  DISABLED: 0,
};

export const DELETION = {
  DELETED: 1,
  ACTIVE: 0,
};
export const GENDER = {
  MALE: 0,
  FEMALE: 1,
  TRANSGENDER: 2,
};

export const LANGUAGE = {
  ENGLISH: 0,
  SPANISH: 1,
  FRENCH: 2,
};

export const COUNTRY = {
  USA: 0,
  INDIA: 1,
  UK: 2,
};

export const CITY = {
  NEW_YORK: 0,
  MUMBAI: 1,
  LONDON: 2,
};

export enum NotificationType {
  DEPOSIT_MADE = 'DEPOSIT_MADE',
  WITHDRAWAL_REQUESTED = 'WITHDRAWAL_REQUESTED',
  PROMO_MATERIAL_UPDATED = 'PROMO_MATERIAL_UPDATED',
  AFFILIATE_COMMISSION = 'AFFILIATE_COMMISSION',
}
