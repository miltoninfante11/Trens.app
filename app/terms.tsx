import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Dumbbell,
  FileText,
  Shield,
  Scale,
  Heart,
  Mail,
  Globe,
  CreditCard,
  UserX,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PREMIUM = {
  fireRed: '#DC2626',
  fireOrange: '#F97316',
  fireYellow: '#FBBF24',
};

interface SectionProps {
  number: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  delay: number;
}

const Section = ({ number, title, icon, children, delay }: SectionProps) => (
  <Animated.View entering={FadeInUp.delay(delay).duration(500)} className="mb-8">
    <View className="flex-row items-center gap-3 mb-4">
      <LinearGradient
        colors={[PREMIUM.fireRed, PREMIUM.fireOrange]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="w-10 h-10 rounded-xl items-center justify-center"
      >
        {icon}
      </LinearGradient>
      <View>
        <Text className="text-zinc-500 text-xs font-bold tracking-wider">SECCIÓN {number}</Text>
        <Text className="text-white text-lg font-bold">{title}</Text>
      </View>
    </View>
    <View className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
      <Text className="text-zinc-400 text-base leading-7">{children}</Text>
    </View>
  </Animated.View>
);

export default function TermsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-black">
      {/* Background Effects */}
      <View
        style={{
          position: 'absolute',
          top: -100,
          right: -100,
          width: 300,
          height: 300,
          borderRadius: 150,
          backgroundColor: PREMIUM.fireRed,
          opacity: 0.05,
        }}
        className="blur-3xl"
      />

      {/* Header */}
      <LinearGradient
        colors={['rgba(220, 38, 38, 0.08)', 'transparent']}
        className="border-b border-zinc-800/50"
      >
        <View
          className="px-4 pb-4 flex-row items-center"
          style={{ paddingTop: Math.max(insets.top, 12) + 8 }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-zinc-800/80 items-center justify-center mr-4"
          >
            <ArrowLeft size={20} color="#ffffff" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text
              className="text-white text-xl font-bold"
              style={{
                textShadowColor: 'rgba(220, 38, 38, 0.3)',
                textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 10,
              }}
            >
              Términos de Servicio
            </Text>
            <Text className="text-zinc-500 text-xs">TRENS High Performance Fitness</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Company Info */}
        <Animated.View entering={FadeInDown.duration(400)} className="mb-6">
          <View className="bg-zinc-900/50 border border-zinc-800/30 rounded-2xl p-4">
            <Text className="text-zinc-400 text-sm leading-6">
              Estos Términos de Servicio regulan el uso de la aplicación TRENS, operada por MICORP
              LATAM. Al descargar, instalar o usar TRENS, aceptas estos términos en su totalidad.
            </Text>
          </View>
        </Animated.View>

        {/* Date Badge */}
        <Animated.View entering={FadeInDown.delay(50).duration(400)} className="mb-8">
          <View className="flex-row items-center gap-2 bg-zinc-900/50 border border-zinc-800/30 rounded-full px-4 py-2 self-start">
            <View className="w-2 h-2 rounded-full bg-green-500" />
            <Text className="text-zinc-400 text-sm">Última actualización: Marzo 2026</Text>
          </View>
        </Animated.View>

        <Section
          number="01"
          title="Aceptación de los Términos"
          icon={<FileText size={18} color="white" />}
          delay={100}
        >
          Al acceder y utilizar la aplicación TRENS ("la App"), aceptas estos Términos de Servicio y
          nuestra Política de Privacidad.{'\n\n'}
          Si no estás de acuerdo con alguno de estos términos, no debes utilizar la App. El uso
          continuado de TRENS constituye tu aceptación de cualquier modificación futura.{'\n\n'}
          Debes tener al menos 13 años para usar TRENS. Si eres menor de 18 años, necesitas el
          consentimiento de tu padre, madre o tutor legal.
        </Section>

        <Section
          number="02"
          title="Descripción del Servicio"
          icon={<Dumbbell size={18} color="white" />}
          delay={150}
        >
          TRENS es una plataforma de fitness de alto rendimiento que ofrece:{'\n\n'}• Planes de
          entrenamiento personalizados con IA{'\n'}• Seguimiento de progreso físico y récords
          personales{'\n'}• Biblioteca de ejercicios con videos demostrativos{'\n'}• Registro y
          grabación de sesiones de entrenamiento{'\n'}• Plan nutricional personalizado{'\n'}• Stack
          de suplementación{'\n'}• Asistente virtual HANK con inteligencia artificial{'\n'}• Feed
          social de videos de entrenamiento{'\n'}• Integración con Spotify para música{'\n'}•
          Métricas ADN atlético
        </Section>

        <Section
          number="03"
          title="Registro de Cuenta"
          icon={<Shield size={18} color="white" />}
          delay={200}
        >
          Para utilizar TRENS, debes crear una cuenta proporcionando información precisa y
          actualizada.{'\n\n'}
          Eres responsable de:{'\n'}• Mantener la confidencialidad de tu contraseña{'\n'}• Todas las
          actividades que ocurran bajo tu cuenta{'\n'}• Notificarnos inmediatamente de cualquier uso
          no autorizado{'\n'}• Mantener tu información de perfil actualizada{'\n\n'}
          Nos reservamos el derecho de suspender o cerrar cuentas que violen estos términos.
        </Section>

        <Section
          number="04"
          title="Suscripciones y Pagos"
          icon={<CreditCard size={18} color="white" />}
          delay={250}
        >
          TRENS ofrece un plan gratuito con funcionalidades básicas y un plan PRO con
          funcionalidades avanzadas.{'\n\n'}
          Plan PRO:{'\n'}• Precio: S/ 59.90/mes (sujeto a cambios con aviso previo){'\n'}• Cobro:
          Recurrente mensual mediante tarjeta de crédito/débito{'\n'}• Procesador: OpenPay Perú (PCI
          DSS Level 1){'\n'}• Cancelación: Puedes cancelar en cualquier momento desde la app. Tu
          acceso PRO continuará hasta el final del período pagado{'\n'}• Reembolsos: No se realizan
          reembolsos por períodos parciales{'\n\n'}
          Los precios incluyen los impuestos aplicables según la legislación peruana.
        </Section>

        <Section
          number="05"
          title="Uso Aceptable"
          icon={<Scale size={18} color="white" />}
          delay={300}
        >
          Te comprometes a:{'\n\n'}• No utilizar la App para fines ilegales{'\n'}• No intentar
          acceder a cuentas de otros usuarios{'\n'}• No distribuir malware o código malicioso{'\n'}•
          No interferir con el funcionamiento de la App{'\n'}• No suplantar la identidad de otras
          personas{'\n'}• No subir contenido ofensivo, violento o inapropiado{'\n'}• No realizar
          ingeniería inversa de la App{'\n'}• No usar bots o scripts automatizados
        </Section>

        <Section
          number="06"
          title="Propiedad Intelectual"
          icon={<FileText size={18} color="white" />}
          delay={350}
        >
          Todo el contenido de TRENS, incluyendo pero no limitado a logos, diseños, textos,
          gráficos, videos, algoritmos y software, es propiedad de TRENS / MICORP LATAM o sus
          licenciantes y está protegido por leyes de propiedad intelectual.{'\n\n'}
          El contenido que generes (entrenamientos, fotos, videos) sigue siendo tuyo. Al subirlo a
          TRENS, nos otorgas una licencia limitada para almacenarlo y mostrarlo dentro de la
          plataforma.{'\n\n'}
          Puedes solicitar la eliminación de tu contenido en cualquier momento eliminando tu cuenta.
        </Section>

        <Section
          number="07"
          title="Eliminación de Cuenta"
          icon={<UserX size={18} color="white" />}
          delay={400}
        >
          Puedes eliminar tu cuenta en cualquier momento desde Mi Cuenta → Eliminar cuenta.{'\n\n'}
          Al eliminar tu cuenta:{'\n'}• Se cancelará tu suscripción activa (si la tienes){'\n'}• Se
          eliminarán todos tus datos personales permanentemente{'\n'}• Se eliminarán tus
          entrenamientos, récords, fotos y videos{'\n'}• Se eliminarán tus tarjetas guardadas
          {'\n\n'}
          Esta acción es irreversible. Los datos eliminados no pueden recuperarse.{'\n\n'}
          Algunos datos pueden conservarse hasta 30 días por razones técnicas, y los registros de
          pago se conservan según la legislación fiscal aplicable.
        </Section>

        <Section
          number="08"
          title="Aviso de Salud"
          icon={<Heart size={18} color="white" />}
          delay={450}
        >
          TRENS proporciona información de fitness con fines educativos e informativos únicamente.
          {'\n\n'}
          IMPORTANTE:{'\n'}• Antes de comenzar cualquier programa de ejercicios, consulta con un
          profesional de la salud{'\n'}• Los planes nutricionales generados por IA son orientativos
          y no sustituyen el consejo de un nutricionista certificado{'\n'}• No somos responsables de
          lesiones que puedan ocurrir durante el uso de la App{'\n'}• Si experimentas dolor, mareos
          u otros síntomas durante el ejercicio, detente inmediatamente y consulta a un médico
        </Section>

        <Section
          number="09"
          title="Limitación de Responsabilidad"
          icon={<AlertTriangle size={18} color="white" />}
          delay={500}
        >
          TRENS se proporciona "tal cual" y "según disponibilidad". No garantizamos que el servicio
          será ininterrumpido o libre de errores.{'\n\n'}
          MICORP LATAM no será responsable por:{'\n'}• Pérdida de datos debido a fallos técnicos
          {'\n'}• Lesiones derivadas del uso de planes de ejercicio{'\n'}• Resultados específicos de
          entrenamiento o nutrición{'\n'}• Interrupciones del servicio por mantenimiento o fuerza
          mayor{'\n\n'}
          Nuestra responsabilidad total se limita al monto pagado por el usuario en los últimos 12
          meses.
        </Section>

        <Section
          number="10"
          title="Privacidad y Datos"
          icon={<ShieldCheck size={18} color="white" />}
          delay={550}
        >
          El tratamiento de tus datos personales se rige por nuestra Política de Privacidad,
          disponible en la App y en https://trens.app/privacy{'\n\n'}
          Al usar TRENS, aceptas nuestra Política de Privacidad y el procesamiento de tus datos
          conforme a ella.
        </Section>

        <Section
          number="11"
          title="Modificaciones"
          icon={<FileText size={18} color="white" />}
          delay={600}
        >
          Nos reservamos el derecho de modificar estos términos en cualquier momento. Las
          modificaciones entrarán en vigor inmediatamente después de su publicación en la App.
          {'\n\n'}
          Te notificaremos de cambios significativos a través de la App o por correo electrónico con
          al menos 7 días de anticipación.{'\n\n'}
          El uso continuado de TRENS después de las modificaciones constituye tu aceptación de los
          términos actualizados.
        </Section>

        <Section
          number="12"
          title="Ley Aplicable"
          icon={<Globe size={18} color="white" />}
          delay={650}
        >
          Estos términos se rigen por las leyes de la República del Perú. Cualquier disputa será
          resuelta por los tribunales competentes de la ciudad de Lima, Perú.{'\n\n'}
          Si alguna disposición de estos términos resulta inaplicable, las demás disposiciones
          continuarán en vigor.
        </Section>

        <Section number="13" title="Contacto" icon={<Mail size={18} color="white" />} delay={700}>
          Para preguntas sobre estos términos:{'\n\n'}
          📧 Email: soporte@trens.app{'\n'}
          🌐 Web: https://trens.app/contact{'\n\n'}
          MICORP LATAM{'\n'}
          Operador de TRENS{'\n'}
          Lima, Perú
        </Section>

        {/* Footer */}
        <Animated.View
          entering={FadeInUp.delay(750).duration(500)}
          className="py-10 border-t border-zinc-800/50 mt-6 items-center"
        >
          <LinearGradient
            colors={[PREMIUM.fireRed, PREMIUM.fireOrange]}
            className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
            style={{
              shadowColor: PREMIUM.fireRed,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 12,
            }}
          >
            <Dumbbell size={28} color="white" />
          </LinearGradient>
          <Text
            className="text-white text-2xl font-bold"
            style={{
              textShadowColor: 'rgba(220, 38, 38, 0.4)',
              textShadowOffset: { width: 0, height: 2 },
              textShadowRadius: 10,
            }}
          >
            TRENS
          </Text>
          <Text className="text-zinc-600 text-xs mt-1 tracking-widest">
            HIGH PERFORMANCE FITNESS
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
