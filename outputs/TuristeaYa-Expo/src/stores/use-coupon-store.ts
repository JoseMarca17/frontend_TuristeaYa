import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from './storage';

export type RedeemedCoupon = {
  id: string;
  promotionId: string;
  code: string;
  title: string;
  placeName: string;
  discountPercent: number;
  purchaseAmount: number;
  savings: number;
  redeemedAt: string;
  ownerId: string;
  isDemo?: boolean;
};

export type DiscountBreakdown = {
  originalCost: number;
  discountPercent: number;
  discountAmount: number;
  finalCost: number;
};

export function calculateDiscountedCost(originalCost: number, coupon: RedeemedCoupon | null): DiscountBreakdown {
  const safeCost = Number.isFinite(originalCost) && originalCost > 0 ? originalCost : 0;
  if (!coupon || !Number.isFinite(coupon.discountPercent) || coupon.discountPercent <= 0) {
    return { originalCost: safeCost, discountPercent: 0, discountAmount: 0, finalCost: safeCost };
  }
  const pct = Math.min(100, Math.max(0, coupon.discountPercent));
  const discountAmount = Math.round(safeCost * (pct / 100) * 100) / 100;
  const finalCost = Math.max(0, Math.round((safeCost - discountAmount) * 100) / 100);
  return { originalCost: safeCost, discountPercent: pct, discountAmount, finalCost };
}

type CouponStoreState = {
  redemptions: RedeemedCoupon[];
  activeCoupon: RedeemedCoupon | null;
  recordRedemption: (coupon: RedeemedCoupon) => void;
  setActiveCoupon: (coupon: RedeemedCoupon | null) => void;
  clearActiveCoupon: () => void;
};

export const useCouponStore = create<CouponStoreState>()(
  persist(
    (set) => ({
      redemptions: [],
      activeCoupon: null,
      recordRedemption: (coupon) =>
        set((state) => ({
          activeCoupon: coupon,
          redemptions: [
            coupon,
            ...state.redemptions.filter((item) => item.id !== coupon.id),
          ].slice(0, 30),
        })),
      setActiveCoupon: (coupon) => set({ activeCoupon: coupon }),
      clearActiveCoupon: () => set({ activeCoupon: null }),
    }),
    {
      name: 'turisteaya.coupons.v1',
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
