import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
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
  timezoneMode: "user",
};
const mobileMediaQuery = "(max-width: 768px)";

const getInitialIsMobile = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(mobileMediaQuery).matches
    : false;

const getStartOfWeek = (value = new Date()) => {
  const date = new Date(value);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  date.setHours(0, 0, 0, 0);
  return date;
};

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

const formatDateTimeForInput = (value) => {
  if (!value) {
    return { startDate: "", startTime: "09:00" };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return {
      startDate: getDatePart(value),
      startTime: getTimePart(value),
    };
  }

  const offset = parsed.getTimezoneOffset() * 60000;
  const local = new Date(parsed.getTime() - offset).toISOString();

  return {
    startDate: local.slice(0, 10),
    startTime: local.slice(11, 16),
  };
};


const parseDateParts = (dateValue, timeValue) => {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = timeValue.split(":").map(Number);

  if ([year, month, day, hours, minutes].some((part) => Number.isNaN(part))) {
    return null;
  }

  return { year, month, day, hours, minutes };
};

const buildUtcIsoFromInput = (dateValue, timeValue, timezoneMode) => {
  const parsed = parseDateParts(dateValue, timeValue);
  if (!parsed) {
    return null;
  }

  const { year, month, day, hours, minutes } = parsed;

  if (timezoneMode === "msk") {
    return new Date(Date.UTC(year, month - 1, day, hours - 3, minutes)).toISOString();
  }

  return new Date(year, month - 1, day, hours, minutes).toISOString();
};

const formatDateTimeForTimezoneInput = (value, timezoneMode = "user") => {
  if (!value) {
    return { startDate: "", startTime: "09:00" };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return {
      startDate: getDatePart(value),
      startTime: getTimePart(value),
    };
  }

  if (timezoneMode === "msk") {
    const mskShifted = new Date(parsed.getTime() + 3 * 60 * 60 * 1000).toISOString();
    return {
      startDate: mskShifted.slice(0, 10),
      startTime: mskShifted.slice(11, 16),
    };
  }

  return formatDateTimeForInput(value);
};

const formatDateTimeEu = (value) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${weekday}, ${day}.${month}.${year}, ${hours}:${minutes}`;
};

const getDurationMinutes = (start, end) => {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return "60";
  }

  return `${Math.max(5, Math.round((endMs - startMs) / 60000))}`;
};

const getEventStatus = (eventStart, eventEnd, now = new Date()) => {
  const start = new Date(eventStart);
  if (Number.isNaN(start.getTime())) {
    return "event-status-upcoming";
  }

  const end = eventEnd ? new Date(eventEnd) : null;
  const hasValidEnd = end && !Number.isNaN(end.getTime());

  if (now < start) {
    return "event-status-upcoming";
  }

  if (hasValidEnd && now >= end) {
    return "event-status-past";
  }

  if (hasValidEnd && now >= start && now < end) {
    return "event-status-live";
  }

  return "event-status-past";
};

const formatEventTimeRange = (eventStart, eventEnd) => {
  const start = new Date(eventStart);
  const end = eventEnd ? new Date(eventEnd) : null;

  if (Number.isNaN(start.getTime())) {
    return "Time unavailable";
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const startLabel = formatter.format(start);

  if (!end || Number.isNaN(end.getTime())) {
    return `${startLabel} - --:--`;
  }

  return `${startLabel} - ${formatter.format(end)}`;
};

const formatLinkLabel = (url, maxLength = 42) => {
  if (url.length <= maxLength) {
    return url;
  }

  const head = url.slice(0, 26);
  const tail = url.slice(-12);
  return `${head}…${tail}`;
};

function LinkifiedText({ text }) {
  if (!text) {
    return <p className="event-description-empty">No description provided.</p>;
  }

  const lines = text.split("\n");
  const urlPattern = /(https?:\/\/[^\s]+)/g;

  return (
    <div className="event-description-rich">
      {lines.map((line, lineIndex) => {
        const chunks = line.split(urlPattern);

        return (
          <p key={`${line}-${lineIndex}`}>
            {chunks.map((chunk, chunkIndex) => {
              if (/^https?:\/\//.test(chunk)) {
                return (
                  <a key={`${chunk}-${chunkIndex}`} href={chunk} target="_blank" rel="noreferrer">
                    {formatLinkLabel(chunk)}
                  </a>
                );
              }

              return <span key={`${chunk}-${chunkIndex}`}>{chunk}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

function App() {
  const [token, setToken] = useState("");
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
  const [calendarView, setCalendarView] = useState(isMobile ? "mobileWeek" : "dayGridMonth");
  const weekViewKey = isMobile ? "mobileWeek" : "weekRow";
  const [nowTick, setNowTick] = useState(Date.now());
  const [calendarRangeStart, setCalendarRangeStart] = useState(null);

  const [eventDialogMode, setEventDialogMode] = useState(null);
  const [eventForm, setEventForm] = useState(blankEventForm);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const authHeader = useMemo(() => {
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  const apiFetch = useCallback(
    (path, options = {}) =>
      fetch(`${API_BASE}${path}`, {
        credentials: "include",
        ...options,
      }),
    []
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



  const eventsForCalendar = sortedEvents;

  const mobileWeekDays = useMemo(() => {
    const weekStart = getStartOfWeek(calendarRangeStart || new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekEvents = sortedEvents.filter((entry) => {
      const rawStart = entry.start || entry.startStr;
      const eventStart = new Date(rawStart);

      if (Number.isNaN(eventStart.getTime())) {
        return false;
      }

      return eventStart >= weekStart && eventStart < weekEnd;
    });

    return Array.from({ length: 7 }, (_, index) => {
      const dayStart = new Date(weekStart);
      dayStart.setDate(dayStart.getDate() + index);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayEvents = weekEvents.filter((entry) => {
        const rawStart = entry.start || entry.startStr;
        const eventStart = new Date(rawStart);
        return eventStart >= dayStart && eventStart < dayEnd;
      });

      return {
        key: dayStart.toISOString().slice(0, 10),
        date: dayStart,
        events: dayEvents,
      };
    });
  }, [calendarRangeStart, sortedEvents]);

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
        if (event.matches) {
          if (currentView === "dayGridMonth" || currentView === "weekRow") {
            return "mobileWeek";
          }
        } else if (currentView === "mobileWeek") {
          return "weekRow";
        }

        return currentView;
      });
    };

    mediaQueryList.addEventListener("change", handleViewportChange);

    return () => mediaQueryList.removeEventListener("change", handleViewportChange);
  }, []);

  useEffect(() => {
    const calendarApi = calendarRef.current?.getApi();

    if (calendarView === "mobileWeek") {
      return;
    }

    if (calendarApi && calendarApi.view.type !== calendarView) {
      calendarApi.changeView(calendarView);
    }
  }, [calendarView]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTick(Date.now());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setError("");
        const meResponse = await apiFetch(`/auth/me`, {
          headers: authHeader,
        });

        const meData = await parseJsonSafe(meResponse);

        if (!meResponse.ok) {
          throw new Error(meData.error || "Session expired. Please log in again.");
        }

        setUser(meData.user);

        const eventsResponse = await apiFetch(`/events`, {
          headers: authHeader,
        });
        const eventsData = await parseJsonSafe(eventsResponse);

        if (!eventsResponse.ok) {
          throw new Error(eventsData.error || "Unable to load events.");
        }

        setEvents(eventsData.events || []);
      } catch (bootError) {
        setUser(null);
        setEvents([]);
        if (token) {
          setToken("");
        }
      }
    };

    bootstrap();
  }, [apiFetch, authHeader, token]);

  const loadAdminUsers = async () => {
    if (!user?.isAdmin) {
      return;
    }

    try {
      setAdminLoading(true);
      const response = await apiFetch(`/admin/users`, {
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
      const response = await apiFetch(`/auth/${authMode}`, {
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

  const openCreateDialog = (startValue) => {
    const initial = startValue
      ? {
          ...blankEventForm,
          startDate: getDatePart(startValue),
          startTime: getTimePart(startValue, "09:00"),
          timezoneMode: "user",
        }
      : blankEventForm;

    setEventForm(initial);
    setEventDialogMode("create");
  };

  const closeEventDialog = () => {
    setEventDialogMode(null);
    setEventForm(blankEventForm);
    setSelectedEvent(null);
  };

  const handleDateSelect = (selectionInfo) => {
    openCreateDialog(selectionInfo.startStr);
    selectionInfo.view.calendar.unselect();
  };

  const handleDateClick = (dateInfo) => {
    openCreateDialog(dateInfo.dateStr);
  };

  const createEvent = async (draftEvent) => {
    const response = await apiFetch(`/events`, {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify(draftEvent),
    });

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      throw new Error(data.error || "Could not create event.");
    }

    setEvents((current) => [...current, data.event]);
  };

  const updateEvent = async (eventId, draftEvent) => {
    const response = await apiFetch(`/events/${eventId}`, {
      method: "PUT",
      headers: authHeader,
      body: JSON.stringify(draftEvent),
    });

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      throw new Error(data.error || "Could not update event.");
    }

    setEvents((current) =>
      current.map((entry) => (`${entry.id}` === `${eventId}` ? data.event : entry))
    );
    setSelectedEvent(data.event);
  };

  const deleteEvent = async (eventId) => {
    const response = await apiFetch(`/events/${eventId}`, {
      method: "DELETE",
      headers: authHeader,
    });

    if (!response.ok) {
      const data = await parseJsonSafe(response);
      throw new Error(data.error || "Could not delete event.");
    }

    setEvents((current) => current.filter((entry) => `${entry.id}` !== `${eventId}`));
    setSelectedEvent(null);
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

    const startIso = buildUtcIsoFromInput(eventForm.startDate, eventForm.startTime, eventForm.timezoneMode);
    if (!startIso) {
      setError("Invalid start date or time.");
      return;
    }

    const endDateTime = new Date(new Date(startIso).getTime() + duration * 60000);

    const payload = {
      title,
      start: startIso,
      end: endDateTime.toISOString(),
      allDay: false,
      notes: eventForm.notes,
    };

    try {
      if (eventDialogMode === "edit" && selectedEvent?.id) {
        await updateEvent(selectedEvent.id, payload);
      } else {
        await createEvent(payload);
      }

      closeEventDialog();
      setError("");
    } catch (eventError) {
      setError(eventError.message);
    }
  };

  const openEventDetails = (calendarEvent) => {
    const normalized = {
      id: calendarEvent.id,
      title: calendarEvent.title,
      start: calendarEvent.startStr,
      end: calendarEvent.endStr,
      notes: calendarEvent.extendedProps.notes || "",
      allDay: calendarEvent.allDay,
    };

    setSelectedEvent(normalized);
    setEventDialogMode("view");
  };

  const startEditingSelectedEvent = () => {
    if (!selectedEvent) {
      return;
    }

    const timezoneMode = eventForm.timezoneMode || "user";
    const startParts = formatDateTimeForTimezoneInput(selectedEvent.start, timezoneMode);

    setEventForm({
      title: selectedEvent.title || "",
      startDate: startParts.startDate,
      startTime: startParts.startTime,
      durationMinutes: getDurationMinutes(selectedEvent.start, selectedEvent.end),
      notes: selectedEvent.notes || "",
      timezoneMode,
    });
    setEventDialogMode("edit");
  };

  const handleEventClick = (clickInfo) => {
    if (clickInfo.event.extendedProps?.isPlaceholder) {
      return;
    }

    openEventDetails(clickInfo.event);
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

      const response = await apiFetch(`/admin/users/${entry.id}`, {
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

  const logout = async () => {
    try {
      await apiFetch(`/auth/logout`, { method: "POST" });
    } catch (logoutError) {
      // ignore logout network errors
    }

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
      key: weekViewKey,
      label: "Week",
    },
  ];

  const goToPreviousMobileWeek = () => {
    setCalendarRangeStart((current) => {
      const start = getStartOfWeek(current || new Date());
      start.setDate(start.getDate() - 7);
      return start.toISOString();
    });
  };

  const goToNextMobileWeek = () => {
    setCalendarRangeStart((current) => {
      const start = getStartOfWeek(current || new Date());
      start.setDate(start.getDate() + 7);
      return start.toISOString();
    });
  };

  const goToCurrentMobileWeek = () => {
    setCalendarRangeStart(getStartOfWeek(new Date()).toISOString());
  };

  if (!user) {
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
              ? "Click + to create an event. Click event name to view details and edit."
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
                    if (view.key !== "mobileWeek") {
                      calendarRef.current?.getApi().changeView(view.key);
                    }
                  }}
                >
                  {view.label}
                </button>
              ))}
            </div>
            <button type="button" className="create-event-button" onClick={() => openCreateDialog()}>
              +
            </button>
          </div>

          {isMobile && calendarView === "mobileWeek" ? (
            <section className="mobile-week-view" aria-label="Week view">
              <header className="mobile-week-controls">
                <button type="button" onClick={goToPreviousMobileWeek}>
                  prev
                </button>
                <button type="button" onClick={goToCurrentMobileWeek}>
                  today
                </button>
                <button type="button" onClick={goToNextMobileWeek}>
                  next
                </button>
              </header>

              <div className="mobile-week-days">
                {mobileWeekDays.map((day) => (
                  <article key={day.key} className="mobile-week-day-row">
                    <h4>
                      {new Intl.DateTimeFormat("en-GB", {
                        weekday: "long",
                        day: "2-digit",
                      }).format(day.date)}
                    </h4>

                    <div className="mobile-week-events-list">
                      {day.events.length === 0 ? (
                        <p className="mobile-week-empty">No events</p>
                      ) : (
                        day.events.map((event) => {
                          const statusClass = getEventStatus(event.start, event.end, new Date(nowTick));

                          return (
                            <button
                              key={event.id}
                              type="button"
                              className={`mobile-week-event-card ${statusClass}`}
                              onClick={() => handleEventClick({ event })}
                            >
                              <span className="mobile-week-event-time">
                                <span className="mobile-week-event-dot" aria-hidden="true" />
                                {formatEventTimeRange(event.start, event.end)}
                              </span>
                              <span className="mobile-week-event-name">{event.title || "Untitled event"}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, interactionPlugin, listPlugin]}
            initialView={calendarView}
            viewDidMount={(info) => {
              setCalendarView(info.view.type);
              setCalendarRangeStart(info.view.activeStart?.toISOString() || null);
            }}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "",
            }}
            selectable
            firstDay={1}
            locale="en-gb"
            dayHeaderContent={(arg) => {
              if (arg.view.type === "dayGridMonth") {
                return new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(arg.date);
              }

              return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit" }).format(arg.date);
            }}
            listDayFormat={{
              weekday: "long",
              day: "2-digit",
              month: "2-digit",
            }}
            datesSet={(info) => {
              setCalendarRangeStart(info.startStr || null);
              setCalendarView(info.view.type);
            }}
            views={{
              weekRow: {
                type: "dayGrid",
                duration: { days: 7 },
                dateAlignment: "week",
                fixedWeekCount: false,
                visibleRange(currentDate) {
                  const start = new Date(currentDate);
                  const mondayOffset = (start.getDay() + 6) % 7;
                  start.setDate(start.getDate() - mondayOffset);
                  start.setHours(0, 0, 0, 0);

                  const end = new Date(start);
                  end.setDate(end.getDate() + 7);

                  return { start, end };
                },
              },
            }}
            events={eventsForCalendar}
            eventOrder="start,title"
            displayEventTime
            displayEventEnd={!isMobile}
            eventTimeFormat={{
              hour: "2-digit",
              minute: "2-digit",
              meridiem: false,
            }}
            eventClassNames={(arg) => {
              if (arg.event.extendedProps?.isPlaceholder) {
                return ["event-status-placeholder"];
              }

              return [getEventStatus(arg.event.start, arg.event.end, new Date(nowTick))];
            }}
            select={handleDateSelect}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            height="auto"
            contentHeight="auto"
            expandRows={false}
            dayMaxEventRows={false}
            fixedWeekCount={false}
            />
          )}
        </section>
      )}

      {eventDialogMode && (
        <div className="modal-overlay" role="presentation">
          <section className="modal-card" role="dialog" aria-modal="true">
            {(eventDialogMode === "create" || eventDialogMode === "edit") && (
              <>
                <h3>{eventDialogMode === "create" ? "Create event" : "Edit event"}</h3>
                <form className="event-form" onSubmit={handleEventFormSubmit}>
                  <div className="event-form-grid">
                    <label htmlFor="event-title">Name</label>
                    <input
                      id="event-title"
                      value={eventForm.title}
                      onChange={(e) =>
                        setEventForm((current) => ({
                          ...current,
                          title: e.target.value,
                        }))
                      }
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

                    <label>Timezone</label>
                    <div className="timezone-switch" role="group" aria-label="Timezone selection">
                      {[
                        { key: "user", label: "My timezone" },
                        { key: "msk", label: "MSK (GMT+3)" },
                      ].map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          className={eventForm.timezoneMode === option.key ? "is-active" : ""}
                          onClick={() => {
                            const nextMode = option.key;
                            const currentIso = buildUtcIsoFromInput(
                              eventForm.startDate,
                              eventForm.startTime,
                              eventForm.timezoneMode
                            );
                            const nextParts = formatDateTimeForTimezoneInput(currentIso, nextMode);

                            setEventForm((current) => ({
                              ...current,
                              timezoneMode: nextMode,
                              startDate: current.startDate ? nextParts.startDate : current.startDate,
                              startTime: current.startTime ? nextParts.startTime : current.startTime,
                            }));
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

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
                    <textarea
                      id="event-notes"
                      rows={6}
                      value={eventForm.notes}
                      onChange={(e) =>
                        setEventForm((current) => ({
                          ...current,
                          notes: e.target.value,
                        }))
                      }
                      placeholder={"Add multiple lines and links like:\nhttps://example.com"}
                    />
                  </div>
                  <div className="event-form-actions">
                    <button type="submit">{eventDialogMode === "create" ? "Create" : "Save"}</button>
                    {eventDialogMode === "edit" && selectedEvent?.id && (
                      <button
                        type="button"
                        className="danger-button"
                        onClick={async () => {
                          try {
                            await deleteEvent(selectedEvent.id);
                            closeEventDialog();
                            setError("");
                          } catch (deleteError) {
                            setError(deleteError.message);
                          }
                        }}
                      >
                        Delete
                      </button>
                    )}
                    <button type="button" className="link-button" onClick={closeEventDialog}>
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}

            {eventDialogMode === "view" && selectedEvent && (
              <>
                <h3>{selectedEvent.title}</h3>
                <p className="event-time-row">
                  Starts: {formatDateTimeEu(selectedEvent.start)}
                </p>
                <p className="event-time-row">
                  Ends: {formatDateTimeEu(selectedEvent.end)}
                </p>
                <h4>Description</h4>
                <LinkifiedText text={selectedEvent.notes} />
                <div className="event-form-actions">
                  <button type="button" onClick={startEditingSelectedEvent}>
                    Edit
                  </button>
                  <button type="button" className="link-button" onClick={closeEventDialog}>
                    Close
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
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
