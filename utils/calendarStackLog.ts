import { store } from 'expo-router/build/global-state/store';

type NavState = {
  index?: number;
  routes?: NavRoute[];
};

type NavRoute = {
  name: string;
  state?: NavState;
};

/** 一時ログ用。(calendar) Stack の index と route 名。まだ無いときは null。 */
export function readCalendarStackLog(): { index: number | null; routes: string[] | null } {
  const root = store.navigationRef.current?.getRootState() as NavState | undefined;
  const app = root?.routes?.find((route) => route.name === '__root')?.state ?? root;
  const tabs = app?.routes?.find((route) => route.name === '(tabs)')?.state;
  const calendar = tabs?.routes?.find((route) => route.name === '(calendar)');
  const routes = calendar?.state?.routes;
  if (!routes) {
    return { index: null, routes: null };
  }
  return {
    index: calendar?.state?.index ?? 0,
    routes: routes.map((route) => route.name),
  };
}
