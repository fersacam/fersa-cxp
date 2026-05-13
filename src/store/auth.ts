import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { profilesRepo } from '../db/repositories/profiles';
import type { Profile } from '../types/db';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;
  init: () => Promise<() => void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  loading: true,
  initialized: false,

  init: async () => {
    if (get().initialized) return () => {};
    set({ initialized: true });

    const { data } = await supabase.auth.getSession();
    set({ session: data.session });
    if (data.session) {
      const profile = await profilesRepo.me();
      set({ profile });
    }
    set({ loading: false });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ session });
      if (session) {
        const profile = await profilesRepo.me();
        set({ profile });
      } else {
        set({ profile: null });
      }
    });

    return () => sub.subscription.unsubscribe();
  },

  refreshProfile: async () => {
    const profile = await profilesRepo.me();
    set({ profile });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },
}));
