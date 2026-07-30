import { Stack } from 'expo-router';
import { SettlementMockProvider } from '@/contexts/SettlementMockContext';

export default function SettlementLayout() {
  return (
    <SettlementMockProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="[roomId]" />
      </Stack>
    </SettlementMockProvider>
  );
}
