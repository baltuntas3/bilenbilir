import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react';

const TimerContext = createContext(null);

/**
 * Shared tick logic: only calls setRemainingTime when the displayed second changes.
 * Returns the interval ID so the caller can store it.
 */
function createTimerInterval(endTimeRef, lastSecondRef, setRemainingTime) {
  return setInterval(() => {
    const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
    if (remaining !== lastSecondRef.current) {
      lastSecondRef.current = remaining;
      setRemainingTime(remaining);
    }
    if (remaining <= 0) {
      clearInterval(endTimeRef._intervalId);
      endTimeRef._intervalId = null;
    }
  }, 100);
}

export function TimerProvider({ children }) {
  const [remainingTime, setRemainingTime] = useState(0);
  const [timeLimit, setTimeLimit] = useState(30);
  const timerRef = useRef(null);
  const endTimeRef = useRef(null);
  const lastSecondRef = useRef(0);

  const startTimer = useCallback((duration, endTime, isSync = false) => {
    if (timerRef.current) clearInterval(timerRef.current);
    endTimeRef.current = endTime;
    lastSecondRef.current = duration;
    setRemainingTime(duration);
    if (!isSync) setTimeLimit(duration);

    timerRef.current = createTimerInterval(endTimeRef, lastSecondRef, setRemainingTime);
    endTimeRef._intervalId = timerRef.current;
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const extendTimer = useCallback((extraTimeMs) => {
    if (!endTimeRef.current) return;
    endTimeRef.current += extraTimeMs;
    setTimeLimit(prev => prev + Math.ceil(extraTimeMs / 1000));

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
    lastSecondRef.current = remaining;
    setRemainingTime(remaining);
    if (remaining <= 0) return;
    timerRef.current = createTimerInterval(endTimeRef, lastSecondRef, setRemainingTime);
    endTimeRef._intervalId = timerRef.current;
  }, []);

  // Lightweight sync: only update endTime reference without resetting interval.
  // The existing interval will pick up the new endTime on its next tick.
  const syncTimer = useCallback((duration, endTime) => {
    if (!timerRef.current) return; // No active timer to sync
    endTimeRef.current = endTime;
  }, []);

  const resetTimer = useCallback(() => {
    stopTimer();
    setRemainingTime(0);
    setTimeLimit(30);
  }, [stopTimer]);

  // Clear interval on unmount to prevent memory leak and state updates on unmounted component
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const value = useMemo(() => ({
    remainingTime,
    timeLimit,
    startTimer,
    stopTimer,
    extendTimer,
    syncTimer,
    resetTimer,
  }), [remainingTime, timeLimit, startTimer, stopTimer, extendTimer, syncTimer, resetTimer]);

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) throw new Error('useTimer must be used within a TimerProvider');
  return context;
}
