import { Fragment, useEffect, useMemo, useState } from "react";
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
  const [activePage, setActivePage] = useState("calendar");
  const [users, setUsers] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);

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
    } catch (parseError) {
      return {};
    }
  };

  useEffect(() => {
    if (!token) {
      setUser(null);
      setEvents([]);
      setUsers([]);
      setActivePage("calendar");
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

        const meData = await parseJsonSafe(meResponse);

        if (!meResponse.ok) {
          throw new Error(meData.error || "Session expired. Please log in again.");
        }

        setUser(meData.user);

        const eventsResponse = await fetch(`${API_BASE}/events`, {
          headers: authHeader,
        });
        const eventsData = await parseJsonSafe(eventsResponse);

        if (!eventsResponse.ok) {
          throw new Error(eventsData.error || "Unable to load events.");
        }

        setEvents(eventsData.events || []);
      } catch (bootError) {
        setToken("");
        setError(bootError.message);
      }
    };

    bootstrap();
  }, [token, authHeader]);

  const loadAdminUsers = async () => {
    if (!user?.isAdmin) {
      return;
    }

    try {
      setAdminLoading(true);
      const response = await fetch(`${API_BASE}/admin/users`, {
        headers: authHeader,
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to load users");
      }

      const normalized = (data.users || []).map((entry) => ({
        ...entry,
        newPassword: "",
      }));
      setUsers(normalized);
      setError("");
    } catch (adminError) {
      setError(adminError.message);
    } finally {
      setAdminLoading(false);
    }
  };

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

      if (data.requiresApproval) {
        setAuthForm(blankAuth);
        setError(data.message || "Account created. Wait for admin approval.");
        return;
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

  const updateUserDraft = (targetId, patch) => {
    setUsers((current) =>
      current.map((entry) =>
        `${entry.id}` === `${targetId}`
          ? {
              ...entry,
              ...patch,
            }
          : entry
      )
    );
  };

  const saveUser = async (entry) => {
    try {
      const payload = {
        email: entry.email,
        isAdmin: Boolean(entry.isAdmin),
        isApproved: Boolean(entry.isApproved),
      };

      if (entry.newPassword) {
        payload.password = entry.newPassword;
      }

      const response = await fetch(`${API_BASE}/admin/users/${entry.id}`, {
        method: "PUT",
        headers: authHeader,
        body: JSON.stringify(payload),
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Failed to update user");
      }

      setUsers((current) =>
        current.map((item) =>
          `${item.id}` === `${entry.id}`
            ? {
                ...item,
                ...data.user,
                newPassword: "",
              }
            : item
        )
      );

      if (`${user.id}` === `${entry.id}`) {
        setUser((current) => ({
          ...current,
          email: data.user.email,
          isAdmin: data.user.isAdmin,
          isApproved: data.user.isApproved,
        }));
      }

      setError("");
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  const goToAdminPage = async () => {
    setActivePage("admin");
    await loadAdminUsers();
  };

  const logout = () => {
    setToken("");
    setUser(null);
    setEvents([]);
    setUsers([]);
    setActivePage("calendar");
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
            onClick={() => {
              setError("");
              setAuthMode((mode) => (mode === "login" ? "register" : "login"));
            }}
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
          <p>
            {activePage === "calendar"
              ? "Select a date to create an event. Click an event to delete it."
              : "Manage users: approve accounts, grant admin, and edit email/password."}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => setActivePage("calendar")}>
            Calendar
          </button>
          {user.isAdmin && (
            <button type="button" onClick={goToAdminPage}>
              User Management
            </button>
          )}
          <button type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {error && <p className="error-text">{error}</p>}

      {activePage === "calendar" && (
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
      )}

      {activePage === "admin" && user.isAdmin && (
        <section className="calendar-card">
          <h3>User Management</h3>
          {adminLoading ? (
            <p>Loading users...</p>
          ) : (
            <div className="admin-grid">
              <div className="admin-grid-head">Email</div>
              <div className="admin-grid-head">Approved</div>
              <div className="admin-grid-head">Admin</div>
              <div className="admin-grid-head">New Password</div>
              <div className="admin-grid-head">Action</div>

              {users.map((entry) => (
                <Fragment key={entry.id}>
                  <input
                    value={entry.email}
                    onChange={(e) => updateUserDraft(entry.id, { email: e.target.value })}
                  />
                  <label className="checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={Boolean(entry.isApproved)}
                      onChange={(e) => updateUserDraft(entry.id, { isApproved: e.target.checked })}
                    />
                    Approved
                  </label>
                  <label className="checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={Boolean(entry.isAdmin)}
                      onChange={(e) => updateUserDraft(entry.id, { isAdmin: e.target.checked })}
                    />
                    Admin
                  </label>
                  <input
                    type="password"
                    minLength={6}
                    placeholder="Leave blank to keep"
                    value={entry.newPassword || ""}
                    onChange={(e) => updateUserDraft(entry.id, { newPassword: e.target.value })}
                  />
                  <button type="button" onClick={() => saveUser(entry)}>
                    Save
                  </button>
                </Fragment>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
