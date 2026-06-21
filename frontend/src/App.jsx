import { useWalkingGuide } from "./hooks/useWalkingGuide";
import "./App.css";

const STATUS_COPY = {
  idle: "Listening for nearby places",
  locating: "Finding your position",
  searching: "Scanning the area",
  narrating: "Composing the story",
  speaking: "Narrating",
  error: "Something interrupted the walk",
};

function StatusPulse({ status }) {
  const active = status === "searching" || status === "narrating" || status === "speaking";
  return (
    <div className={`pulse ${active ? "pulse--active" : ""} pulse--${status}`} aria-hidden="true">
      <span className="pulse__ring" />
      <span className="pulse__ring" />
      <span className="pulse__core" />
    </div>
  );
}

function App() {
  const { position, geoError, status, currentPlace, history, errorMessage, unlockAudio, forceCheck } =
    useWalkingGuide();

  return (
    <div className="app" onClick={unlockAudio} onTouchStart={unlockAudio}>
      <header className="app__header">
        <span className="app__eyebrow">Field Guide</span>
        <h1 className="app__title">Wayfarer</h1>
        <p className="app__subtitle">A voice for the ground you're standing on.</p>
      </header>

      <main className="stage">
        <StatusPulse status={status} />
        <p className="stage__status">{STATUS_COPY[status] ?? STATUS_COPY.idle}</p>

        {currentPlace ? (
          <div className="now-narrating">
            <span className="now-narrating__label">Now narrating</span>
            <h2 className="now-narrating__title">{currentPlace.title}</h2>
            <p className="now-narrating__script">{currentPlace.script}</p>
          </div>
        ) : (
        <p className="stage__hint">
            Start walking. When you pass somewhere with a story, you'll hear it.
            <br />
            <span className="stage__hint-small">(Tap anywhere once to enable sound.)</span>
          </p>
        )}

        {position && (
          <button
            className="stage__force-btn"
            onClick={(e) => { e.stopPropagation(); unlockAudio(); forceCheck(); }}
            disabled={status !== "idle" && status !== "error"}
          >
            Force narrate nearby
          </button>
        )}

        {(geoError || errorMessage) && (
          <p className="stage__error" role="alert">
            {geoError || errorMessage}
          </p>
        )}
      </main>

      <footer className="trail">
        <h2 className="trail__heading">Trail so far</h2>
        {history.length === 0 ? (
          <p className="trail__empty">Nothing narrated yet — your trail will collect here.</p>
        ) : (
          <ol className="trail__list">
            {history.map((entry, i) => (
              <li className="trail__item" key={`${entry.title}-${entry.narratedAt}-${i}`}>
                <span className="trail__time">
                  {new Date(entry.narratedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="trail__name">{entry.title}</span>
              </li>
            ))}
          </ol>
        )}
      </footer>

      {position && (
        <p className="coords">
          {position.lat.toFixed(5)}, {position.lng.toFixed(5)} · ±{Math.round(position.accuracy)}m
        </p>
      )}
    </div>
  );
}

export default App;
