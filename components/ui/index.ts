// ============================================================================
// PREMIUM UI COMPONENTS
// Export all premium visual components for TRENS High-Performance Fitness
// Savage Mode: Ed Hardy Fire Aesthetic
// ============================================================================

// Core Premium Components
export { PremiumCard } from './PremiumCard';
export { PremiumButton } from './PremiumButton';
export { PremiumInput } from './PremiumInput';
export { PremiumModal } from './PremiumModal';
export { PremiumHeader } from './PremiumHeader';
export { PremiumBadge } from './PremiumBadge';
export { PremiumAvatar } from './PremiumAvatar';
export { PremiumProgress } from './PremiumProgress';
export { PremiumStatCard } from './PremiumStatCard';
export { PremiumListItem, PremiumListSection } from './PremiumListItem';
export { PremiumLoader, PremiumSkeleton } from './PremiumLoader';

// Visual Effects
export { GlowOrb } from './GlowOrb';
export { SectionHeader } from './SectionHeader';
export { GradientText } from './GradientText';
export { FloatingParticles } from './FloatingParticles';
export { SavageBackground } from './SavageBackground';

// Re-export existing components
export { PhoneInput, getDefaultCountry, getFullPhoneNumber } from './PhoneInput';

// Premium color constants
export const PREMIUM_COLORS = {
  // Core
  black: '#000000',
  blackSoft: '#0A0A0A',
  blackCard: '#0D0D0D',

  // Fire Gradient
  fireRed: '#DC2626',
  fireRedDark: '#B91C1C',
  fireOrange: '#F97316',
  fireYellow: '#FBBF24',
  fireEmber: '#EF4444',

  // Dragon
  dragonGreen: '#22C55E',
  dragonBlue: '#0EA5E9',

  // Glow Effects
  glowRed: 'rgba(220, 38, 38, 0.6)',
  glowOrange: 'rgba(249, 115, 22, 0.5)',
  glowSoft: 'rgba(220, 38, 38, 0.2)',
  glowGreen: 'rgba(34, 197, 94, 0.5)',

  // Glass
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassBackground: 'rgba(255, 255, 255, 0.03)',
  glassBackgroundStrong: 'rgba(255, 255, 255, 0.06)',
  glassBorderHover: 'rgba(220, 38, 38, 0.3)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  textDark: '#52525B',

  // Status
  success: '#22C55E',
  warning: '#FBBF24',
  error: '#EF4444',

  // Zinc scale
  zinc: {
    400: '#A1A1AA',
    500: '#71717A',
    600: '#52525B',
    700: '#3F3F46',
    800: '#27272A',
    900: '#18181B',
    950: '#0F0F10',
  },
};
