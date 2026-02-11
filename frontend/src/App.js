import { useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import "./App.css";

const API_BASE =
  process.env.REACT_APP_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

const blankAuth = { email: "", password: "" };

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(blankAuth);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const authHeader = useMemo(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  const parseJsonSafe = async (response) => {
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  };

  useEffect(() => {
    if (!token) {
      setUser(null);
      setEvents([]);
      localStorage.removeItem("token");
      return;
    }

    localStorage.setItem("token", token);

    const bootstrap = async () => {
      try {
        setError("");
        const meResponse = await fetch(`${API_BASE}/auth/me`, {
          headers: authHeader,
        });

        if (!meResponse.ok) {
          throw new Error("Session expired. Please log in again.");
        }

        const meData = await meResponse.json();
        setUser(meData.user);

        const eventsResponse = await fetch(`${API_BASE}/events`, {
          headers: authHeader,
        });

        if (!eventsResponse.ok) {
          throw new Error("Unable to load events.");
        }

        const eventsData = await eventsResponse.json();
        setEvents(eventsData.events);
      } catch (bootError) {
        setToken("");
        setError(bootError.message);
      }
    };

    bootstrap();
  }, [token, authHeader]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm),
      });

      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      setAuthForm(blankAuth);
      setToken(data.token);
    } catch (authError) {
      setError(authError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = async (selectionInfo) => {
    const title = window.prompt("Event title:");
    if (!title) {
      return;
    }

    const notes = window.prompt("Optional notes:") || "";

    const draftEvent = {
      title,
      start: selectionInfo.startStr,
      end: selectionInfo.endStr,
      allDay: selectionInfo.allDay,
      notes,
    };

    try {
      const response = await fetch(`${API_BASE}/events`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify(draftEvent),
      });

      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Could not create event.");
      }

      setEvents((current) => [...current, data.event]);
      setError("");
    } catch (eventError) {
      setError(eventError.message);
    }
  };

  const handleEventClick = async (clickInfo) => {
    const eventId = clickInfo.event.id;
    const shouldDelete = window.confirm(
      `Delete "${clickInfo.event.title}"?\nPress Cancel to keep it.`
    );

    if (!shouldDelete) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/events/${eventId}`, {
        method: "DELETE",
        headers: authHeader,
      });

      if (!response.ok && response.status !== 204) {
        const data = await parseJsonSafe(response);
        throw new Error(data.error || "Could not delete event.");
      }

      setEvents((current) => current.filter((calendarEvent) => `${calendarEvent.id}` !== `${eventId}`));
      setError("");
    } catch (eventError) {
      setError(eventError.message);
    }
  };

  const logout = () => {
    setToken("");
    setUser(null);
    setEvents([]);
  };

  if (!token || !user) {
    return (
      <div className="auth-shell">
        <form className="auth-card" onSubmit={handleAuthSubmit}>
          <h1>Plaanss Calendar</h1>
          <p>{authMode === "login" ? "Sign in to your calendar" : "Create a new account"}</p>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={authForm.email}
            onChange={(e) => setAuthForm((current) => ({ ...current, email: e.target.value }))}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            minLength={6}
            value={authForm.password}
            onChange={(e) => setAuthForm((current) => ({ ...current, password: e.target.value }))}
            required
          />

          {error && <p className="error-text">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Please wait..." : authMode === "login" ? "Login" : "Register"}
          </button>

          <button
            type="button"
            className="link-button"
            onClick={() => setAuthMode((mode) => (mode === "login" ? "register" : "login"))}
          >
            {authMode === "login" ? "Need an account? Register" : "Already have an account? Login"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <main className="calendar-shell">
      <header className="calendar-header">
        <div>
          <h2>Welcome, {user.email}</h2>
          <p>Select a date to create an event. Click an event to delete it.</p>
        </div>
        <button type="button" onClick={logout}>
          Logout
        </button>
      </header>

      {error && <p className="error-text">{error}</p>}

      <section className="calendar-card">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          selectable
          events={events}
          select={handleDateSelect}
          eventClick={handleEventClick}
          height="auto"
        />
      </section>
    </main>
  );
}

export default App;
