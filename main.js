import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getDatabase,
  onValue,
  ref,
  remove, // Import remove for deletion
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

/*************** Existing Patient Overview Functionality (Keep this as it is) *****************/
const dbRef = ref(patientDatabase, "ADDPATIENT FORM");
onValue(
  dbRef,
  (snapshot) => {
    const cardsContainer = document.querySelector(".cards");
    cardsContainer.innerHTML = ""; // Clear existing cards

    if (snapshot.exists()) {
      snapshot.forEach((childSnapshot) => {
        const patient = childSnapshot.val();
        const patientKey = childSnapshot.key; // Key to identify which patient to delete

        if (patient.name && patient.age && patient.photo) {
          const cardHTML = `
            <div class="card" id="${patientKey}">
              <div class="card-details">
                <img src="${patient.photo}" alt="Patient Photo" />
                <p class="text-title">${patient.name}</p>
                <p class="text-body">Age: ${patient.age}</p>
                <p class="text-body">Details: ${patient.details}</p>
              </div>
              <button class="card-button" data-patient-key="${patientKey}">Delete Patient</button>
            </div>
          `;
          cardsContainer.innerHTML += cardHTML;
        }
      });

      // Attach delete functionality to all delete buttons after cards are rendered
      attachDeleteEventListeners();
    } else {
      console.log("No data available");
      cardsContainer.innerHTML = "<p>No patients found.</p>";
    }
  },
  (error) => {
    console.error("Error fetching patient data: ", error);
  }
);

/*************** Delete Patient Logic *****************/
function attachDeleteEventListeners() {
  const deleteButtons = document.querySelectorAll(".card-button");

  deleteButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      const patientKey = event.target.getAttribute("data-patient-key");

      // Confirm the deletion
      if (confirm("Are you sure you want to delete this patient?")) {
        // Delete the patient from Firebase
        const patientRef = ref(
          patientDatabase,
          `ADDPATIENT FORM/${patientKey}`
        );

        remove(patientRef)
          .then(() => {
            console.log(`Patient ${patientKey} deleted successfully.`);

            // Remove the patient card from the DOM
            const patientCard = document.getElementById(patientKey);
            if (patientCard) {
              patientCard.remove();
            }
          })
          .catch((error) => {
            console.error("Error deleting patient: ", error);
          });
      }
    });
  });
}

/*************** New Functionality: Fetching Prescriptions from 'add-prescription' *****************/
function createNotificationCard(patientName, time, notificationKey) {
  return `
    <div class="info" id="${notificationKey}">
      <div class="info__icon">
        <img src="main/info.png" alt="Info Icon" />
      </div>
      <div class="info__title">
        <h3>Upcoming Medication</h3>
        <p>${patientName}: ${time}</p>
      </div>
      <span class="skip-icon" data-notification-key="${notificationKey}">&times;</span> <!-- Skip Icon -->
    </div>
  `;
}

// Helper function to check if a given time has passed
function hasTimePassed(time) {
  const [hour, minute, period] = time.match(/(\d+):(\d+) (\w+)/).slice(1);
  const date = new Date();
  let hours = parseInt(hour);

  // Convert 12-hour format to 24-hour format for comparison
  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  const timeToCompare = new Date();
  timeToCompare.setHours(hours, minute, 0);

  return timeToCompare < date;
}

// Fetch prescription details from the 'add_prescription' Firebase app
const prescriptionDbRef = ref(prescriptionDatabase, "add_prescription");

onValue(
  prescriptionDbRef,
  (snapshot) => {
    const notificationsContainer = document.querySelector(".ncards");
    notificationsContainer.innerHTML = ""; // Clear existing notifications

    if (snapshot.exists()) {
      snapshot.forEach((patientSnapshot) => {
        const patientName = patientSnapshot.key; // Patient's name
        const patientData = patientSnapshot.val();

        const tablets = patientData.tablets;

        // Check if patient has any prescriptions
        if (tablets) {
          Object.keys(tablets).forEach((tabletKey) => {
            const tablet = tablets[tabletKey];

            // Process all available times (morning, afternoon, evening)
            if (tablet.morningTime && !hasTimePassed(tablet.morningTime)) {
              const notificationKey = `${patientName}-${tabletKey}-morning`;
              const notificationHTML = createNotificationCard(
                patientName,
                tablet.morningTime,
                notificationKey
              );
              notificationsContainer.innerHTML += notificationHTML;
            }

            if (tablet.afternoonTime && !hasTimePassed(tablet.afternoonTime)) {
              const notificationKey = `${patientName}-${tabletKey}-afternoon`;
              const notificationHTML = createNotificationCard(
                patientName,
                tablet.afternoonTime,
                notificationKey
              );
              notificationsContainer.innerHTML += notificationHTML;
            }

            if (tablet.eveningTime && !hasTimePassed(tablet.eveningTime)) {
              const notificationKey = `${patientName}-${tabletKey}-evening`;
              const notificationHTML = createNotificationCard(
                patientName,
                tablet.eveningTime,
                notificationKey
              );
              notificationsContainer.innerHTML += notificationHTML;
            }
          });
        }
      });

      // Attach skip functionality to each skip icon
      attachSkipEventListeners();
    } else {
      console.log("No prescription data available");
      notificationsContainer.innerHTML = "<p>No notifications found.</p>";
    }
  },
  (error) => {
    console.error("Error fetching prescription data:", error);
  }
);

/*************** Skip Notification Logic *****************/
function attachSkipEventListeners() {
  const skipIcons = document.querySelectorAll(".skip-icon");

  skipIcons.forEach((icon) => {
    icon.addEventListener("click", (event) => {
      const notificationKey = event.target.getAttribute(
        "data-notification-key"
      );

      // Confirm the skip action
      if (confirm("Are you sure you want to skip this notification?")) {
        // Remove the notification card from the DOM
        const notificationCard = document.getElementById(notificationKey);
        if (notificationCard) {
          notificationCard.remove();
        }
      }
    });
  });
}
