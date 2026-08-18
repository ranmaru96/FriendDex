import { useCallback, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getQrScannedFriends, initializeDatabase } from '../db';
import { Friend } from '../types';
import { formatScannedAtLabel } from '@/utils/qrScanHelpers';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { OffsetCard } from '@/components/ui/OffsetCard';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { ScreenTopBar } from '@/components/screen/ScreenTopBar';

export default function FollowsScreen() {
  const kit = useUiKit();
  const content = useContentColors();
  const isCodex = usesOffsetChrome(useAppThemeOptional()?.patternId);
  const listPaddingHorizontal = kit.listScreenPaddingHorizontal;
  const borderRadius = kit.friendsScreenBorderRadius;
  const router = useRouter();
  const [qrFriends, setQrFriends] = useState<Friend[]>([]);

  const loadQrFriends = useCallback(() => {
    initializeDatabase();
    setQrFriends(getQrScannedFriends());
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadQrFriends();
    }, [loadQrFriends])
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
      <ScreenTopBar title="フォロー" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: listPaddingHorizontal, paddingBottom: 80 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {qrFriends.length === 0 ? (
          <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>
            QRコードを読み取って追加した人がここに表示されます。
          </Text>
        ) : (
          qrFriends.map((friend) => {
            const row = (
            <Pressable
              style={[
                styles.friendRow,
                isCodex
                  ? null
                  : [contentSurfaceStyle(content), { borderRadius, borderWidth: 1 }],
              ]}
              onPress={() => router.push({ pathname: '/detail', params: { id: friend.id } })}
            >
              <View style={styles.friendMain}>
                <Text style={[styles.friendName, contentTextStyle(content)]}>
                  {friend.name || '-'}
                </Text>
                {friend.nickname.trim() ? (
                  <Text style={[styles.friendNickname, contentMutedTextStyle(content)]}>
                    {friend.nickname}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.friendDate, contentMutedTextStyle(content)]}>
                {formatScannedAtLabel(friend.scannedAt)}
              </Text>
            </Pressable>
            );
            return isCodex ? <OffsetCard key={friend.id}>{row}</OffsetCard> : <View key={friend.id}>{row}</View>;
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 12,
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  friendMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  friendName: {
    fontSize: 15,
    fontWeight: '700',
  },
  friendNickname: {
    fontSize: 12,
  },
  friendDate: {
    fontSize: 12,
    flexShrink: 0,
  },
});
