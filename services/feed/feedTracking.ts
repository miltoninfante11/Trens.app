/**
 * ==========================================================================
 * FEED TRACKING SERVICE — TikTok-Style Behavioral Analytics
 * ==========================================================================
 *
 * Tracks all user interactions with feed content and sends them to Supabase
 * in efficient batches. This data powers the personalized feed algorithm.
 *
 * Signals tracked:
 *   - view:   user watched a video (with duration + completion rate)
 *   - skip:   user swiped away in < 2 seconds
 *   - replay: user watched past 100% (looped)
 *   - like:   explicit like
 *   - save:   explicit save (highest intent)
 *   - share:  explicit share
 *
 * Architecture:
 *   - In-memory queue with debounced batch flush
 *   - Session ID for grouping interactions in one browsing session
 *   - Automatic flush on app background / feed exit
 *   - Deduplication: only one 'view' per video per session
 */

import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

// ============================================================================
// TYPES
// ============================================================================

export type FeedInteractionType =
  | 'view'
  | 'like'
  | 'save'
  | 'share'
  | 'skip'
  | 'replay'
  | 'unlike'
  | 'unsave';

export interface FeedInteraction {
  video_id: string;
  source: 'pro_video' | 'instagram_reel';
  interaction_type: FeedInteractionType;
  watch_duration_ms: number;
  video_duration_ms: number;
  completion_rate: number;
  session_id: string;
}

interface WatchSession {
  videoId: string;
  source: 'pro_video' | 'instagram_reel';
  startedAt: number; // timestamp ms
  videoDurationMs: number; // total video duration
  totalWatchMs: number; // accumulated watch time (handles pause/resume)
  isPlaying: boolean;
  lastPlayTimestamp: number; // last time play started (for pause delta)
  hasLoggedView: boolean; // only log one 'view' per video per session
  hasLoggedReplay: boolean; // only log one 'replay' per loop cycle
  loopCount: number; // how many times the video looped
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BATCH_SIZE = 10; // Max items per batch flush
const FLUSH_INTERVAL_MS = 15_000; // Auto-flush every 15 seconds
const SKIP_THRESHOLD_MS = 2_000; // < 2 seconds = skip
const MIN_VIEW_DURATION_MS = 3_000; // Minimum to count as a "view"

// ============================================================================
// SINGLETON SERVICE
// ============================================================================

class FeedTrackingService {
  private static instance: FeedTrackingService;

  private queue: FeedInteraction[] = [];
  private activeWatches: Map<string, WatchSession> = new Map();
  private sessionId: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.startAutoFlush();
  }

  static getInstance(): FeedTrackingService {
    if (!FeedTrackingService.instance) {
      FeedTrackingService.instance = new FeedTrackingService();
    }
    return FeedTrackingService.instance;
  }

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  private generateSessionId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    return `${ts}_${rand}`;
  }

  /** Start a new session (e.g., when user opens the feed tab) */
  newSession(): void {
    this.sessionId = this.generateSessionId();
    this.activeWatches.clear();
  }

  /** Get current session ID */
  getSessionId(): string {
    return this.sessionId;
  }

  // ==========================================================================
  // WATCH LIFECYCLE: Video enters/exits viewport
  // ==========================================================================

  /**
   * Called when a video enters the viewport (becomes active).
   * Starts the watch timer.
   */
  onVideoVisible(
    videoId: string,
    source: 'pro_video' | 'instagram_reel',
    videoDurationMs: number
  ): void {
    const existing = this.activeWatches.get(videoId);
    if (existing) {
      // Video re-entered viewport (e.g., scroll back)
      // Resume tracking but keep accumulated time
      existing.isPlaying = true;
      existing.lastPlayTimestamp = Date.now();
      return;
    }

    this.activeWatches.set(videoId, {
      videoId,
      source,
      startedAt: Date.now(),
      videoDurationMs: videoDurationMs || 0,
      totalWatchMs: 0,
      isPlaying: true,
      lastPlayTimestamp: Date.now(),
      hasLoggedView: false,
      hasLoggedReplay: false,
      loopCount: 0,
    });
  }

  /**
   * Called when a video leaves the viewport (user scrolled away).
   * Finalizes the watch session and enqueues the interaction.
   */
  onVideoHidden(videoId: string): void {
    const session = this.activeWatches.get(videoId);
    if (!session) return;

    // Accumulate any remaining play time
    if (session.isPlaying) {
      session.totalWatchMs += Date.now() - session.lastPlayTimestamp;
      session.isPlaying = false;
    }

    const watchMs = session.totalWatchMs;
    const durationMs = session.videoDurationMs || 1;
    const completionRate = durationMs > 0 ? watchMs / durationMs : 0;

    // Determine interaction type
    if (watchMs < SKIP_THRESHOLD_MS && !session.hasLoggedView) {
      // SKIP: User swiped away very quickly
      this.enqueue({
        video_id: videoId,
        source: session.source,
        interaction_type: 'skip',
        watch_duration_ms: watchMs,
        video_duration_ms: durationMs,
        completion_rate: completionRate,
        session_id: this.sessionId,
      });
    } else if (watchMs >= MIN_VIEW_DURATION_MS && !session.hasLoggedView) {
      // VIEW: User watched enough to count
      this.enqueue({
        video_id: videoId,
        source: session.source,
        interaction_type: 'view',
        watch_duration_ms: watchMs,
        video_duration_ms: durationMs,
        completion_rate: completionRate,
        session_id: this.sessionId,
      });
      session.hasLoggedView = true;
    }

    // Remove from active watches
    this.activeWatches.delete(videoId);
  }

  /**
   * Called when video is manually paused by user.
   * Accumulates watch time but keeps session alive.
   */
  onVideoPaused(videoId: string): void {
    const session = this.activeWatches.get(videoId);
    if (!session || !session.isPlaying) return;

    session.totalWatchMs += Date.now() - session.lastPlayTimestamp;
    session.isPlaying = false;
  }

  /**
   * Called when video resumes playing.
   */
  onVideoResumed(videoId: string): void {
    const session = this.activeWatches.get(videoId);
    if (!session || session.isPlaying) return;

    session.isPlaying = true;
    session.lastPlayTimestamp = Date.now();
  }

  /**
   * Called when video loops (plays to end and restarts).
   * This is a STRONG positive signal.
   */
  onVideoLooped(videoId: string): void {
    const session = this.activeWatches.get(videoId);
    if (!session) return;

    session.loopCount++;

    // Log the initial view if not done yet
    if (!session.hasLoggedView) {
      const durationMs = session.videoDurationMs || 1;
      this.enqueue({
        video_id: videoId,
        source: session.source,
        interaction_type: 'view',
        watch_duration_ms: durationMs,
        video_duration_ms: durationMs,
        completion_rate: 1.0,
        session_id: this.sessionId,
      });
      session.hasLoggedView = true;
    }

    // Log replay (only once per video per session to avoid spam)
    if (!session.hasLoggedReplay && session.loopCount >= 1) {
      this.enqueue({
        video_id: videoId,
        source: session.source,
        interaction_type: 'replay',
        watch_duration_ms:
          session.totalWatchMs + (session.isPlaying ? Date.now() - session.lastPlayTimestamp : 0),
        video_duration_ms: session.videoDurationMs || 1,
        completion_rate: session.loopCount + 1, // > 1.0 means looped
        session_id: this.sessionId,
      });
      session.hasLoggedReplay = true;
    }
  }

  // ==========================================================================
  // EXPLICIT INTERACTIONS
  // ==========================================================================

  /** User liked a video */
  trackLike(videoId: string, source: 'pro_video' | 'instagram_reel'): void {
    this.enqueue({
      video_id: videoId,
      source,
      interaction_type: 'like',
      watch_duration_ms: 0,
      video_duration_ms: 0,
      completion_rate: 0,
      session_id: this.sessionId,
    });
  }

  /** User unliked a video */
  trackUnlike(videoId: string, source: 'pro_video' | 'instagram_reel'): void {
    this.enqueue({
      video_id: videoId,
      source,
      interaction_type: 'unlike',
      watch_duration_ms: 0,
      video_duration_ms: 0,
      completion_rate: 0,
      session_id: this.sessionId,
    });
  }

  /** User saved a video */
  trackSave(videoId: string, source: 'pro_video' | 'instagram_reel'): void {
    this.enqueue({
      video_id: videoId,
      source,
      interaction_type: 'save',
      watch_duration_ms: 0,
      video_duration_ms: 0,
      completion_rate: 0,
      session_id: this.sessionId,
    });
  }

  /** User unsaved a video */
  trackUnsave(videoId: string, source: 'pro_video' | 'instagram_reel'): void {
    this.enqueue({
      video_id: videoId,
      source,
      interaction_type: 'unsave',
      watch_duration_ms: 0,
      video_duration_ms: 0,
      completion_rate: 0,
      session_id: this.sessionId,
    });
  }

  /** User shared a video */
  trackShare(videoId: string, source: 'pro_video' | 'instagram_reel'): void {
    this.enqueue({
      video_id: videoId,
      source,
      interaction_type: 'share',
      watch_duration_ms: 0,
      video_duration_ms: 0,
      completion_rate: 0,
      session_id: this.sessionId,
    });
  }

  // ==========================================================================
  // QUEUE & BATCH FLUSH
  // ==========================================================================

  private enqueue(interaction: FeedInteraction): void {
    this.queue.push(interaction);

    // Auto-flush if queue is full
    if (this.queue.length >= BATCH_SIZE) {
      this.flush();
    }
  }

  private startAutoFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, FLUSH_INTERVAL_MS);
  }

  /**
   * Flush all pending interactions to Supabase via RPC.
   * Called automatically on batch full, timer, or feed exit.
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) return;

    this.isFlushing = true;
    const batch = this.queue.splice(0, BATCH_SIZE);

    try {
      const { error } = await supabase.rpc('log_feed_interactions', {
        p_interactions: batch,
      });

      if (error) {
        logger.error('[FeedTracking] Flush error:', error);
        // Put items back at the front of the queue for retry
        this.queue.unshift(...batch);
      } else {
        logger.info(`[FeedTracking] Flushed ${batch.length} interactions`);
      }
    } catch (err) {
      logger.error('[FeedTracking] Flush exception:', err);
      // Put items back for retry
      this.queue.unshift(...batch);
    } finally {
      this.isFlushing = false;

      // If there are still items in the queue, flush again
      if (this.queue.length >= BATCH_SIZE) {
        this.flush();
      }
    }
  }

  /**
   * Force-flush all pending interactions + finalize all active watches.
   * Call this when the feed tab loses focus or the app goes to background.
   */
  async flushAll(): Promise<void> {
    // Finalize all active watches
    const activeIds = Array.from(this.activeWatches.keys());
    for (const videoId of activeIds) {
      this.onVideoHidden(videoId);
    }

    // Flush remaining queue
    while (this.queue.length > 0) {
      await this.flush();
    }
  }

  /**
   * Destroy the service (cleanup timers).
   * Usually not needed since it's a singleton.
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushAll();
  }

  // ==========================================================================
  // DEBUG / ANALYTICS
  // ==========================================================================

  /** Get queue size (for debugging) */
  getQueueSize(): number {
    return this.queue.length;
  }

  /** Get active watch count */
  getActiveWatchCount(): number {
    return this.activeWatches.size;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

const feedTracking = FeedTrackingService.getInstance();
export default feedTracking;
