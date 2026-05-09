// ============================================================================
// SHOP MODAL - Modal de tienda in-app accesible desde Hank Tools
// ============================================================================

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking,
  FlatList,
  Dimensions,
  PanResponder,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Alert } from '../../lib/alert';
import * as Haptics from '../../lib/haptics';
import {
  ShoppingBag,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  MessageCircle,
  Check,
  Package,
  Crown,
  AlertCircle,
  Layers,
  Sparkles,
  Zap,
  Clock as ClockIcon,
} from 'lucide-react-native';
import shop, { ShopProduct, ShopCartItem, ShopCategory } from '../../services/shop';
import { hankToolsEvent, ShopOpenPayload } from '../../lib/hankToolsEvent';
import { useAuth } from '../../app/_layout';
import { useSubscription } from '../../context/SubscriptionContext';
import { getMyCards } from '../../lib/openpay';
import { LinearGradient } from 'expo-linear-gradient';
import { SavageBackground } from '../ui/SavageBackground';
import BannerCarousel from './BannerCarousel';

const GUEST_CART_KEY = '@trens/shop/guest_cart';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Altura del bottom-sheet: 92% pantalla (similar al chat de Hank)
const SHEET_HEIGHT = SCREEN_H * 0.92;
// Card de producto: 2 columnas, padding del grid (8) + padding interior (8 * 2)
const CARD_W = (Math.min(SCREEN_W, 720) - 16 - 16) / 2;
const CARD_IMG = CARD_W;

const COLORS = {
  red: '#DC2626',
  green: '#22C55E',
  white: '#FFFFFF',
  zinc300: '#D4D4D8',
  zinc400: '#A1A1AA',
  zinc500: '#71717A',
  zinc700: '#3F3F46',
  zinc800: '#27272a',
  zinc900: '#18181b',
};

type ShopView = 'catalog' | 'product' | 'cart' | 'checkout' | 'success';

// Sentinel para el filtro "MI STACK" (mismo slot que las categorías reales).
const MY_STACK_KEY = '__my_stack__';

interface MyStackData {
  products: ShopProduct[];
  purchases: Record<string, { last_paid_at: string | null }>;
  bundle: { min: number; discount: number };
}

interface SavedCard {
  id: string;
  last4: string;
  brand: string;
  is_default?: boolean;
}

interface ShopModalProps {
  /** Si está presente, el modal arranca abierto y onClose se llama en lugar de ocultar */
  asPage?: boolean;
  onPageClose?: () => void;
}

export default function ShopModal({ asPage, onPageClose }: ShopModalProps = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { isPro } = useSubscription();
  const [visible, setVisible] = useState(!!asPage);
  const [view, setView] = useState<ShopView>('catalog');
  const guestCartHydrated = useRef(false);

  // En modo asPage: la última vista de página (catalog/product) cuando se abre overlay
  const lastPageViewRef = useRef<'catalog' | 'product'>('catalog');
  useEffect(() => {
    if (view === 'catalog' || view === 'product') lastPageViewRef.current = view;
  }, [view]);

  // Catalog state
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // MI STACK state
  const [myStack, setMyStack] = useState<MyStackData | null>(null);
  const [myStackLoading, setMyStackLoading] = useState(false);

  // Detail
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);

  // Cart
  const [cartItems, setCartItems] = useState<ShopCartItem[]>([]);
  const [cartLoading, setCartLoading] = useState(false);

  // Login prompt for card
  const [loginPromptVisible, setLoginPromptVisible] = useState(false);

  // Checkout
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    name: '',
    email: '',
    phone: '',
    street: '',
    district: '',
    city: 'Lima',
    region: 'Lima',
    reference: '',
    notes: '',
  });
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'whatsapp'>('card');

  // Success
  const [successOrder, setSuccessOrder] = useState<any>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);

  // Listen to hank tools event
  useEffect(() => {
    if (asPage) {
      // En modo página cargamos catálogo de inmediato
      loadCatalog();
      if (user) loadCart();
      return;
    }
    return hankToolsEvent.subscribe('shop', (payload?: any) => {
      const p = payload as ShopOpenPayload | undefined;
      open();
      if (p?.view === 'mystack') {
        setActiveCategory(MY_STACK_KEY);
      }
      if (p?.productId) {
        // Deep-link a un producto: lo abrimos cuando el catálogo termine de cargar.
        (async () => {
          try {
            const prod = await shop.getProduct(p.productId!);
            if (prod) {
              setSelectedProduct(prod);
              setView('product');
            }
          } catch (e) {
            console.warn('[ShopModal] deep-link product error', e);
          }
        })();
      }
    });
  }, [asPage]);

  // -------------------------------------------------------------------------
  // GUEST CART PERSISTENCE (AsyncStorage / localStorage on web)
  // -------------------------------------------------------------------------
  // Hidratar carrito invitado al montar
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(GUEST_CART_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) setCartItems(parsed);
        }
      } catch {}
      guestCartHydrated.current = true;
    })();
  }, []);

  // Persistir carrito invitado en cada cambio (solo guest, después de hidratación)
  useEffect(() => {
    if (!guestCartHydrated.current) return;
    if (user) return; // Logged-in users → DB
    (async () => {
      try {
        await AsyncStorage.setItem(GUEST_CART_KEY, JSON.stringify(cartItems));
      } catch {}
    })();
  }, [cartItems, user]);

  const open = useCallback(() => {
    setVisible(true);
    setView('catalog');
    loadCatalog();
    if (user) loadCart();
  }, [user]);

  const close = () => {
    // Si estamos en modo p\u00e1gina y hay un overlay (cart/checkout/success) → solo cerrar overlay
    if (asPage && (view === 'cart' || view === 'checkout' || view === 'success')) {
      setView(lastPageViewRef.current);
      return;
    }
    if (asPage && onPageClose) {
      onPageClose();
      return;
    }
    setVisible(false);
    setSelectedProduct(null);
    setView('catalog');
  };

  // ==========================================================================
  // DATA LOADING
  // ==========================================================================
  const loadCatalog = async () => {
    setLoading(true);
    try {
      const [prods, cats] = await Promise.all([
        shop.listProducts({ categorySlug: activeCategory || undefined }),
        shop.listCategories(),
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (e) {
      console.error('Error loading shop:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) loadCatalog();
  }, [activeCategory]);

  // ==========================================================================
  // MI STACK — Productos vinculados al supplement_stack del usuario
  // ==========================================================================
  const loadMyStack = useCallback(async () => {
    if (!user) {
      setMyStack(null);
      return;
    }
    setMyStackLoading(true);
    try {
      const r = await shop.myStackProducts();
      setMyStack(r);
    } catch (e) {
      console.warn('[ShopModal] myStack load error', e);
    } finally {
      setMyStackLoading(false);
    }
  }, [user]);

  // Cargar MI STACK al abrir el modal y cuando se selecciona el filtro
  useEffect(() => {
    if (!visible && !asPage) return;
    if (!user) return;
    if (activeCategory === MY_STACK_KEY || myStack === null) {
      loadMyStack();
    }
  }, [visible, asPage, user, activeCategory]);

  // "COMPRAR TODO MI STACK" — agrega al carrito todo el stack y lleva a checkout
  const buyAllStack = useCallback(async () => {
    if (!user) {
      setLoginPromptVisible(true);
      return;
    }
    if (!myStack || myStack.products.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // Productos disponibles únicamente
      const available = myStack.products.filter(
        (p) => p.is_active && (p.stock_unlimited || p.is_digital || (p.stock || 0) > 0)
      );
      if (available.length === 0) {
        Alert.alert('Stack vacío', 'Ninguno de tus productos del Stack está disponible.');
        return;
      }
      for (const p of available) {
        try {
          await shop.addToCart(p.id, 1);
        } catch (e) {
          // continuar con el resto
          console.warn('[buyAllStack] addToCart fail', p.id, e);
        }
      }
      await loadCart();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      goToCheckout();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo armar el bundle');
    }
  }, [user, myStack]);

  const loadCart = async () => {
    if (!user) return;
    setCartLoading(true);
    try {
      const { items } = await shop.getCart();
      setCartItems(items);
    } catch (e) {
      console.error('Error loading cart:', e);
    } finally {
      setCartLoading(false);
    }
  };

  const loadSavedCards = async () => {
    try {
      const r = await getMyCards();
      if (r.success && r.cards) {
        setSavedCards(r.cards as SavedCard[]);
        const def = r.cards.find((c: any) => c.is_default);
        setSelectedCardId(def?.id || r.cards[0]?.id || null);
      }
    } catch (e) {
      console.warn('No saved cards available', e);
    }
  };

  // ==========================================================================
  // CART ACTIONS - guest (local) o user (DB)
  // ==========================================================================
  const addToCart = async (product: ShopProduct, qty = 1) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (user) {
        await shop.addToCart(product.id, qty);
        await loadCart();
      } else {
        // Guest: cart en local state
        setCartItems((prev) => {
          const existing = prev.find((it) => it.product_id === product.id);
          if (existing) {
            return prev.map((it) =>
              it.id === existing.id ? { ...it, quantity: it.quantity + qty } : it
            );
          }
          const localItem: ShopCartItem = {
            id: `local-${product.id}`,
            cart_id: 'local',
            product_id: product.id,
            quantity: qty,
            product,
          };
          return [...prev, localItem];
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const updateQty = async (item: ShopCartItem, qty: number) => {
    if (qty < 1) return removeItem(item);
    try {
      if (user && !item.id.startsWith('local-')) {
        await shop.updateCartItem(item.id, qty);
        await loadCart();
      } else {
        setCartItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, quantity: qty } : it))
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const removeItem = async (item: ShopCartItem) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (user && !item.id.startsWith('local-')) {
        await shop.removeCartItem(item.id);
        await loadCart();
      } else {
        setCartItems((prev) => prev.filter((it) => it.id !== item.id));
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  // ==========================================================================
  // CHECKOUT
  // ==========================================================================
  const goToCheckout = async () => {
    if (cartItems.length === 0) return;
    setView('checkout');
    if (user) {
      setCheckoutForm((f) => ({
        ...f,
        name: f.name || (user as any).user_metadata?.full_name || '',
        email: f.email || user.email || '',
      }));
      await loadSavedCards();
    } else {
      // Guest: solo WhatsApp está disponible por defecto
      setPaymentMethod('whatsapp');
    }
  };

  const subtotal = cartItems.reduce(
    (sum, it) => sum + Number(it.product?.price || 0) * it.quantity,
    0
  );
  const requiresShipping = cartItems.some((it) => it.product?.shipping_required);

  const validateCheckout = (): string | null => {
    if (!checkoutForm.name) return 'Ingresa tu nombre';
    if (!checkoutForm.email) return 'Ingresa tu email';
    if (paymentMethod === 'whatsapp' && !checkoutForm.phone) return 'Ingresa tu teléfono';
    if (requiresShipping) {
      if (!checkoutForm.street) return 'Ingresa la dirección';
      if (!checkoutForm.district) return 'Ingresa el distrito';
    }
    if (paymentMethod === 'card' && !selectedCardId) {
      return 'Selecciona una tarjeta o agrega una nueva';
    }
    return null;
  };

  const submitCheckoutCard = async () => {
    const err = validateCheckout();
    if (err) return Alert.alert('Faltan datos', err);

    setCheckoutLoading(true);
    try {
      const { order } = await shop.checkoutWithCard({
        cardId: selectedCardId!,
        customer: {
          name: checkoutForm.name,
          email: checkoutForm.email,
          phone: checkoutForm.phone,
        },
        shippingAddress: requiresShipping
          ? {
              street: checkoutForm.street,
              district: checkoutForm.district,
              city: checkoutForm.city,
              region: checkoutForm.region,
              reference: checkoutForm.reference,
            }
          : undefined,
        customerNotes: checkoutForm.notes,
        applyStackBundle: true,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessOrder(order);
      setWhatsappUrl(null);
      setView('success');
      setCartItems([]);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error en el pago', e.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const submitCheckoutWhatsApp = async () => {
    const err = validateCheckout();
    if (err) return Alert.alert('Faltan datos', err);

    setCheckoutLoading(true);
    try {
      // Si es guest, mandamos los items del carrito local
      const guestItems = !user
        ? cartItems.map((it) => ({ productId: it.product_id, quantity: it.quantity }))
        : undefined;

      const { order, whatsappUrl: url } = await shop.checkoutWhatsApp({
        customer: {
          name: checkoutForm.name,
          email: checkoutForm.email,
          phone: checkoutForm.phone,
        },
        shippingAddress: requiresShipping
          ? {
              street: checkoutForm.street,
              district: checkoutForm.district,
              city: checkoutForm.city,
              region: checkoutForm.region,
              reference: checkoutForm.reference,
            }
          : undefined,
        customerNotes: checkoutForm.notes,
        items: guestItems,
        applyStackBundle: true,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessOrder(order);
      setWhatsappUrl(url);
      setView('success');
      setCartItems([]);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  const cartCount = cartItems.reduce((s, it) => s + it.quantity, 0);
  const cartTotal = cartItems.reduce(
    (s, it) => s + it.quantity * Number(it.product?.price || 0),
    0
  );

  // Drag-to-close (solo modo modal in-app, no en asPage)
  const translateY = useSharedValue(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.value = g.dy;
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120 || g.vy > 0.6) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          close();
          translateY.value = 0;
        } else {
          translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
        }
      },
    })
  ).current;
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    if (visible) translateY.value = 0;
  }, [visible]);

  // Header común reutilizado en ambos modos
  const renderHeader = (v: ShopView = view) => (
    <View
      className="flex-row items-center justify-between px-4 py-4 relative"
      style={{
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(220, 38, 38, 0.35)',
        backgroundColor: asPage ? 'rgba(0, 0, 0, 0.35)' : undefined,
      }}
    >
      {/* Hairline glow under the header (asPage only) */}
      {asPage && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: -1,
            left: 24,
            right: 24,
            height: 1,
            backgroundColor: 'rgba(249, 115, 22, 0.6)',
            shadowColor: '#F97316',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: 10,
          }}
        />
      )}

      {v === 'catalog' ? (
        <View className="flex-row items-center gap-3 flex-1">
          {/* Fire-glow shopping icon */}
          <LinearGradient
            colors={['#DC2626', '#F97316']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#DC2626',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.7,
              shadowRadius: 10,
              elevation: 6,
            }}
          >
            <ShoppingBag size={18} color="#fff" strokeWidth={2.5} />
          </LinearGradient>
          <View>
            <Text
              className="text-white font-black text-xl tracking-[0.18em]"
              style={{
                textShadowColor: '#DC2626',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 12,
              }}
            >
              TRENS SHOP
            </Text>
            <Text className="text-fire-orange font-mono text-[9px] tracking-[0.3em] uppercase">
              Savage Gear
            </Text>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => {
            if (v === 'success') return close();
            if (v === 'product') return setView('catalog');
            if (v === 'cart') {
              if (asPage) return setView(lastPageViewRef.current);
              return setView('catalog');
            }
            if (v === 'checkout') return setView('cart');
          }}
          className="flex-row items-center gap-1"
        >
          <ChevronLeft size={22} color={COLORS.white} />
          <Text className="text-white font-bold text-base">
            {v === 'cart' && 'Carrito'}
            {v === 'checkout' && 'Checkout'}
            {v === 'product' && 'Producto'}
            {v === 'success' && 'Pedido confirmado'}
          </Text>
        </TouchableOpacity>
      )}

      <View className="flex-row items-center gap-2">
        {v !== 'cart' && v !== 'checkout' && v !== 'success' && (
          <TouchableOpacity
            onPress={() => setView('cart')}
            activeOpacity={0.85}
            className="rounded-xl px-3 py-2 flex-row items-center gap-1.5"
            style={{
              backgroundColor: 'rgba(15, 8, 8, 0.9)',
              borderWidth: 1.5,
              borderColor: cartCount > 0 ? 'rgba(220, 38, 38, 0.6)' : 'rgba(220, 38, 38, 0.2)',
              shadowColor: '#DC2626',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: cartCount > 0 ? 0.6 : 0.15,
              shadowRadius: 10,
              elevation: cartCount > 0 ? 6 : 2,
            }}
          >
            <ShoppingCart size={18} color={cartCount > 0 ? '#F97316' : COLORS.white} />
            {cartCount > 0 && (
              <LinearGradient
                colors={['#DC2626', '#F97316']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 999,
                  minWidth: 20,
                  height: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 4,
                }}
              >
                <Text className="text-white font-mono text-[10px] font-black">{cartCount}</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderBody = (v: ShopView = view) => (
    <>
      {v === 'catalog' && (
        <CatalogView
          products={products}
          categories={categories}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          loading={loading}
          onProductPress={(p: ShopProduct) => {
            setSelectedProduct(p);
            setView('product');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          onQuickAdd={(p: ShopProduct) => addToCart(p, 1)}
          asPage={asPage}
          myStack={myStack}
          myStackLoading={myStackLoading}
          onBuyAllStack={buyAllStack}
          isAuthenticated={!!user}
        />
      )}

      {v === 'product' && selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          isPro={isPro}
          onAdd={(qty) => {
            addToCart(selectedProduct, qty);
            setView('cart');
          }}
        />
      )}

      {v === 'cart' && (
        <CartView
          items={cartItems}
          loading={cartLoading}
          subtotal={subtotal}
          onUpdateQty={updateQty}
          onRemove={removeItem}
          onCheckout={goToCheckout}
          onContinue={() => {
            if (asPage) setView(lastPageViewRef.current);
            else setView('catalog');
          }}
        />
      )}

      {v === 'checkout' && (
        <CheckoutView
          isGuest={!user}
          form={checkoutForm}
          setForm={setCheckoutForm}
          requiresShipping={requiresShipping}
          paymentMethod={paymentMethod}
          setPaymentMethod={(m: 'card' | 'whatsapp') => {
            if (m === 'card' && !user) {
              setLoginPromptVisible(true);
              return;
            }
            setPaymentMethod(m);
          }}
          savedCards={savedCards}
          selectedCardId={selectedCardId}
          setSelectedCardId={setSelectedCardId}
          subtotal={subtotal}
          loading={checkoutLoading}
          onSubmit={paymentMethod === 'card' ? submitCheckoutCard : submitCheckoutWhatsApp}
        />
      )}

      {v === 'success' && successOrder && (
        <SuccessView order={successOrder} whatsappUrl={whatsappUrl} onClose={close} />
      )}

      {/* Login prompt overlay */}
      {loginPromptVisible && (
        <View
          className="absolute inset-0 bg-black/80 items-center justify-center px-6"
          style={{ paddingBottom: insets.bottom }}
        >
          <View className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm">
            <View className="w-14 h-14 rounded-full bg-red-600/20 items-center justify-center mb-4 self-center">
              <CreditCard size={28} color={COLORS.red} />
            </View>
            <Text className="text-white font-bold text-xl text-center">Pago con tarjeta</Text>
            <Text className="text-zinc-400 text-sm text-center mt-2 leading-5">
              Para pagar con tarjeta necesitas una cuenta TRENS. ¿Quieres crear una o iniciar
              sesión? También puedes continuar como invitado pagando por WhatsApp.
            </Text>
            <TouchableOpacity
              onPress={() => {
                setLoginPromptVisible(false);
                close();
                router.push('/(auth)/login');
              }}
              className="bg-red-600 rounded-xl py-3 items-center mt-5"
            >
              <Text className="text-white font-bold tracking-wider">INICIAR SESIÓN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setLoginPromptVisible(false)}
              className="py-3 items-center mt-1"
            >
              <Text className="text-zinc-400 font-mono text-xs">
                CONTINUAR COMO INVITADO (WHATSAPP)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );

  // Sheet reutilizable: bottom-sheet con drag-down. Header completo es zona draggable.
  const renderSheet = (sheetView: ShopView) => (
    <View className="flex-1 bg-black/60 justify-end">
      <Pressable className="flex-1" onPress={close} />
      <Animated.View
        style={[
          sheetStyle,
          {
            backgroundColor: '#000000',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            height: SHEET_HEIGHT,
            borderTopWidth: 2,
            borderTopColor: 'rgba(220, 38, 38, 0.5)',
            overflow: 'hidden',
          },
        ]}
      >
        {/* Línea de acento superior */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            backgroundColor: COLORS.red,
            shadowColor: COLORS.red,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 10,
            zIndex: 10,
          }}
        />

        {/* HEADER + HANDLE = zona draggable completa */}
        <View {...panResponder.panHandlers}>
          <View className="pt-4 pb-2 items-center">
            <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
          </View>
          {renderHeader(sheetView)}
        </View>

        <View className="flex-1">{renderBody(sheetView)}</View>

        {/* Floating CheckoutBar (catalog/product views, with items) */}
        {(sheetView === 'catalog' || sheetView === 'product') && cartItems.length > 0 && (
          <CheckoutBar
            items={cartItems}
            total={cartTotal}
            count={cartCount}
            bottomInset={0}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              goToCheckout();
            }}
          />
        )}
      </Animated.View>
    </View>
  );

  // ==========================================================================
  // ASPAGE: render como página completa (web shop.trens.app o /shop)
  // El carrito/checkout/success se abren como bottom-sheet overlay
  // ==========================================================================
  if (asPage) {
    const overlayActive = view === 'cart' || view === 'checkout' || view === 'success';
    const pageView: ShopView = overlayActive ? lastPageViewRef.current : view;
    return (
      <View className="flex-1 bg-black">
        {/* SAVAGE LANDING-GRADE AMBIENT BACKDROP */}
        <SavageBackground variant="screen" />

        {/* Top fire spotlight that bleeds into the header */}
        <LinearGradient
          colors={['rgba(220, 38, 38, 0.28)', 'rgba(249, 115, 22, 0.06)', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 260,
          }}
        />

        <View style={{ paddingTop: insets.top }} />

        {renderHeader(pageView)}
        {renderBody(pageView)}

        {/* Floating CheckoutBar (catalog/product, with items) */}
        {(pageView === 'catalog' || pageView === 'product') &&
          !overlayActive &&
          cartItems.length > 0 && (
            <CheckoutBar
              items={cartItems}
              total={cartTotal}
              count={cartCount}
              bottomInset={insets.bottom}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                goToCheckout();
              }}
            />
          )}

        {overlayActive && (
          <Modal visible animationType="slide" transparent onRequestClose={close}>
            {renderSheet(view)}
          </Modal>
        )}
      </View>
    );
  }

  // ==========================================================================
  // BOTTOM-SHEET MODAL (in-app)
  // ==========================================================================
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      {renderSheet(view)}
    </Modal>
  );
}

// ============================================================================
// CATALOG VIEW
// ============================================================================

function CatalogView({
  products,
  categories,
  activeCategory,
  setActiveCategory,
  loading,
  onProductPress,
  onQuickAdd,
  asPage,
  myStack,
  myStackLoading,
  onBuyAllStack,
  isAuthenticated,
}: any) {
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={COLORS.red} size="large" />
      </View>
    );
  }

  const inMyStackMode = activeCategory === MY_STACK_KEY;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 140 }}>
      {/* Banner carousel (oculto en MI STACK para ganar foco) */}
      {!inMyStackMode && <BannerCarousel hideFirst={!asPage} />}

      {/* Categorías (MI STACK · TODO · ...) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 14 }}
      >
        <MyStackPill
          active={inMyStackMode}
          count={myStack?.products?.length || 0}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveCategory(inMyStackMode ? null : MY_STACK_KEY);
          }}
        />
        <CategoryPill
          label="TODO"
          active={!activeCategory}
          onPress={() => setActiveCategory(null)}
        />
        {categories.map((c: ShopCategory) => (
          <CategoryPill
            key={c.id}
            label={c.name.toUpperCase()}
            active={activeCategory === c.slug}
            onPress={() => setActiveCategory(c.slug)}
          />
        ))}
      </ScrollView>

      {/* Render según modo */}
      {inMyStackMode ? (
        <MyStackBody
          data={myStack}
          loading={myStackLoading}
          isAuthenticated={isAuthenticated}
          onProductPress={onProductPress}
          onQuickAdd={onQuickAdd}
          onBuyAll={onBuyAllStack}
        />
      ) : products.length === 0 ? (
        <View className="items-center justify-center py-20">
          <Package size={48} color={COLORS.zinc700} />
          <Text className="text-zinc-500 font-mono mt-4 text-sm">No hay productos disponibles</Text>
        </View>
      ) : (
        <View className="flex-row flex-wrap px-2">
          {products.map((p: ShopProduct) => (
            <ProductCard
              key={p.id}
              product={p}
              onPress={() => onProductPress(p)}
              onQuickAdd={() => onQuickAdd?.(p)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ============================================================================
// CATEGORY PILL — Premium fire-glow pill (matches landing aesthetic)
// ============================================================================
function CategoryPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  if (active) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <LinearGradient
          colors={['#DC2626', '#F97316']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 9,
            borderRadius: 12,
            shadowColor: '#DC2626',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 10,
            elevation: 6,
          }}
        >
          <Text className="text-white font-mono text-xs font-black tracking-widest">{label}</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="px-4 py-2 rounded-xl"
      style={{
        backgroundColor: 'rgba(15, 8, 8, 0.85)',
        borderWidth: 1,
        borderColor: 'rgba(220, 38, 38, 0.18)',
      }}
    >
      <Text className="text-zinc-300 font-mono text-xs font-bold tracking-widest">{label}</Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// MY STACK PILL — Botón especial a la izquierda de TODO. Color violeta para
// distinguirlo de las categorías regulares (rojo/naranja).
// ============================================================================
function MyStackPill({
  active,
  count,
  onPress,
}: {
  active: boolean;
  count: number;
  onPress: () => void;
}) {
  if (active) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <LinearGradient
          colors={['#A855F7', '#7C3AED']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 9,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            shadowColor: '#A855F7',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.7,
            shadowRadius: 10,
            elevation: 6,
          }}
        >
          <Layers size={12} color="#FFFFFF" strokeWidth={2.6} />
          <Text className="text-white font-mono text-xs font-black tracking-widest">MI STACK</Text>
          {count > 0 && (
            <View
              style={{
                backgroundColor: 'rgba(0,0,0,0.4)',
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: 6,
                minWidth: 20,
                alignItems: 'center',
              }}
            >
              <Text className="text-white font-mono text-[10px] font-black">{count}</Text>
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="px-4 py-2 rounded-xl flex-row items-center gap-1.5"
      style={{
        backgroundColor: 'rgba(15, 8, 18, 0.85)',
        borderWidth: 1,
        borderColor: 'rgba(168, 85, 247, 0.45)',
      }}
    >
      <Layers size={11} color="#A855F7" strokeWidth={2.4} />
      <Text className="text-purple-300 font-mono text-xs font-bold tracking-widest">MI STACK</Text>
      {count > 0 && (
        <Text className="text-purple-400 font-mono text-[10px] font-black ml-0.5">· {count}</Text>
      )}
    </TouchableOpacity>
  );
}

// ============================================================================
// MY STACK BODY — Render del filtro MI STACK con badges de estado y CTA bundle
// ============================================================================
type StackStatus = 'faltante' | 'activo' | 'reponer';

function getStackStatus(lastPaidAt: string | null | undefined): StackStatus {
  if (!lastPaidAt) return 'faltante';
  const days = (Date.now() - new Date(lastPaidAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days >= 25) return 'reponer';
  return 'activo';
}

function MyStackBody({
  data,
  loading,
  isAuthenticated,
  onProductPress,
  onQuickAdd,
  onBuyAll,
}: {
  data: MyStackData | null;
  loading: boolean;
  isAuthenticated: boolean;
  onProductPress: (p: ShopProduct) => void;
  onQuickAdd: (p: ShopProduct) => void;
  onBuyAll: () => void;
}) {
  if (!isAuthenticated) {
    return (
      <View className="items-center justify-center py-16 px-6">
        <Layers size={48} color={COLORS.zinc700} />
        <Text className="text-white font-bold text-base mt-4 text-center">
          Inicia sesión para ver MI STACK
        </Text>
        <Text className="text-zinc-500 font-mono text-xs mt-2 text-center leading-5">
          MI STACK muestra los productos de la tienda que vinculaste con los compuestos de tu plan.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="py-16 items-center">
        <ActivityIndicator color="#A855F7" />
      </View>
    );
  }

  if (!data || data.products.length === 0) {
    return (
      <View className="items-center justify-center py-16 px-6">
        <Layers size={48} color={COLORS.zinc700} />
        <Text className="text-white font-bold text-base mt-4 text-center">
          Tu Stack aún no tiene productos vinculados
        </Text>
        <Text className="text-zinc-500 font-mono text-xs mt-2 text-center leading-5">
          Ve a tu plan → Stack → Agregar Compuesto → "BUSCAR EN TIENDA" para vincular un producto.
        </Text>
      </View>
    );
  }

  const eligibleForBundle = data.products.length >= data.bundle.min;
  const discountPct = Math.round(data.bundle.discount * 100);

  return (
    <View>
      {/* Bundle CTA */}
      <View className="px-4 mb-2">
        <TouchableOpacity onPress={onBuyAll} activeOpacity={0.9}>
          <LinearGradient
            colors={eligibleForBundle ? ['#A855F7', '#DC2626'] : ['#27272a', '#18181b']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 16,
              paddingVertical: 14,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderWidth: 1.5,
              borderColor: eligibleForBundle
                ? 'rgba(220, 38, 38, 0.6)'
                : 'rgba(168, 85, 247, 0.35)',
              shadowColor: eligibleForBundle ? '#DC2626' : '#A855F7',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: eligibleForBundle ? 0.5 : 0.2,
              shadowRadius: 12,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: 'rgba(0,0,0,0.35)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={18} color="#FFFFFF" strokeWidth={2.4} />
            </View>
            <View className="flex-1">
              <Text className="text-white font-black text-sm tracking-widest">
                COMPRAR TODO MI STACK
              </Text>
              <Text className="text-white/85 font-mono text-[10px] mt-0.5 tracking-wider">
                {eligibleForBundle
                  ? `${data.products.length} productos · -${discountPct}% al pagar`
                  : `Necesitas ${data.bundle.min}+ productos para el descuento (-${discountPct}%)`}
              </Text>
            </View>
            <ChevronRight size={20} color="#FFFFFF" strokeWidth={3} />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Grid */}
      <View className="flex-row flex-wrap px-2">
        {data.products.map((p) => {
          const status = getStackStatus(data.purchases[p.id]?.last_paid_at);
          return (
            <MyStackProductCard
              key={p.id}
              product={p}
              status={status}
              onPress={() => onProductPress(p)}
              onQuickAdd={() => onQuickAdd(p)}
            />
          );
        })}
      </View>
    </View>
  );
}

// ============================================================================
// MY STACK PRODUCT CARD — Variante con badge de estado FALTANTE/ACTIVO/REPONER
// ============================================================================
const STATUS_THEME: Record<
  StackStatus,
  {
    color: string;
    bg: string;
    border: string;
    label: string;
    Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  }
> = {
  faltante: {
    color: '#DC2626',
    bg: 'rgba(220, 38, 38, 0.18)',
    border: 'rgba(220, 38, 38, 0.55)',
    label: 'FALTANTE',
    Icon: AlertCircle,
  },
  activo: {
    color: '#22C55E',
    bg: 'rgba(34, 197, 94, 0.15)',
    border: 'rgba(34, 197, 94, 0.5)',
    label: 'ACTIVO',
    Icon: Check,
  },
  reponer: {
    color: '#F97316',
    bg: 'rgba(249, 115, 22, 0.15)',
    border: 'rgba(249, 115, 22, 0.55)',
    label: 'POR REPONER',
    Icon: ClockIcon,
  },
};

function MyStackProductCard({
  product: p,
  status,
  onPress,
  onQuickAdd,
}: {
  product: ShopProduct;
  status: StackStatus;
  onPress: () => void;
  onQuickAdd: () => void;
}) {
  const theme = STATUS_THEME[status];
  const Icon = theme.Icon;
  const outOfStock = !p.stock_unlimited && !p.is_digital && p.stock === 0;
  const [added, setAdded] = useState(false);
  const handleQuickAdd = (e: any) => {
    e?.stopPropagation?.();
    if (outOfStock) return;
    onQuickAdd();
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <TouchableOpacity onPress={onPress} className="w-1/2 p-2" activeOpacity={0.85}>
      <View
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'rgba(15, 8, 8, 0.92)',
          borderWidth: 1.5,
          borderColor: theme.border,
          shadowColor: theme.color,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 14,
          elevation: 6,
        }}
      >
        <View style={{ width: '100%', height: CARD_IMG, backgroundColor: '#0a0505' }}>
          {p.thumbnail_url ? (
            <Image
              source={{ uri: p.thumbnail_url }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View className="w-full h-full items-center justify-center">
              <ShoppingBag size={36} color={COLORS.zinc700} />
            </View>
          )}

          <LinearGradient
            colors={['transparent', 'transparent', 'rgba(0, 0, 0, 0.55)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />

          <View
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: theme.bg,
              borderWidth: 1,
              borderColor: theme.border,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
            }}
          >
            <Icon size={10} color={theme.color} strokeWidth={2.4} />
            <Text
              className="font-mono text-[9px] font-black tracking-widest"
              style={{ color: theme.color }}
            >
              {theme.label}
            </Text>
          </View>

          {outOfStock && (
            <View className="absolute inset-0 items-center justify-center bg-black/60">
              <View
                className="px-3 py-1 rounded-md"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.85)',
                  borderWidth: 1,
                  borderColor: '#52525b',
                }}
              >
                <Text className="text-zinc-300 font-mono text-[10px] font-bold tracking-widest">
                  AGOTADO
                </Text>
              </View>
            </View>
          )}
        </View>

        <View className="p-3">
          <Text className="text-white font-bold text-sm" numberOfLines={2}>
            {p.name}
          </Text>
          <Text
            className="text-fire-orange font-black text-base mt-1.5"
            style={{
              textShadowColor: 'rgba(249, 115, 22, 0.6)',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 8,
            }}
          >
            S/ {Number(p.price).toFixed(2)}
          </Text>

          <TouchableOpacity
            onPress={handleQuickAdd}
            disabled={outOfStock}
            activeOpacity={0.85}
            className="mt-2.5"
            style={{ opacity: outOfStock ? 0.4 : 1 }}
          >
            <LinearGradient
              colors={
                added
                  ? ['#16A34A', '#22C55E']
                  : status === 'faltante'
                    ? ['#DC2626', '#F97316']
                    : ['#A855F7', '#7C3AED']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 8,
                borderRadius: 10,
              }}
            >
              {added ? (
                <>
                  <Check size={14} color="#FFFFFF" />
                  <Text className="text-white font-mono text-[11px] font-black tracking-widest">
                    AGREGADO
                  </Text>
                </>
              ) : (
                <>
                  <Plus size={14} color="#FFFFFF" />
                  <Text className="text-white font-mono text-[11px] font-black tracking-widest">
                    {outOfStock ? 'AGOTADO' : 'COMPRAR'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// PRODUCT CARD — Premium fire-glow card with savage hover-style border
// ============================================================================
function ProductCard({
  product: p,
  onPress,
  onQuickAdd,
}: {
  product: ShopProduct;
  onPress: () => void;
  onQuickAdd?: () => void;
}) {
  const outOfStock = !p.stock_unlimited && !p.is_digital && p.stock === 0;
  const lowStock = !p.stock_unlimited && !p.is_digital && p.stock <= 5 && p.stock > 0;
  const [added, setAdded] = useState(false);
  const handleQuickAdd = (e: any) => {
    e?.stopPropagation?.();
    if (outOfStock || !onQuickAdd) return;
    onQuickAdd();
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };
  const discount =
    p.compare_at_price && Number(p.compare_at_price) > Number(p.price)
      ? Math.round((1 - Number(p.price) / Number(p.compare_at_price)) * 100)
      : 0;

  return (
    <TouchableOpacity onPress={onPress} className="w-1/2 p-2" activeOpacity={0.85}>
      <View
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'rgba(15, 8, 8, 0.92)',
          borderWidth: 1.5,
          borderColor: 'rgba(220, 38, 38, 0.28)',
          shadowColor: '#DC2626',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 14,
          elevation: 6,
        }}
      >
        <View style={{ width: '100%', height: CARD_IMG, backgroundColor: '#0a0505' }}>
          {p.thumbnail_url ? (
            <Image
              source={{ uri: p.thumbnail_url }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View className="w-full h-full items-center justify-center">
              <ShoppingBag size={36} color={COLORS.zinc700} />
            </View>
          )}

          {/* Inner shimmer overlay (landing-grade) */}
          <LinearGradient
            colors={['transparent', 'transparent', 'rgba(0, 0, 0, 0.55)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />

          {discount > 0 && (
            <LinearGradient
              colors={['#DC2626', '#F97316']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.7,
                shadowRadius: 8,
              }}
            >
              <Text className="text-white font-mono text-[10px] font-black tracking-wider">
                -{discount}%
              </Text>
            </LinearGradient>
          )}

          {outOfStock && (
            <View className="absolute inset-0 items-center justify-center bg-black/60">
              <View
                className="px-3 py-1 rounded-md"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.85)',
                  borderWidth: 1,
                  borderColor: '#52525b',
                }}
              >
                <Text className="text-zinc-300 font-mono text-[10px] font-bold tracking-widest">
                  AGOTADO
                </Text>
              </View>
            </View>
          )}
        </View>

        <View className="p-3">
          <Text className="text-white font-bold text-sm" numberOfLines={2}>
            {p.name}
          </Text>
          <View className="flex-row items-center gap-2 mt-1.5">
            <Text
              className="text-fire-orange font-black text-base"
              style={{
                textShadowColor: 'rgba(249, 115, 22, 0.6)',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 8,
              }}
            >
              S/ {Number(p.price).toFixed(2)}
            </Text>
            {p.compare_at_price && Number(p.compare_at_price) > Number(p.price) && (
              <Text className="text-zinc-500 line-through text-xs font-mono">
                S/ {Number(p.compare_at_price).toFixed(2)}
              </Text>
            )}
          </View>
          {lowStock && (
            <Text className="text-fire-orange font-mono text-[10px] mt-1 font-bold">
              ¡Solo {p.stock} disponibles!
            </Text>
          )}

          {/* Quick add to cart */}
          <TouchableOpacity
            onPress={handleQuickAdd}
            disabled={outOfStock}
            activeOpacity={0.85}
            className="mt-2.5"
            style={{ opacity: outOfStock ? 0.4 : 1 }}
          >
            <LinearGradient
              colors={added ? ['#16A34A', '#22C55E'] : ['#DC2626', '#F97316']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 8,
                borderRadius: 10,
                shadowColor: added ? '#22C55E' : '#DC2626',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.55,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              {added ? (
                <>
                  <Check size={14} color="#FFFFFF" />
                  <Text className="text-white font-mono text-[11px] font-black tracking-widest">
                    AGREGADO
                  </Text>
                </>
              ) : (
                <>
                  <Plus size={14} color="#FFFFFF" />
                  <Text className="text-white font-mono text-[11px] font-black tracking-widest">
                    {outOfStock ? 'AGOTADO' : 'AGREGAR'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// CHECKOUT BAR — Floating bar fija en la parte inferior con miniaturas + total
// Aparece en vistas de listas/producto cuando hay items en el carrito.
// ============================================================================
function CheckoutBar({
  items,
  total,
  count,
  bottomInset,
  onPress,
}: {
  items: ShopCartItem[];
  total: number;
  count: number;
  bottomInset: number;
  onPress: () => void;
}) {
  // Tomar hasta 4 thumbnails distintos
  const thumbs = items
    .map((it) => it.product?.thumbnail_url || it.product?.images?.[0])
    .filter(Boolean)
    .slice(0, 4) as string[];
  const extra = Math.max(0, items.length - thumbs.length);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: (bottomInset || 0) + 12,
        backgroundColor: 'rgba(0,0,0,0.85)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(220,38,38,0.35)',
        zIndex: 50,
      }}
    >
      <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
        <LinearGradient
          colors={['#DC2626', '#F97316']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 16,
            paddingVertical: 10,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: '#DC2626',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.55,
            shadowRadius: 14,
            elevation: 8,
          }}
        >
          {/* Miniaturas apiladas */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginRight: 10,
            }}
          >
            {thumbs.map((uri, idx) => (
              <View
                key={`${uri}-${idx}`}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  overflow: 'hidden',
                  borderWidth: 2,
                  borderColor: '#0a0a0a',
                  backgroundColor: '#0a0a0a',
                  marginLeft: idx === 0 ? 0 : -10,
                }}
              >
                <Image
                  source={{ uri }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              </View>
            ))}
            {extra > 0 && (
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: '#0a0a0a',
                  backgroundColor: 'rgba(0,0,0,0.7)',
                  marginLeft: -10,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text className="text-white font-mono text-[10px] font-black">+{extra}</Text>
              </View>
            )}
            {thumbs.length === 0 && (
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShoppingCart size={18} color="#FFFFFF" />
              </View>
            )}
          </View>

          {/* Texto + total */}
          <View style={{ flex: 1 }}>
            <Text
              className="text-white font-mono text-[10px] tracking-widest"
              style={{ opacity: 0.9 }}
            >
              {count} {count === 1 ? 'PRODUCTO' : 'PRODUCTOS'}
            </Text>
            <Text
              className="text-white font-black text-base"
              style={{
                textShadowColor: 'rgba(0,0,0,0.4)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 4,
              }}
            >
              S/ {total.toFixed(2)}
            </Text>
          </View>

          {/* CTA */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: 'rgba(0,0,0,0.25)',
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
            }}
          >
            <Text className="text-white font-black text-sm tracking-wider">Realizar pedido</Text>
            <ChevronRight size={18} color="#FFFFFF" strokeWidth={3} />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// PRODUCT DETAIL
// ============================================================================
function ProductDetail({
  product,
  onAdd,
  isPro,
}: {
  product: ShopProduct;
  onAdd: (qty: number) => void;
  isPro?: boolean;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const outOfStock = !product.stock_unlimited && !product.is_digital && (product.stock || 0) === 0;
  const imageSize = Math.min(SCREEN_W, 720);

  return (
    <View className="flex-1">
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Carousel de imágenes */}
        <View style={{ width: '100%', height: imageSize, backgroundColor: '#18181b' }}>
          {product.images && product.images.length > 0 ? (
            <>
              <FlatList
                data={product.images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item, i) => `${item}-${i}`}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / imageSize);
                  setImageIndex(idx);
                }}
                renderItem={({ item }) => (
                  <Image
                    source={{ uri: item }}
                    style={{ width: imageSize, height: imageSize }}
                    contentFit="cover"
                    transition={150}
                  />
                )}
              />
              {/* Dots indicator */}
              {product.images.length > 1 && (
                <View className="absolute bottom-3 left-0 right-0 flex-row items-center justify-center gap-1.5">
                  {product.images.map((_, i) => (
                    <View
                      key={i}
                      style={{
                        width: i === imageIndex ? 20 : 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: i === imageIndex ? '#DC2626' : 'rgba(255,255,255,0.5)',
                      }}
                    />
                  ))}
                </View>
              )}
              {/* Counter */}
              {product.images.length > 1 && (
                <View className="absolute top-3 right-3 bg-black/60 px-2.5 py-1 rounded-full">
                  <Text className="text-white text-xs font-mono font-bold">
                    {imageIndex + 1}/{product.images.length}
                  </Text>
                </View>
              )}
            </>
          ) : product.thumbnail_url ? (
            <Image
              source={{ uri: product.thumbnail_url }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View className="w-full h-full items-center justify-center">
              <ShoppingBag size={64} color={COLORS.zinc700} />
            </View>
          )}
        </View>

        <View className="p-4">
          <Text className="text-white font-bold text-2xl">{product.name}</Text>

          <View className="flex-row items-center gap-2 mt-2">
            <Text className="text-green-500 font-bold text-2xl">
              S/ {Number(product.price).toFixed(2)}
            </Text>
            {product.compare_at_price && (
              <Text className="text-zinc-500 line-through font-mono">
                S/ {Number(product.compare_at_price).toFixed(2)}
              </Text>
            )}
          </View>

          {product.short_description && (
            <Text className="text-zinc-300 mt-3 leading-5">{product.short_description}</Text>
          )}
          {product.description && (
            <Text className="text-zinc-400 mt-3 leading-5">{product.description}</Text>
          )}

          {/* Info pills */}
          <View className="flex-row gap-2 mt-4 flex-wrap">
            {product.is_digital && (
              <View className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 flex-row items-center gap-1.5">
                <Package size={12} color={COLORS.green} />
                <Text className="text-white font-mono text-xs">Producto digital</Text>
              </View>
            )}
            {product.shipping_required &&
              (isPro ? (
                <View className="bg-yellow-500/15 border border-yellow-500/60 rounded-lg px-3 py-1.5 flex-row items-center gap-1.5">
                  <Crown size={12} color="#FACC15" fill="#FACC15" />
                  <Text className="text-yellow-300 font-mono text-xs font-bold">
                    Envío gratis ✓
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => router.push('/landing')}
                  activeOpacity={0.8}
                  className="bg-yellow-500/10 border border-yellow-500/40 rounded-lg px-3 py-1.5 flex-row items-center gap-1.5"
                >
                  <Crown size={12} color="#FACC15" fill="#FACC15" />
                  <Text className="text-yellow-300 font-mono text-xs font-bold">
                    Envío gratis con PRO
                  </Text>
                </TouchableOpacity>
              ))}
            {!product.stock_unlimited && !product.is_digital && (
              <View className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5">
                <Text className="text-white font-mono text-xs">Stock: {product.stock}</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <View className="absolute bottom-0 left-0 right-0 bg-black border-t border-zinc-900 px-4 py-3 flex-row items-center gap-3">
        {!outOfStock && (
          <View className="flex-row items-center bg-zinc-900 rounded-xl border border-zinc-800">
            <TouchableOpacity onPress={() => setQty(Math.max(1, qty - 1))} className="px-3 py-3">
              <Minus size={16} color={COLORS.white} />
            </TouchableOpacity>
            <Text className="text-white font-bold font-mono px-3">{qty}</Text>
            <TouchableOpacity onPress={() => setQty(qty + 1)} className="px-3 py-3">
              <Plus size={16} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity
          onPress={() => onAdd(qty)}
          disabled={outOfStock}
          className={`flex-1 py-4 rounded-xl items-center ${outOfStock ? 'bg-zinc-800' : 'bg-red-600'}`}
        >
          <Text className="text-white font-bold">
            {outOfStock ? 'AGOTADO' : `AGREGAR · S/ ${(Number(product.price) * qty).toFixed(2)}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// CART VIEW
// ============================================================================
function CartView({
  items,
  loading,
  subtotal,
  onUpdateQty,
  onRemove,
  onCheckout,
  onContinue,
}: any) {
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={COLORS.red} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <ShoppingCart size={64} color={COLORS.zinc700} />
        <Text className="text-white font-bold text-lg mt-4">Tu carrito está vacío</Text>
        <Text className="text-zinc-500 font-mono text-sm mt-2 text-center">
          Agrega productos para continuar
        </Text>
        <TouchableOpacity onPress={onContinue} className="mt-6 bg-red-600 rounded-xl px-6 py-3">
          <Text className="text-white font-bold">EXPLORAR TRENS SHOP</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingVertical: 12, paddingBottom: 120 }}
      >
        {items.map((it: ShopCartItem) => (
          <View
            key={it.id}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 mb-3 flex-row gap-3"
          >
            <View className="w-20 h-20 rounded-xl bg-zinc-800 overflow-hidden">
              {it.product?.thumbnail_url ? (
                <Image
                  source={{ uri: it.product.thumbnail_url }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              ) : (
                <View className="w-full h-full items-center justify-center">
                  <ShoppingBag size={28} color={COLORS.zinc700} />
                </View>
              )}
            </View>
            <View className="flex-1">
              <Text className="text-white font-bold" numberOfLines={2}>
                {it.product?.name}
              </Text>
              <Text className="text-red-500 font-bold mt-1">
                S/ {Number(it.product?.price || 0).toFixed(2)}
              </Text>
              <View className="flex-row items-center justify-between mt-2">
                <View className="flex-row items-center bg-zinc-800 rounded-lg">
                  <TouchableOpacity
                    onPress={() => onUpdateQty(it, it.quantity - 1)}
                    className="px-2 py-1"
                  >
                    <Minus size={14} color={COLORS.white} />
                  </TouchableOpacity>
                  <Text className="text-white font-mono px-2">{it.quantity}</Text>
                  <TouchableOpacity
                    onPress={() => onUpdateQty(it, it.quantity + 1)}
                    className="px-2 py-1"
                  >
                    <Plus size={14} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => onRemove(it)} className="p-2">
                  <Trash2 size={16} color={COLORS.red} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Bottom bar */}
      <View className="absolute bottom-0 left-0 right-0 bg-black border-t border-zinc-900 px-4 py-3">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-zinc-400 font-mono">SUBTOTAL</Text>
          <Text className="text-white font-bold text-xl">S/ {subtotal.toFixed(2)}</Text>
        </View>
        <TouchableOpacity onPress={onCheckout} className="bg-red-600 rounded-xl py-4 items-center">
          <Text className="text-white font-bold tracking-wider">PROCEDER AL PAGO</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// CHECKOUT VIEW
// ============================================================================
function CheckoutView({
  isGuest,
  form,
  setForm,
  requiresShipping,
  paymentMethod,
  setPaymentMethod,
  savedCards,
  selectedCardId,
  setSelectedCardId,
  subtotal,
  loading,
  onSubmit,
}: any) {
  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Método de pago */}
        <Text className="text-zinc-400 font-mono text-xs mt-3 mb-2">MÉTODO DE PAGO</Text>
        <View className="flex-row gap-2 mb-3">
          <TouchableOpacity
            onPress={() => setPaymentMethod('card')}
            className={`flex-1 p-3 rounded-xl border flex-row items-center gap-2 ${
              paymentMethod === 'card'
                ? 'border-red-600 bg-red-600/10'
                : 'border-zinc-800 bg-zinc-900'
            } ${isGuest ? 'opacity-60' : ''}`}
          >
            <CreditCard size={18} color={paymentMethod === 'card' ? COLORS.red : COLORS.white} />
            <View className="flex-1">
              <Text className="text-white font-bold text-sm">Tarjeta</Text>
              {isGuest && (
                <Text className="text-zinc-500 font-mono text-[9px]">requiere cuenta</Text>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPaymentMethod('whatsapp')}
            className={`flex-1 p-3 rounded-xl border flex-row items-center gap-2 ${
              paymentMethod === 'whatsapp'
                ? 'border-red-600 bg-red-600/10'
                : 'border-zinc-800 bg-zinc-900'
            }`}
          >
            <MessageCircle
              size={18}
              color={paymentMethod === 'whatsapp' ? COLORS.red : COLORS.white}
            />
            <Text className="text-white font-bold text-sm">WhatsApp</Text>
          </TouchableOpacity>
        </View>

        {paymentMethod === 'whatsapp' && (
          <View className="bg-green-600/10 border border-green-600/30 rounded-xl p-3 mb-3 flex-row gap-2">
            <AlertCircle size={16} color={COLORS.green} />
            <Text className="text-zinc-300 text-xs flex-1">
              Coordina el pago por Yape, Plin o transferencia directamente con TRENS por WhatsApp.
            </Text>
          </View>
        )}

        {/* Tarjetas guardadas */}
        {paymentMethod === 'card' && (
          <>
            <Text className="text-zinc-400 font-mono text-xs mb-2">TUS TARJETAS</Text>
            {savedCards.length === 0 ? (
              <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-3">
                <Text className="text-zinc-400 text-sm">
                  No tienes tarjetas guardadas. Agrega una desde tu perfil o suscríbete a TRENS PRO.
                </Text>
              </View>
            ) : (
              savedCards.map((c: SavedCard) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setSelectedCardId(c.id)}
                  className={`p-3 rounded-xl border mb-2 flex-row items-center justify-between ${
                    selectedCardId === c.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-zinc-800 bg-zinc-900'
                  }`}
                >
                  <View className="flex-row items-center gap-3">
                    <CreditCard
                      size={20}
                      color={selectedCardId === c.id ? '#3B82F6' : COLORS.white}
                    />
                    <View>
                      <Text className="text-white font-bold">
                        {c.brand?.toUpperCase()} ••••{c.last4}
                      </Text>
                      {c.is_default && (
                        <Text className="text-zinc-500 font-mono text-[10px]">Predeterminada</Text>
                      )}
                    </View>
                  </View>
                  {selectedCardId === c.id && <Check size={18} color="#3B82F6" />}
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {/* Datos */}
        <Text className="text-zinc-400 font-mono text-xs mt-3 mb-2">DATOS DE CONTACTO</Text>
        <Input
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="Nombre completo"
        />
        <Input
          value={form.email}
          onChange={(v) => setForm({ ...form, email: v })}
          placeholder="Email"
          keyboardType="email-address"
        />
        <Input
          value={form.phone}
          onChange={(v) => setForm({ ...form, phone: v })}
          placeholder="Teléfono (WhatsApp)"
          keyboardType="phone-pad"
        />

        {requiresShipping && (
          <>
            <Text className="text-zinc-400 font-mono text-xs mt-3 mb-2">DIRECCIÓN DE ENVÍO</Text>
            <Input
              value={form.street}
              onChange={(v) => setForm({ ...form, street: v })}
              placeholder="Dirección (calle, número)"
            />
            <Input
              value={form.district}
              onChange={(v) => setForm({ ...form, district: v })}
              placeholder="Distrito"
            />
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Input
                  value={form.city}
                  onChange={(v) => setForm({ ...form, city: v })}
                  placeholder="Ciudad"
                />
              </View>
              <View className="flex-1">
                <Input
                  value={form.region}
                  onChange={(v) => setForm({ ...form, region: v })}
                  placeholder="Región"
                />
              </View>
            </View>
            <Input
              value={form.reference}
              onChange={(v) => setForm({ ...form, reference: v })}
              placeholder="Referencia (opcional)"
            />
          </>
        )}

        <Text className="text-zinc-400 font-mono text-xs mt-3 mb-2">NOTAS (OPCIONAL)</Text>
        <Input
          value={form.notes}
          onChange={(v) => setForm({ ...form, notes: v })}
          placeholder="Indicaciones especiales"
          multiline
        />
      </ScrollView>

      {/* Submit */}
      <View className="absolute bottom-0 left-0 right-0 bg-black border-t border-zinc-900 px-4 py-3">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-zinc-400 font-mono">TOTAL</Text>
          <Text className="text-white font-bold text-xl">S/ {subtotal.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          onPress={onSubmit}
          disabled={loading}
          className={`rounded-xl py-4 items-center ${loading ? 'bg-zinc-800' : 'bg-red-600'}`}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text className="text-white font-bold tracking-wider">
              {paymentMethod === 'card' ? 'PAGAR CON TARJETA' : 'CONTINUAR EN WHATSAPP'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// SUCCESS VIEW
// ============================================================================
function SuccessView({ order, whatsappUrl, onClose }: any) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <View className="w-20 h-20 rounded-full bg-green-600/20 items-center justify-center mb-4">
        <Check size={40} color={COLORS.green} />
      </View>
      <Text className="text-white font-bold text-2xl">¡Pedido confirmado!</Text>
      <Text className="text-zinc-500 font-mono mt-2">{order.order_number}</Text>
      <Text className="text-zinc-300 text-center mt-4 leading-5">
        {whatsappUrl
          ? 'Te redirigiremos a WhatsApp para coordinar el pago. Tu pedido queda reservado.'
          : 'Tu pago se procesó correctamente. Te enviaremos los detalles por email.'}
      </Text>

      {whatsappUrl && (
        <TouchableOpacity
          onPress={() => Linking.openURL(whatsappUrl)}
          className="mt-6 bg-green-600 rounded-xl py-4 px-8 flex-row items-center gap-2"
        >
          <MessageCircle size={20} color={COLORS.white} />
          <Text className="text-white font-bold tracking-wider">ABRIR WHATSAPP</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={onClose} className="mt-4 px-8 py-3">
        <Text className="text-zinc-400 font-mono">CERRAR</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// HELPERS
// ============================================================================
function Input({
  value,
  onChange,
  placeholder,
  keyboardType,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboardType?: any;
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={COLORS.zinc500}
      keyboardType={keyboardType}
      multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
      className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 text-white mb-2"
      style={{ textAlignVertical: multiline ? 'top' : 'center' }}
    />
  );
}
