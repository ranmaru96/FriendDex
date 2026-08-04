import { MaterialIcons } from '@expo/vector-icons';

type StreakFlameIconProps = {
  color: string;
  size?: number;
};

/** Material Icons local-fire-department（候補1番） */
export function StreakFlameIcon({ color, size = 44 }: StreakFlameIconProps) {
  return <MaterialIcons name="local-fire-department" size={size} color={color} />;
}
