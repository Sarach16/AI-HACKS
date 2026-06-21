import { useEffect, useRef, useState } from "react";

/**
 * Watches the user's position and exposes the latest coordinates plus any
 * error. Keeps the watch alive for the lifetime of the component that uses
 * this hook and cleans up on unmount.
 */
export function useGeolocation({ enabled = true } = {}) {
  const [position, setPosition] = useState(null); // { lat, lng, accuracy, timestamp }
  const [error, setError] = useState(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    if (!("geolocation" in navigator)) {
      const timeoutId = setTimeout(() => {
        setError("Geolocation is not supported by this browser.");
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        setError(err.message || "Failed to get location");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [enabled]);

  return { position, error };
}
