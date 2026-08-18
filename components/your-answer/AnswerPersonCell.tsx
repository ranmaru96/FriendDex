import { useMemo } from 'react';
import { Image, Text, useWindowDimensions, View } from 'react-native';
import type { DesignPatternColors } from '@/constants/designPatterns';
import { getScaledHomeCardPhotoCornerRadius } from '@/utils/homeCardPhotoMetrics';
import { ANSWER_AVATAR_SIZE, answerRowStyles as styles } from './answerRowStyles';

type AnswerPersonCellProps = {
  name: string;
  photoUri: string | null;
  colors: DesignPatternColors;
};

export function AnswerPersonCell({ name, photoUri, colors }: AnswerPersonCellProps) {
  const { width: screenWidth } = useWindowDimensions();
  const cornerRadius = useMemo(
    () => getScaledHomeCardPhotoCornerRadius(ANSWER_AVATAR_SIZE, screenWidth, 4),
    [screenWidth]
  );
  const uri = photoUri?.trim() || undefined;
  const initial = (name.trim().charAt(0) || '?').toUpperCase();

  return (
    <View style={styles.person}>
      <View style={[styles.avatar, { borderRadius: cornerRadius }]}>
        {uri ? (
          <Image source={{ uri }} style={styles.avatarImage} resizeMode="cover" />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.avatarInitial, { color: colors.accent }]}>{initial}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.name, { color: colors.cardInk }]} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}
