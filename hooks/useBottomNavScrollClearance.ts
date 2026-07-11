import { usePathname } from 'expo-router';
import { getBottomNavScrollClearance } from '@/utils/bottomNavVisibility';

export function useBottomNavScrollClearance(): number {
  const pathname = usePathname();
  return getBottomNavScrollClearance(pathname);
}
