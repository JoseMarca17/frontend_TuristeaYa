import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { listRecords, profile as fetchProfile } from '@/services/catalog';
import { findDemoAccount, type DemoAccount, type DemoRoleKey } from '@/services/demo-accounts';
import { auth, session as sessionService, type Session } from '@/services/session';
import { safeStorage } from './storage';

export type EffectiveRole = 'guest' | 'tourist' | 'vip' | 'advertiser' | 'support' | 'admin';

export type ProfileSummary = {
  id: string;
  full_name: string;
  phone?: string | null;
};

type AuthState = {
  session: Session | null;
  backendRole: 'guest' | 'tourist' | 'advertiser' | 'support' | 'admin';
  hasActiveVip: boolean;
  profile: ProfileSummary | null;
  demoRole: DemoRoleKey | null;
  demoAccount: DemoAccount | null;
  metaLoading: boolean;
  metaError: string;
  syncFromSession: (next: Session | null) => Promise<void>;
  refreshMeta: () => Promise<void>;
  loginReal: (email: string, password: string) => Promise<void>;
  registerReal: (fullName: string, email: string, password: string, acceptTerms: boolean) => Promise<string>;
  loginDemoOnRender: (roleKey: DemoRoleKey) => Promise<{ ok: boolean; message: string; canFallbackToDemoPreview?: boolean }>;
  enterDemoPreview: (roleKey: DemoRoleKey) => void;
  logout: () => Promise<void>;
};

let syncGeneration = 0;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: sessionService.get(),
      backendRole: sessionService.get() ? 'tourist' : 'guest',
      hasActiveVip: false,
      profile: null,
      demoRole: null,
      demoAccount: null,
      metaLoading: false,
      metaError: '',

      syncFromSession: async (next) => {
        const version = ++syncGeneration;
        if (!next) {
          set((state) => {
            const account = state.demoRole ? findDemoAccount(state.demoRole) : state.demoAccount;
            return {
              session: null,
              backendRole: 'guest',
              hasActiveVip: state.demoRole === 'vip',
              demoAccount: account,
              profile: account
                ? { id: `demo-${account.key}`, full_name: account.fullName, phone: '70000000' }
                : null,
              metaLoading: false,
              metaError: '',
            };
          });
          return;
        }

        set({ session: next, demoRole: null, demoAccount: null, metaLoading: true, metaError: '' });
        try {
          const [meRes, accessRes, subsRes] = await Promise.allSettled([
            fetchProfile(),
            listRecords('user-access', { private: true, filters: { user_id: next.user.id } }),
            listRecords('subscriptions', { private: true, filters: { user_id: next.user.id } }),
          ]);
          if (version !== syncGeneration) return;

          const prof = meRes.status === 'fulfilled'
            ? { id: meRes.value.id, full_name: meRes.value.full_name, phone: meRes.value.phone }
            : null;

          let backendRole: AuthState['backendRole'] = 'tourist';
          if (accessRes.status === 'fulfilled') {
            const activeAccess = accessRes.value.find((row) => row.user_id === next.user.id && row.status === 'active');
            const r = String(activeAccess?.role || 'tourist');
            if (r === 'admin' || r === 'support' || r === 'advertiser' || r === 'tourist') {
              backendRole = r;
            }
          }

          let hasActiveVip = false;
          if (subsRes.status === 'fulfilled') {
            const now = Date.now();
            hasActiveVip = subsRes.value.some(
              (row) => row.user_id === next.user.id
                && row.status === 'active'
                && Date.parse(String(row.starts_at)) <= now
                && Date.parse(String(row.ends_at)) > now,
            );
          }

          set({ profile: prof, backendRole, hasActiveVip, metaLoading: false, metaError: '' });
        } catch (error) {
          if (version !== syncGeneration) return;
          set({
            metaLoading: false,
            metaError: error instanceof Error ? error.message : 'No se pudo cargar tu perfil.',
          });
        }
      },

      refreshMeta: async () => {
        const current = sessionService.get();
        await get().syncFromSession(current);
      },

      loginReal: async (email, password) => {
        set({ demoRole: null, demoAccount: null });
        await auth.login(email, password);
        await get().syncFromSession(sessionService.get());
      },

      registerReal: async (fullName, email, password, acceptTerms) => {
        set({ demoRole: null, demoAccount: null });
        const notice = await auth.register(fullName, email, password, acceptTerms);
        if (!notice) await get().syncFromSession(sessionService.get());
        return notice;
      },

      loginDemoOnRender: async (roleKey) => {
        const account = findDemoAccount(roleKey);
        set({ demoRole: null, demoAccount: null });
        try {
          await auth.login(account.email, account.password);
          await get().syncFromSession(sessionService.get());
          return { ok: true, message: `Sesión real iniciada en Render con ${account.email}.` };
        } catch (loginError) {
          if (account.canAutoRegisterOnRender) {
            try {
              const notice = await auth.register(account.fullName, account.email, account.password, true);
              if (!notice) {
                await get().syncFromSession(sessionService.get());
                return { ok: true, message: `Cuenta demo real creada y conectada en Render (${account.email}).` };
              }
              return { ok: false, message: notice, canFallbackToDemoPreview: true };
            } catch (regError) {
              return {
                ok: false,
                message: regError instanceof Error ? regError.message : 'No se pudo iniciar la cuenta demo en Render.',
                canFallbackToDemoPreview: true,
              };
            }
          }
          const msg = loginError instanceof Error ? loginError.message : 'No existe la cuenta demo en Render.';
          return {
            ok: false,
            message: `${msg} Esta cuenta requiere rol "${account.backendRole}" asignado en Render/Supabase, o puedes entrar en Modo Demo local.`,
            canFallbackToDemoPreview: true,
          };
        }
      },

      enterDemoPreview: (roleKey) => {
        const account = findDemoAccount(roleKey);
        sessionService.set(null);
        set({
          session: null,
          backendRole: 'guest',
          hasActiveVip: roleKey === 'vip',
          demoRole: roleKey,
          demoAccount: account,
          profile: { id: `demo-${account.key}`, full_name: account.fullName, phone: '70000000' },
          metaLoading: false,
          metaError: '',
        });
      },

      logout: async () => {
        set({ demoRole: null, demoAccount: null, profile: null, backendRole: 'guest', hasActiveVip: false });
        await auth.logout();
      },
    }),
    {
      name: 'turisteaya.auth.demo.v1',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ demoRole: state.demoRole }),
      onRehydrateStorage: () => (state) => {
        if (state && !state.session && state.demoRole) {
          const account = findDemoAccount(state.demoRole);
          useAuthStore.setState({
            demoAccount: account,
            hasActiveVip: state.demoRole === 'vip',
            profile: { id: `demo-${account.key}`, full_name: account.fullName, phone: '70000000' },
          });
        }
      },
    },
  ),
);

export function selectEffectiveRole(state: AuthState): EffectiveRole {
  if (state.demoRole) return state.demoRole;
  if (!state.session) return 'guest';
  if (state.backendRole === 'tourist' && state.hasActiveVip) return 'vip';
  return state.backendRole;
}
