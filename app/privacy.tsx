import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Shield,
  Eye,
  Lock,
  UserCheck,
  Mail,
  Dumbbell,
  Database,
  Key,
  FileCheck,
  Globe,
  Clock,
  Server,
  Share2,
  ShieldCheck,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PREMIUM = {
  fireRed: '#DC2626',
  fireOrange: '#F97316',
  fireYellow: '#FBBF24',
  dragonBlue: '#0EA5E9',
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
        colors={[PREMIUM.dragonBlue, '#2563EB']}
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

export default function PrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-black">
      {/* Background Effects */}
      <View
        style={{
          position: 'absolute',
          top: -100,
          left: -100,
          width: 300,
          height: 300,
          borderRadius: 150,
          backgroundColor: PREMIUM.dragonBlue,
          opacity: 0.05,
        }}
        className="blur-3xl"
      />
      <View
        style={{
          position: 'absolute',
          bottom: 100,
          right: -50,
          width: 200,
          height: 200,
          borderRadius: 100,
          backgroundColor: PREMIUM.fireRed,
          opacity: 0.03,
        }}
        className="blur-3xl"
      />

      {/* Header */}
      <LinearGradient
        colors={['rgba(14, 165, 233, 0.08)', 'transparent']}
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
            <View className="flex-row items-center gap-2">
              <Shield size={18} color={PREMIUM.dragonBlue} />
              <Text
                className="text-white text-xl font-bold"
                style={{
                  textShadowColor: 'rgba(14, 165, 233, 0.3)',
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 10,
                }}
              >
                Política de Privacidad
              </Text>
            </View>
            <Text className="text-zinc-500 text-xs">Tu seguridad es nuestra prioridad</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Trust Badge */}
        <Animated.View entering={FadeInDown.duration(400)} className="mb-8">
          <View className="flex-row items-center gap-3 bg-blue-950/30 border border-blue-500/20 rounded-2xl p-4">
            <View className="w-12 h-12 rounded-full bg-blue-500/20 items-center justify-center">
              <Lock size={24} color={PREMIUM.dragonBlue} />
            </View>
            <View className="flex-1">
              <Text className="text-white font-bold">Datos protegidos con encriptación</Text>
              <Text className="text-blue-400/70 text-xs mt-0.5">
                HTTPS/TLS • Almacenamiento seguro • GDPR Compliant
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Company Info */}
        <Animated.View entering={FadeInDown.delay(50).duration(400)} className="mb-6">
          <View className="bg-zinc-900/50 border border-zinc-800/30 rounded-2xl p-4">
            <Text className="text-zinc-400 text-sm leading-6">
              Esta Política de Privacidad describe cómo TRENS, operado por MICORP LATAM (en adelante
              "nosotros", "nuestro" o "TRENS"), recopila, usa, almacena y protege tu información
              personal cuando utilizas nuestra aplicación móvil y servicios web.
            </Text>
          </View>
        </Animated.View>

        {/* Date Badge */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)} className="mb-8">
          <View className="flex-row items-center gap-2 bg-zinc-900/50 border border-zinc-800/30 rounded-full px-4 py-2 self-start">
            <View className="w-2 h-2 rounded-full bg-green-500" />
            <Text className="text-zinc-400 text-sm">Última actualización: Marzo 2026</Text>
          </View>
        </Animated.View>

        <Section
          number="01"
          title="Información que Recopilamos"
          icon={<Database size={18} color="white" />}
          delay={150}
        >
          TRENS recopila la siguiente información:{'\n\n'}
          Datos proporcionados por ti:{'\n'}• Información de cuenta (correo electrónico, nombre,
          foto de perfil){'\n'}• Datos de entrenamiento (ejercicios, series, repeticiones, pesos)
          {'\n'}• Récords personales y progreso físico{'\n'}• Fotos de progreso (opcionales){'\n'}•
          Plan nutricional y suplementos{'\n'}• Información de pago (procesada por OpenPay — no
          almacenamos datos completos de tarjeta){'\n\n'}
          Datos recopilados automáticamente:{'\n'}• Tipo de dispositivo y sistema operativo{'\n'}•
          Dirección IP y datos de uso general{'\n'}• Tokens de notificaciones push{'\n'}• Datos de
          rendimiento de la app
        </Section>

        <Section
          number="02"
          title="Uso de la Información"
          icon={<Eye size={18} color="white" />}
          delay={200}
        >
          Utilizamos tu información para:{'\n\n'}• Proporcionar, mantener y mejorar nuestros
          servicios de fitness{'\n'}• Personalizar tu experiencia de entrenamiento y nutrición{'\n'}
          • Procesar pagos y gestionar suscripciones{'\n'}• Enviar notificaciones sobre
          entrenamientos, comidas y suplementos{'\n'}• Generar resúmenes e insights de tu progreso
          {'\n'}• Comunicarnos contigo sobre tu cuenta y actualizaciones del servicio{'\n'}•
          Detectar y prevenir fraude o uso no autorizado{'\n'}• Cumplir con obligaciones legales
        </Section>

        <Section
          number="03"
          title="Servicios de Terceros"
          icon={<Share2 size={18} color="white" />}
          delay={250}
        >
          TRENS utiliza los siguientes servicios de terceros:{'\n\n'}• Supabase — Base de datos y
          autenticación (PostgreSQL, alojado en AWS){'\n'}• Cloudflare — CDN, almacenamiento de
          archivos (R2) y despliegue web{'\n'}• OpenPay Perú — Procesamiento de pagos y
          suscripciones (PCI DSS Level 1){'\n'}• Expo / EAS — Distribución de la app y
          actualizaciones OTA{'\n'}• Spotify — Integración musical opcional (solo si activas la
          conexión){'\n'}• Firebase — Notificaciones push (FCM/APNs){'\n\n'}
          Cada proveedor tiene su propia política de privacidad. Te recomendamos revisarlas.
        </Section>

        <Section number="04" title="Seguridad" icon={<Key size={18} color="white" />} delay={300}>
          Implementamos medidas de seguridad robustas:{'\n\n'}• Todos los datos se transmiten con
          encriptación HTTPS/TLS{'\n'}• Las contraseñas se almacenan con hash bcrypt{'\n'}• Los
          datos de tarjeta son tokenizados por OpenPay (PCI DSS Level 1){'\n'}• Acceso a base de
          datos protegido mediante Row Level Security (RLS){'\n'}• Autenticación segura con JSON Web
          Tokens (JWT){'\n'}• Almacenamiento de archivos en Cloudflare R2 con acceso autenticado
        </Section>

        <Section
          number="05"
          title="Retención de Datos"
          icon={<Clock size={18} color="white" />}
          delay={350}
        >
          Conservamos tu información mientras tu cuenta esté activa:{'\n\n'}• Datos de cuenta: Se
          conservan hasta que elimines tu cuenta{'\n'}• Datos de entrenamiento: Se conservan hasta
          que elimines tu cuenta{'\n'}• Datos de pago: Se conservan según requerimientos fiscales
          (mínimo 5 años){'\n'}• Logs del sistema: Se eliminan automáticamente después de 90 días
          {'\n\n'}
          Al eliminar tu cuenta, todos tus datos personales serán eliminados permanentemente en un
          plazo máximo de 30 días, excepto aquellos que debamos conservar por obligación legal.
        </Section>

        <Section
          number="06"
          title="Tus Derechos (GDPR / LGPD)"
          icon={<UserCheck size={18} color="white" />}
          delay={400}
        >
          Como usuario, tienes derecho a:{'\n\n'}• Acceso: Solicitar una copia de tus datos
          personales{'\n'}• Rectificación: Corregir información inexacta desde tu perfil{'\n'}•
          Eliminación: Eliminar tu cuenta y datos desde la app (Mi Cuenta → Eliminar cuenta){'\n'}•
          Portabilidad: Solicitar la exportación de tus datos de entrenamiento{'\n'}• Oposición:
          Revocar consentimientos otorgados{'\n'}• Restricción: Limitar el procesamiento de tus
          datos{'\n\n'}
          Para ejercer estos derechos, contacta a soporte@trens.app
        </Section>

        <Section
          number="07"
          title="Menores de Edad (COPPA)"
          icon={<ShieldCheck size={18} color="white" />}
          delay={450}
        >
          TRENS no está dirigida a menores de 13 años. No recopilamos intencionalmente información
          de niños menores de 13 años.{'\n\n'}
          Si eres menor de 18 años, debes contar con el consentimiento de tu padre, madre o tutor
          legal para usar TRENS.{'\n\n'}
          Si descubrimos que hemos recopilado datos de un menor de 13 años sin consentimiento
          verificable, eliminaremos esa información de inmediato. Si crees que un menor ha
          proporcionado información personal, contáctanos en soporte@trens.app
        </Section>

        <Section
          number="08"
          title="Cookies y Tecnologías"
          icon={<Server size={18} color="white" />}
          delay={500}
        >
          En la versión web de TRENS utilizamos:{'\n\n'}• LocalStorage: Para mantener tu sesión y
          preferencias{'\n'}• Service Worker: Para funcionalidad offline (PWA){'\n\n'}
          En la app móvil utilizamos:{'\n\n'}• AsyncStorage: Para almacenar preferencias y caché
          local{'\n'}• Secure Store: Para tokens de autenticación{'\n\n'}
          No utilizamos cookies de rastreo ni publicidad de terceros.
        </Section>

        <Section
          number="09"
          title="Transferencias Internacionales"
          icon={<Globe size={18} color="white" />}
          delay={550}
        >
          Tus datos pueden ser procesados en servidores ubicados fuera de tu país. Nuestros
          proveedores (Supabase, Cloudflare, OpenPay) operan con infraestructura global.{'\n\n'}
          Nos aseguramos de que todos los proveedores cumplan con estándares de protección de datos
          equivalentes a los requeridos por GDPR y las leyes aplicables.
        </Section>

        <Section
          number="10"
          title="Cambios a esta Política"
          icon={<FileCheck size={18} color="white" />}
          delay={600}
        >
          Podemos actualizar esta política ocasionalmente. Te notificaremos de cambios
          significativos a través de la app o por correo electrónico.{'\n\n'}
          El uso continuado de TRENS después de las modificaciones constituye tu aceptación de la
          política actualizada.
        </Section>

        <Section number="11" title="Contacto" icon={<Mail size={18} color="white" />} delay={650}>
          Para consultas sobre privacidad o ejercer tus derechos:{'\n\n'}
          📧 Email: soporte@trens.app{'\n'}
          🌐 Web: https://trens.app/contact{'\n\n'}
          MICORP LATAM{'\n'}
          Operador de TRENS{'\n'}
          Lima, Perú{'\n\n'}
          Tiempo de respuesta estimado: 5 días hábiles
        </Section>

        {/* Footer */}
        <Animated.View
          entering={FadeInUp.delay(700).duration(500)}
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
