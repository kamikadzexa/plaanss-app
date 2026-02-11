import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import "./App.css";

const API_BASE =
  process.env.REACT_APP_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

const blankAuth = { email: "", password: "" };
const blankEventForm = {
  title: "",
  startDate: "",
  startTime: "09:00",
  durationMinutes: "60",
  notes: "",
};
const mobileMediaQuery = "(max-width: 768px)";

const getInitialIsMobile = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(mobileMediaQuery).matches
    : false;

const getDatePart = (value) => {
  if (!value) {
    return "";
  }

  return value.includes("T") ? value.split("T")[0] : value;
};

const getTimePart = (value, fallback = "09:00") => {
  if (!value || !value.includes("T")) {
    return fallback;
  }

  return value.split("T")[1].slice(0, 5);
};

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
  const calendarRef = useRef(null);
  const [isMobile, setIsMobile] = useState(getInitialIsMobile);
  const [calendarView, setCalendarView] = useState(isMobile ? "dayGridDay" : "dayGridMonth");
  const [eventForm, setEventForm] = useState(blankEventForm);

  const authHeader = useMemo(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  const sortedEvents = useMemo(() => {
    const toTimestamp = (event) => {
      const raw = event.start || event.startStr;
      const parsed = Date.parse(raw);
      return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
    };

    return [...events].sort((a, b) => {
      const startDiff = toTimestamp(a) - toTimestamp(b);
      if (startDiff !== 0) {
        return startDiff;
      }

      return (a.title || "").localeCompare(b.title || "");
    });
  }, [events]);

  const parseJsonSafe = async (response) => {
    try {
      return await response.json();
    } catch (parseError) {
      return {};
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQueryList = window.matchMedia(mobileMediaQuery);

    const handleViewportChange = (event) => {
      setIsMobile(event.matches);
      setCalendarView((currentView) => {
        if (event.matches && currentView === "dayGridMonth") {
          return "dayGridDay";
        }

        if (!event.matches && currentView === "dayGridDay") {
          return "dayGridMonth";
        }

        return currentView;
      });
    };

    mediaQueryList.addEventListener("change", handleViewportChange);

    return () => mediaQueryList.removeEventListener("change", handleViewportChange);
  }, []);

  useEffect(() => {
    const calendarApi = calendarRef.current?.getApi();

    if (calendarApi && calendarApi.view.type !== calendarView) {
      calendarApi.changeView(calendarView);
    }
  }, [calendarView]);

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

  const createEvent = async (draftEvent) => {
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
      setEventForm(blankEventForm);
    } catch (eventError) {
      setError(eventError.message);
    }
  };

  const prefillEventForm = (startValue) => {
    setEventForm((current) => ({
      ...current,
      startDate: getDatePart(startValue),
      startTime: getTimePart(startValue, current.startTime || "09:00"),
    }));
  };

  const handleDateSelect = (selectionInfo) => {
    prefillEventForm(selectionInfo.startStr);
    selectionInfo.view.calendar.unselect();
  };

  const handleDateClick = (dateInfo) => {
    prefillEventForm(dateInfo.dateStr);
  };

  const handleEventFormSubmit = async (event) => {
    event.preventDefault();

    const title = eventForm.title.trim();
    if (!title) {
      setError("Event name is required.");
      return;
    }

    if (!eventForm.startDate || !eventForm.startTime) {
      setError("Start date and start time are required.");
      return;
    }

    const duration = Number.parseInt(eventForm.durationMinutes, 10);
    if (Number.isNaN(duration) || duration < 5) {
      setError("Length must be at least 5 minutes.");
      return;
    }

    const startDateTime = new Date(`${eventForm.startDate}T${eventForm.startTime}`);
    if (Number.isNaN(startDateTime.getTime())) {
      setError("Invalid start date or time.");
      return;
    }

    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    await createEvent({
      title,
      start: startDateTime.toISOString(),
      end: endDateTime.toISOString(),
      allDay: false,
      notes: eventForm.notes.trim(),
    });
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

      setEvents((current) =>
        current.filter((calendarEvent) => `${calendarEvent.id}` !== `${eventId}`)
      );
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

  const calendarViews = [
    {
      key: "dayGridMonth",
      label: "Month",
    },
    {
      key: "dayGridWeek",
      label: isMobile ? "Week" : "Week view",
    },
    {
      key: "dayGridDay",
      label: isMobile ? "Day" : "Day view",
    },
  ];

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
              ? "Pick a date, set time and duration, then create your event. Click an event to delete it."
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
          <div className="calendar-toolbar">
            <div className="view-switcher" role="group" aria-label="Calendar view switcher">
              {calendarViews.map((view) => (
                <button
                  key={view.key}
                  type="button"
                  className={calendarView === view.key ? "is-active" : ""}
                  onClick={() => {
                    setCalendarView(view.key);
                    calendarRef.current?.getApi().changeView(view.key);
                  }}
                >
                  {view.label}
                </button>
              ))}
            </div>
            <p className="calendar-tip">
              Events are sorted by start time. Tap/click a date to prefill the form.
            </p>
          </div>

          <form className="event-form" onSubmit={handleEventFormSubmit}>
            <div className="event-form-grid">
              <label htmlFor="event-title">Name</label>
              <input
                id="event-title"
                value={eventForm.title}
                onChange={(e) => setEventForm((current) => ({ ...current, title: e.target.value }))}
                placeholder="Event name"
                required
              />

              <label htmlFor="event-start-date">Start date</label>
              <input
                id="event-start-date"
                type="date"
                value={eventForm.startDate}
                onChange={(e) =>
                  setEventForm((current) => ({
                    ...current,
                    startDate: e.target.value,
                  }))
                }
                required
              />

              <label htmlFor="event-start-time">Start time</label>
              <input
                id="event-start-time"
                type="time"
                value={eventForm.startTime}
                onChange={(e) =>
                  setEventForm((current) => ({
                    ...current,
                    startTime: e.target.value,
                  }))
                }
                required
              />

              <label htmlFor="event-duration">Length (minutes)</label>
              <input
                id="event-duration"
                type="number"
                min={5}
                step={5}
                value={eventForm.durationMinutes}
                onChange={(e) =>
                  setEventForm((current) => ({
                    ...current,
                    durationMinutes: e.target.value,
                  }))
                }
                required
              />

              <label htmlFor="event-notes">Description</label>
              <input
                id="event-notes"
                value={eventForm.notes}
                onChange={(e) => setEventForm((current) => ({ ...current, notes: e.target.value }))}
                placeholder="Optional details"
              />
            </div>
            <div className="event-form-actions">
              <button type="submit">Create event</button>
              <button
                type="button"
                className="link-button"
                onClick={() => setEventForm(blankEventForm)}
              >
                Clear
              </button>
            </div>
          </form>

          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView={calendarView}
            viewDidMount={(info) => {
              setCalendarView(info.view.type);
            }}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "",
            }}
            selectable
            firstDay={1}
            events={sortedEvents}
            eventOrder="start,title"
            eventTimeFormat={{
              hour: "2-digit",
              minute: "2-digit",
              meridiem: false,
            }}
            displayEventTime
            select={handleDateSelect}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            height={isMobile ? "auto" : "calc(100vh - 210px)"}
            expandRows={!isMobile}
            dayMaxEventRows={isMobile ? 2 : 5}
            fixedWeekCount={!isMobile}
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
