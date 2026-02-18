import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import "./App.css";


const SUPPORTED_LANGUAGES = ["en", "ru"];

const detectBrowserLanguage = () => {
  if (typeof navigator === "undefined") {
    return "en";
  }

  const candidate = (navigator.language || "en").toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.includes(candidate) ? candidate : "en";
};

const UI_TRANSLATIONS = {
  en: {
    month: "Month",
    week: "Week",
    calendar: "Calendar",
    management: "Management",
    settings: "Settings",
    logout: "Logout",
    login: "Login",
    register: "Register",
    pleaseWait: "Please wait...",
    noDescriptionProvided: "No description provided.",
    timeUnavailable: "Time unavailable",
    translationManagement: "Translation management",
    exportTranslations: "Export Excel",
    importTranslations: "Import Excel",
    selectLanguage: "Language",
    signInTitle: "Sign in to your calendar",
    createAccountTitle: "Create a new account",
    needAccount: "Need an account?",
    haveAccount: "Already have an account?",
    welcome: "Welcome",
    pageDescCalendar: "Click + to create an event. Click event name to view details and edit.",
    pageDescAdmin: "Manage users, translations, and Telegram bot configuration.",
    pageDescSettings: "Manage your Telegram subscription, timezone, and password.",
    prev: "Prev",
    today: "Today",
    next: "Next",
    noEvents: "No events",
    untitledEvent: "Untitled event",
    createEvent: "Create event",
    editEvent: "Edit event",
    eventName: "Name",
    eventNamePlaceholder: "Event name",
    startDate: "Start date",
    startTime: "Start time",
    timezone: "Timezone",
    myTimezone: "My timezone",
    lengthMinutes: "Length (minutes)",
    description: "Description",
    descriptionPlaceholder: "Add multiple lines and links like:\nhttps://example.com",
    addAttachment: "Add attachment",
    imageUploadFailed: "Unable to upload image.",
    telegramNotification: "Telegram notification",
    minutesBeforeEvent: "Minutes before event",
    notifyAllTelegramUsers: "Notify all connected Telegram users",
    selectSpecificTelegramUsers: "Select specific users with Telegram bot connected:",
    noConnectedTelegramUsers: "No connected Telegram users available.",
    create: "Create",
    save: "Save",
    delete: "Delete",
    cancel: "Cancel",
    starts: "Starts",
    ends: "Ends",
    edit: "Edit",
    close: "Close",
    loading: "Loading...",
    userManagement: "User Management",
    email: "Email",
    password: "Password",
    passwordNew: "Password (new)",
    approved: "Approved",
    admin: "Admin",
    telegram: "Telegram",
    actions: "Actions",
    leaveBlankToKeep: "Leave blank to keep",
    connected: "Connected",
    notConnected: "Not connected",
    searchTimezone: "Search timezone",
    useSystem: "Use system",
    sendTelegram: "Send Telegram",
    telegramBotSettings: "Telegram bot settings",
    botKey: "Bot key",
    savedEnterReplace: "Saved (enter to replace)",
    enterBotToken: "Enter bot token",
    botName: "Bot name",
    botLink: "Bot link",
    saveTelegramSettings: "Save Telegram settings",
    cleanupOldEventImages: "Delete old event images",
    userSettings: "User Settings",
    loadingSettings: "Loading settings...",
    telegramNotifications: "Telegram notifications",
    connectTelegramInstruction: "Connect your Telegram chat to receive notifications.",
    openBot: "Open the bot",
    botLinkNotConfigured: "Bot link not configured by admin yet.",
    sendStart: "Send",
    inChat: "in the chat.",
    copyMessage: "Copy message",
    afterSendingMessage: "After sending message from step 2",
    verifyConnection: "Verify connection",
    status: "Status",
    regenerateSubscriptionId: "Regenerate subscription id",
    generateSubscriptionId: "Generate subscription id",
    timeZone: "Time zone",
    ianaTimezone: "IANA Timezone",
    useCurrentSystemTimezone: "Use current system timezone",
    saveTimezone: "Save timezone",
    changePassword: "Change password",
    currentPassword: "Current password",
    newPassword: "New password",
    changePasswordBtn: "Change password",
    sendTelegramNotification: "Send Telegram notification",
    user: "User",
    message: "Message",
    enterMessageToSend: "Enter message to send",
    attachImageOptional: "Attach image (optional)",
    imageWillBeDeletedAfterSend: "Image is sent directly and not stored on the server.",
    send: "Send",
    cleanupOldEventImagesDone: "Old event images cleaned: {{events}} events, {{images}} images.",
    noFileSelected: "Select an Excel file first",
    timezoneSelection: "Timezone selection",
    dailyNotifications: "Daily Telegram digest",
    dailyNotificationsHelp: "Send today's events at 10:00 in your timezone (from 10:00 today to 10:00 tomorrow).",
  },
  ru: {
    month: "Месяц",
    week: "Неделя",
    calendar: "Календарь",
    management: "Управление",
    settings: "Настройки",
    logout: "Выйти",
    login: "Войти",
    register: "Регистрация",
    pleaseWait: "Подождите...",
    noDescriptionProvided: "Описание отсутствует.",
    timeUnavailable: "Время недоступно",
    translationManagement: "Управление переводами",
    exportTranslations: "Экспорт Excel",
    importTranslations: "Импорт Excel",
    selectLanguage: "Язык",
    signInTitle: "Войдите в календарь",
    createAccountTitle: "Создайте новый аккаунт",
    needAccount: "Нет аккаунта?",
    haveAccount: "Уже есть аккаунт?",
    welcome: "Добро пожаловать",
    pageDescCalendar: "Нажмите + чтобы создать событие. Нажмите на событие, чтобы просмотреть и изменить.",
    pageDescAdmin: "Управляйте пользователями, переводами и настройками Telegram-бота.",
    pageDescSettings: "Управляйте подпиской Telegram, часовым поясом и паролем.",
    prev: "Назад",
    today: "Сегодня",
    next: "Вперёд",
    noEvents: "Нет событий",
    untitledEvent: "Без названия",
    createEvent: "Создать событие",
    editEvent: "Изменить событие",
    eventName: "Название",
    eventNamePlaceholder: "Название события",
    startDate: "Дата начала",
    startTime: "Время начала",
    timezone: "Часовой пояс",
    myTimezone: "Мой часовой пояс",
    lengthMinutes: "Длительность (минуты)",
    description: "Описание",
    descriptionPlaceholder: "Добавьте несколько строк и ссылки, например:\nhttps://example.com",
    addAttachment: "Добавить вложение",
    imageUploadFailed: "Не удалось загрузить изображение.",
    telegramNotification: "Telegram-уведомление",
    minutesBeforeEvent: "Минут до события",
    notifyAllTelegramUsers: "Уведомить всех подключённых пользователей Telegram",
    selectSpecificTelegramUsers: "Выберите конкретных пользователей с подключённым Telegram-ботом:",
    noConnectedTelegramUsers: "Нет подключённых пользователей Telegram.",
    create: "Создать",
    save: "Сохранить",
    delete: "Удалить",
    cancel: "Отмена",
    starts: "Начало",
    ends: "Окончание",
    edit: "Изменить",
    close: "Закрыть",
    loading: "Загрузка...",
    userManagement: "Управление пользователями",
    email: "Email",
    password: "Пароль",
    passwordNew: "Пароль (новый)",
    approved: "Одобрен",
    admin: "Админ",
    telegram: "Telegram",
    actions: "Действия",
    leaveBlankToKeep: "Оставьте пустым, чтобы не менять",
    connected: "Подключён",
    notConnected: "Не подключён",
    searchTimezone: "Найти часовой пояс",
    useSystem: "Системный",
    sendTelegram: "Отправить в Telegram",
    telegramBotSettings: "Настройки Telegram-бота",
    botKey: "Ключ бота",
    savedEnterReplace: "Сохранено (введите для замены)",
    enterBotToken: "Введите токен бота",
    botName: "Имя бота",
    botLink: "Ссылка бота",
    saveTelegramSettings: "Сохранить настройки Telegram",
    cleanupOldEventImages: "Удалить старые изображения событий",
    userSettings: "Настройки пользователя",
    loadingSettings: "Загрузка настроек...",
    telegramNotifications: "Telegram-уведомления",
    connectTelegramInstruction: "Подключите ваш Telegram-чат, чтобы получать уведомления.",
    openBot: "Откройте бота",
    botLinkNotConfigured: "Ссылка бота ещё не настроена админом.",
    sendStart: "Отправьте",
    inChat: "в чат.",
    copyMessage: "Скопировать сообщение",
    afterSendingMessage: "После отправки сообщения из шага 2",
    verifyConnection: "Проверить подключение",
    status: "Статус",
    regenerateSubscriptionId: "Пересоздать ID подписки",
    generateSubscriptionId: "Создать ID подписки",
    timeZone: "Часовой пояс",
    ianaTimezone: "Часовой пояс IANA",
    useCurrentSystemTimezone: "Использовать текущий системный часовой пояс",
    saveTimezone: "Сохранить часовой пояс",
    changePassword: "Сменить пароль",
    currentPassword: "Текущий пароль",
    newPassword: "Новый пароль",
    changePasswordBtn: "Сменить пароль",
    sendTelegramNotification: "Отправить уведомление в Telegram",
    user: "Пользователь",
    message: "Сообщение",
    enterMessageToSend: "Введите сообщение для отправки",
    attachImageOptional: "Прикрепить изображение (необязательно)",
    imageWillBeDeletedAfterSend: "Изображение отправляется сразу и не сохраняется на сервере.",
    send: "Отправить",
    cleanupOldEventImagesDone: "Старые изображения очищены: событий {{events}}, изображений {{images}}.",
    noFileSelected: "Сначала выберите файл Excel",
    timezoneSelection: "Выбор часового пояса",
    dailyNotifications: "Ежедневная сводка в Telegram",
    dailyNotificationsHelp: "Отправлять события дня в 10:00 вашего часового пояса (с 10:00 сегодня до 10:00 завтра).",
  },
};


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
  dailyNotificationsEnabled: false,
};
const blankTelegramAdmin = { botToken: "", botName: "", botLink: "", hasBotToken: false };
const blankAdminTelegramMessage = { userId: "", userEmail: "", message: "", imageFile: null };
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

const formatDateTimeEu = (value, language = "en") => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const weekday = new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-GB", { weekday: "short" }).format(date);
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

const formatEventTimeRange = (eventStart, eventEnd, language = "en", fallbackLabel = "Time unavailable") => {
  const start = new Date(eventStart);
  const end = eventEnd ? new Date(eventEnd) : null;

  if (Number.isNaN(start.getTime())) {
    return fallbackLabel;
  }

  const formatter = new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-GB", {
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

function LinkifiedText({ text, emptyText }) {
  if (!text) {
    return <p className="event-description-empty">{emptyText}</p>;
  }

  const lines = text.split("\n");
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const imagePattern = /^!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/;

  return (
    <div className="event-description-rich">
      {lines.map((line, lineIndex) => {
        const imageMatch = line.trim().match(imagePattern);

        if (imageMatch) {
          return <img key={`${line}-${lineIndex}`} src={imageMatch[1]} alt="event attachment" style={{ maxWidth: "100%", borderRadius: "8px" }} />;
        }

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

function NotesAttachmentPreview({ text }) {
  if (!text) {
    return null;
  }

  const lines = text.split("\n");
  const imagePattern = /^!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/;
  const images = lines
    .map((line) => line.trim().match(imagePattern)?.[1] || null)
    .filter(Boolean);

  if (!images.length) {
    return null;
  }

  return (
    <div className="event-description-rich">
      {images.map((src, index) => (
        <img key={`${src}-${index}`} src={src} alt="event attachment" style={{ maxWidth: "100%", borderRadius: "8px" }} />
      ))}
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
  const [language, setLanguage] = useState(detectBrowserLanguage);
  const translationsImportInputRef = useRef(null);
  const eventAttachmentInputRef = useRef(null);

  const [eventDialogMode, setEventDialogMode] = useState(null);
  const [eventForm, setEventForm] = useState(blankEventForm);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const timezoneOptions = useMemo(() => getAvailableTimezones(), []);
  const t = useCallback((key) => UI_TRANSLATIONS[language]?.[key] || UI_TRANSLATIONS.en[key] || key, [language]);

  const authHeader = useMemo(() => {
    const headers = { "Content-Type": "application/json", "X-UI-Language": language };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, [token, language]);

  const apiFetch = useCallback(
    (path, options = {}) =>
      fetch(`${API_BASE}${path}`, {
        credentials: "include",
        ...options,
        headers: { "X-UI-Language": language, ...(options.headers || {}) },
      }),
    [language]
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

  const loadEvents = useCallback(async () => {
    const eventsResponse = await apiFetch(`/events`, {
      headers: authHeader,
    });
    const eventsData = await parseJsonSafe(eventsResponse);

    if (!eventsResponse.ok) {
      throw new Error(eventsData.error || "Unable to load events.");
    }

    setEvents(eventsData.events || []);
  }, [apiFetch, authHeader]);

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

        await loadEvents();
      } catch (bootError) {
        setUser(null);
        setEvents([]);
        if (token) {
          setToken("");
        }
      }
    };

    bootstrap();
  }, [apiFetch, authHeader, loadEvents, token]);

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
      status: data.status || "Not connected",
      generatedId: data.generatedId || "",
      dailyNotificationsEnabled: Boolean(data.dailyNotificationsEnabled),
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

  const loadTranslations = async () => {
    const response = await apiFetch(`/i18n/translations`, {
      headers: authHeader,
    });
    const data = await parseJsonSafe(response);

    if (!response.ok) {
      throw new Error(data.error || "Unable to load translations");
    }

  };

  const exportTranslationsFile = async () => {
    try {
      const response = await apiFetch(`/admin/translations/export`, { headers: authHeader });
      if (!response.ok) {
        const data = await parseJsonSafe(response);
        throw new Error(data.error || "Unable to export translations");
      }

      const fileBlob = await response.blob();
      const blob = new Blob([fileBlob], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "translations.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
      setError("");
    } catch (exportError) {
      setError(exportError.message);
    }
  };

  const uploadTranslationsFile = async (file) => {
    if (!file) {
      setError(t("noFileSelected"));
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiFetch(`/admin/translations/import`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}`, "X-UI-Language": language } : { "X-UI-Language": language },
        body: formData,
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to import translations");
      }

      await loadTranslations();
      setError("");
    } catch (importError) {
      setError(importError.message);
    }
  };

  const openTranslationsImportPicker = () => {
    translationsImportInputRef.current?.click();
  };

  const importTranslationsFile = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    await uploadTranslationsFile(file);
  };

  const goToAdminPage = async () => {
    setActivePage("admin");
    setSettingsLoading(true);

    try {
      await Promise.all([loadAdminUsers(), loadTelegramAdminSettings(), loadTelegramConnectedUsers(), loadTranslations()]);
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
      imageFile: null,
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
    const hasImage = Boolean(adminTelegramMessage.imageFile);

    if (!message && !hasImage) {
      setError("Telegram message or image is required.");
      return;
    }

    try {
      const payload = new FormData();
      if (message) {
        payload.append("message", message);
      }
      if (adminTelegramMessage.imageFile) {
        payload.append("image", adminTelegramMessage.imageFile);
      }

      const response = await apiFetch(`/admin/users/${adminTelegramMessage.userId}/telegram-message`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: payload,
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

  const cleanupOldEventImages = async () => {
    try {
      const response = await apiFetch(`/admin/events/cleanup-old-images`, {
        method: "POST",
        headers: authHeader,
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to cleanup old images");
      }

      const message = (t("cleanupOldEventImagesDone") || "")
        .replace("{{events}}", `${data.updatedEventsCount || 0}`)
        .replace("{{images}}", `${data.deletedImagesCount || 0}`);

      setError(message || "Done");
      await loadEvents();
    } catch (cleanupError) {
      setError(cleanupError.message);
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
        status: data.status || (data.linked ? "Connected" : "Not connected"),
      }));
      setError("");
    } catch (tgError) {
      setError(tgError.message);
    }
  };

  const uploadEventImage = async (file) => {
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch(`${API_BASE}/events/attachments`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}`, "X-UI-Language": language } : { "X-UI-Language": language },
      body: formData,
    });
    const data = await parseJsonSafe(response);

    if (!response.ok || !data.url) {
      throw new Error(data.error || t("imageUploadFailed"));
    }

    const markdown = `
![image](${data.url})
`;
    setEventForm((current) => ({
      ...current,
      notes: `${current.notes || ""}${markdown}`.replace(/^\n/, ""),
    }));
  };

  const handleAttachmentInputChange = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      await uploadEventImage(file);
      setError("");
    } catch (uploadError) {
      setError(uploadError.message || t("imageUploadFailed"));
    }
  };

  const handleNotesPaste = async (event) => {
    const files = Array.from(event.clipboardData?.files || []).filter((item) => item.type?.startsWith("image/"));
    if (!files.length) {
      return;
    }

    event.preventDefault();

    for (const file of files) {
      try {
        await uploadEventImage(file);
      } catch (uploadError) {
        setError(uploadError.message || t("imageUploadFailed"));
        return;
      }
    }

    setError("");
  };

  const saveDailyNotificationsEnabled = async (enabled) => {
    try {
      const response = await apiFetch(`/user/daily-notifications`, {
        method: "PUT",
        headers: authHeader,
        body: JSON.stringify({ enabled }),
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to update daily notifications");
      }

      setTelegramUser((current) => ({
        ...current,
        dailyNotificationsEnabled: Boolean(data.enabled),
      }));
      setError("");
    } catch (dailyError) {
      setError(dailyError.message);
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
              language,
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
      label: t("month"),
    },
    {
      key: weekViewKey,
      label: t("week"),
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
          <p>{authMode === "login" ? t("signInTitle") : t("createAccountTitle")}</p>
          <label htmlFor="email">{t("email")}</label>
          <input
            id="email"
            type="email"
            value={authForm.email}
            onChange={(e) => setAuthForm((current) => ({ ...current, email: e.target.value }))}
            required
          />

          <label htmlFor="password">{t("password")}</label>
          <input
            id="password"
            type="password"
            minLength={6}
            value={authForm.password}
            onChange={(e) => setAuthForm((current) => ({ ...current, password: e.target.value }))}
            required
          />

          {error && <p className="error-text">{error}</p>}

          <label htmlFor="auth-language">{t("selectLanguage")}</label>
          <select id="auth-language" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="en">English</option>
            <option value="ru">Русский</option>
          </select>

          <button type="submit" disabled={loading}>
            {loading ? t("pleaseWait") : authMode === "login" ? t("login") : t("register")}
          </button>

          <button
            type="button"
            className="link-button"
            onClick={() => {
              setError("");
              setAuthMode((mode) => (mode === "login" ? "register" : "login"));
            }}
          >
            {authMode === "login" ? `${t("needAccount")} ${t("register")}` : `${t("haveAccount")} ${t("login")}`}
          </button>
        </form>
      </div>
    );
  }

  return (
    <main className="calendar-shell">
      <header className="calendar-header">
        <div>
          <h2>{t("welcome")}, {user.email}</h2>
          <p>
            {activePage === "calendar"
              ? t("pageDescCalendar")
              : activePage === "admin"
              ? t("pageDescAdmin")
              : t("pageDescSettings")}
          </p>
        </div>
        <div className="header-actions">
          <label htmlFor="header-language" className="sr-only">{t("selectLanguage")}</label>
          <select id="header-language" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="en">EN</option>
            <option value="ru">RU</option>
          </select>
          <button type="button" onClick={() => setActivePage("calendar")}>
            {t("calendar")}
          </button>
          {user.isAdmin && (
            <button type="button" onClick={goToAdminPage}>
              {t("management")}
            </button>
          )}
          <button type="button" onClick={goToSettingsPage}>
            {t("settings")}
          </button>
          <button type="button" onClick={logout}>
            {t("logout")}
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
                      {new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-GB", {
                        weekday: "long",
                        day: "2-digit",
                      }).format(day.date)}
                    </h4>

                    <div className="mobile-week-events-list">
                      {day.events.length === 0 ? (
                        <p className="mobile-week-empty">{t("noEvents")}</p>
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
                                {formatEventTimeRange(event.start, event.end, language, t("timeUnavailable"))}
                              </span>
                              <span className="mobile-week-event-name">{event.title || t("untitledEvent")}</span>
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
              locale={language === "ru" ? "ru" : "en-gb"}
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
            dayHeaderContent={(arg) => {
              const locale = language === "ru" ? "ru-RU" : "en-GB";
              if (arg.view.type === "dayGridMonth") {
                return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(arg.date);
              }

              return new Intl.DateTimeFormat(locale, { weekday: "long", day: "2-digit" }).format(arg.date);
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
                <h3>{eventDialogMode === "create" ? t("createEvent") : t("editEvent")}</h3>
                <form className="event-form" onSubmit={handleEventFormSubmit}>
                  <div className="event-form-grid">
                    <label htmlFor="event-title">{t("eventName")}</label>
                    <input
                      id="event-title"
                      value={eventForm.title}
                      onChange={(e) =>
                        setEventForm((current) => ({
                          ...current,
                          title: e.target.value,
                        }))
                      }
                      placeholder={t("eventNamePlaceholder")}
                      required
                    />

                    <label htmlFor="event-start-date">{t("startDate")}</label>
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

                    <label htmlFor="event-start-time">{t("startTime")}</label>
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

                    <label>{t("timezone")}</label>
                    <div className="timezone-switch" role="group" aria-label={t("timezoneSelection")}>
                      {[
                        { key: "user", label: t("myTimezone") },
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

                    <label htmlFor="event-duration">{t("lengthMinutes")}</label>
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

                    <label htmlFor="event-notes">{t("description")}</label>
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
                      placeholder={t("descriptionPlaceholder")}
                      onPaste={handleNotesPaste}
                    />
                    <NotesAttachmentPreview text={eventForm.notes} />
                    <input
                      ref={eventAttachmentInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAttachmentInputChange}
                      style={{ display: "none" }}
                    />
                    <button type="button" className="link-button" onClick={() => eventAttachmentInputRef.current?.click()}>
                      {t("addAttachment")}
                    </button>

                    <label htmlFor="event-telegram-minutes">{t("telegramNotification")}</label>
                    <div className="telegram-event-settings">
                      <div className="telegram-event-row">
                        <span>{t("minutesBeforeEvent")}</span>
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
                        <label className="checkbox-wrap telegram-inline-checkbox">
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
                          {t("notifyAllTelegramUsers")}
                        </label>
                      </div>

                      {!eventForm.telegramNotifyAll && (
                        <div className="telegram-user-pick-list">
                          <p>{t("selectSpecificTelegramUsers")}</p>
                          {telegramConnectedUsers.length === 0 ? (
                            <p className="event-description-empty">{t("noConnectedTelegramUsers")}</p>
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
                    <button type="submit">{eventDialogMode === "create" ? t("create") : t("save")}</button>
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
                        {t("delete")}
                      </button>
                    )}
                    <button type="button" className="link-button" onClick={closeEventDialog}>
                      {t("cancel")}
                    </button>
                  </div>
                </form>
              </>
            )}

            {eventDialogMode === "view" && selectedEvent && (
              <>
                <h3>{selectedEvent.title}</h3>
                <p className="event-time-row">
                  {t("starts")}: {formatDateTimeEu(selectedEvent.start, language)}
                </p>
                <p className="event-time-row">
                  {t("ends")}: {formatDateTimeEu(selectedEvent.end, language)}
                </p>
                <h4>{t("description")}</h4>
                <LinkifiedText text={selectedEvent.notes} emptyText={t("noDescriptionProvided")} />
                <div className="event-form-actions">
                  <button type="button" onClick={startEditingSelectedEvent}>
                    {t("edit")}
                  </button>
                  <button type="button" className="link-button" onClick={closeEventDialog}>
                    {t("close")}
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
            <p>{t("loading")}</p>
          ) : (
            <>
              <h4>{t("userManagement")}</h4>
              <div className="admin-grid">
                <div className="admin-grid-head">{t("email")}</div>
                <div className="admin-grid-head">{t("passwordNew")}</div>
                <div className="admin-grid-head">{t("approved")}</div>
                <div className="admin-grid-head">{t("admin")}</div>
                <div className="admin-grid-head">{t("telegram")}</div>
                <div className="admin-grid-head">Timezone</div>
                <div className="admin-grid-head">{t("actions")}</div>

                {users.map((entry) => (
                  <Fragment key={entry.id}>
                    <input
                      value={entry.email}
                      onChange={(e) => updateUserDraft(entry.id, { email: e.target.value })}
                    />
                    <input
                      type="password"
                      minLength={6}
                      placeholder={t("leaveBlankToKeep")}
                      value={entry.newPassword || ""}
                      onChange={(e) => updateUserDraft(entry.id, { newPassword: e.target.value })}
                    />
                    <label className="checkbox-wrap">
                      <input
                        type="checkbox"
                        checked={Boolean(entry.isApproved)}
                        onChange={(e) => updateUserDraft(entry.id, { isApproved: e.target.checked })}
                      />
                      {t("approved")}
                    </label>
                    <label className="checkbox-wrap">
                      <input
                        type="checkbox"
                        checked={Boolean(entry.isAdmin)}
                        onChange={(e) => updateUserDraft(entry.id, { isAdmin: e.target.checked })}
                      />
                      {t("admin")}
                    </label>
                    <div className="admin-telegram-cell">
                      <span className={entry.telegramStatus === "connected" ? "status-connected" : "status-not-connected"}>
                        {entry.telegramStatus === "connected" ? t("connected") : t("notConnected")}
                      </span>
                    </div>
                    <div className="timezone-input-wrap">
                      <input
                        value={entry.timezone || "UTC"}
                        onChange={(e) => updateUserDraft(entry.id, { timezone: e.target.value })}
                        placeholder={t("searchTimezone")}
                        list="timezone-options"
                      />
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => updateUserDraft(entry.id, { timezone: detectBrowserTimezone() })}
                      >
                        {t("useSystem")}
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
                        {t("sendTelegram")}
                      </button>
                    </div>
                  </Fragment>
                ))}
              </div>

              <h4>{t("translationManagement")}</h4>
              <div className="settings-actions">
                <button type="button" onClick={exportTranslationsFile}>
                  {t("exportTranslations")}
                </button>
                <button type="button" onClick={openTranslationsImportPicker}>
                  {t("importTranslations")}
                </button>
                <input
                  ref={translationsImportInputRef}
                  id="translations-import-file"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={importTranslationsFile}
                  style={{ display: "none" }}
                />
              </div>

              <h4>{t("telegramBotSettings")}</h4>
              <div className="settings-grid">
                <label htmlFor="bot-token">{t("botKey")}</label>
                <input
                  id="bot-token"
                  type="password"
                  placeholder={telegramAdmin.hasBotToken ? t("savedEnterReplace") : t("enterBotToken")}
                  value={telegramAdmin.botToken}
                  onChange={(e) => setTelegramAdmin((current) => ({ ...current, botToken: e.target.value }))}
                />

                <label htmlFor="bot-name">{t("botName")}</label>
                <input
                  id="bot-name"
                  value={telegramAdmin.botName}
                  onChange={(e) => setTelegramAdmin((current) => ({ ...current, botName: e.target.value }))}
                />

                <label htmlFor="bot-link">{t("botLink")}</label>
                <input
                  id="bot-link"
                  placeholder="https://t.me/your_bot"
                  value={telegramAdmin.botLink}
                  onChange={(e) => setTelegramAdmin((current) => ({ ...current, botLink: e.target.value }))}
                />

                <div className="settings-actions">
                  <button type="button" onClick={saveTelegramAdminSettings}>
                    {t("saveTelegramSettings")}
                  </button>
                  <button type="button" className="link-button" onClick={cleanupOldEventImages}>
                    {t("cleanupOldEventImages")}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {activePage === "settings" && (
        <section className="calendar-card">
          <h3>{t("userSettings")}</h3>
          {settingsLoading ? (
            <p>{t("loadingSettings")}</p>
          ) : (
            <>
              <section className="telegram-subscription-block">
                <h4>{t("telegramNotifications")}</h4>
                <p>{t("connectTelegramInstruction")}</p>
                <ol>
                  <li>
                    {t("openBot")}:{" "}
                    {telegramUser.botLink ? (
                      <a href={telegramUser.botLink} target="_blank" rel="noreferrer">
                        {telegramUser.botLink}
                      </a>
                    ) : (
                      <span>{t("botLinkNotConfigured")}</span>
                    )}
                  </li>
                  <li>
                    {t("sendStart")} <code>/start {telegramUser.generatedId || '"generated id"'}</code> {t("inChat")}
                    <button type="button" className="copy-telegram-button" onClick={copyTelegramStartMessage}>
                      {t("copyMessage")}
                    </button>
                  </li>
                  <li>
                    {t("afterSendingMessage")}
                    <button type="button" className="verify-telegram-button" onClick={verifyTelegramSubscription} disabled={!telegramUser.hasBotToken || !telegramUser.generatedId}>
                      {t("verifyConnection")}
                    </button>
                  </li>
                </ol>
                <label className="checkbox-wrap">
                  <input
                    type="checkbox"
                    checked={Boolean(telegramUser.dailyNotificationsEnabled)}
                    onChange={(e) => saveDailyNotificationsEnabled(e.target.checked)}
                  />
                  {t("dailyNotifications")}
                </label>
                <p>{t("dailyNotificationsHelp")}</p>
                <p>
                  {t("status")}: <strong>{telegramUser.status}</strong>
                </p>
                <button type="button" onClick={generateTelegramId}>
                  {telegramUser.generatedId ? t("regenerateSubscriptionId") : t("generateSubscriptionId")}
                </button>
              </section>

              <section className="password-block">
                <h4>{t("timeZone")}</h4>
                <form className="settings-grid" onSubmit={saveOwnTimezone}>
                  <label htmlFor="timezone">{t("ianaTimezone")}</label>
                  <div className="timezone-input-wrap">
                    <input
                      id="timezone"
                      value={timezoneFormValue}
                      onChange={(e) => setTimezoneFormValue(e.target.value)}
                      placeholder={t("searchTimezone")}
                      list="timezone-options"
                      required
                    />
                    <button type="button" className="link-button" onClick={() => setTimezoneFormValue(detectBrowserTimezone())}>
                      {t("useCurrentSystemTimezone")}
                    </button>
                  </div>
                  <div className="settings-actions">
                    <button type="submit">{t("saveTimezone")}</button>
                  </div>
                </form>
              </section>

              <section className="password-block">
                <h4>{t("changePassword")}</h4>
                <form className="settings-grid" onSubmit={changeOwnPassword}>
                  <label htmlFor="current-password">{t("currentPassword")}</label>
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

                  <label htmlFor="new-password">{t("newPassword")}</label>
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
                    <button type="submit">{t("changePasswordBtn")}</button>
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
            <h3>{t("sendTelegramNotification")}</h3>
            <p>
              {t("user")}: <strong>{adminTelegramMessage.userEmail}</strong>
            </p>
            <form onSubmit={sendAdminTelegramMessage} className="settings-grid">
              <label htmlFor="admin-telegram-message">{t("message")}</label>
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
                placeholder={t("enterMessageToSend")}
              />

              <label htmlFor="admin-telegram-image">{t("attachImageOptional")}</label>
              <input
                id="admin-telegram-image"
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setAdminTelegramMessage((current) => ({
                    ...current,
                    imageFile: e.target.files?.[0] || null,
                  }))
                }
              />
              <small>{t("imageWillBeDeletedAfterSend")}</small>

              <div className="settings-actions event-form-actions">
                <button type="submit">{t("send")}</button>
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
