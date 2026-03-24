import React, { useEffect } from 'react';
import { TouchableOpacity } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { Send } from 'lucide-react-native';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export const AnimatedSendButton: React.FC<{
  hasText: boolean;
  isDisabled: boolean;
  onPress: () => void;
}> = React.memo(({ hasText, isDisabled, onPress }) => {
  const active = useSharedValue(0);

  useEffect(() => {
    active.value = withTiming(hasText && !isDisabled ? 1 : 0, { duration: 200 });
  }, [hasText, isDisabled, active]);

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(active.value, [0, 1], ['#27272a', '#DC2626']),
    transform: [{ scale: active.value === 1 ? 1.05 : 1 }],
  }));

  return (
    <AnimatedTouchable
      onPress={onPress}
      disabled={!hasText || isDisabled}
      style={[
        {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
        },
        bgStyle,
      ]}
    >
      <Send size={20} color={hasText && !isDisabled ? '#FFFFFF' : '#71717A'} />
    </AnimatedTouchable>
  );
});
