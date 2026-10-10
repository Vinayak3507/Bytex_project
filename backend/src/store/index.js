import { MemoryStore } from './memory-store.js';
import { SupabaseStore } from './supabase-store.js';

export const createStore = (env = process.env) => {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseStore({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  }
  return new MemoryStore();
};
