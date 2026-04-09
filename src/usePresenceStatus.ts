import { useEffect, useState } from "react";
import type { PresenceChangedEvent, TrackingStatus } from "./renderer";

interface PresenceStatusState {
  hasLoaded: boolean;
  isPresent: boolean;
  isTracking: boolean;
  lastUpdated: number | null;
}

export const usePresenceStatus = (
  initialValue = true,
): PresenceStatusState => {
  const [status, setStatus] = useState<PresenceStatusState>({
    hasLoaded: false,
    isPresent: initialValue,
    isTracking: initialValue,
    lastUpdated: null,
  });

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};

    const applyTrackingStatus = (trackingStatus: TrackingStatus) => {
      if (!isMounted) return;

      setStatus((previous) => {
        if (!trackingStatus.hasPresenceData) {
          return {
            ...previous,
            hasLoaded: false,
          };
        }

        return {
          hasLoaded: true,
          isPresent: trackingStatus.presenceDetected,
          isTracking: trackingStatus.isTracking,
          lastUpdated: previous.lastUpdated ?? Date.now(),
        };
      });
    };

    const loadInitialStatus = async () => {
      if (!window.api?.getTrackingStatus) return;

      try {
        const trackingStatus = await window.api.getTrackingStatus();
        applyTrackingStatus(trackingStatus);
      } catch {
        if (!isMounted) return;

        setStatus((previous) => ({
          ...previous,
          hasLoaded: false,
        }));
      }
    };

    void loadInitialStatus();

    if (window.api?.onPresenceChanged) {
      unsubscribe = window.api.onPresenceChanged((event: PresenceChangedEvent) => {
        if (!isMounted) return;

        setStatus({
          hasLoaded: true,
          isPresent: event.isPresent,
          isTracking: event.isPresent,
          lastUpdated: event.timestamp,
        });
      });
    }

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return status;
};
