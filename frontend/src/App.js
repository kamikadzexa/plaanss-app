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
  telegramNotifyMinutes: "60",
  telegramNotifyAll: true,
  telegramNotifyUserIds: [],
};
const mobileMediaQuery = "(max-width: 768px)";
const blankPasswordForm = { currentPassword: "", newPassword: "" };
const blankTelegramInfo = {
  botName: "",
  botLink: "",
  hasBotToken: false,
  status: "Not connected",
  generatedId: "",
};
const blankTelegramAdmin = { botToken: "", botName: "", botLink: "", hasBotToken: false };
const blankAdminTelegramMessage = { userId: "", userEmail: "", message: "" };
const languageOptions = [
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
];
const detectBrowserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (error) {
    return "UTC";
  }
};

const getAvailableTimezones = () => {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      const values = Intl.supportedValuesOf("timeZone");
      if (Array.isArray(values) && values.length) {
        return values.includes("UTC") ? values : ["UTC", ...values];
      }
    }
  } catch (error) {
    // no-op fallback below
  }

  return ["UTC", "Europe/Riga", "Europe/London", "Europe/Berlin", "America/New_York", "Asia/Tokyo"];
};

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

const collectStaticTextsFromDom = () => {
  if (typeof document === "undefined") {
    return [];
  }

  const values = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = `${walker.currentNode?.textContent || ""}`.replace(/\s+/g, " ").trim();
    if (!text || text.length < 2) {
      continue;
    }
    if (!/[A-Za-zА-Яа-яЁё]/.test(text)) {
      continue;
    }
    values.add(text);
  }

  return [...values];
};

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
  const [telegramAdmin, setTelegramAdmin] = useState(blankTelegramAdmin);
  const [telegramUser, setTelegramUser] = useState(blankTelegramInfo);
  const [telegramConnectedUsers, setTelegramConnectedUsers] = useState([]);
  const [telegramMessageDialogOpen, setTelegramMessageDialogOpen] = useState(false);
  const [adminTelegramMessage, setAdminTelegramMessage] = useState(blankAdminTelegramMessage);
  const [timezoneFormValue, setTimezoneFormValue] = useState("");
  const [passwordForm, setPasswordForm] = useState(blankPasswordForm);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const calendarRef = useRef(null);
  const [isMobile, setIsMobile] = useState(getInitialIsMobile);
  const [calendarView, setCalendarView] = useState(isMobile ? "mobileWeek" : "dayGridMonth");
  const weekViewKey = isMobile ? "mobileWeek" : "weekRow";
  const [nowTick, setNowTick] = useState(Date.now());
  const [calendarRangeStart, setCalendarRangeStart] = useState(null);

  const [eventDialogMode, setEventDialogMode] = useState(null);
  const [eventForm, setEventForm] = useState(blankEventForm);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const timezoneOptions = useMemo(() => getAvailableTimezones(), []);
  const [language, setLanguage] = useState("en");
  const [translations, setTranslations] = useState({});
  const [capturedTranslations, setCapturedTranslations] = useState(false);
  const [translationImportFile, setTranslationImportFile] = useState(null);
  const [translationImporting, setTranslationImporting] = useState(false);

  const t = useCallback((text) => translations[text] || text, [translations]);

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
        setLanguage(meData.user?.language || "en");

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

  useEffect(() => {
    if (!token) {
      setTranslations({});
      return;
    }

    const loadTranslations = async () => {
      try {
        const response = await apiFetch(`/translations?language=${language}`, {
          headers: authHeader,
        });
        const data = await parseJsonSafe(response);
        if (response.ok) {
          setTranslations(data.dictionary || {});
        }
      } catch (translationError) {
        // keep fallback strings
      }
    };

    loadTranslations();
  }, [apiFetch, authHeader, language, token]);

  useEffect(() => {
    if (!token || capturedTranslations) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const entries = collectStaticTextsFromDom();
        if (!entries.length) {
          return;
        }

        await apiFetch(`/translations/capture`, {
          method: "POST",
          headers: authHeader,
          body: JSON.stringify({ sourceType: "frontend-runtime", entries }),
        });
        setCapturedTranslations(true);
      } catch (captureError) {
        // no-op
      }
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [activePage, apiFetch, authHeader, capturedTranslations, token]);

  const saveLanguage = async (nextLanguage) => {
    try {
      const response = await apiFetch(`/user/language`, {
        method: "PUT",
        headers: authHeader,
        body: JSON.stringify({ language: nextLanguage }),
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to update language");
      }

      setUser((current) => ({ ...current, language: data.user?.language || nextLanguage }));
      setLanguage(data.user?.language || nextLanguage);
      setError("");
    } catch (languageError) {
      setError(languageError.message);
    }
  };

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

  const loadTelegramAdminSettings = async () => {
    if (!user?.isAdmin) {
      return;
    }

    const response = await apiFetch(`/admin/telegram-settings`, {
      headers: authHeader,
    });
    const data = await parseJsonSafe(response);

    if (!response.ok) {
      throw new Error(data.error || "Unable to load Telegram bot settings");
    }

    setTelegramAdmin((current) => ({
      ...current,
      botName: data.settings?.botName || "",
      botLink: data.settings?.botLink || "",
      hasBotToken: Boolean(data.settings?.hasBotToken),
    }));
  };

  const loadUserSettings = async () => {
    const response = await apiFetch(`/user/telegram`, {
      headers: authHeader,
    });
    const data = await parseJsonSafe(response);

    if (!response.ok) {
      throw new Error(data.error || "Unable to load Telegram subscription");
    }

    setTelegramUser({
      botName: data.botName || "",
      botLink: data.botLink || "",
      hasBotToken: Boolean(data.hasBotToken),
      status: data.status || t("Not connected"),
      generatedId: data.generatedId || "",
    });
  };

  const loadTelegramConnectedUsers = async () => {
    const response = await apiFetch(`/telegram/connected-users`, {
      headers: authHeader,
    });
    const data = await parseJsonSafe(response);

    if (!response.ok) {
      throw new Error(data.error || "Unable to load Telegram connected users");
    }

    setTelegramConnectedUsers(data.users || []);
  };

  const goToAdminPage = async () => {
    setActivePage("admin");
    setSettingsLoading(true);

    try {
      await Promise.all([loadAdminUsers(), loadTelegramAdminSettings(), loadTelegramConnectedUsers()]);
      setError("");
    } catch (adminError) {
      setError(adminError.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  const openAdminTelegramMessageDialog = (entry) => {
    setAdminTelegramMessage({
      userId: `${entry.id}`,
      userEmail: entry.email,
      message: "",
    });
    setTelegramMessageDialogOpen(true);
  };

  const closeAdminTelegramMessageDialog = () => {
    setTelegramMessageDialogOpen(false);
    setAdminTelegramMessage(blankAdminTelegramMessage);
  };

  const sendAdminTelegramMessage = async (event) => {
    event.preventDefault();

    const message = adminTelegramMessage.message.trim();
    if (!message) {
      setError("Telegram message cannot be empty.");
      return;
    }

    try {
      const response = await apiFetch(`/admin/users/${adminTelegramMessage.userId}/telegram-message`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({ message }),
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to send Telegram message");
      }

      setError("");
      closeAdminTelegramMessageDialog();
    } catch (sendError) {
      setError(sendError.message);
    }
  };

  const goToSettingsPage = async () => {
    setActivePage("settings");
    setSettingsLoading(true);

    try {
      await loadUserSettings();
      setTimezoneFormValue(user?.timezone || "UTC");
      setPasswordForm(blankPasswordForm);
      setError("");
    } catch (settingsError) {
      setError(settingsError.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveTelegramAdminSettings = async () => {
    try {
      const payload = {
        botToken: telegramAdmin.botToken.trim(),
        botName: telegramAdmin.botName.trim(),
        botLink: telegramAdmin.botLink.trim(),
      };

      const response = await apiFetch(`/admin/telegram-settings`, {
        method: "PUT",
        headers: authHeader,
        body: JSON.stringify(payload),
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Failed to save Telegram bot settings");
      }

      setTelegramAdmin((current) => ({
        ...current,
        botToken: "",
        botName: data.settings?.botName || current.botName,
        botLink: data.settings?.botLink || current.botLink,
        hasBotToken: Boolean(data.settings?.hasBotToken),
      }));

      setError("");
    } catch (settingsError) {
      setError(settingsError.message);
    }
  };

  const arrayBufferToBase64 = (arrayBuffer) => {
    const bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 0x8000;
    let binary = "";

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  };

  const exportTranslations = async () => {
    try {
      const response = await apiFetch(`/translations/export`, {
        method: "GET",
        headers: authHeader,
      });

      if (!response.ok) {
        const data = await parseJsonSafe(response);
        throw new Error(data.error || "Unable to export translations");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = "translations.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(downloadUrl);
      setError("");
    } catch (exportError) {
      setError(exportError.message);
    }
  };

  const importTranslations = async () => {
    if (!translationImportFile) {
      setError("Choose an Excel file before importing.");
      return;
    }

    try {
      setTranslationImporting(true);
      const buffer = await translationImportFile.arrayBuffer();
      const contentBase64 = arrayBufferToBase64(buffer);

      const response = await apiFetch(`/translations/import-file`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({
          filename: translationImportFile.name,
          contentBase64,
        }),
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to import translations");
      }

      setTranslationImportFile(null);
      const fileInput = document.getElementById("translations-import-file");
      if (fileInput) {
        fileInput.value = "";
      }
      setError("");
    } catch (importError) {
      setError(importError.message);
    } finally {
      setTranslationImporting(false);
    }
  };

  const generateTelegramId = async () => {
    try {
      const response = await apiFetch(`/user/telegram/generate`, {
        method: "POST",
        headers: authHeader,
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to generate Telegram id");
      }

      setTelegramUser((current) => ({
        ...current,
        generatedId: data.generatedId || "",
        status: "Not connected",
      }));
      setError("");
    } catch (tgError) {
      setError(tgError.message);
    }
  };

  const verifyTelegramSubscription = async () => {
    try {
      const response = await apiFetch(`/user/telegram/verify`, {
        method: "POST",
        headers: authHeader,
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to verify Telegram subscription");
      }

      setTelegramUser((current) => ({
        ...current,
        generatedId: data.linked ? "" : current.generatedId,
        status: data.status || (data.linked ? t("Connected") : t("Not connected")),
      }));
      setError("");
    } catch (tgError) {
      setError(tgError.message);
    }
  };

  const copyTelegramStartMessage = async () => {
    const message = `/start ${telegramUser.generatedId || 'generated id'}`;

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(message);
        setError("");
        return;
      } catch (copyError) {
        // fallback below
      }
    }

    try {
      const textArea = document.createElement("textarea");
      textArea.value = message;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "absolute";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setError("");
    } catch (fallbackError) {
      setError("Unable to copy message automatically. Please copy it manually.");
    }
  };

  const changeOwnPassword = async (event) => {
    event.preventDefault();

    try {
      const response = await apiFetch(`/user/password`, {
        method: "PUT",
        headers: authHeader,
        body: JSON.stringify(passwordForm),
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to change password");
      }

      setPasswordForm(blankPasswordForm);
      setError("");
    } catch (pwdError) {
      setError(pwdError.message);
    }
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload =
        authMode === "register"
          ? {
              ...authForm,
              timezone: detectBrowserTimezone(),
            }
          : authForm;

      const response = await apiFetch(`/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const toggleTelegramNotifyUserId = (targetId, checked) => {
    setEventForm((current) => {
      const nextIds = checked
        ? [...new Set([...current.telegramNotifyUserIds, targetId])]
        : current.telegramNotifyUserIds.filter((id) => `${id}` !== `${targetId}`);

      return {
        ...current,
        telegramNotifyUserIds: nextIds,
      };
    });
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
      telegramNotification: {
        minutesBefore: Number.parseInt(eventForm.telegramNotifyMinutes, 10) || 60,
        notifyAll: Boolean(eventForm.telegramNotifyAll),
        userIds: eventForm.telegramNotifyAll ? [] : eventForm.telegramNotifyUserIds,
      },
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
      start: calendarEvent.startStr || calendarEvent.start || null,
      end: calendarEvent.endStr || calendarEvent.end || null,
      notes: calendarEvent.extendedProps?.notes || calendarEvent.notes || "",
      allDay: Boolean(calendarEvent.allDay),
      telegramNotification: calendarEvent.extendedProps?.telegramNotification || calendarEvent.telegramNotification || {
        minutesBefore: 60,
        notifyAll: true,
        userIds: [],
      },
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
      telegramNotifyMinutes: `${selectedEvent.telegramNotification?.minutesBefore || 60}`,
      telegramNotifyAll: Boolean(selectedEvent.telegramNotification?.notifyAll ?? true),
      telegramNotifyUserIds: selectedEvent.telegramNotification?.userIds || [],
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
        timezone: entry.timezone || "UTC",
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

  const saveOwnTimezone = async (event) => {
    event.preventDefault();

    try {
      const response = await apiFetch(`/user/timezone`, {
        method: "PUT",
        headers: authHeader,
        body: JSON.stringify({ timezone: timezoneFormValue }),
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to update timezone");
      }

      setUser((current) => ({
        ...current,
        timezone: data.user?.timezone || current?.timezone || "UTC",
      }));
      setTimezoneFormValue(data.user?.timezone || timezoneFormValue);
      setError("");
    } catch (timezoneError) {
      setError(timezoneError.message);
    }
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
    setTelegramAdmin(blankTelegramAdmin);
    setTelegramUser(blankTelegramInfo);
    setPasswordForm(blankPasswordForm);
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
          <p>{authMode === "login" ? t("Sign in to your calendar") : t("Create a new account")}</p>
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
            {loading ? t("Please wait...") : authMode === "login" ? t("Login") : t("Register")}
          </button>

          <button
            type="button"
            className="link-button"
            onClick={() => {
              setError("");
              setAuthMode((mode) => (mode === "login" ? "register" : "login"));
            }}
          >
            {authMode === "login" ? t("Need an account? Register") : t("Already have an account? Login")}
          </button>
        </form>
      </div>
    );
  }

  return (
    <main className="calendar-shell">
      <header className="calendar-header">
        <div>
          <h2>{t("Welcome")}, {user.email}</h2>
          <p>
            {activePage === "calendar"
              ? t("Click + to create an event. Click event name to view details and edit.")
              : activePage === "admin"
              ? t("Manage users and Telegram bot configuration.")
              : t("Manage your Telegram subscription and password.")}
          </p>
        </div>
        <div className="header-actions">
          <select className="language-select" value={language} onChange={(e) => saveLanguage(e.target.value)} aria-label={t("Language")}>
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button type="button" onClick={() => setActivePage("calendar")}>
            {t("Calendar")}
          </button>
          {user.isAdmin && (
            <button type="button" onClick={goToAdminPage}>
              {t("Management")}
            </button>
          )}
          <button type="button" onClick={goToSettingsPage}>
            {t("Settings")}
          </button>
          <button type="button" onClick={logout}>
            {t("Logout")}
          </button>
        </div>
      </header>

      {error && <p className="error-text">{error}</p>}

      <datalist id="timezone-options">
        {timezoneOptions.map((timezone) => (
          <option key={timezone} value={timezone} />
        ))}
      </datalist>

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
                  {t("prev")}
                </button>
                <button type="button" onClick={goToCurrentMobileWeek}>
                  {t("today")}
                </button>
                <button type="button" onClick={goToNextMobileWeek}>
                  {t("next")}
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
                        <p className="mobile-week-empty">{t("No events")}</p>
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

                    <label htmlFor="event-telegram-minutes">Telegram notification</label>
                    <div className="telegram-event-settings">
                      <div className="telegram-event-row">
                        <span>Minutes before event</span>
                        <input
                          id="event-telegram-minutes"
                          type="number"
                          min={1}
                          max={10080}
                          value={eventForm.telegramNotifyMinutes}
                          onChange={(e) =>
                            setEventForm((current) => ({
                              ...current,
                              telegramNotifyMinutes: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <label className="checkbox-wrap">
                        <input
                          type="checkbox"
                          checked={Boolean(eventForm.telegramNotifyAll)}
                          onChange={(e) =>
                            setEventForm((current) => ({
                              ...current,
                              telegramNotifyAll: e.target.checked,
                            }))
                          }
                        />
                        Notify all connected Telegram users
                      </label>

                      {!eventForm.telegramNotifyAll && (
                        <div className="telegram-user-pick-list">
                          <p>Select specific users with Telegram bot connected:</p>
                          {telegramConnectedUsers.length === 0 ? (
                            <p className="event-description-empty">No connected Telegram users available.</p>
                          ) : (
                            telegramConnectedUsers.map((entry) => (
                              <label key={entry.id} className="checkbox-wrap">
                                <input
                                  type="checkbox"
                                  checked={eventForm.telegramNotifyUserIds.some((id) => `${id}` === `${entry.id}`)}
                                  onChange={(e) => toggleTelegramNotifyUserId(entry.id, e.target.checked)}
                                />
                                {entry.email}
                              </label>
                            ))
                          )}
                        </div>
                      )}
                    </div>
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
          <h3>Management</h3>
          {settingsLoading || adminLoading ? (
            <p>Loading...</p>
          ) : (
            <>
              <h4>User Management</h4>
              <div className="admin-grid">
                <div className="admin-grid-head">Email</div>
                <div className="admin-grid-head">Password (new)</div>
                <div className="admin-grid-head">Approved</div>
                <div className="admin-grid-head">Admin</div>
                <div className="admin-grid-head">Telegram</div>
                <div className="admin-grid-head">Timezone</div>
                <div className="admin-grid-head">Actions</div>

                {users.map((entry) => (
                  <Fragment key={entry.id}>
                    <input
                      value={entry.email}
                      onChange={(e) => updateUserDraft(entry.id, { email: e.target.value })}
                    />
                    <input
                      type="password"
                      minLength={6}
                      placeholder="Leave blank to keep"
                      value={entry.newPassword || ""}
                      onChange={(e) => updateUserDraft(entry.id, { newPassword: e.target.value })}
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
                    <div className="admin-telegram-cell">
                      <span className={entry.telegramStatus === "connected" ? "status-connected" : "status-not-connected"}>
                        {entry.telegramStatus === "connected" ? t("Connected") : t("Not connected")}
                      </span>
                    </div>
                    <div className="timezone-input-wrap">
                      <input
                        value={entry.timezone || "UTC"}
                        onChange={(e) => updateUserDraft(entry.id, { timezone: e.target.value })}
                        placeholder={t("Search timezone")}
                        list="timezone-options"
                      />
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => updateUserDraft(entry.id, { timezone: detectBrowserTimezone() })}
                      >
                        Use system
                      </button>
                    </div>
                    <div className="admin-row-actions">
                      <button type="button" onClick={() => saveUser(entry)}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        disabled={entry.telegramStatus !== "connected"}
                        onClick={() => openAdminTelegramMessageDialog(entry)}
                      >
                        Send Telegram
                      </button>
                    </div>
                  </Fragment>
                ))}
              </div>


              <h4>Translations</h4>
              <div className="translation-admin-tools">
                <button type="button" onClick={exportTranslations}>
                  Export translations (Excel)
                </button>
                <div className="translation-import-row">
                  <input
                    id="translations-import-file"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setTranslationImportFile(e.target.files?.[0] || null)}
                  />
                  <button type="button" onClick={importTranslations} disabled={!translationImportFile || translationImporting}>
                    {translationImporting ? "Importing..." : "Import translations (Excel)"}
                  </button>
                </div>
              </div>

              <h4>Telegram bot settings</h4>
              <div className="settings-grid">
                <label htmlFor="bot-token">Bot key</label>
                <input
                  id="bot-token"
                  type="password"
                  placeholder={telegramAdmin.hasBotToken ? "Saved (enter to replace)" : "Enter bot token"}
                  value={telegramAdmin.botToken}
                  onChange={(e) => setTelegramAdmin((current) => ({ ...current, botToken: e.target.value }))}
                />

                <label htmlFor="bot-name">Bot name</label>
                <input
                  id="bot-name"
                  value={telegramAdmin.botName}
                  onChange={(e) => setTelegramAdmin((current) => ({ ...current, botName: e.target.value }))}
                />

                <label htmlFor="bot-link">Bot link</label>
                <input
                  id="bot-link"
                  placeholder="https://t.me/your_bot"
                  value={telegramAdmin.botLink}
                  onChange={(e) => setTelegramAdmin((current) => ({ ...current, botLink: e.target.value }))}
                />

                <div className="settings-actions">
                  <button type="button" onClick={saveTelegramAdminSettings}>
                    Save Telegram settings
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {activePage === "settings" && (
        <section className="calendar-card">
          <h3>User Settings</h3>
          {settingsLoading ? (
            <p>Loading settings...</p>
          ) : (
            <>
              <section className="telegram-subscription-block">
                <h4>Telegram notifications</h4>
                <p>Connect your Telegram chat to receive notifications.</p>
                <ol>
                  <li>
                    Open the bot:{" "}
                    {telegramUser.botLink ? (
                      <a href={telegramUser.botLink} target="_blank" rel="noreferrer">
                        {telegramUser.botLink}
                      </a>
                    ) : (
                      <span>Bot link not configured by admin yet.</span>
                    )}
                  </li>
                  <li>
                    Send <code>/start {telegramUser.generatedId || '"generated id"'}</code> in the chat.
                    <button type="button" className="copy-telegram-button" onClick={copyTelegramStartMessage}>
                      Copy message
                    </button>
                  </li>
                  <li>
                    After sending message from step 2
                    <button type="button" className="verify-telegram-button" onClick={verifyTelegramSubscription} disabled={!telegramUser.hasBotToken || !telegramUser.generatedId}>
                      Verify connection
                    </button>
                  </li>
                </ol>
                <p>
                  Status: <strong>{telegramUser.status}</strong>
                </p>
                <button type="button" onClick={generateTelegramId}>
                  {telegramUser.generatedId ? t("Regenerate subscription id") : t("Generate subscription id")}
                </button>
              </section>

              <section className="password-block">
                <h4>Time zone</h4>
                <form className="settings-grid" onSubmit={saveOwnTimezone}>
                  <label htmlFor="timezone">IANA Timezone</label>
                  <div className="timezone-input-wrap">
                    <input
                      id="timezone"
                      value={timezoneFormValue}
                      onChange={(e) => setTimezoneFormValue(e.target.value)}
                      placeholder={t("Search timezone")}
                      list="timezone-options"
                      required
                    />
                    <button type="button" className="link-button" onClick={() => setTimezoneFormValue(detectBrowserTimezone())}>
                      Use current system timezone
                    </button>
                  </div>
                  <div className="settings-actions">
                    <button type="submit">Save timezone</button>
                  </div>
                </form>
              </section>

              <section className="password-block">
                <h4>Change password</h4>
                <form className="settings-grid" onSubmit={changeOwnPassword}>
                  <label htmlFor="current-password">Current password</label>
                  <input
                    id="current-password"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm((current) => ({
                        ...current,
                        currentPassword: e.target.value,
                      }))
                    }
                    required
                  />

                  <label htmlFor="new-password">New password</label>
                  <input
                    id="new-password"
                    type="password"
                    minLength={6}
                    value={passwordForm.newPassword}
                    onChange={(e) =>
                      setPasswordForm((current) => ({
                        ...current,
                        newPassword: e.target.value,
                      }))
                    }
                    required
                  />

                  <div className="settings-actions">
                    <button type="submit">Change password</button>
                  </div>
                </form>
              </section>
            </>
          )}
        </section>
      )}

      {telegramMessageDialogOpen && (
        <div className="modal-overlay" role="presentation">
          <section className="modal-card" role="dialog" aria-modal="true">
            <h3>Send Telegram notification</h3>
            <p>
              User: <strong>{adminTelegramMessage.userEmail}</strong>
            </p>
            <form onSubmit={sendAdminTelegramMessage} className="settings-grid">
              <label htmlFor="admin-telegram-message">Message</label>
              <textarea
                id="admin-telegram-message"
                rows={5}
                value={adminTelegramMessage.message}
                onChange={(e) =>
                  setAdminTelegramMessage((current) => ({
                    ...current,
                    message: e.target.value,
                  }))
                }
                placeholder="Enter message to send"
                required
              />

              <div className="settings-actions event-form-actions">
                <button type="submit">Send</button>
                <button type="button" className="link-button" onClick={closeAdminTelegramMessageDialog}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

    </main>
  );
}

export default App;
