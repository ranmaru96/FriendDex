import { Alert } from 'react-native';
import { getSupabasePublicConfig } from '@/lib/supabase';

export const ONLINE_REQUIRED_TITLE = 'オフラインです';
export const ONLINE_REQUIRED_MESSAGE = 'インターネットに接続してからやり直してください。';

const PROBE_TIMEOUT_MS = 5000;

let lastOnline = true;

export const isNetworkReachable = (): boolean => lastOnline;

export const setNetworkReachable = (next: boolean): void => {
  lastOnline = next;
};

export const alertIfOffline = (): boolean => {
  if (lastOnline) {
    return false;
  }
  Alert.alert(ONLINE_REQUIRED_TITLE, ONLINE_REQUIRED_MESSAGE);
  return true;
};

export const requireOnline = (): boolean => !alertIfOffline();

export async function probeSupabaseReachable(): Promise<boolean> {
  const config = getSupabasePublicConfig();
  if (!config) {
    return true;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url.replace(/\/$/, '')}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
