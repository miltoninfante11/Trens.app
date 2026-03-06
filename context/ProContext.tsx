import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

// ============================================================================
// TIPOS
// ============================================================================
export type ProContextType = 'free';

export interface ProContextData {
  type: ProContextType;
  moduleName: 'GYM' | 'NUCLEO' | 'ADN' | 'PLAN';
}

interface ProContextValue {
  context: ProContextData;
  setFreeContext: (moduleName: 'GYM' | 'NUCLEO' | 'ADN' | 'PLAN') => void;
  clearContext: () => void;
}

// ============================================================================
// CONTEXT
// ============================================================================
const ProContext = createContext<ProContextValue | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================
export function ProContextProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<ProContextData>({
    type: 'free',
    moduleName: 'NUCLEO',
  });

  const setFreeContext = useCallback((moduleName: 'GYM' | 'NUCLEO' | 'ADN' | 'PLAN') => {
    setContext((prev) => {
      if (prev.type === 'free' && prev.moduleName === moduleName) {
        return prev;
      }
      return {
        type: 'free',
        moduleName,
      };
    });
  }, []);

  const clearContext = useCallback(() => {
    setContext({
      type: 'free',
      moduleName: 'NUCLEO',
    });
  }, []);

  return (
    <ProContext.Provider
      value={{
        context,
        setFreeContext,
        clearContext,
      }}
    >
      {children}
    </ProContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================
export function useProContext() {
  const context = useContext(ProContext);
  if (!context) {
    throw new Error('useProContext must be used within a ProContextProvider');
  }
  return context;
}
