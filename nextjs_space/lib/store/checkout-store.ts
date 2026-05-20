'use client';

import { create } from 'zustand';

export interface CheckoutAddress {
  nombre: string;
  telefono: string;
  linea1: string;
  linea2: string;
  ciudad: string;
  estado: string;
  codigoPostal: string;
  pais: string;
  nif: string;
  emailFacturacion: string;
}

export interface CheckoutState {
  step: number;
  address: CheckoutAddress | null;
  shippingMethod: string;
  couponCode: string;
  couponValid: boolean;
  couponDiscount: number;
  paymentMethod: string;
  isProcessing: boolean;
  error: string | null;

  setStep: (step: number) => void;
  setAddress: (address: CheckoutAddress) => void;
  setShippingMethod: (method: string) => void;
  setCouponCode: (code: string) => void;
  setCouponValid: (valid: boolean, discount: number) => void;
  setPaymentMethod: (method: string) => void;
  setIsProcessing: (processing: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const defaultAddress: CheckoutAddress = {
  nombre: '',
  telefono: '',
  linea1: '',
  linea2: '',
  ciudad: '',
  estado: '',
  codigoPostal: '',
  pais: 'España',
  nif: '',
  emailFacturacion: '',
};

export const useCheckoutStore = create<CheckoutState>()((set) => ({
  step: 1,
  address: null,
  shippingMethod: 'standard',
  couponCode: '',
  couponValid: false,
  couponDiscount: 0,
  paymentMethod: 'card',
  isProcessing: false,
  error: null,

  setStep: (step) => set({ step }),
  setAddress: (address) => set({ address }),
  setShippingMethod: (shippingMethod) => set({ shippingMethod }),
  setCouponCode: (couponCode) => set({ couponCode }),
  setCouponValid: (couponValid, couponDiscount) => set({ couponValid, couponDiscount }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setError: (error) => set({ error }),
  reset: () => set({
    step: 1,
    address: null,
    shippingMethod: 'standard',
    couponCode: '',
    couponValid: false,
    couponDiscount: 0,
    paymentMethod: 'card',
    isProcessing: false,
    error: null,
  }),
}));
