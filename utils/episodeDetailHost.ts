type HostTab = 'home' | 'calendar' | 'episode' | 'tools' | 'tasks';

/**
 * 今の画面を載せているタブ。
 * 別タブの詳細を開いても、下部タブのタップ以外ではここを変えない。
 */
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
