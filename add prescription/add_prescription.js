import {
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  set,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

const firebasePatientsConfig = {
  apiKey: "AIzaSyD0bcDszuRnDIhP0xKn5OJsepG_bM4w56Q",
  authDomain: "addpatients.firebaseapp.com",
  databaseURL:
    "https://addpatients-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "addpatients",
  storageBucket: "addpatients.appspot.com",
  messagingSenderId: "594219036450",
  appId: "1:594219036450:web:2345ca5c169602c3a5bf7b",
};

const firebasePrescriptionConfig = {
  apiKey: "AIzaSyDjgeX0SN0iy1_D0ck8I8S981Ae_RbZ_Lg",
  authDomain: "add-prescription.firebaseapp.com",
  databaseURL:
    "https://add-prescription-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "add-prescription",
  storageBucket: "add-prescription.appspot.com",
  messagingSenderId: "356227587000",
  appId: "1:356227587000:web:d17384304f2d3ea0f3cd4d",
};

if (!getApps().find((app) => app.name === "addpatients")) {
  initializeApp(firebasePatientsConfig, "addpatients");
}

if (!getApps().find((app) => app.name === "add_prescription")) {
  initializeApp(firebasePrescriptionConfig, "add_prescription");
}

const databasePatients = getDatabase(
  getApps().find((app) => app.name === "addpatients"),
);

const databasePrescription = getDatabase(
  getApps().find((app) => app.name === "add_prescription"),
);

const prescriptionForm = document.getElementById("prescription-form");
const tabletList = document.getElementById("tablet-list");
const commandPreview = document.getElementById("command-preview");
const exportScheduleButton = document.getElementById("export-schedule");
const sendToBridgeButton = document.getElementById("send-to-bridge");
const clearScheduleButton = document.getElementById("clear-schedule");
const bridgeStatus = document.getElementById("bridge-status");
const patientsDropdown = document.getElementById("patients");
const missedDoseNotifications = document.getElementById(
  "missed-dose-notifications",
);

const scheduleEntries = [];
const missedPrescriptionKeys = new Set();
const MISSED_DOSE_GRACE_PERIOD_MINUTES = 10;
const MISSED_DOSE_CHECK_INTERVAL_MS = 15000;
let latestPrescriptionSnapshot = null;

function convertTo12HourFormat(time) {
  if (!time) {
    return null;
  }

  const [rawHour, minutes] = time.split(":");
  let hour = Number(rawHour);
  const period = hour >= 12 ? "PM" : "AM";

  if (hour === 0) {
    hour = 12;
  } else if (hour > 12) {
    hour -= 12;
  }

  return `${hour}:${minutes} ${period}`;
}

function calculateDaysRemaining(startDate, totalDays) {
  const currentDate = new Date();
  const prescriptionStartDate = new Date(startDate);
  const timeDifference = currentDate - prescriptionStartDate;
  const daysPassed = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
  const remainingDays = Number(totalDays) - daysPassed;
  return remainingDays > 0 ? remainingDays : 0;
}

function parse12HourTimeToDate(timeLabel) {
  if (!timeLabel) {
    return null;
  }

  const match = String(timeLabel)
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);

  if (!match) {
    return null;
  }

  const now = new Date();
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours < 12) {
    hours += 12;
  }

  if (period === "AM" && hours === 12) {
    hours = 0;
  }

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

function getMissedDose(tablet) {
  if (isTabletDispensed(tablet)) {
    return null;
  }

  const slots = [
    { label: "Morning", time: tablet.morningTime },
    { label: "Afternoon", time: tablet.afternoonTime },
    { label: "Evening", time: tablet.eveningTime || tablet.nightTime },
  ];

  return slots.find((slot) => {
    const doseTime = parse12HourTimeToDate(slot.time);
    if (!doseTime) {
      return false;
    }

    const missedAfter = new Date(doseTime);
    missedAfter.setMinutes(
      missedAfter.getMinutes() + MISSED_DOSE_GRACE_PERIOD_MINUTES,
    );

    return Date.now() > missedAfter.getTime();
  });
}

function showMissedDoseNotification(patientName, tablet, missedDose) {
  if (!missedDoseNotifications) {
    alert(
      `Missed dose: ${patientName} did not receive ${tablet.tabletName} at ${missedDose.time}. Prescription removed.`,
    );
    return;
  }

  const notification = document.createElement("div");
  notification.className = "missed-dose-toast";
  notification.setAttribute("role", "alert");

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "missed-dose-close";
  closeButton.setAttribute("aria-label", "Close notification");
  closeButton.textContent = "×";

  const title = document.createElement("strong");
  title.textContent = "Missed dose removed";

  const message = document.createElement("span");
  message.textContent = `${patientName} did not receive ${tablet.tabletName || "this medicine"} for the ${missedDose.label.toLowerCase()} dose at ${missedDose.time}.`;

  closeButton.addEventListener("click", () => notification.remove());

  notification.append(closeButton, title, message);
  missedDoseNotifications.appendChild(notification);
  setTimeout(() => notification.remove(), 10000);
}

function removeMissedPrescription(patientName, tabletKey, tablet, missedDose) {
  const missedKey = `${patientName}/${tabletKey}`;
  if (missedPrescriptionKeys.has(missedKey)) {
    return;
  }

  missedPrescriptionKeys.add(missedKey);

  const tabletRef = ref(
    databasePrescription,
    `add_prescription/${patientName}/tablets/${tabletKey}`,
  );

  remove(tabletRef)
    .then(() => {
      showMissedDoseNotification(patientName, tablet, missedDose);
    })
    .catch((error) => {
      missedPrescriptionKeys.delete(missedKey);
      console.error("Error removing missed prescription:", error);
      alert("Failed to remove missed prescription from Firebase.");
    });
}

function createDispenseCommandLine(slot, time, tabletName) {
  const normalizedSlot = slot.toUpperCase();
  return `AT ${time} -> DISPENSE:${normalizedSlot}  // ${tabletName}`;
}

function buildPayload() {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    entries: scheduleEntries,
  };
}

function formatDoseTime(label, time) {
  return time ? `${label}: ${time}` : `${label}: not scheduled`;
}

function renderCommandPreview() {
  if (!scheduleEntries.length) {
    commandPreview.textContent =
      "No schedule yet. Add a tablet to prepare a hardware bridge review.";
    return;
  }

  const lines = [
    "Review this schedule before sending it to the hardware bridge:",
    "",
  ];

  scheduleEntries.forEach((entry, index) => {
    lines.push(
      `${index + 1}. ${entry.patientName} needs ${entry.tabletName}`,
      `   Dosage: ${entry.dosage}`,
      `   Duration: ${entry.days} day(s)`,
      `   ${formatDoseTime("Morning", entry.morningTime)}`,
      `   ${formatDoseTime("Afternoon", entry.afternoonTime)}`,
      `   ${formatDoseTime("Night", entry.nightTime)}`,
      "",
    );
  });

  lines.push('Click "Send to Hardware Bridge" when this review looks correct.');
  commandPreview.textContent = lines.join("\n").trim();
}

function appendTabletCard(tablet, remainingDays) {
  const tabletCard = document.createElement("div");
  tabletCard.classList.add("tablet-entry");
  tabletCard.innerHTML = `
    <div class="tablet-row">
       <span class="tablet-name">Tablet: ${tablet.tabletName}</span>
      <span class="tablet-time">Morning: ${tablet.morningTime || "-"}</span>
      <span class="tablet-time">Afternoon: ${tablet.afternoonTime || "-"}</span>
      <span class="tablet-time">Evening: ${tablet.eveningTime || tablet.nightTime || "-"}</span>
      <span class="tablet-days">Days Remaining: ${remainingDays}</span>
      <span class="tablet-dosage">Dosage: ${tablet.dosage}</span>
    </div>
  `;

  tabletList.appendChild(tabletCard);
}

function loadTabletsForPatient(patientName) {
  tabletList.innerHTML = "";

  if (!patientName) {
    tabletList.innerHTML = "<p>Select a patient to see prescriptions.</p>";
    return;
  }

  const tabletsRef = ref(
    databasePrescription,
    `add_prescription/${patientName}/tablets`,
  );

  onValue(tabletsRef, (snapshot) => {
    tabletList.innerHTML = "";

    if (!snapshot.exists()) {
      tabletList.innerHTML = "<p>No prescriptions found for this patient.</p>";
      return;
    }

    const tabletsData = snapshot.val();
    let visiblePrescriptionCount = 0;

    Object.keys(tabletsData).forEach((tabletKey) => {
      const tablet = tabletsData[tabletKey];
      const missedDose = getMissedDose(tablet);

      if (missedDose) {
        removeMissedPrescription(patientName, tabletKey, tablet, missedDose);
        return;
      }

      const remainingDays = calculateDaysRemaining(
        tablet.startDate,
        tablet.days,
      );
      visiblePrescriptionCount += 1;
      appendTabletCard(tablet, remainingDays);
    });

    if (!visiblePrescriptionCount) {
      tabletList.innerHTML =
        "<p>No active prescriptions found for this patient.</p>";
    }
  });
}

function scanMissedPrescriptions(snapshot) {
  if (!snapshot?.exists()) {
    return;
  }

  snapshot.forEach((patientSnapshot) => {
    const patientName = patientSnapshot.key;
    const tablets = patientSnapshot.val()?.tablets;

    if (!tablets) {
      return;
    }

    Object.keys(tablets).forEach((tabletKey) => {
      const tablet = tablets[tabletKey];
      const missedDose = getMissedDose(tablet);

      if (missedDose) {
        removeMissedPrescription(patientName, tabletKey, tablet, missedDose);
      }
    });
  });
}

function monitorMissedPrescriptions() {
  const prescriptionsRef = ref(databasePrescription, "add_prescription");

  onValue(prescriptionsRef, (snapshot) => {
    latestPrescriptionSnapshot = snapshot;
    scanMissedPrescriptions(snapshot);
  });

  setInterval(() => {
    scanMissedPrescriptions(latestPrescriptionSnapshot);
  }, MISSED_DOSE_CHECK_INTERVAL_MS);
}

function loadPatients() {
  const patientsRef = ref(databasePatients, "ADDPATIENT FORM/");

  onValue(patientsRef, (snapshot) => {
    patientsDropdown.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.text = "Select a patient";
    defaultOption.value = "";
    patientsDropdown.appendChild(defaultOption);

    if (!snapshot.exists()) {
      return;
    }

    const patientData = snapshot.val();
    Object.keys(patientData).forEach((patientKey) => {
      const patient = patientData[patientKey];
      if (!patient || !patient.name) {
        return;
      }

      const option = document.createElement("option");
      option.value = patient.name;
      option.textContent = patient.name;
      patientsDropdown.appendChild(option);
    });
  });
}

prescriptionForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const patientName = patientsDropdown.value;
  if (!patientName) {
    alert("Please select a patient before adding a prescription.");
    return;
  }

  const tabletName = document.getElementById("tablet-name").value;
  const morningTimeRaw = document.getElementById("morning-time").value;
  const afternoonTimeRaw = document.getElementById("afternoon-time").value;
  const nightTimeRaw = document.getElementById("night-time").value;
  const days = document.getElementById("days").value;
  const dosage = document.getElementById("dosage").value;
  const currentDate = new Date().toISOString().split("T")[0];

  const morningTime = convertTo12HourFormat(morningTimeRaw);
  const afternoonTime = convertTo12HourFormat(afternoonTimeRaw);
  const eveningTime = convertTo12HourFormat(nightTimeRaw);

  const prescriptionRef = ref(
    databasePrescription,
    `add_prescription/${patientName}/tablets`,
  );

  const newPrescriptionRef = push(prescriptionRef);
  const scheduleEntry = {
    patientName,
    tabletKey: newPrescriptionRef.key,
    tabletName,
    dosage,
    morningTime: morningTimeRaw,
    afternoonTime: afternoonTimeRaw,
    nightTime: nightTimeRaw,
    days: Number(days),
  };

  scheduleEntries.push(scheduleEntry);
  renderCommandPreview();

  set(newPrescriptionRef, {
    tabletName,
    morningTime,
    afternoonTime,
    eveningTime,
    nightTime: eveningTime,
    days,
    dosage,
    startDate: currentDate,
  })
    .then(() => {
      prescriptionForm.reset();
      loadTabletsForPatient(patientName);
    })
    .catch((error) => {
      console.error("Error adding prescription:", error);
      alert("Failed to save prescription to Firebase. Check console logs.");
    });
});

patientsDropdown.addEventListener("change", () => {
  loadTabletsForPatient(patientsDropdown.value);
});

exportScheduleButton.addEventListener("click", () => {
  if (!scheduleEntries.length) {
    commandPreview.textContent = "Cannot review: no schedule entries found.";
    return;
  }

  renderCommandPreview();
  bridgeStatus.textContent =
    "Bridge status: schedule review is ready. Send it when approved.";
});

sendToBridgeButton.addEventListener("click", async () => {
  if (!scheduleEntries.length) {
    bridgeStatus.textContent = "Bridge status: add at least one tablet first.";
    return;
  }

  const payload = buildPayload();

  try {
    const response = await fetch("http://127.0.0.1:8787/schedule", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      bridgeStatus.textContent = `Bridge status: failed (${response.status})`;
      return;
    }

    const result = await response.json();
    bridgeStatus.textContent = `Bridge status: sent ${result.loadedEvents} scheduled dose(s) to the hardware bridge at ${result.receivedAt}.`;
  } catch (error) {
    bridgeStatus.textContent =
      "Bridge status: cannot reach bridge. Start hardware_bridge.js in --server mode.";
  }
});

clearScheduleButton.addEventListener("click", () => {
  scheduleEntries.length = 0;

  renderCommandPreview();
  bridgeStatus.textContent = "Bridge status: schedule cleared in UI.";
});

loadPatients();

monitorMissedPrescriptions();

renderCommandPreview();

loadTabletsForPatient("");
