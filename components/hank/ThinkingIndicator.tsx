import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
  FadeIn,
} from 'react-native-reanimated';

export const ThinkingIndicator: React.FC = React.memo(() => {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, [shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.7, 0.3]),
  }));

  return (
    <Animated.View entering={FadeIn.duration(200)} className="self-start max-w-[85%] mb-3">
      <Text className="text-xs font-mono mb-1" style={{ color: '#F97316' }}>
        🔥 HANK
      </Text>
      <View
        className="px-4 py-3 rounded-2xl rounded-tl-sm"
        style={{
          backgroundColor: '#1a0a0a',
          borderWidth: 2,
          borderColor: '#DC262650',
        }}
      >
        {/* Skeleton lines */}
        <Animated.View style={shimmerStyle}>
          <View
            style={{
              height: 12,
              width: '85%',
              backgroundColor: '#DC262625',
              borderRadius: 6,
              marginBottom: 8,
            }}
          />
          <View
            style={{
              height: 12,
              width: '65%',
              backgroundColor: '#DC262620',
              borderRadius: 6,
              marginBottom: 8,
            }}
          />
          <View
            style={{
              height: 12,
              width: '45%',
              backgroundColor: '#DC262615',
              borderRadius: 6,
            }}
          />
        </Animated.View>

        {/* Dots row */}
        <View className="flex-row items-center mt-2">
          <SkeletonDot delay={0} />
          <SkeletonDot delay={150} />
          <SkeletonDot delay={300} />
        </View>
      </View>
    </Animated.View>
  );
});

const SkeletonDot: React.FC<{ delay: number }> = React.memo(({ delay }) => {
  const dot = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      dot.value = withRepeat(
        withSequence(withTiming(1, { duration: 400 }), withTiming(0, { duration: 400 })),
        -1,
        false
      );
    }, delay);
    return () => clearTimeout(timer);
  }, [dot, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(dot.value, [0, 1], [0.3, 1]),
    transform: [{ scale: interpolate(dot.value, [0, 1], [1, 1.3]) }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: '#DC2626',
          marginRight: 4,
        },
        style,
      ]}
    />
  );
});
