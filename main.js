import {
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getDatabase,
  onValue,
  ref,
  remove, // Import remove for deletion
  update,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

// Firebase configuration for 'addpatients' (for patient overview)
const patientAppConfig = {
  apiKey: "AIzaSyD0bcDszuRnDIhP0xKn5OJsepG_bM4w56Q", // Keep existing API key
  authDomain: "addpatients.firebaseapp.com",
  databaseURL:
    "https://addpatients-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "addpatients",
  storageBucket: "addpatients.appspot.com",
  messagingSenderId: "594219036450",
  appId: "1:594219036450:web:2345ca5c169602c3a5bf7b",
};

// Firebase configuration for 'add-prescription' (for prescription notifications)
const prescriptionAppConfig = {
  apiKey: "AIzaSyDjgeX0SN0iy1_D0ck8I8S981Ae_RbZ_Lg", // API key for 'add-prescription'
  authDomain: "add-prescription.firebaseapp.com",
  databaseURL:
    "https://add-prescription-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "add-prescription",
  storageBucket: "add-prescription.appspot.com",
  messagingSenderId: "356227587000",
  appId: "1:356227587000:web:d17384304f2d3ea0f3cd4d",
};

const loginAppConfig = {
  apiKey: "AIzaSyBnLD8SkcnEPyx9blSBeQwfH5J75hLhJ4Q",
  authDomain: "ahda-login-page.firebaseapp.com",
  projectId: "ahda-login-page",
  storageBucket: "ahda-login-page.appspot.com",
  messagingSenderId: "658853633192",
  appId: "1:658853633192:web:37195e593f0914f799769d",
};

function getOrInitializeApp(config, name) {
  return (
    getApps().find((app) => app.name === name) || initializeApp(config, name)
  );
}

// Initialize Firebase apps for both projects
const patientApp = getOrInitializeApp(patientAppConfig, "patientsApp"); // 'patientsApp' will handle patient data
const prescriptionApp = getOrInitializeApp(
  prescriptionAppConfig,
  "prescriptionApp",
); // 'prescriptionApp' will handle prescriptions
const loginApp = getOrInitializeApp(loginAppConfig, "loginApp"); // 'loginApp' handles logout

// Get database references for both Firebase apps
const patientDatabase = getDatabase(patientApp); // Patient database
const prescriptionDatabase = getDatabase(prescriptionApp); // Prescription database
const auth = getAuth(loginApp);

const stats = {
  patients: 0,
  upcoming: 0,
  dueNow: 0,
  dispensedToday: 0,
};

const seenEventIds = new Set();
const dispensedNotificationKeys = new Set();
let bridgeEventStream = null;
let currentPatients = [];
let currentPrescriptionSummaries = [];
let latestBridgeEvents = [];
let currentBridgeStatus = "Bridge: checking connection...";
let activeBridgeBaseUrl = "http://127.0.0.1:8787";
const BRIDGE_BASE_URLS = ["http://127.0.0.1:8787", "http://localhost:8787"];

const logoutButton = document.getElementById("logout-button");
const botForm = document.getElementById("bot-form");
const botInput = document.getElementById("bot-input");
const botMessages = document.getElementById("bot-messages");

function updateText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = String(value);
  }
}

function updateStatsUI() {
  updateText("stat-patients", stats.patients);
  updateText("stat-upcoming", stats.upcoming);
  updateText("stat-due-now", stats.dueNow);
  updateText("stat-dispensed", stats.dispensedToday);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPatientPrescriptionSummary(patientName) {
  const doses = currentPrescriptionSummaries.filter(
    (item) => item.patientName === patientName,
  );

  return {
    total: doses.length,
    due: doses.filter((item) => item.status.className === "due").length,
    upcoming: doses.filter((item) => item.status.className === "upcoming")
      .length,
    dispensed: doses.filter((item) => item.status.className === "dispensed")
      .length,
  };
}

function getPatientPhoto(patient) {
  return (
    patient.photo ||
    `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="28" fill="#dbeafe"/><circle cx="60" cy="45" r="22" fill="#2563eb"/><path d="M24 104c6-24 24-36 36-36s30 12 36 36" fill="#1d4ed8"/></svg>`)}`
  );
}

function createPatientCard(patient, patientKey) {
  const patientName = patient.name || patientKey;
  const patientPhoto = getPatientPhoto(patient);
  const summary = getPatientPrescriptionSummary(patientName);
  const initials = String(patientName || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const statusLabel = summary.due
    ? `${summary.due} due now`
    : summary.upcoming
      ? `${summary.upcoming} upcoming`
      : "All clear";
  const statusClass = summary.due
    ? "patient-status due"
    : summary.upcoming
      ? "patient-status upcoming"
      : "patient-status clear";

  return `
    <div class="card patient-card" id="${escapeHTML(patientKey)}">
      <div class="patient-card-glow"></div>
      <div class="patient-photo-wrap">
        <img src="${escapeHTML(patientPhoto)}" alt="${escapeHTML(patientName)} photo" />
        <span class="patient-initials">${escapeHTML(initials)}</span>
      </div>
      <div class="card-details">
        <div>
          <p class="text-title">${escapeHTML(patientName)}</p>
          <p class="text-body">${escapeHTML(patient.age || "Age not added")}${patient.age ? " years old" : ""}</p>
          <p class="text-body patient-details">${escapeHTML(patient.details || "No extra details")}</p>
        </div>
        <div class="patient-metrics">
          <span><strong>${summary.total}</strong> doses</span>
          <span><strong>${summary.dispensed}</strong> done</span>
        </div>
        <span class="${statusClass}">${escapeHTML(statusLabel)}</span>
      </div>
      <button class="card-button" data-patient-key="${escapeHTML(patientKey)}">Delete Patient</button>
    </div>
  `;
}

function renderPatientCards(message = "No patients found.") {
  const cardsContainer = document.querySelector(".cards");
  if (!cardsContainer) return;
  cardsContainer.innerHTML = "";

  if (!currentPatients.length) {
    cardsContainer.innerHTML = `<p class="empty-state">${escapeHTML(message)}</p>`;
    return;
  }

  cardsContainer.innerHTML = currentPatients
    .map(({ patient, patientKey }) => createPatientCard(patient, patientKey))
    .join("");
  attachDeleteEventListeners();
}

function handleLogout() {
  signOut(auth)
    .then(() => {
      window.location.href = "index.html";
    })
    .catch((error) => {
      console.error("Logout failed:", error);
      alert("Logout failed. Please try again.");
    });
}

function parse12HourTimeToDate(time) {
  if (!time) return null;
  const match = String(time).match(/(\d+):(\d+)\s?(AM|PM)/i);
  if (!match) {
    return null;
  }

  /*************** Delete Patient Logic *****************/
  const now = new Date();
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  return target;
}

function isTabletDispensed(tablet) {
  const status = String(tablet.status || tablet.dispenseStatus || "")
    .trim()
    .toLowerCase();

  return Boolean(
    tablet.dispensed ||
    tablet.dispensedAt ||
    status === "dispensed" ||
    status === "completed",
  );
}

function getDoseStatus(timeLabel, tablet = {}) {
  if (isTabletDispensed(tablet)) {
    return { label: "Dispensed", className: "dispensed", deltaMin: null };
  }

  const target = parse12HourTimeToDate(timeLabel);
  if (!target)
    return { label: "Invalid", className: "invalid", deltaMin: null };

  const deltaMs = target.getTime() - Date.now();
  const deltaMin = Math.round(deltaMs / 60000);

  if (Math.abs(deltaMin) <= 10)
    return { label: "Due now", className: "due", deltaMin };
  if (deltaMin > 10)
    return { label: `In ${deltaMin} min`, className: "upcoming", deltaMin };

  return {
    label: `${Math.abs(deltaMin)} min overdue`,
    className: "overdue",
    deltaMin,
  };
}

function normalizeSlot(slotName) {
  return String(slotName || "")
    .trim()
    .toUpperCase();
}

function slotToLabel(slot) {
  if (slot === "MORNING") return "Morning";
  if (slot === "AFTERNOON") return "Afternoon";
  return "Evening";
}

function attachDeleteEventListeners() {
  const deleteButtons = document.querySelectorAll(".card-button");

  deleteButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      const patientKey = event.target.getAttribute("data-patient-key");

      if (!confirm("Are you sure you want to delete this patient?")) {
        return;
      }

      const patientRef = ref(patientDatabase, `ADDPATIENT FORM/${patientKey}`);
      remove(patientRef)
        .then(() => {
          const patientCard = document.getElementById(patientKey);
          if (patientCard) {
            patientCard.remove();
          }
        })
        .catch((error) => {
          console.error("Error deleting patient:", error);
        });
    });
  });
}

/*************** New Functionality: Fetching Prescriptions from 'add-prescription' *****************/
function createNotificationCard(
  patientName,
  tabletName,
  slotName,
  time,
  statusInfo,
  notificationKey,
  tabletKey,
) {
  const normalizedSlot = normalizeSlot(slotName);

  return `
      <div class="info ${statusInfo.className}" id="${notificationKey}" data-slot="${normalizedSlot}" data-status="${statusInfo.className}" data-patient-name="${patientName}" data-tablet-name="${tabletName}" data-tablet-key="${tabletKey}">
      <div class="info__icon">
        <img src="main/info.png" alt="Info Icon" />
      </div>
      <div class="info__title">
        <h3>${patientName} • ${tabletName}</h3>
        <p>${slotName}: ${time}</p>
      </div>
     <span class="dose-status ${statusInfo.className}">${statusInfo.label}</span>
      <span class="skip-icon" data-notification-key="${notificationKey}">&times;</span>
    </div>
  `;
}

function attachSkipEventListeners() {
  const skipIcons = document.querySelectorAll(".skip-icon");
  skipIcons.forEach((icon) => {
    icon.addEventListener("click", (event) => {
      const notificationKey = event.target.getAttribute(
        "data-notification-key",
      );
      if (!confirm("Skip this notification?")) {
        return;
      }

      const notificationCard = document.getElementById(notificationKey);
      if (notificationCard) {
        notificationCard.remove();
      }
    });
  });
}

function showBrowserNotification(title, body) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification(title, { body });
    return;
  }

  if (Notification.permission !== "denied") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        new Notification(title, { body });
      }
    });
  }
}

function renderLiveEvent(event) {
  latestBridgeEvents.unshift(event);
  latestBridgeEvents = latestBridgeEvents.slice(0, 20);

  const liveFeed = document.getElementById("live-feed");
  if (!liveFeed) return;

  const line = document.createElement("div");
  line.className = `live-event ${event.type || "info"}`;
  line.textContent = `${new Date(event.timestamp || Date.now()).toLocaleTimeString()} • ${event.message}`;

  liveFeed.prepend(line);
  if (liveFeed.children.length > 40) {
    liveFeed.removeChild(liveFeed.lastChild);
  }
}

function findDispenseNotification(event) {
  const normalizedSlot = normalizeSlot(event.slot);
  if (!normalizedSlot) return null;

  const candidates = Array.from(
    document.querySelectorAll(`.info[data-slot="${normalizedSlot}"]`),
  );

  return (
    candidates.find(
      (element) =>
        event.tabletKey && element.dataset.tabletKey === event.tabletKey,
    ) ||
    candidates.find(
      (element) =>
        event.patientName &&
        event.tabletName &&
        element.dataset.patientName === event.patientName &&
        element.dataset.tabletName === event.tabletName,
    ) ||
    candidates.find((element) => element.dataset.status === "due") ||
    candidates.find((element) => element.dataset.status === "overdue") ||
    candidates.find((element) => element.dataset.status === "upcoming") ||
    null
  );
}

function markNotificationAsDispensed(event) {
  const candidate = findDispenseNotification(event);

  if (!candidate) {
    return;
  }

  const notificationKey = candidate.id;
  const oldStatus = candidate.dataset.status;
  const badge = candidate.querySelector(".dose-status");

  dispensedNotificationKeys.add(notificationKey);
  candidate.classList.remove("due", "overdue", "upcoming", "invalid");
  candidate.classList.add("dispensed");
  candidate.dataset.status = "dispensed";

  if (badge) {
    badge.classList.remove("due", "overdue", "upcoming", "invalid");
    badge.classList.add("dispensed");
    badge.textContent = "Dispensed";
  }

  const titleElement = candidate.querySelector(".info__title p");
  if (titleElement && !titleElement.textContent.includes("• Dispensed")) {
    titleElement.textContent = `${titleElement.textContent} • Dispensed`;
  }

  if (oldStatus === "due") {
    stats.dueNow = Math.max(0, stats.dueNow - 1);
  }

  if (oldStatus === "upcoming") {
    stats.upcoming = Math.max(0, stats.upcoming - 1);
  }

  updateStatsUI();
}

function saveDispensedStatus(event) {
  if (!event.patientName || !event.tabletKey) {
    return;
  }

  const tabletRef = ref(
    prescriptionDatabase,
    `add_prescription/${event.patientName}/tablets/${event.tabletKey}`,
  );

  update(tabletRef, {
    dispensed: true,
    dispensedAt: new Date(event.timestamp || Date.now()).toISOString(),
    dispensedSlot: slotToLabel(normalizeSlot(event.slot)),
    status: "dispensed",
  }).catch((error) => {
    console.error("Error saving dispensed status:", error);
  });
}

function ingestBridgeEvents(events) {
  events.forEach((event) => {
    if (!event.id || seenEventIds.has(event.id)) {
      return;
    }
    seenEventIds.add(event.id);
    renderLiveEvent(event);

    if (event.type === "dispensed") {
      stats.dispensedToday += 1;
      markNotificationAsDispensed(event);
      saveDispensedStatus(event);
      updateStatsUI();
      showBrowserNotification("Medicine dispensed", event.message);
    }

    if (event.type === "blocked") {
      showBrowserNotification("Dispense blocked", event.message);
    }
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getHealthyBridgeBaseUrl() {
  const candidates = [
    activeBridgeBaseUrl,
    ...BRIDGE_BASE_URLS.filter((url) => url !== activeBridgeBaseUrl),
  ];

  for (const baseUrl of candidates) {
    try {
      const healthResponse = await fetchWithTimeout(`${baseUrl}/health`);
      if (healthResponse.ok) {
        activeBridgeBaseUrl = baseUrl;
        return baseUrl;
      }
    } catch (error) {
      console.warn(`Bridge health check failed for ${baseUrl}:`, error);
    }
  }

  throw new Error("Bridge unavailable");
}

async function pollBridgeEvents() {
  const bridgeBanner = document.getElementById("bridge-banner");
  if (!bridgeBanner) return;

  currentBridgeStatus = "Bridge: checking connection...";
  bridgeBanner.textContent = currentBridgeStatus;

  try {
    const baseUrl = await getHealthyBridgeBaseUrl();

    currentBridgeStatus = "Bridge: connected (real-time updates active)";
    bridgeBanner.textContent = currentBridgeStatus;
    bridgeBanner.classList.add("online");

    try {
      const recentResponse = await fetchWithTimeout(`${baseUrl}/events/recent`);
      const recent = await recentResponse.json();
      if (Array.isArray(recent.events)) {
        ingestBridgeEvents(recent.events);
      }
    } catch (error) {
      console.warn(
        "Bridge connected, but recent events could not be loaded:",
        error,
      );
    }

    connectBridgeEventStream();
  } catch (error) {
    currentBridgeStatus =
      "Bridge: offline. Start hardware_bridge.js --server for live dispense notifications.";
    bridgeBanner.textContent = currentBridgeStatus;
    bridgeBanner.classList.remove("online");
  }
}

function connectBridgeEventStream() {
  if (!("EventSource" in window) || bridgeEventStream) {
    return;
  }

  const bridgeBanner = document.getElementById("bridge-banner");
  if (!bridgeBanner) return;
  bridgeEventStream = new EventSource(`${activeBridgeBaseUrl}/events`);

  bridgeEventStream.onopen = () => {
    currentBridgeStatus = "Bridge: connected (live event stream active)";
    bridgeBanner.textContent = currentBridgeStatus;
    bridgeBanner.classList.add("online");
  };

  bridgeEventStream.onmessage = (message) => {
    const event = JSON.parse(message.data);
    ingestBridgeEvents([event]);
  };

  bridgeEventStream.onerror = () => {
    currentBridgeStatus =
      "Bridge: reconnecting live event stream. Polling remains active.";
    bridgeBanner.textContent = currentBridgeStatus;
    bridgeBanner.classList.remove("online");
  };
}

function formatDoseList(items, emptyMessage) {
  if (!items.length) {
    return emptyMessage;
  }

  return items
    .slice(0, 6)
    .map(
      (item) =>
        `${item.patientName}: ${item.tabletName} (${item.slotName} at ${item.time}) - ${item.status.label}`,
    )
    .join("\n");
}

function createBotSummary() {
  const due = currentPrescriptionSummaries.filter(
    (item) => item.status.className === "due",
  );
  const overdue = currentPrescriptionSummaries.filter(
    (item) => item.status.className === "overdue",
  );
  const upcoming = currentPrescriptionSummaries.filter(
    (item) => item.status.className === "upcoming",
  );
  const dispensed = currentPrescriptionSummaries.filter(
    (item) => item.status.className === "dispensed",
  );

  return { due, overdue, upcoming, dispensed };
}

function answerBotQuestion(question) {
  const normalizedQuestion = question.toLowerCase();
  const { due, overdue, upcoming, dispensed } = createBotSummary();

  if (
    normalizedQuestion.includes("bridge") ||
    normalizedQuestion.includes("hardware")
  ) {
    const lastEvent = latestBridgeEvents[0];
    return `Current bridge status: ${currentBridgeStatus}${lastEvent ? `\nLatest bridge event: ${lastEvent.message}` : ""}`;
  }

  if (
    normalizedQuestion.includes("due") ||
    normalizedQuestion.includes("now")
  ) {
    return formatDoseList(
      due,
      "No medicines are due right now based on the current prescription data.",
    );
  }

  if (
    normalizedQuestion.includes("overdue") ||
    normalizedQuestion.includes("miss")
  ) {
    return formatDoseList(
      overdue,
      "No overdue or missed medicines are currently visible on the dashboard.",
    );
  }

  if (
    normalizedQuestion.includes("dispensed") ||
    normalizedQuestion.includes("done")
  ) {
    return formatDoseList(
      dispensed,
      "No dispensed medicines are recorded in the current prescription data yet.",
    );
  }

  if (
    normalizedQuestion.includes("upcoming") ||
    normalizedQuestion.includes("next")
  ) {
    return formatDoseList(
      upcoming,
      "No upcoming doses are currently scheduled.",
    );
  }

  if (
    normalizedQuestion.includes("patient") ||
    normalizedQuestion.includes("summary")
  ) {
    if (!currentPatients.length) {
      return "No patient records are loaded yet.";
    }

    return currentPatients
      .map(({ patient }) => {
        const summary = getPatientPrescriptionSummary(patient.name);
        return `${patient.name}: ${summary.total} scheduled dose(s), ${summary.due} due now, ${summary.upcoming} upcoming, ${summary.dispensed} dispensed.`;
      })
      .join("\n");
  }

  return `Dashboard summary:\nPatients: ${stats.patients}\nDue now: ${stats.dueNow}\nUpcoming: ${stats.upcoming}\nDispensed today: ${stats.dispensedToday}\nTry asking: "What is due now?", "What was dispensed today?", or "Show patient summary."`;
}

function addBotMessage(message, sender = "bot") {
  if (!botMessages) return;

  const bubble = document.createElement("div");
  bubble.className = `bot-message ${sender}`;
  bubble.textContent = message;
  botMessages.appendChild(bubble);
  botMessages.scrollTop = botMessages.scrollHeight;
}

function askSmartBot(question) {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) return;

  addBotMessage(trimmedQuestion, "user");
  addBotMessage(answerBotQuestion(trimmedQuestion), "bot");
}

function initializeSmartBot() {
  if (!botForm || !botInput || !botMessages) return;

  addBotMessage(
    "Hi! I can answer questions from the current dispense dashboard data.",
  );

  botForm.addEventListener("submit", (event) => {
    event.preventDefault();
    askSmartBot(botInput.value);
    botInput.value = "";
  });

  document.querySelectorAll("[data-bot-question]").forEach((button) => {
    button.addEventListener("click", () => {
      askSmartBot(button.dataset.botQuestion || "");
    });
  });
}

initializeSmartBot();

/*************** Skip Notification Logic *****************/
const dbRef = ref(patientDatabase, "ADDPATIENT FORM");
onValue(
  dbRef,
  (snapshot) => {
    currentPatients = [];
    stats.patients = 0;

    if (snapshot.exists()) {
      snapshot.forEach((childSnapshot) => {
        const patient = childSnapshot.val() || {};
        const patientKey = childSnapshot.key;

        if (patient.name || patientKey) {
          stats.patients += 1;
          currentPatients.push({ patient, patientKey });
        }
      });
    }

    renderPatientCards();
    updateStatsUI();
  },
  (error) => {
    console.error("Error loading patients:", error);
    renderPatientCards("Unable to load patients. Check Firebase permissions.");
  },
);

const prescriptionDbRef = ref(prescriptionDatabase, "add_prescription");
onValue(
  prescriptionDbRef,
  (snapshot) => {
    const notificationsContainer = document.querySelector(".ncards");
    if (!notificationsContainer) return;
    notificationsContainer.innerHTML = "";
    stats.upcoming = 0;
    stats.dueNow = 0;
    currentPrescriptionSummaries = [];

    let renderedNotificationCount = 0;

    if (snapshot.exists()) {
      snapshot.forEach((patientSnapshot) => {
        const patientName = patientSnapshot.key;
        const patientData = patientSnapshot.val() || {};
        const tablets = patientData.tablets || patientData;

        if (!tablets || typeof tablets !== "object") return;

        Object.keys(tablets).forEach((tabletKey) => {
          const tablet = tablets[tabletKey];
          const slots = [
            { name: "Morning", time: tablet.morningTime },
            { name: "Afternoon", time: tablet.afternoonTime },
            { name: "Evening", time: tablet.eveningTime || tablet.nightTime },
          ];

          slots.forEach((slot) => {
            if (!slot.time) return;

            const notificationKey = `${patientName}-${tabletKey}-${slot.name}`;
            const status = dispensedNotificationKeys.has(notificationKey)
              ? { label: "Dispensed", className: "dispensed", deltaMin: null }
              : getDoseStatus(slot.time, tablet);
            if (status.className === "upcoming") stats.upcoming += 1;
            if (status.className === "due") stats.dueNow += 1;

            currentPrescriptionSummaries.push({
              patientName,
              tabletName: tablet.tabletName || tabletKey,
              tabletKey,
              slotName: slot.name,
              time: slot.time,
              status,
            });

            notificationsContainer.innerHTML += createNotificationCard(
              patientName,
              tablet.tabletName || tabletKey,
              slot.name,
              slot.time,
              status,
              notificationKey,
              tabletKey,
            );
            renderedNotificationCount += 1;
          });
        });
      });

      attachSkipEventListeners();
    }

    if (!renderedNotificationCount) {
      notificationsContainer.innerHTML =
        '<p class="empty-state">No medication notifications found.</p>';
    }

    renderPatientCards();
    updateStatsUI();
  },
  (error) => {
    console.error("Error loading prescriptions:", error);
    const notificationsContainer = document.querySelector(".ncards");
    if (notificationsContainer) {
      notificationsContainer.innerHTML =
        '<p class="empty-state">Unable to load notifications. Check Firebase permissions.</p>';
    }
  },
);

const refreshedAtElement = document.getElementById("refreshed-at");
setInterval(() => {
  if (refreshedAtElement) {
    refreshedAtElement.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
  }
}, 1000);

if (logoutButton) {
  logoutButton.addEventListener("click", handleLogout);
}

pollBridgeEvents();
setInterval(pollBridgeEvents, 5000);
