import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD0bcDszuRnDIhP0xKn5OJsepG_bM4w56Q",
  authDomain: "addpatients.firebaseapp.com",
  databaseURL:
    "https://addpatients-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "addpatients",
  storageBucket: "addpatients.appspot.com",
  messagingSenderId: "594219036450",
  appId: "1:594219036450:web:2345ca5c169602c3a5bf7b",
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const prescriptionForm = document.getElementById("prescription-form");
const patientSelect = document.getElementById("patients");
const tabletList = document.getElementById("tablet-list");
const notificationContainer = document.getElementById("missed-dose-notifications");
const patientsRef = ref(database, "ADDPATIENT FORM");
const prescriptionsRef = ref(database, "PRESCRIPTION FORM");

const doseNames = ["morning", "afternoon", "evening"];
const missedPrescriptionKeys = new Set();
let prescriptions = {};

function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `missed-dose-alert ${type}`;
  notification.setAttribute("role", "alert");

  const content = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent =
    type === "warning" ? "Missed medicine" : "Prescription update";
  const body = document.createElement("p");
  body.textContent = message;
  content.append(title, body);

  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.setAttribute("aria-label", "Dismiss notification");
  dismissButton.textContent = "×";
  dismissButton.addEventListener("click", () => {
    notification.remove();
  });

  notification.append(content, dismissButton);
  notificationContainer.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 10000);
}

function getDoseDate(time) {
  if (!time) {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);
  const doseDate = new Date();
  doseDate.setHours(hours, minutes, 0, 0);
  return doseDate;
}

function getMissedDose(prescription) {
  const now = new Date();

  return doseNames.find((doseName) => {
    const doseTime = getDoseDate(prescription.times?.[doseName]);
    return doseTime && now > doseTime && !prescription.dispensed?.[doseName];
  });
}

async function removeMissedPrescription(key, prescription, missedDose) {
  if (missedPrescriptionKeys.has(key)) {
    return;
  }

  missedPrescriptionKeys.add(key);

  try {
    await remove(ref(database, `PRESCRIPTION FORM/${key}`));
    const missedTime = prescription.times?.[missedDose] || "scheduled time";
    showNotification(
      `${prescription.tabletName} for ${prescription.patientName} was not dispensed at ${missedTime}. The prescription has been removed from the database.`,
      "warning"
    );
  } catch (error) {
    missedPrescriptionKeys.delete(key);
    console.error("Error removing missed prescription: ", error);
    showNotification(
      `Unable to remove missed prescription for ${prescription.tabletName}. Please try again.`,
      "error"
    );
  }
}

function checkMissedPrescriptions() {
  Object.entries(prescriptions).forEach(([key, prescription]) => {
    const missedDose = getMissedDose(prescription);

    if (missedDose) {
      removeMissedPrescription(key, prescription, missedDose);
    }
  });
}

function createTextItem(className, text) {
  const item = document.createElement("span");
  item.className = className;
  item.textContent = text;
  return item;
}

function createTabletEntry(key, prescription) {
  const tabletCard = document.createElement("div");
  tabletCard.classList.add("tablet-entry");
  tabletCard.dataset.prescriptionId = key;

  const tabletRow = document.createElement("div");
  tabletRow.className = "tablet-row";
  tabletRow.append(
    createTextItem("tablet-name", prescription.tabletName),
    createTextItem("tablet-patient", prescription.patientName),
    createTextItem("tablet-time", `Morning: ${prescription.times?.morning || "--"}`),
    createTextItem(
      "tablet-time",
      `Afternoon: ${prescription.times?.afternoon || "--"}`
    ),
    createTextItem("tablet-time", `Evening: ${prescription.times?.evening || "--"}`),
    createTextItem("tablet-days", `${prescription.days} days`),
    createTextItem("tablet-dosage", prescription.dosage)
  );

  const dispenseButton = document.createElement("button");
  dispenseButton.type = "button";
  dispenseButton.className = "dispense-btn";
  dispenseButton.textContent = "Mark Dispensed";
  dispenseButton.addEventListener("click", () => {
    markPrescriptionDispensed(key);
  });
  tabletRow.appendChild(dispenseButton);

  tabletCard.appendChild(tabletRow);
  return tabletCard;
}

function renderPrescriptions() {
  tabletList.querySelectorAll(".tablet-entry, .empty-tablets").forEach((entry) => {
    entry.remove();
  });

  const activePrescriptions = Object.entries(prescriptions);

  if (!activePrescriptions.length) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-tablets";
    emptyMessage.textContent = "No active prescriptions found.";
    tabletList.appendChild(emptyMessage);
    return;
  }

  activePrescriptions.forEach(([key, prescription]) => {
    tabletList.appendChild(createTabletEntry(key, prescription));
  });
}

function populatePatients(snapshot) {
  patientSelect.innerHTML = "";

  if (!snapshot.exists()) {
    patientSelect.innerHTML = '<option value="">No patients available</option>';
    patientSelect.disabled = true;
    return;
  }

  patientSelect.disabled = false;
  snapshot.forEach((childSnapshot) => {
    const patient = childSnapshot.val();
    const option = document.createElement("option");
    option.value = childSnapshot.key;
    option.textContent = patient.name || childSnapshot.key;
    patientSelect.appendChild(option);
  });
}

async function markPrescriptionDispensed(key) {
  const prescription = prescriptions[key];

  if (!prescription) {
    return;
  }

  const dispensedUpdates = doseNames.reduce((updates, doseName) => {
    updates[`dispensed/${doseName}`] = true;
    return updates;
  }, {});

  try {
    await update(ref(database, `PRESCRIPTION FORM/${key}`), {
      ...dispensedUpdates,
      dispensedAt: new Date().toISOString(),
    });
    showNotification(`${prescription.tabletName} marked as dispensed.`);
  } catch (error) {
    console.error("Error updating prescription: ", error);
    showNotification("Unable to mark this prescription as dispensed.", "error");
  }
}

prescriptionForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!patientSelect.value) {
    showNotification("Please select a patient before adding a prescription.", "error");
    return;
  }

  const prescriptionData = {
    patientId: patientSelect.value,
    patientName: patientSelect.options[patientSelect.selectedIndex].text,
    tabletName: document.getElementById("tablet-name").value.trim(),
    times: {
      morning: document.getElementById("morning-time").value,
      afternoon: document.getElementById("afternoon-time").value,
      evening: document.getElementById("evening-time").value,
    },
    days: Number(document.getElementById("days").value),
    dosage: document.getElementById("dosage").value.trim(),
    dispensed: {
      morning: false,
      afternoon: false,
      evening: false,
    },
    createdAt: new Date().toISOString(),
  };

  const alreadyMissedDose = getMissedDose(prescriptionData);

  if (alreadyMissedDose) {
    showNotification(
      `${prescriptionData.tabletName} was scheduled for a time that has already passed today and was not saved.`,
      "warning"
    );
    return;
  }

  try {
    await set(push(prescriptionsRef), prescriptionData);
    showNotification(`${prescriptionData.tabletName} prescription added.`);
    prescriptionForm.reset();
  } catch (error) {
    console.error("Error adding prescription: ", error);
    showNotification("Unable to save this prescription to the database.", "error");
  }
});

onValue(patientsRef, populatePatients, (error) => {
  console.error("Error fetching patients: ", error);
  patientSelect.innerHTML = '<option value="">Unable to load patients</option>';
  patientSelect.disabled = true;
});

onValue(
  prescriptionsRef,
  (snapshot) => {
    prescriptions = snapshot.exists() ? snapshot.val() : {};
    renderPrescriptions();
    checkMissedPrescriptions();
  },
  (error) => {
    console.error("Error fetching prescriptions: ", error);
    showNotification("Unable to load prescriptions from the database.", "error");
  }
);

setInterval(checkMissedPrescriptions, 30000);
