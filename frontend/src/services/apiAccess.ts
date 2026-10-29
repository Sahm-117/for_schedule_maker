import { supabase } from '../lib/supabase';
import { getSessionToken } from './supabase-api';

// Church app access: the keys other church apps use to call the FOF API (supabase/functions/public-api).
// Full admins only; the database refuses everyone else (api_admin_check).

export type ApiClientRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  createdBy: string | null;
  requests7d: number;
  refused7d: number;
  teenRecords30d: number;
};

export type ApiRequestRow = { path: string; status: number; teenRecords: number; durationMs: number | null; at: string };

const fail = (message: string): never => {
  if (message.includes('SESSION_EXPIRED')) throw new Error('SESSION_EXPIRED');
  if (message.includes('NOT_ALLOWED')) throw new Error('Only full admins can manage church app access.');
  throw new Error(message.replace(/^.*?ERROR:\s*/, '') || 'Something went wrong. Please try again.');
};

export const apiAccessApi = {
  async list(): Promise<ApiClientRow[]> {
    const { data, error } = await supabase.rpc('api_admin_clients', { p_token: getSessionToken() });
    if (error) fail(error.message);
    return (data ?? []) as ApiClientRow[];
  },
  /** Returns the new key. It is shown once and cannot be fetched again. */
  async create(name: string, scopes: string[], notes: string): Promise<{ id: string; key: string }> {
    const { data, error } = await supabase.rpc('api_admin_create_client', { p_token: getSessionToken(), p_name: name, p_scopes: scopes, p_notes: notes });
    if (error) fail(error.message);
    return data as { id: string; key: string };
  },
  async update(id: string, changes: { active?: boolean; scopes?: string[]; name?: string; notes?: string }): Promise<void> {
    const { error } = await supabase.rpc('api_admin_update_client', {
      p_token: getSessionToken(), p_id: id, p_active: changes.active ?? null, p_scopes: changes.scopes ?? null,
      p_name: changes.name ?? null, p_notes: changes.notes ?? null,
    });
    if (error) fail(error.message);
  },
  async activity(id: string): Promise<ApiRequestRow[]> {
    const { data, error } = await supabase.rpc('api_admin_client_activity', { p_token: getSessionToken(), p_id: id, p_limit: 100 });
    if (error) fail(error.message);
    return (data ?? []) as ApiRequestRow[];
  },
};
