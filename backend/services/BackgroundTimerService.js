import { getDatabase } from '../config/database.js';
import { logError, logSessionEvent } from '../config/logger.js';

/**
 * BackgroundTimerService - Manages persistent session timers
 * 
 * This service runs independently of client connections and ensures:
 * - Session timers continue running even when desktop/web apps are closed
 * - Automatic session termination when credits are insufficient
 * - Real-time timer updates in the database
 * - Proper cleanup on session completion
 */
class BackgroundTimerService {
  constructor() {
    this.activeTimers = new Map(); // sessionId -> timerData
    this.timerInterval = null;
    this.isRunning = false;
    this.pool = null;
  }

  /**
   * Initialize the background timer service
   */
  async initialize() {
    try {
      this.pool = getDatabase();
      
      // Load all active sessions from database on startup
      await this.loadActiveSessions();
      
      // Start the main timer loop (runs every 30 seconds)
      this.startTimerLoop();
      
      console.log('🕒 Background Timer Service initialized successfully');
      console.log(`📊 Managing ${this.activeTimers.size} active session timers`);
      
    } catch (error) {
      logError(error, { service: 'BackgroundTimerService', method: 'initialize' });
      throw new Error('Failed to initialize BackgroundTimerService');
    }
  }

  /**
   * Load all active sessions from database and start their timers
   */
  async loadActiveSessions() {
    try {
      const query = `
        SELECT s.id, s.user_id, s.started_at, s.total_duration_minutes, 
               s.estimated_duration_minutes, s.job_title, u.credits
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.status = 'active' AND s.started_at IS NOT NULL
      `;
      
      const result = await this.pool.query(query);
      
      for (const session of result.rows) {
        const now = new Date();
        const startTime = new Date(session.started_at);
        const elapsedSeconds = Math.floor((now - startTime) / 1000);
        
        // Add session to active timers
        this.activeTimers.set(session.id, {
          sessionId: session.id,
          userId: session.user_id,
          startTime: startTime,
          elapsedSeconds: elapsedSeconds,
          lastUpdateMinute: Math.floor(elapsedSeconds / 60),
          estimatedDurationMinutes: session.estimated_duration_minutes || 60,
          jobTitle: session.job_title,
          userCredits: session.credits,
          lastCreditCheck: now,
        });
        
        console.log(`⏱️  Loaded active session timer: ${session.id} (${Math.floor(elapsedSeconds / 60)}m elapsed)`);
      }
    } catch (error) {
      logError(error, { service: 'BackgroundTimerService', method: 'loadActiveSessions' });
    }
  }

  /**
   * Start a timer for a new session
   */
  startSessionTimer(sessionId, userId, startTime = new Date(), estimatedDuration = 60, jobTitle = '', userCredits = 0) {
    if (this.activeTimers.has(sessionId)) {
      console.log(`⚠️  Timer already exists for session: ${sessionId}`);
      return;
    }

    const timerData = {
      sessionId,
      userId,
      startTime,
      elapsedSeconds: 0,
      lastUpdateMinute: 0,
      estimatedDurationMinutes: estimatedDuration,
      jobTitle,
      userCredits,
      lastCreditCheck: new Date(),
    };

    this.activeTimers.set(sessionId, timerData);
    
    console.log(`🟢 Started background timer for session: ${sessionId}`);
    
    logSessionEvent('BACKGROUND_TIMER_STARTED', sessionId, userId, {
      startTime: startTime,
      estimatedDuration: estimatedDuration,
    });
  }

  /**
   * Stop a timer for a session
   */
  stopSessionTimer(sessionId, reason = 'Manual stop') {
    const timerData = this.activeTimers.get(sessionId);
    if (!timerData) {
      console.log(`⚠️  No active timer found for session: ${sessionId}`);
      return null;
    }

    const elapsedMinutes = Math.floor(timerData.elapsedSeconds / 60);
    this.activeTimers.delete(sessionId);
    
    console.log(`🔴 Stopped background timer for session: ${sessionId} (${elapsedMinutes}m elapsed, reason: ${reason})`);
    
    logSessionEvent('BACKGROUND_TIMER_STOPPED', sessionId, timerData.userId, {
      elapsedMinutes: elapsedMinutes,
      elapsedSeconds: timerData.elapsedSeconds,
      reason: reason,
    });

    return {
      elapsedSeconds: timerData.elapsedSeconds,
      elapsedMinutes: elapsedMinutes,
    };
  }

  /**
   * Get current timer status for a session
   */
  getSessionTimer(sessionId) {
    const timerData = this.activeTimers.get(sessionId);
    if (!timerData) {
      return null;
    }

    const now = new Date();
    const totalElapsedSeconds = Math.floor((now - timerData.startTime) / 1000);
    const elapsedMinutes = Math.floor(totalElapsedSeconds / 60);

    return {
      sessionId: timerData.sessionId,
      isActive: true,
      startTime: timerData.startTime,
      elapsedSeconds: totalElapsedSeconds,
      elapsedMinutes: elapsedMinutes,
      estimatedDurationMinutes: timerData.estimatedDurationMinutes,
      jobTitle: timerData.jobTitle,
      userCredits: timerData.userCredits,
    };
  }

  /**
   * Get all active session timers
   */
  getAllActiveTimers() {
    const timers = [];
    for (const [sessionId, timerData] of this.activeTimers) {
      timers.push(this.getSessionTimer(sessionId));
    }
    return timers;
  }

  /**
   * Main timer loop - runs every 30 seconds
   */
  startTimerLoop() {
    if (this.isRunning) {
      console.log('⚠️  Timer loop already running');
      return;
    }

    this.isRunning = true;
    console.log('🔄 Starting background timer loop (30s intervals)');

    this.timerInterval = setInterval(async () => {
      await this.processActiveTimers();
    }, 30000); // 30 seconds

    // Also run immediately
    setTimeout(() => this.processActiveTimers(), 1000);
  }

  /**
   * Stop the timer loop
   */
  stopTimerLoop() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Background timer loop stopped');
  }

  /**
   * Process all active timers - main background logic
   */
  async processActiveTimers() {
    if (this.activeTimers.size === 0) {
      return;
    }

    console.log(`⏱️  Processing ${this.activeTimers.size} active session timers...`);
    const now = new Date();

    for (const [sessionId, timerData] of this.activeTimers) {
      try {
        // Calculate current elapsed time
        const totalElapsedSeconds = Math.floor((now - timerData.startTime) / 1000);
        const currentMinute = Math.floor(totalElapsedSeconds / 60);
        
        // Update elapsed seconds in memory
        timerData.elapsedSeconds = totalElapsedSeconds;

        // Check if we need to update database (every minute)
        if (currentMinute > timerData.lastUpdateMinute) {
          await this.updateSessionInDatabase(sessionId, currentMinute);
          timerData.lastUpdateMinute = currentMinute;
        }

        // Check credits every 5 minutes
        if (now - timerData.lastCreditCheck >= 5 * 60 * 1000) {
          await this.checkUserCredits(sessionId, timerData);
          timerData.lastCreditCheck = now;
        }

        // Check if session has exceeded estimated duration by 50% (auto-warn)
        const maxAllowedMinutes = timerData.estimatedDurationMinutes * 1.5;
        if (currentMinute >= maxAllowedMinutes) {
          await this.handleExcessiveSession(sessionId, timerData, currentMinute, maxAllowedMinutes);
        }

      } catch (error) {
        logError(error, { 
          service: 'BackgroundTimerService', 
          method: 'processActiveTimers', 
          sessionId: sessionId 
        });
        
        // Remove problematic timer to prevent continuous errors
        console.error(`❌ Removing problematic timer for session: ${sessionId}`);
        this.activeTimers.delete(sessionId);
      }
    }
  }

  /**
   * Update session duration in database
   */
  async updateSessionInDatabase(sessionId, elapsedMinutes) {
    try {
      await this.pool.query(
        `
        UPDATE sessions 
        SET total_duration_minutes = $1, updated_at = NOW()
        WHERE id = $2 AND status = 'active'
      `,
        [elapsedMinutes, sessionId]
      );

      console.log(`📝 Updated session ${sessionId}: ${elapsedMinutes}m elapsed`);
    } catch (error) {
      logError(error, { 
        service: 'BackgroundTimerService', 
        method: 'updateSessionInDatabase', 
        sessionId: sessionId 
      });
    }
  }

  /**
   * Check user credits and stop session if insufficient
   */
  async checkUserCredits(sessionId, timerData) {
    try {
      const query = 'SELECT credits FROM users WHERE id = $1';
      const result = await this.pool.query(query, [timerData.userId]);
      
      if (result.rows.length === 0) {
        console.error(`❌ User not found for session ${sessionId}, stopping timer`);
        await this.stopSessionForInsufficientCredits(sessionId, 'User not found');
        return;
      }

      const currentCredits = result.rows[0].credits;
      timerData.userCredits = currentCredits;

      // Stop session if user has no credits (they've already used 1 credit to start)
      if (currentCredits < 0) {
        console.log(`💳 Stopping session ${sessionId}: User has insufficient credits (${currentCredits})`);
        await this.stopSessionForInsufficientCredits(sessionId, `Insufficient credits: ${currentCredits}`);
      }
    } catch (error) {
      logError(error, { 
        service: 'BackgroundTimerService', 
        method: 'checkUserCredits', 
        sessionId: sessionId 
      });
    }
  }

  /**
   * Handle sessions that have run for too long
   */
  async handleExcessiveSession(sessionId, timerData, currentMinute, maxAllowedMinutes) {
    console.log(`⚠️  Session ${sessionId} has exceeded estimated duration: ${currentMinute}m / ${maxAllowedMinutes}m allowed`);
    
    // Log warning but don't stop automatically - let user decide
    logSessionEvent('SESSION_DURATION_WARNING', sessionId, timerData.userId, {
      elapsedMinutes: currentMinute,
      estimatedDuration: timerData.estimatedDurationMinutes,
      maxAllowedMinutes: maxAllowedMinutes,
    });

    // Update timerData to prevent repeated warnings
    timerData.estimatedDurationMinutes = Math.max(timerData.estimatedDurationMinutes * 2, currentMinute + 30);
  }

  /**
   * Stop session due to insufficient credits
   */
  async stopSessionForInsufficientCredits(sessionId, reason) {
    try {
      // Stop the background timer
      const timerResult = this.stopSessionTimer(sessionId, reason);
      if (!timerResult) return;

      // Update session status in database
      await this.pool.query(
        `
        UPDATE sessions 
        SET status = 'completed', 
            ended_at = NOW(), 
            total_duration_minutes = $1,
            session_notes = COALESCE(session_notes, '') || $2
        WHERE id = $3 AND status = 'active'
      `,
        [
          timerResult.elapsedMinutes,
          `\n[${new Date().toISOString()}] Session auto-stopped: ${reason}`,
          sessionId
        ]
      );

      console.log(`🛑 Session ${sessionId} auto-stopped due to: ${reason}`);
      
    } catch (error) {
      logError(error, { 
        service: 'BackgroundTimerService', 
        method: 'stopSessionForInsufficientCredits', 
        sessionId: sessionId 
      });
    }
  }

  /**
   * Manually stop a session timer (called from web app)
   */
  async stopSessionManually(sessionId, userId, reason = 'Manual stop from web app') {
    try {
      // Verify user owns the session
      const sessionQuery = `
        SELECT id, status, user_id, started_at 
        FROM sessions 
        WHERE id = $1 AND user_id = $2
      `;
      const sessionResult = await this.pool.query(sessionQuery, [sessionId, userId]);
      
      if (sessionResult.rows.length === 0) {
        throw new Error('Session not found or access denied');
      }

      const session = sessionResult.rows[0];
      if (session.status !== 'active') {
        throw new Error(`Cannot stop session with status: ${session.status}`);
      }

      // Stop the background timer
      const timerResult = this.stopSessionTimer(sessionId, reason);
      if (!timerResult) {
        throw new Error('No active timer found for session');
      }

      // Update session in database
      await this.pool.query(
        `
        UPDATE sessions 
        SET status = 'completed', 
            ended_at = NOW(), 
            total_duration_minutes = $1,
            session_notes = COALESCE(session_notes, '') || $2
        WHERE id = $3
      `,
        [
          timerResult.elapsedMinutes,
          `\n[${new Date().toISOString()}] Session manually stopped: ${reason}`,
          sessionId
        ]
      );

      return {
        success: true,
        elapsedMinutes: timerResult.elapsedMinutes,
        elapsedSeconds: timerResult.elapsedSeconds,
        stoppedAt: new Date(),
      };

    } catch (error) {
      logError(error, { 
        service: 'BackgroundTimerService', 
        method: 'stopSessionManually', 
        sessionId: sessionId,
        userId: userId 
      });
      throw error;
    }
  }

  /**
   * Get timer status for a specific session
   */
  getTimerStatus(sessionId) {
    const timer = this.getSessionTimer(sessionId);
    return timer || { isActive: false, sessionId };
  }

  /**
   * Handle session start from external trigger (web app, desktop app)
   */
  async handleSessionStart(sessionId, userId, estimatedDuration, jobTitle, userCredits) {
    console.log(`🎯 Starting background timer for session: ${sessionId}`);
    
    const startTime = new Date();
    this.startSessionTimer(sessionId, userId, startTime, estimatedDuration, jobTitle, userCredits);
    
    return {
      success: true,
      startTime: startTime,
      sessionId: sessionId,
    };
  }

  /**
   * Handle session completion from external source
   */
  async handleSessionEnd(sessionId, reason = 'External completion') {
    return this.stopSessionTimer(sessionId, reason);
  }

  /**
   * Graceful shutdown of the timer service
   */
  async shutdown() {
    console.log('🛑 Shutting down Background Timer Service...');
    
    this.stopTimerLoop();
    
    // Save final timer states for all active sessions
    for (const [sessionId, timerData] of this.activeTimers) {
      try {
        const elapsedMinutes = Math.floor(timerData.elapsedSeconds / 60);
        await this.pool.query(
          `
          UPDATE sessions 
          SET total_duration_minutes = $1, updated_at = NOW()
          WHERE id = $2
        `,
          [elapsedMinutes, sessionId]
        );
        
        console.log(`💾 Saved final timer state for session ${sessionId}: ${elapsedMinutes}m`);
      } catch (error) {
        console.error(`❌ Failed to save timer state for session ${sessionId}:`, error);
      }
    }

    this.activeTimers.clear();
    console.log('✅ Background Timer Service shutdown complete');
  }

  /**
   * Get service statistics
   */
  getStats() {
    const stats = {
      isRunning: this.isRunning,
      activeTimers: this.activeTimers.size,
      totalElapsedMinutes: 0,
      longestSession: null,
    };

    let longestElapsed = 0;
    for (const [sessionId, timerData] of this.activeTimers) {
      const elapsedMinutes = Math.floor(timerData.elapsedSeconds / 60);
      stats.totalElapsedMinutes += elapsedMinutes;
      
      if (elapsedMinutes > longestElapsed) {
        longestElapsed = elapsedMinutes;
        stats.longestSession = {
          sessionId: sessionId,
          elapsedMinutes: elapsedMinutes,
          jobTitle: timerData.jobTitle,
        };
      }
    }

    return stats;
  }
}

// Create singleton instance
const backgroundTimerService = new BackgroundTimerService();

export default backgroundTimerService;
