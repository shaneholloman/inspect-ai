import { RefObject, useCallback, useEffect, useRef } from "react";
import { StateCallback, StateSnapshot, VirtuosoHandle } from "react-virtuoso";
import { createLogger } from "../utils/logger";
import { debounce } from "../utils/sync";
import { useStore } from "./store";

const log = createLogger("scrolling");

export function useStatefulScrollPosition<
  T extends HTMLElement = HTMLDivElement,
>(
  elementRef: RefObject<T | null>,
  elementKey: string,
  delay = 1000,
  scrollable = true,
) {
  const getScrollPosition = useStore(
    (state) => state.appActions.getScrollPosition,
  );
  const setScrollPosition = useStore(
    (state) => state.appActions.setScrollPosition,
  );

  // Create debounced scroll handler
  const handleScroll = useCallback(
    debounce((e: Event) => {
      const target = e.target as HTMLElement;
      const position = target.scrollTop;
      log.debug(`Storing scroll position`, elementKey, position);
      setScrollPosition(elementKey, position);
    }, delay),
    [elementKey, setScrollPosition, delay],
  );

  // Function to manually restore scroll position
  const restoreScrollPosition = useCallback(() => {
    const element = elementRef.current;
    const savedPosition = getScrollPosition(elementKey);

    if (element && savedPosition !== undefined) {
      requestAnimationFrame(() => {
        element.scrollTop = savedPosition;

        requestAnimationFrame(() => {
          if (element.scrollTop !== savedPosition) {
            element.scrollTop = savedPosition;
          }
        });
      });
    }
  }, [elementKey, getScrollPosition, elementRef]);

  // Set up scroll listener and restore position on mount
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !scrollable) {
      return;
    }
    log.debug(`Restore Scroll Hook`, elementKey);

    // Restore scroll position on mount
    const savedPosition = getScrollPosition(elementKey);
    if (savedPosition !== undefined) {
      log.debug(`Restoring scroll position`, savedPosition);

      // Function to check and restore scroll position
      const tryRestoreScroll = () => {
        // Check if element has content to scroll (scrollHeight > clientHeight)
        if (element.scrollHeight > element.clientHeight) {
          if (element.scrollTop !== savedPosition) {
            element.scrollTop = savedPosition;
            log.debug(`Scroll position restored to ${savedPosition}`);
          }
          return true; // Successfully restored
        }
        return false; // Not ready yet
      };

      // Try immediately once
      if (!tryRestoreScroll()) {
        // If not successful, set up polling with setTimeout for 1-second intervals
        let attempts = 0;
        const maxAttempts = 5; // Fewer attempts since we're waiting longer

        const pollForRender = () => {
          if (tryRestoreScroll() || attempts >= maxAttempts) {
            // Either success or max attempts reached
            if (attempts >= maxAttempts) {
              log.debug(
                `Failed to restore scroll after ${maxAttempts} attempts`,
              );
            }
            return;
          }

          attempts++;
          // Wait 1 second before trying again
          setTimeout(pollForRender, 1000);
        };

        // Start polling after 1 second
        setTimeout(pollForRender, 1000);
      }
    }

    // Set up scroll listener
    if (element.addEventListener) {
      element.addEventListener("scroll", handleScroll);
    } else {
      log.warn("Element has no way to add event listener", element);
    }

    // Clean up
    return () => {
      if (element.removeEventListener) {
        element.removeEventListener("scroll", handleScroll);
      } else {
        log.warn("Element has no way to remove event listener", element);
      }
    };
  }, [elementKey, elementRef, handleScroll]);

  return { restoreScrollPosition };
}

// Define a type for the debounced function that includes the cancel method
type DebouncedFunction<T extends (...args: any[]) => any> = T & {
  cancel: () => void;
  flush: () => void;
};

export const useVirtuosoState = (
  virtuosoRef: RefObject<VirtuosoHandle | null>,
  elementKey: string,
  delay = 1000,
) => {
  // Use useCallback to stabilize the selectors
  const restoreState = useStore(
    useCallback((state) => state.app.listPositions[elementKey], [elementKey]),
  );

  const setListPosition = useStore(
    useCallback((state) => state.appActions.setListPosition, []),
  );

  const clearListPosition = useStore(
    useCallback((state) => state.appActions.clearListPosition, []),
  );

  // Properly type the debounced function ref
  const debouncedFnRef = useRef<DebouncedFunction<
    (isScrolling: boolean) => void
  > | null>(null);

  // Create the state change handler
  const handleStateChange: StateCallback = useCallback(
    (state: StateSnapshot) => {
      log.debug(`Storing list state: [${elementKey}]`, state);
      setListPosition(elementKey, state);
    },
    [elementKey, setListPosition],
  );

  // Setup the debounced function once
  useEffect(() => {
    debouncedFnRef.current = debounce((isScrolling: boolean) => {
      log.debug("List scroll", isScrolling);
      const element = virtuosoRef.current;
      if (!element) {
        return;
      }
      element.getState(handleStateChange);
    }, delay) as DebouncedFunction<(isScrolling: boolean) => void>;

    return () => {
      // Clear the stored position when component unmounts
      clearListPosition(elementKey);
    };
  }, [delay, elementKey, handleStateChange, clearListPosition, virtuosoRef]);

  // Return a stable function reference that uses the ref internally
  const isScrolling = useCallback((scrolling: boolean) => {
    if (!scrolling) {
      return;
    }

    if (debouncedFnRef.current) {
      debouncedFnRef.current(scrolling);
    }
  }, []);

  // Use a state to prevent re-rendering just because the restore
  // state changes
  const stateRef = useRef(restoreState);
  useEffect(() => {
    stateRef.current = restoreState;
  }, [restoreState]);

  const getRestoreState = useCallback(() => stateRef.current, []);

  return { getRestoreState, isScrolling };
};

export function useRafThrottle<T extends (...args: any[]) => any>(
  callback: T,
  dependencies: any[] = [],
): (...args: Parameters<T>) => void {
  const rafRef = useRef<number | null>(null);
  const callbackRef = useRef<T>(callback);

  // Update the callback ref when the callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback, ...dependencies]);

  const throttledCallback = useCallback((...args: Parameters<T>) => {
    // Skip if we already have a frame queued
    if (rafRef.current) {
      return;
    }

    rafRef.current = requestAnimationFrame(() => {
      callbackRef.current(...args);
      rafRef.current = null;
    });
  }, []);

  // Clean up any pending animation frame on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return throttledCallback;
}
