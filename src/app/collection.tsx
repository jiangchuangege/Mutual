import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';

import type { CollectionKind } from '../core/types';
import { CollectionScreen } from '../ui/CollectionScreen';

export default function CollectionRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = (params.kind ?? 'wishlist') as CollectionKind;
  return (
    <CollectionScreen
      kind={kind}
      onBack={() => router.back()}
      onListen={() => router.push('/listen')}
    />
  );
}