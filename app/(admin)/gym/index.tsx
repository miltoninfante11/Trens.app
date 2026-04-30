import { View, Text, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { LayoutList, Dumbbell, ChevronRight } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';

const COLORS = {
  blue: '#3B82F6',
  white: '#FFFFFF',
  zinc400: '#A1A1AA',
  zinc500: '#71717A',
};

const MODULES = [
  {
    href: '/(admin)/rutinas',
    title: 'RUTINAS',
    description: 'Plantillas de entrenamiento',
    icon: LayoutList,
    color: '#3B82F6',
  },
  {
    href: '/(admin)/ejercicios',
    title: 'EJERCICIOS',
    description: 'Catálogo de ejercicios',
    icon: Dumbbell,
    color: '#22C55E',
  },
] as const;

export default function AdminGymHub() {
  return (
    <View className="flex-1 bg-black">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="px-4 pt-4 pb-2">
          <View className="flex-row items-center gap-3 mb-2">
            <Dumbbell size={24} color={COLORS.blue} />
            <Text className="text-white text-xl font-bold tracking-wider">GYM</Text>
          </View>
          <Text className="text-zinc-500 text-sm font-mono">
            Gestión de rutinas y biblioteca de ejercicios.
          </Text>
        </View>

        <View className="px-4 mt-4 gap-3">
          {MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <Link key={m.href} href={m.href as any} asChild>
                <TouchableOpacity
                  activeOpacity={0.7}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex-row items-center"
                >
                  <View
                    className="w-12 h-12 rounded-xl items-center justify-center"
                    style={{ backgroundColor: `${m.color}20` }}
                  >
                    <Icon size={24} color={m.color} />
                  </View>
                  <View className="flex-1 ml-4">
                    <Text className="text-white font-bold text-base">{m.title}</Text>
                    <Text className="text-zinc-500 font-mono text-xs mt-1">{m.description}</Text>
                  </View>
                  <ChevronRight size={20} color={COLORS.zinc500} />
                </TouchableOpacity>
              </Link>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
