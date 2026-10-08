type HostTab = 'home' | 'calendar' | 'episode' | 'tools' | 'tasks';

/** エピソード詳細を開いたタブ。戻ると下部タブの選択を、開いた場所に揃える。 */
let hostTab: HostTab | null = null;

/** 下部タブをタップして別タブの画面へ移るとき、移動先タブ。 */
let pendingSwitchTab: HostTab | null = null;

export function isEpisodeDetailPath(pathname: string): boolean {
  return pathname.includes('episode-detail');
}

export function getEpisodeDetailHostTab(): HostTab | null {
  return hostTab;
}

export function setEpisodeDetailHostTab(tab: HostTab | null): void {
  hostTab = tab;
}

export function markEpisodeDetailTabSwitch(tab: HostTab): void {
  pendingSwitchTab = tab;
}

export function consumeEpisodeDetailTabSwitch(): HostTab | null {
  const tab = pendingSwitchTab;
  pendingSwitchTab = null;
  return tab;
}

export function clearEpisodeDetailTabSwitch(): void {
  pendingSwitchTab = null;
}
