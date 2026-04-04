import { useState, useCallback } from 'react';
import { useApp } from '@/app/context/AppContext';

/**
 * Hook pour pull-to-refresh.
 * Usage: const { refreshing, onRefresh } = useRefresh();
 * <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} />
 */
export function useRefresh() {
  const { refreshData } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  return { refreshing, onRefresh };
}
