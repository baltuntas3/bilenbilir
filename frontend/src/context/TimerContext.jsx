import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';

const TimerContext = createContext(null);

export function TimerProvider({ children }) {
  const [remainingTime, setRemainingTime] = useState(0);
  const [timeLimit, setTimeLimit] = useState(30);
  const timerRef = useRef(null);
  const endTimeRef = useRef(null);

  const startTimer = useCallback((duration, endTime) => {
    if (timerRef.current) clearInterval(timerRef.current);
    endTimeRef.current = endTime;
    setRemainingTime(duration);
    setTimeLimit(duration);

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
      setRemainingTime(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, 100);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const extendTimer = useCallback((extraTimeMs) => {
    if (endTimeRef.current) {
      endTimeRef.current += extraTimeMs;
      // Update timeLimit so progress ring stays proportional
      setTimeLimit(prev => prev + Math.ceil(extraTimeMs / 1000));

      // Restart interval if it was cleared (timer had expired)
      if (!timerRef.current) {
        const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
        setRemainingTime(remaining);
        if (remaining > 0) {
          timerRef.current = setInterval(() => {
            const now = Date.now();
            const r = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
            setRemainingTime(r);
            if (r <= 0) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
          }, 100);
        }
      }
    }
  }, []);

  const resetTimer = useCallback(() => {
    stopTimer();
    setRemainingTime(0);
    setTimeLimit(30);
  }, [stopTimer]);

  const value = useMemo(() => ({
    remainingTime,
    timeLimit,
    startTimer,
    stopTimer,
    extendTimer,
    resetTimer,
  }), [remainingTime, timeLimit, startTimer, stopTimer, extendTimer, resetTimer]);

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) throw new Error('useTimer must be used within a TimerProvider');
  return context;
}
