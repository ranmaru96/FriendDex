import { Redirect } from 'expo-router';

/** 旧経路の互換用。マイページへ転送する。 */
export default function FollowsRedirect() {
  return <Redirect href="/mypage" />;
}
