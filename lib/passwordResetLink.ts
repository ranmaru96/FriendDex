/**
 * パスワード再設定のディープリンク。
 * トークンはルートに載せない。画面へ渡す前にここに置く。
 */

type ResetLinkParams = {
  code: string;
  accessToken: string;
  refreshToken: string;
  errorMessage: string;
};

const RESET_SEGMENT = 'reset-password';

let pending = false;
let revision = 0;
let queuedUrl: string | null = null;
let lastMarkedUrl: string | null = null;
const listeners = new Set<() => void>();

const emptyParams = (): ResetLinkParams => ({
  code: '',
  accessToken: '',
  refreshToken: '',
  errorMessage: '',
});

const parseLink = (path: string): URL | null => {
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(trimmed, 'frienddex://local');
    } catch {
      return null;
    }
  }
};

const readParamsFromUrl = (url: URL): ResetLinkParams => {
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash);
  const read = (key: string): string =>
    url.searchParams.get(key)?.trim() || hashParams.get(key)?.trim() || '';
  return {
    code: read('code'),
    accessToken: read('access_token'),
    refreshToken: read('refresh_token'),
    errorMessage: read('error_description') || read('error'),
  };
};

export const readResetLinkParams = (path: string): ResetLinkParams => {
  const url = parseLink(path);
  if (!url) {
    return emptyParams();
  }
  return readParamsFromUrl(url);
};

const mentionsReset = (path: string): boolean => {
  const url = parseLink(path);
  if (!url) {
    return path.includes(RESET_SEGMENT);
  }
  if (url.hostname === RESET_SEGMENT || url.pathname.includes(RESET_SEGMENT)) {
    return true;
  }
  const params = readParamsFromUrl(url);
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const type = url.searchParams.get('type') || new URLSearchParams(hash).get('type');
  return type === 'recovery' && Boolean(params.code || params.accessToken || params.errorMessage);
};

export const isPasswordResetLink = (path: string): boolean => mentionsReset(path);

const hasSecret = (params: ResetLinkParams): boolean =>
  Boolean(params.code || params.accessToken || params.refreshToken || params.errorMessage);

const emit = (): void => {
  revision += 1;
  listeners.forEach((listener) => listener());
};

export const markPasswordResetLink = (url: string): void => {
  const params = readResetLinkParams(url);
  const useful = hasSecret(params);
  if (!useful && (queuedUrl || lastMarkedUrl || pending)) {
    if (!pending) {
      pending = true;
      emit();
    }
    return;
  }
  if (url === lastMarkedUrl) {
    if (!pending) {
      pending = true;
      emit();
    }
    return;
  }
  queuedUrl = url;
  lastMarkedUrl = url;
  pending = true;
  emit();
};

export const takeQueuedResetLink = (): string | null => {
  if (!queuedUrl) {
    return null;
  }
  const url = queuedUrl;
  queuedUrl = null;
  return url;
};

export const isPasswordRecoveryPending = (): boolean => pending;

export const getPasswordRecoveryRevision = (): number => revision;

export const subscribePasswordRecovery = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const endPasswordRecovery = (): void => {
  if (!pending && !queuedUrl) {
    return;
  }
  pending = false;
  queuedUrl = null;
  emit();
};
