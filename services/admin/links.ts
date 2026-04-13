// ============================================================================
// ADMIN SHORT LINKS SERVICE
// CRUD para enlaces cortos y subdominios
// ============================================================================

import { supabase } from '../../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================
export interface ShortLink {
  id: string;
  slug: string;
  destination_url: string;
  link_type: 'path' | 'subdomain';
  label: string | null;
  is_active: boolean;
  clicks: number;
  created_at: string;
  updated_at: string;
}

export interface CreateShortLinkInput {
  slug: string;
  destination_url: string;
  link_type: 'path' | 'subdomain';
  label?: string;
}

export interface UpdateShortLinkInput {
  slug?: string;
  destination_url?: string;
  link_type?: 'path' | 'subdomain';
  label?: string;
  is_active?: boolean;
}

// Slugs reservados que son rutas de la app
const RESERVED_SLUGS = [
  'app',
  'adn',
  'gym',
  'pro',
  'feed',
  'plan',
  'admin',
  'profile',
  'terms',
  'privacy',
  'contact',
  'pago-exitoso',
  'spotify-callback',
  'instagram-callback',
  'android',
  'ios',
];

// ============================================================================
// SERVICE
// ============================================================================
const adminLinks = {
  /**
   * Obtener todos los enlaces
   */
  async getAll(): Promise<ShortLink[]> {
    const { data, error } = await supabase
      .from('short_links')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Error fetching links: ${error.message}`);
    return data || [];
  },

  /**
   * Crear un nuevo enlace
   */
  async create(input: CreateShortLinkInput): Promise<ShortLink> {
    // Validar slug
    const normalizedSlug = input.slug.toLowerCase().trim();

    if (RESERVED_SLUGS.includes(normalizedSlug)) {
      throw new Error(`El slug "${normalizedSlug}" está reservado y no se puede usar`);
    }

    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(normalizedSlug)) {
      throw new Error('El slug solo puede contener letras minúsculas, números y guiones');
    }

    // Validar URL destino
    try {
      new URL(input.destination_url);
    } catch {
      throw new Error('La URL de destino no es válida');
    }

    const { data, error } = await supabase
      .from('short_links')
      .insert({
        slug: normalizedSlug,
        destination_url: input.destination_url,
        link_type: input.link_type,
        label: input.label || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`El slug "${normalizedSlug}" ya existe`);
      }
      throw new Error(`Error creating link: ${error.message}`);
    }

    return data;
  },

  /**
   * Actualizar un enlace
   */
  async update(id: string, input: UpdateShortLinkInput): Promise<ShortLink> {
    if (input.slug) {
      const normalizedSlug = input.slug.toLowerCase().trim();
      if (RESERVED_SLUGS.includes(normalizedSlug)) {
        throw new Error(`El slug "${normalizedSlug}" está reservado`);
      }
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(normalizedSlug)) {
        throw new Error('El slug solo puede contener letras minúsculas, números y guiones');
      }
      input.slug = normalizedSlug;
    }

    if (input.destination_url) {
      try {
        new URL(input.destination_url);
      } catch {
        throw new Error('La URL de destino no es válida');
      }
    }

    const { data, error } = await supabase
      .from('short_links')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`El slug "${input.slug}" ya existe`);
      }
      throw new Error(`Error updating link: ${error.message}`);
    }

    return data;
  },

  /**
   * Eliminar un enlace
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('short_links').delete().eq('id', id);

    if (error) throw new Error(`Error deleting link: ${error.message}`);
  },

  /**
   * Resetear contador de clicks
   */
  async resetClicks(id: string): Promise<void> {
    const { error } = await supabase.from('short_links').update({ clicks: 0 }).eq('id', id);

    if (error) throw new Error(`Error resetting clicks: ${error.message}`);
  },

  /**
   * Obtener estadísticas generales
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    totalClicks: number;
    paths: number;
    subdomains: number;
  }> {
    const { data, error } = await supabase
      .from('short_links')
      .select('is_active, clicks, link_type');

    if (error) throw new Error(`Error fetching stats: ${error.message}`);

    const links = data || [];
    return {
      total: links.length,
      active: links.filter((l) => l.is_active).length,
      totalClicks: links.reduce((sum, l) => sum + l.clicks, 0),
      paths: links.filter((l) => l.link_type === 'path').length,
      subdomains: links.filter((l) => l.link_type === 'subdomain').length,
    };
  },
};

export default adminLinks;
