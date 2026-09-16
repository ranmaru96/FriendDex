import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Theme } from '@/constants/theme';
import type { ShuffleMode } from '@/utils/shuffleSession';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';

export const SHUFFLE_MODE_INFO: Record<ShuffleMode, { title: string; body: string }> = {
  random: {
    title: 'ランダム選択',
    body: '指定した人数を、選んだメンバーからランダムに抽選します。',
  },
  order: {
    title: '並び替え',
    body: '全員をランダムな順番に並べ替えます。',
  },
  role: {
    title: '役割分担',
    body: '役を追加し、人数と「この役にしない人」を設定してからシャッフルします。',
  },
  team: {
    title: 'チーム分け',
    body: 'チーム数を指定してシャッフルします。ランクを使うと、各チームにランクが均等に配分されます。',
  },
};

type ShuffleModeInfoButtonProps = {
  mode: ShuffleMode;
};

export function ShuffleModeInfoButton({ mode }: ShuffleModeInfoButtonProps) {
  const content = useContentColors();
  const [visible, setVisible] = useState(false);
  const info = SHUFFLE_MODE_INFO[mode];

  return (
    <>
      <Pressable
        style={styles.button}
        onPress={() => setVisible(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${info.title}についての説明`}
      >
        <Ionicons name="information-circle-outline" size={22} color={content.contentTextSecondary} />
      </Pressable>
      <Modal
        transparent
        animationType="fade"
        visible={visible}
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setVisible(false)}
            accessibilityLabel="閉じる"
          />
          <View style={[styles.card, contentSurfaceStyle(content)]}>
            <Text style={[styles.title, contentTextStyle(content)]}>{info.title}</Text>
            <Text style={[styles.body, contentMutedTextStyle(content)]}>{info.body}</Text>
            <Pressable
              style={[styles.close, contentInputStyle(content)]}
              onPress={() => setVisible(false)}
            >
              <Text style={[styles.closeText, contentTextStyle(content)]}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlay,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    alignSelf: 'stretch',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
  },
  close: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
