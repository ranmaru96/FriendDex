import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { useContentColors } from '@/utils/useContentColors';

export function DetailTabAddButton({
  isOpen,
  onPress,
  addLabel,
}: {
  isOpen: boolean;
  onPress: () => void;
  addLabel: string;
}) {
  const content = useContentColors();
  const { shape, patternId } = useAppTheme();
  const offset = usesOffsetChrome(patternId);
  const size = 26;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={isOpen ? '閉じる' : addLabel}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: offset ? shape.innerRadius : 8,
          borderWidth: offset ? Math.min(shape.cardBorderWidth, 1) : 0.5,
          borderColor: content.contentBorder,
          backgroundColor: content.contentInputBg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name={isOpen ? 'close' : 'add'} size={16} color={content.contentText} />
    </Pressable>
  );
}
