// =============================================================================
// PRO BRAND OVERLAY — Branding overlay for camera, editor, and exported media
// "TRENS" + "trens.app" bottom-center
// =============================================================================

import React from 'react';
import { View, Text } from 'react-native';

interface ProBrandOverlayProps {
  /** Hide guide lines (grid + corners) */
  hideGuides?: boolean;
}

export function ProBrandOverlay({ hideGuides }: ProBrandOverlayProps) {
  return (
    <View className="absolute inset-0" pointerEvents="none">
      {/* TRENS Branding — Bottom Center */}
      <View className="absolute bottom-6 left-0 right-0 items-center z-10">
        <Text
          style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: 32,
            fontWeight: '900',
            fontStyle: 'italic',
            letterSpacing: 6,
            textShadowColor: 'rgba(0,0,0,0.6)',
            textShadowOffset: { width: 0, height: 2 },
            textShadowRadius: 8,
          }}
        >
          TRENS
        </Text>
        <Text
          style={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 3,
            marginTop: 2,
          }}
        >
          trens.app
        </Text>
      </View>

      {/* Guide Lines — Grid of thirds */}
      {!hideGuides && (
        <>
          <View
            className="absolute left-0 right-0"
            style={{ top: '33.3%', height: 1, backgroundColor: 'rgba(255,255,255,0.15)' }}
          />
          <View
            className="absolute left-0 right-0"
            style={{ top: '66.6%', height: 1, backgroundColor: 'rgba(255,255,255,0.15)' }}
          />
          <View
            className="absolute top-0 bottom-0"
            style={{ left: '33.3%', width: 1, backgroundColor: 'rgba(255,255,255,0.15)' }}
          />
          <View
            className="absolute top-0 bottom-0"
            style={{ left: '66.6%', width: 1, backgroundColor: 'rgba(255,255,255,0.15)' }}
          />
          {/* Corner brackets */}
          {[
            { top: 0, left: 0 },
            { top: 0, right: 0 },
            { bottom: 0, left: 0 },
            { bottom: 0, right: 0 },
          ].map((pos, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                ...pos,
                width: 24,
                height: 24,
                borderColor: '#DC2626',
                borderTopWidth: pos.top === 0 ? 3 : 0,
                borderBottomWidth: pos.bottom === 0 ? 3 : 0,
                borderLeftWidth: pos.left === 0 ? 3 : 0,
                borderRightWidth: pos.right === 0 ? 3 : 0,
              }}
            />
          ))}
        </>
      )}
    </View>
  );
}
