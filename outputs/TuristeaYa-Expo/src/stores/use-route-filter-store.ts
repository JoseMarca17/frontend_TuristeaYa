import { create } from 'zustand';
import type { PlaceCategory } from '@/types';

export type RouteOrder = 'time' | 'cost' | 'distance';
export type RouteVisibilityFilter = 'all' | 'public' | 'mine';

type RouteFilterState = {
  searchQuery: string;
  categories: PlaceCategory[];
  maxBudget: number | null;
  maxMinutes: number | null;
  maxDistanceKm: number | null;
  order: RouteOrder;
  visibility: RouteVisibilityFilter;
  filterModalOpen: boolean;
  setSearchQuery: (query: string) => void;
  toggleCategory: (category: PlaceCategory) => void;
  setCategories: (categories: PlaceCategory[]) => void;
  setMaxBudget: (budget: number | null) => void;
  setMaxMinutes: (minutes: number | null) => void;
  setMaxDistanceKm: (distance: number | null) => void;
  setOrder: (order: RouteOrder) => void;
  setVisibility: (visibility: RouteVisibilityFilter) => void;
  setFilterModalOpen: (open: boolean) => void;
  applyFilters: (next: {
    categories: PlaceCategory[];
    maxBudget: number | null;
    maxMinutes: number | null;
    maxDistanceKm: number | null;
    order: RouteOrder;
    visibility?: RouteVisibilityFilter;
  }) => void;
  resetFilters: () => void;
};

export const useRouteFilterStore = create<RouteFilterState>((set) => ({
  searchQuery: '',
  categories: [],
  maxBudget: null,
  maxMinutes: null,
  maxDistanceKm: null,
  order: 'time',
  visibility: 'all',
  filterModalOpen: false,
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleCategory: (category) =>
    set((state) => ({
      categories: state.categories.includes(category)
        ? state.categories.filter((item) => item !== category)
        : [...state.categories, category],
    })),
  setCategories: (categories) => set({ categories }),
  setMaxBudget: (maxBudget) => set({ maxBudget }),
  setMaxMinutes: (maxMinutes) => set({ maxMinutes }),
  setMaxDistanceKm: (maxDistanceKm) => set({ maxDistanceKm }),
  setOrder: (order) => set({ order }),
  setVisibility: (visibility) => set({ visibility }),
  setFilterModalOpen: (filterModalOpen) => set({ filterModalOpen }),
  applyFilters: (next) => set((state) => ({ ...state, ...next })),
  resetFilters: () =>
    set({
      searchQuery: '',
      categories: [],
      maxBudget: null,
      maxMinutes: null,
      maxDistanceKm: null,
      order: 'time',
      visibility: 'all',
    }),
}));

export function countActiveRouteFilters(state: Pick<RouteFilterState, 'categories' | 'maxBudget' | 'maxMinutes' | 'maxDistanceKm' | 'visibility'>) {
  let count = 0;
  if (state.categories.length > 0) count += 1;
  if (state.maxBudget != null) count += 1;
  if (state.maxMinutes != null) count += 1;
  if (state.maxDistanceKm != null) count += 1;
  if (state.visibility !== 'all') count += 1;
  return count;
}
