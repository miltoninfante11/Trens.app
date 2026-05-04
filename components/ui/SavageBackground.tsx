// ============================================================================
// SAVAGE BACKGROUND
// Ambient backdrop used across high-impact screens (Landing / ADN).
// Combines animated GlowOrbs + Fire ember FloatingParticles + radial gradient.
// Drop it inside any flex-1 root, before main content, with `pointer-events-none`.
// ============================================================================

import React from 'react';
import { View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlowOrb } from './GlowOrb';
import { FloatingParticles } from './FloatingParticles';

export interface SavageBackgroundProps {
  /**
   * Visual variant for the ambient layout.
   * - `hero`: dramatic — three big orbs + 18 particles. Default for landing-like sections.
   * - `screen`: balanced — two medium orbs + 10 particles. Ideal for full screens (ADN).
   * - `subtle`: minimal — one small orb + 6 particles. Use behind dense content.
   */
  variant?: 'hero' | 'screen' | 'subtle';
  /** Disable the floating fire embers (still keeps orbs + gradient). */
  disableParticles?: boolean;
  /** Disable the radial gradient overlay. */
  disableGradient?: boolean;
  /** Style override for the absolute-positioned wrapper. */
  style?: ViewStyle;
}

/**
 * Premium ambient backdrop matching the TRENS landing aesthetic.
 *
 * Usage:
 * ```tsx
 * <View className="flex-1 bg-black">
 *   <SavageBackground variant="screen" />
 *   <ScrollView>...</ScrollView>
 * </View>
 * ```
 */
export const SavageBackground: React.FC<SavageBackgroundProps> = ({
  variant = 'screen',
  disableParticles = false,
  disableGradient = false,
  style,
}) => {
  const config = getVariantConfig(variant);

  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          backgroundColor: '#000000',
        },
        style,
      ]}
    >
      {/* Base radial darkness */}
      {!disableGradient && (
        <LinearGradient
          colors={['#1a0505', '#0a0000', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}

      {/* Ambient glow orbs */}
      {config.orbs.map((orb, i) => (
        <GlowOrb
          key={`orb-${i}`}
          color={orb.color}
          size={orb.size}
          top={orb.top}
          left={orb.left}
          delay={orb.delay}
          intensity={orb.intensity}
        />
      ))}

      {/* Top fire glow band */}
      {!disableGradient && (
        <LinearGradient
          colors={['rgba(220, 38, 38, 0.18)', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 220 }}
        />
      )}

      {/* Bottom fade to pure black */}
      {!disableGradient && (
        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.9)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 200 }}
        />
      )}

      {/* Floating fire embers */}
      {!disableParticles && <FloatingParticles count={config.particles} color="#F97316" />}
    </View>
  );
};

// ----------------------------------------------------------------------------
// Variant presets
// ----------------------------------------------------------------------------

type OrbConfig = {
  color: string;
  size: number;
  top: string;
  left: string;
  delay: number;
  intensity: 'low' | 'medium' | 'high';
};

interface VariantConfig {
  orbs: OrbConfig[];
  particles: number;
}

function getVariantConfig(variant: 'hero' | 'screen' | 'subtle'): VariantConfig {
  switch (variant) {
    case 'hero':
      return {
        particles: 18,
        orbs: [
          { color: '#DC2626', size: 600, top: '10%', left: '30%', delay: 0, intensity: 'high' },
          {
            color: '#F97316',
            size: 400,
            top: '60%',
            left: '70%',
            delay: 1000,
            intensity: 'medium',
          },
          {
            color: '#B91C1C',
            size: 320,
            top: '85%',
            left: '20%',
            delay: 2000,
            intensity: 'medium',
          },
        ],
      };
    case 'subtle':
      return {
        particles: 6,
        orbs: [
          { color: '#DC2626', size: 320, top: '15%', left: '50%', delay: 0, intensity: 'low' },
        ],
      };
    case 'screen':
    default:
      return {
        particles: 10,
        orbs: [
          { color: '#DC2626', size: 480, top: '12%', left: '25%', delay: 0, intensity: 'medium' },
          {
            color: '#F97316',
            size: 360,
            top: '55%',
            left: '80%',
            delay: 1200,
            intensity: 'medium',
          },
          { color: '#991B1B', size: 280, top: '88%', left: '30%', delay: 2400, intensity: 'low' },
        ],
      };
  }
}

export default SavageBackground;
