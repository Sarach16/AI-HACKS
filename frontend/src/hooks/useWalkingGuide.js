import { useCallback, useEffect, useRef, useState } from "react";
import { useGeolocation } from "./useGeolocation";
import { findNearbyPlaces } from "../lib/wikipedia";
import { distanceMeters } from "../lib/geo";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

// Tuning knobs for the narration trigger logic.
const SEARCH_RADIUS_METERS = 400; // how far to look for nearby Wikipedia places
const MIN_MOVE_METERS = 40; // ignore position updates smaller than this
const MIN_SECONDS_BETWEEN_CHECKS = 8; // throttle how often we re-query Wikipedia
const NARRATE_WITHIN_METERS = 60; // only narrate a place once this close to it
const RE_NARRATE_COOLDOWN_MS = 1000 * 60 * 30; // don't repeat the same place for 30 min

export function STATUS() {
  return {
    IDLE: "idle",
    LOCATING: "locating",
    SEARCHING: "searching",
    NARRATING: "narrating",
    SPEAKING: "speaking",
    ERROR: "error",
  };
}

export function useWalkingGuide() {
  const { position, error: geoError } = useGeolocation({ enabled: true });

  const [status, setStatus] = useState("idle");
  const [currentPlace, setCurrentPlace] = useState(null); // { title, script }
  const [errorMessage, setErrorMessage] = useState(null);
  const [history, setHistory] = useState([]); // narrated places, most recent first

  const lastCheckedPositionRef = useRef(null); // { lat, lng, time }
  const visitedRef = useRef(new Map()); // pageId -> timestamp last narrated
  const isBusyRef = useRef(false); // prevents overlapping pipeline runs
  const audioRef = useRef(null);

  const audioUnlockedRef = useRef(false);

  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    // Playing (and immediately allowing) a silent, near-zero-length clip on a
    // real user gesture satisfies the browser's autoplay policy for the rest
    // of the session, so later programmatic playback won't be blocked.
    const silence = new Audio(
      "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA"
    );
    silence.volume = 0;
    silence.play()
      .then(() => {
        audioUnlockedRef.current = true;
      })
      .catch(() => {
        // Some browsers still refuse; we'll just retry the unlock on next gesture.
      });
  }, []);

  const playScriptAsAudio = useCallback(async (script) => {
    setStatus("speaking");
    const res = await fetch(`${BACKEND_URL}/api/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: script }),
    });

    if (!res.ok) throw new Error("Speech synthesis failed");

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    if (audioRef.current) {
      audioRef.current.pause();
      URL.revokeObjectURL(audioRef.current.src);
    }

    const audio = new Audio(url);
    audioRef.current = audio;

    try {
      await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = reject;
        audio.play().catch(reject);
      });
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        throw new Error(
          "Your browser blocked autoplay. Tap anywhere on the page, then narration will play normally.",
          { cause: err }
        );
      }
      throw err;
    }
  }, []);

  const narrateePlace = useCallback(
    async (place) => {
      setStatus("narrating");
      const res = await fetch(`${BACKEND_URL}/api/narrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeName: place.title,
          extract: place.extract,
          distanceMeters: place.distanceMeters,
        }),
      });

      if (!res.ok) throw new Error("Narration generation failed");
      const { script } = await res.json();
      return script;
    },
    []
  );

  const runPipelineForPlace = useCallback(
    async (place) => {
      const script = await narrateePlace(place);
      const entry = { title: place.title, script, narratedAt: Date.now() };

      setCurrentPlace(entry);
      setHistory((prev) => [entry, ...prev]);
      visitedRef.current.set(place.pageId, Date.now());

      await playScriptAsAudio(script);
      setStatus("idle");
    },
    [narrateePlace, playScriptAsAudio]
  );

  const checkForNearbyPlace = useCallback(
    async (lat, lng, { force = false } = {}) => {
      if (isBusyRef.current) return;
      isBusyRef.current = true;
      setStatus("searching");
      setErrorMessage(null);

      try {
        const places = await findNearbyPlaces({ lat, lng, radiusMeters: SEARCH_RADIUS_METERS });

        const now = Date.now();
        const narrateRadius = force ? SEARCH_RADIUS_METERS : NARRATE_WITHIN_METERS;
        const candidate = places.find((p) => {
          const lastVisited = visitedRef.current.get(p.pageId);
          const onCooldown = !force && lastVisited && now - lastVisited < RE_NARRATE_COOLDOWN_MS;
          return p.distanceMeters <= narrateRadius && !onCooldown;
        });

        if (candidate) {
          await runPipelineForPlace(candidate);
        } else {
          setStatus("idle");
        }
      } catch (err) {
        console.error(err);
        setErrorMessage(err.message || "Something went wrong");
        setStatus("error");
      } finally {
        isBusyRef.current = false;
      }
    },
    [runPipelineForPlace]
  );

  const forceCheck = useCallback(() => {
    if (!position) return;
    checkForNearbyPlace(position.lat, position.lng, { force: true });
  }, [position, checkForNearbyPlace]);

  // React to new position updates, applying throttle + minimum-movement gates.
  useEffect(() => {
    if (!position) return;

    const last = lastCheckedPositionRef.current;
    const now = Date.now();

    const movedEnough =
      !last || distanceMeters(last.lat, last.lng, position.lat, position.lng) >= MIN_MOVE_METERS;
    const enoughTimePassed = !last || (now - last.time) / 1000 >= MIN_SECONDS_BETWEEN_CHECKS;

    if (movedEnough && enoughTimePassed) {
      lastCheckedPositionRef.current = { lat: position.lat, lng: position.lng, time: now };
      checkForNearbyPlace(position.lat, position.lng);
    }
  }, [position, checkForNearbyPlace]);

  return {
    position,
    geoError,
    status,
    currentPlace,
    history,
    errorMessage,
    unlockAudio,
    forceCheck,
  };
}
