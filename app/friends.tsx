import { Redirect } from 'expo-router';

/** 旧タブ経路の互換用。フォロー一覧へ転送する。 */
export default function FriendsRedirect() {
  return <Redirect href="/follows" />;
}
