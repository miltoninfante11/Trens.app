// ============================================================================
// SHOP PAGE - Página pública de tienda (también accesible vía shop.trens.app)
// ============================================================================

import React from 'react';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import ShopModal from '../components/shop/ShopModal';

export default function ShopPage() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: 'TRENS SHOP' }} />
      <ShopModal
        asPage
        onPageClose={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/');
        }}
      />
    </>
  );
}
