import { Redirect } from 'expo-router';

/** 旧タブ経路の互換用。マイページへ転送する。 */
export default function FriendsRedirect() {
  return <Redirect href="/mypage" />;
}
