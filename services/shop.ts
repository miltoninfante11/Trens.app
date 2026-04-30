// ============================================================================
// SHOP SERVICE - Cliente para la tienda TRENS
// ============================================================================

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface ShopCategory {
  id: string;
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  sort_order: number;
  is_active: boolean;
}

export interface ShopProduct {
  id: string;
  slug: string;
  name: string;
  description?: string;
  short_description?: string;
  price: number;
  compare_at_price?: number;
  /** Costo de adquisición/producción. Solo visible para admins (filtrado en endpoints públicos). */
  cost_price?: number;
  is_digital: boolean;
  stock: number;
  stock_unlimited: boolean;
  images: string[];
  thumbnail_url?: string;
  category_id?: string;
  tags?: string[];
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  digital_payload?: any;
  weight_grams?: number;
  shipping_required: boolean;
  metadata?: Record<string, any>;
  category?: { slug: string; name: string; icon?: string };
  created_at: string;
  updated_at: string;
}

export interface ShopCartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  product?: ShopProduct;
}

export interface ShopOrderItem {
  id: string;
  order_id: string;
  product_id?: string;
  product_name: string;
  product_slug?: string;
  thumbnail_url?: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  is_digital: boolean;
  digital_payload?: any;
}

export interface ShippingAddress {
  street: string;
  district: string;
  city: string;
  region: string;
  reference?: string;
  postal_code?: string;
}

export interface ShopOrder {
  id: string;
  order_number: string;
  user_id?: string;
  email: string;
  full_name: string;
  phone?: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  currency: string;
  payment_method: 'card' | 'whatsapp';
  status: 'pending' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  openpay_charge_id?: string;
  card_last4?: string;
  card_brand?: string;
  shipping_required: boolean;
  shipping_address?: ShippingAddress;
  tracking_code?: string;
  shipping_carrier?: string;
  customer_notes?: string;
  admin_notes?: string;
  paid_at?: string;
  shipped_at?: string;
  delivered_at?: string;
  cancelled_at?: string;
  created_at: string;
  items?: ShopOrderItem[];
}

// ============================================================================
// PUBLIC API
// ============================================================================

async function call(action: string, body: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke('shop', {
    body: { action, ...body },
  });
  if (error) {
    // Intentar extraer el body JSON real del Response (FunctionsHttpError)
    let realMsg = error.message;
    if ((error as any)?.context && typeof (error as any).context.json === 'function') {
      try {
        const errBody = await (error as any).context.json();
        if (errBody?.error) realMsg = errBody.error;
        else if (errBody?.message) realMsg = errBody.message;
      } catch {}
    }
    throw new Error(realMsg);
  }
  if (!data?.success) throw new Error(data?.error || 'Error en tienda');
  return data;
}

export const shop = {
  // Catálogo
  async listCategories(): Promise<ShopCategory[]> {
    const r = await call('list-categories');
    return r.categories;
  },

  async listProducts(opts?: {
    categorySlug?: string;
    featured?: boolean;
    limit?: number;
  }): Promise<ShopProduct[]> {
    const r = await call('list-products', opts || {});
    return r.products;
  },

  async getProduct(slug: string): Promise<ShopProduct> {
    const r = await call('get-product', { slug });
    return r.product;
  },

  // Carrito
  async getCart(): Promise<{ cart: any; items: ShopCartItem[] }> {
    const r = await call('cart-get');
    return { cart: r.cart, items: r.items };
  },

  async addToCart(productId: string, quantity = 1): Promise<void> {
    await call('cart-add', { productId, quantity });
  },

  async updateCartItem(itemId: string, quantity: number): Promise<void> {
    await call('cart-update', { itemId, quantity });
  },

  async removeCartItem(itemId: string): Promise<void> {
    await call('cart-remove', { itemId });
  },

  async clearCart(): Promise<void> {
    await call('cart-clear');
  },

  // Checkout
  async checkoutWithCard(params: {
    cardId?: string;
    tokenId?: string;
    customer: { name: string; email: string; phone?: string };
    shippingAddress?: ShippingAddress;
    customerNotes?: string;
    deviceSessionId?: string;
    saveCard?: boolean;
  }): Promise<{ order: any }> {
    const r = await call('checkout-card', params);
    return { order: r.order };
  },

  async checkoutWhatsApp(params: {
    customer: { name: string; email: string; phone: string };
    shippingAddress?: ShippingAddress;
    customerNotes?: string;
    items?: { productId: string; quantity: number }[]; // para guest
  }): Promise<{ order: any; whatsappUrl: string }> {
    const r = await call('checkout-whatsapp', params);
    return { order: r.order, whatsappUrl: r.whatsappUrl };
  },

  // Mis órdenes
  async myOrders(): Promise<ShopOrder[]> {
    const r = await call('my-orders');
    return r.orders;
  },
};

// ============================================================================
// ADMIN API
// ============================================================================

export const shopAdmin = {
  async listAllProducts(): Promise<ShopProduct[]> {
    const r = await call('admin-list-products-all');
    return r.products;
  },

  async createProduct(product: Partial<ShopProduct>): Promise<ShopProduct> {
    const r = await call('admin-product-create', { product });
    return r.product;
  },

  async updateProduct(id: string, updates: Partial<ShopProduct>): Promise<ShopProduct> {
    const r = await call('admin-product-update', { id, updates });
    return r.product;
  },

  async deleteProduct(id: string): Promise<void> {
    await call('admin-product-delete', { id });
  },

  async createCategory(category: Partial<ShopCategory>): Promise<ShopCategory> {
    const r = await call('admin-category-create', { category });
    return r.category;
  },

  async updateCategory(id: string, updates: Partial<ShopCategory>): Promise<ShopCategory> {
    const r = await call('admin-category-update', { id, updates });
    return r.category;
  },

  async deleteCategory(id: string): Promise<void> {
    await call('admin-category-delete', { id });
  },

  async listOrders(opts?: {
    status?: string;
    search?: string;
    limit?: number;
  }): Promise<ShopOrder[]> {
    const r = await call('admin-list-orders', opts || {});
    return r.orders;
  },

  async updateOrder(orderId: string, updates: Partial<ShopOrder>): Promise<void> {
    await call('admin-update-order', { orderId, updates });
  },

  async refundOrder(orderId: string): Promise<void> {
    await call('admin-refund-order', { orderId });
  },
};

export default shop;
