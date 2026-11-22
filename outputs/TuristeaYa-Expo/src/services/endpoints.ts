export const API_ORIGIN = process.env.EXPO_PUBLIC_API_URL || 'https://backend-turisteaya.onrender.com';
const prefix = '/api/v1';
export const endpoints = {
  login: `${prefix}/auth/login`, register: `${prefix}/auth/register`,
  refresh: `${prefix}/auth/refresh`, logout: `${prefix}/auth/logout`, profile: `${prefix}/me`,
  resource: (name: string) => `${prefix}/${encodeURIComponent(name)}`,
  record: (name: string, id: string) => `${prefix}/${encodeURIComponent(name)}/${encodeURIComponent(id)}`,
  redeem: (id: string) => `${prefix}/promotions/${encodeURIComponent(id)}/redeem`,
  reserve: (id: string) => `${prefix}/experiences/${encodeURIComponent(id)}/reserve`,
  reviewMedia: (id: string) => `${prefix}/media/reviews/${encodeURIComponent(id)}`,
  placeMedia: (id: string) => `${prefix}/media/places/${encodeURIComponent(id)}`,
};
