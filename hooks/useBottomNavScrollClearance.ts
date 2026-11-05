import { getBottomNavScrollClearance } from '@/utils/bottomNavVisibility';
import { useChromePath } from '@/hooks/useChromePath';

export function useBottomNavScrollClearance(): number {
  const { chromePath } = useChromePath();
  return getBottomNavScrollClearance(chromePath);
}
