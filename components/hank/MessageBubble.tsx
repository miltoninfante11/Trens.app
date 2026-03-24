import React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { HankToolResult, HankToolCall } from '../../types/hank';

export interface ChatMessage {
  id: string;
  role: 'user' | 'hank';
  content: string;
  timestamp: Date;
  results?: HankToolResult[];
  pendingConfirmation?: boolean;
  pendingToolCalls?: HankToolCall[];
}

export const MessageBubble: React.FC<{ message: ChatMessage }> = React.memo(({ message }) => {
  const isUser = message.role === 'user';

  return (
    <Animated.View
      entering={FadeIn.duration(250).springify().damping(18)}
      className={`max-w-[85%] mb-3 ${isUser ? 'self-end' : 'self-start'}`}
    >
      {/* Label - ED HARDY FIRE */}
      <Text
        className={`text-xs font-mono mb-1 font-bold tracking-wider ${isUser ? 'text-zinc-500 text-right' : ''}`}
        style={{ color: isUser ? '#71717a' : '#F97316' }}
      >
        {isUser ? 'TÚ' : '🔥 HANK'}
      </Text>

      {/* Bubble - ED HARDY GLOW */}
      <View
        className={`px-4 py-3 rounded-2xl ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
        style={{
          backgroundColor: isUser ? '#1a1a1a' : message.pendingConfirmation ? '#2d1a0a' : '#1a0a0a',
          borderWidth: isUser ? 1 : 2,
          borderColor: isUser ? '#27272a' : message.pendingConfirmation ? '#F97316' : '#DC262650',
          shadowColor: isUser ? 'transparent' : '#DC2626',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: isUser ? 0 : 0.2,
          shadowRadius: 10,
          elevation: isUser ? 0 : 3,
        }}
      >
        <Text className="text-white text-base">{message.content}</Text>
      </View>

      {/* Tool Results - FIRE ACCENT */}
      {message.results && message.results.length > 0 && (
        <View className="mt-2 pl-2" style={{ borderLeftWidth: 3, borderLeftColor: '#F97316' }}>
          {message.results.map((result, idx) => (
            <Text
              key={idx}
              className="text-sm font-mono"
              style={{ color: result.success ? '#22C55E' : '#DC2626' }}
            >
              {result.message}
            </Text>
          ))}
        </View>
      )}
    </Animated.View>
  );
});
