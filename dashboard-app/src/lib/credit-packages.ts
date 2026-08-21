export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  pricePaise: number;
  priceDisplay: string;
  pricePerMin: string;
  popular?: boolean;
  bonus?: string;
  isFree?: boolean;
}

export const UPI_ID = process.env.UPI_ID || 'yantric@upi';
export const UPI_PAYEE_NAME = process.env.UPI_PAYEE_NAME || 'Yantric AI';
export const CREDITS_PER_MINUTE = 1;

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'free-trial',
    name: 'Free Trial',
    credits: 30,
    pricePaise: 0,
    priceDisplay: '₹0',
    pricePerMin: 'Free',
    bonus: '30 minutes free',
    isFree: true,
  },
  {
    id: 'starter',
    name: 'Starter',
    credits: 300,
    pricePaise: 49900,
    priceDisplay: '₹499',
    pricePerMin: '₹1.66 / min',
    bonus: '≈ 300 minutes',
  },
  {
    id: 'pro',
    name: 'Pro',
    credits: 1000,
    pricePaise: 149900,
    priceDisplay: '₹1,499',
    pricePerMin: '₹1.50 / min',
    popular: true,
    bonus: '≈ 1,000 minutes · Best value',
  },
  {
    id: 'business',
    name: 'Business',
    credits: 4000,
    pricePaise: 499900,
    priceDisplay: '₹4,999',
    pricePerMin: '₹1.25 / min',
    bonus: '≈ 4,000 minutes',
  },
];

export function findPackage(packageId: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find((p) => p.id === packageId);
}
