import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
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

// Initialize Firebase apps for both projects
const patientApp = initializeApp(patientAppConfig, "patientsApp"); // 'patientsApp' will handle patient data
const prescriptionApp = initializeApp(prescriptionAppConfig, "prescriptionApp"); // 'prescriptionApp' will handle prescriptions

// Get database references for both Firebase apps
const patientDatabase = getDatabase(patientApp); // Patient database
const prescriptionDatabase = getDatabase(prescriptionApp); // Prescription database

const stats = {
  patients: 0,
  upcoming: 0,
  dueNow: 0,
  dispensedToday: 0,
};

const seenEventIds = new Set();
const dispensedNotificationKeys = new Set();
let bridgeEventStream = null;
let latestPatientsSnapshot = null;
const prescriptionPatientPhotoByName = new Map();

function updateStatsUI() {
  document.getElementById("stat-patients").textContent = String(stats.patients);
  document.getElementById("stat-upcoming").textContent = String(stats.upcoming);
  document.getElementById("stat-due-now").textContent = String(stats.dueNow);
  document.getElementById("stat-dispensed").textContent = String(
    stats.dispensedToday,
  );
}

function parse12HourTimeToDate(time) {
  const match = time.match(/(\d+):(\d+)\s?(AM|PM)/i);
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPatientPhotoUrl(patient) {
  const candidateKeys = ["photo", "photoURL", "photoUrl", "image", "imageUrl"];

  for (const key of candidateKeys) {
    const value = patient?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getPrescriptionPhotoByPatientName(patientName) {
  if (!patientName) return "";
  const value = prescriptionPatientPhotoByName.get(String(patientName).trim());
  return typeof value === "string" ? value : "";
}

function getPatientPhotoMarkup(patient) {
  const photoUrl =
    getPatientPhotoUrl(patient) || getPrescriptionPhotoByPatientName(patient?.name);
  if (photoUrl) {
    return `<img src="${photoUrl}" alt="${escapeHtml(patient.name)} photo" loading="lazy" />`;
  }

  const initial = escapeHtml(
    String(patient.name || "?").trim().charAt(0).toUpperCase() || "?",
  );
  return `<div class="patient-photo-placeholder" aria-label="No patient photo available">${initial}</div>`;
}

function createPatientCard(patient, patientKey) {
  return `
    <div class="card" id="${escapeHtml(patientKey)}">
      <div class="card-details">
        ${getPatientPhotoMarkup(patient)}
        <p class="text-title">${escapeHtml(patient.name || "Unnamed patient")}</p>
        <p class="text-body">Age: ${escapeHtml(patient.age || "-")}</p>
        <p class="text-body">Details: ${escapeHtml(patient.details || "-")}</p>
      </div>
      <button class="card-button" data-patient-key="${escapeHtml(patientKey)}">Delete Patient</button>
    </div>
  `;
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

async function pollBridgeEvents() {
  const bridgeBanner = document.getElementById("bridge-banner");

  try {
    const healthResponse = await fetch("http://127.0.0.1:8787/health");
    if (!healthResponse.ok) throw new Error("Bridge unavailable");

    bridgeBanner.textContent = "Bridge: connected (real-time updates active)";
    bridgeBanner.classList.add("online");

    const recentResponse = await fetch("http://127.0.0.1:8787/events/recent");
    const recent = await recentResponse.json();
    if (Array.isArray(recent.events)) {
      ingestBridgeEvents(recent.events);
    }
  } catch (error) {
    bridgeBanner.textContent =
      "Bridge: offline. Start hardware_bridge.js --server for live dispense notifications.";
    bridgeBanner.classList.remove("online");
  }
}

function connectBridgeEventStream() {
  if (!("EventSource" in window) || bridgeEventStream) {
    return;
  }

  const bridgeBanner = document.getElementById("bridge-banner");
  bridgeEventStream = new EventSource("http://127.0.0.1:8787/events");

  bridgeEventStream.onopen = () => {
    bridgeBanner.textContent = "Bridge: connected (live event stream active)";
    bridgeBanner.classList.add("online");
  };

  bridgeEventStream.onmessage = (message) => {
    const event = JSON.parse(message.data);
    ingestBridgeEvents([event]);
  };

  bridgeEventStream.onerror = () => {
    bridgeBanner.textContent =
      "Bridge: reconnecting live event stream. Polling remains active.";
    bridgeBanner.classList.remove("online");
  };
}

/*************** Skip Notification Logic *****************/
function renderPatientCardsFromSnapshot(snapshot) {
  const cardsContainer = document.querySelector(".cards");
  cardsContainer.innerHTML = "";
  stats.patients = 0;

  if (snapshot?.exists()) {
    const patientCards = [];

    snapshot.forEach((childSnapshot) => {
      const patient = childSnapshot.val() || {};
      const patientKey = childSnapshot.key;

      if (!patient.name) {
        return;
      }

      stats.patients += 1;
      patientCards.push(createPatientCard(patient, patientKey));
    });

    if (patientCards.length) {
      cardsContainer.innerHTML = patientCards.join("");
      attachDeleteEventListeners();
    } else {
      cardsContainer.innerHTML = "<p>No patients found.</p>";
    }
  } else {
    cardsContainer.innerHTML = "<p>No patients found.</p>";
  }

  updateStatsUI();
}

const dbRef = ref(patientDatabase, "ADDPATIENT FORM");
onValue(dbRef, (snapshot) => {
  latestPatientsSnapshot = snapshot;
  renderPatientCardsFromSnapshot(snapshot);
});

const prescriptionDbRef = ref(prescriptionDatabase, "add_prescription");
onValue(prescriptionDbRef, (snapshot) => {
  const notificationsContainer = document.querySelector(".ncards");
  notificationsContainer.innerHTML = "";
  stats.upcoming = 0;
  stats.dueNow = 0;

  prescriptionPatientPhotoByName.clear();

  if (snapshot.exists()) {
    snapshot.forEach((patientSnapshot) => {
      const patientName = patientSnapshot.key;
      const patientData = patientSnapshot.val() || {};
      const prescriptionPhoto =
        getPatientPhotoUrl(patientData) || getPatientPhotoUrl(patientData.patient);
      if (prescriptionPhoto && patientName) {
        prescriptionPatientPhotoByName.set(String(patientName).trim(), prescriptionPhoto);
      }
      const tablets = patientData.tablets;

      if (!tablets) return;

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

          notificationsContainer.innerHTML += createNotificationCard(
            patientName,
            tablet.tabletName || tabletKey,
            slot.name,
            slot.time,
            status,
            notificationKey,
            tabletKey,
          );
        });
      });
    });

    attachSkipEventListeners();
  } else {
    notificationsContainer.innerHTML = "<p>No notifications found.</p>";
  }

  updateStatsUI();

  if (latestPatientsSnapshot) {
    renderPatientCardsFromSnapshot(latestPatientsSnapshot);
  }
});

const refreshedAtElement = document.getElementById("refreshed-at");
setInterval(() => {
  if (refreshedAtElement) {
    refreshedAtElement.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
  }
}, 1000);

pollBridgeEvents();
connectBridgeEventStream();
setInterval(pollBridgeEvents, 5000);
