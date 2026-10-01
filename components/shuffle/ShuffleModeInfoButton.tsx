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
    body: '役割数を指定し、各役の名前と対象外の人を設定してからシャッフルします。',
  },
  team: {
    title: 'チーム分け',
    body: '指定のチーム数に対象者をランダムに分けます。「チームのバランスをとる」をオンにすると、役割を設定し、当てはまる対象者を選ぶことで、同じ役割の人物は均等にチームが分かれます。（1人物あたり1つの役割にしか所属できません）',
  },
};

export const SHUFFLE_SCREEN_INFO = {
  title: '人物カードシャッフル',
  body: [
    '選んだ対象者を元に、順番や役割分担を決めたり、チーム分けをすることが出来ます。',
    '対象者のグループは一度でも4種のどれか１つのシャッフルを実行すると履歴に保存されます。後ほど参照できます。',
    '※過去のシャッフル結果は参照できません。',
    '※対象者を変更するとシャッフル結果は消えます。',
    '※同じ条件でのシャッフルは何度目かの表記が出ます。',
  ].join('\n\n'),
};

type ShuffleModeInfoButtonProps = {
  mode?: ShuffleMode;
  title?: string;
  body?: string;
  compact?: boolean;
  accessibilityLabel?: string;
};

export function ShuffleModeInfoButton({
  mode,
  title,
  body,
  compact = false,
  accessibilityLabel,
}: ShuffleModeInfoButtonProps) {
  const content = useContentColors();
  const [visible, setVisible] = useState(false);
  const info = mode
    ? SHUFFLE_MODE_INFO[mode]
    : { title: title ?? SHUFFLE_SCREEN_INFO.title, body: body ?? SHUFFLE_SCREEN_INFO.body };

  return (
    <>
      <Pressable
        style={[styles.button, compact ? styles.buttonCompact : null]}
        onPress={() => setVisible(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `${info.title}についての説明`}
      >
        <Ionicons
          name="information-circle-outline"
          size={compact ? 20 : 22}
          color={content.contentTextSecondary}
        />
      </Pressable>
      <Modal
        transparent
        animationType="fade"
        visible={visible}
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
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
  buttonCompact: {
    width: 28,
    height: 28,
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
