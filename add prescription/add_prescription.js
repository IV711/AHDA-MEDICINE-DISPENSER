import {
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getDatabase,
  onValue,
  push,
  ref,
  set,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

// Firebase configuration for 'addpatients' app (for retrieving patients)
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

// Firebase configuration for 'add_prescription' app (for saving prescription data)
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

// Initialize 'addpatients' app to retrieve patients' names
if (!getApps().find((app) => app.name === "addpatients")) {
  initializeApp(firebasePatientsConfig, "addpatients");
}
const databasePatients = getDatabase(
  getApps().find((app) => app.name === "addpatients")
);

// Initialize 'add_prescription' app for storing prescriptions
if (!getApps().find((app) => app.name === "add_prescription")) {
  initializeApp(firebasePrescriptionConfig, "add_prescription");
}
const databasePrescription = getDatabase(
  getApps().find((app) => app.name === "add_prescription")
);

document.addEventListener("DOMContentLoaded", function () {
  // Function to load patients into the dropdown from 'addpatients' app
  function loadPatients() {
    const patientsDropdown = document.getElementById("patients");
    const patientsRef = ref(databasePatients, "ADDPATIENT FORM/");

    onValue(patientsRef, (snapshot) => {
      if (snapshot.exists()) {
        patientsDropdown.innerHTML = ""; // Clear dropdown
        const defaultOption = document.createElement("option");
        defaultOption.text = "Select a patient";
        defaultOption.value = "";
        patientsDropdown.appendChild(defaultOption);

        const patientData = snapshot.val();
        Object.keys(patientData).forEach((patientKey) => {
          const patient = patientData[patientKey];
          if (patient && patient.name) {
            const option = document.createElement("option");
            option.value = patient.name;
            option.textContent = patient.name;
            patientsDropdown.appendChild(option);
          }
        });
      } else {
        const noPatientsOption = document.createElement("option");
        noPatientsOption.textContent = "No patients found";
        noPatientsOption.disabled = true;
        patientsDropdown.appendChild(noPatientsOption);
      }
    });
  }

  // Helper function to convert 24-hour time to 12-hour format with AM/PM
  function convertTo12HourFormat(time) {
    const [hours, minutes] = time.split(":");
    let period = "AM";
    let hour = parseInt(hours);

    if (hour >= 12) {
      period = "PM";
      if (hour > 12) {
        hour -= 12;
      }
    } else if (hour === 0) {
      hour = 12; // Midnight case
    }

    return `${hour}:${minutes} ${period}`;
  }

  // Function to calculate the correct days remaining
  function calculateDaysRemaining(startDate, totalDays) {
    const currentDate = new Date();
    const prescriptionStartDate = new Date(startDate);

    // Calculate the difference in time (milliseconds)
    const timeDifference = currentDate - prescriptionStartDate;

    // Convert time difference from milliseconds to days
    const daysPassed = Math.floor(timeDifference / (1000 * 60 * 60 * 24));

    // Calculate remaining days
    const remainingDays = totalDays - daysPassed;

    // Return remaining days (or 0 if it's less than 0)
    return remainingDays > 0 ? remainingDays : 0;
  }

  // Load patients into dropdown
  loadPatients();

  // Handle form submission to store prescription in 'add_prescription' app
  const prescriptionForm = document.getElementById("prescription-form");

  if (prescriptionForm) {
    prescriptionForm.addEventListener("submit", function (e) {
      e.preventDefault();

      // Get the form values
      const patientName = document.getElementById("patients").value;
      const tabletName = document.getElementById("tablet-name").value;
      let morningTime = document.getElementById("morning-time").value;
      let afternoonTime = document.getElementById("afternoon-time").value;
      let eveningTime = document.getElementById("evening-time").value;
      const days = document.getElementById("days").value;
      const dosage = document.getElementById("dosage").value;
      const currentDate = new Date().toISOString().split("T")[0]; // Store current date as 'YYYY-MM-DD'

      // Convert times to 12-hour format with AM/PM
      if (morningTime) {
        morningTime = convertTo12HourFormat(morningTime);
      }
      if (afternoonTime) {
        afternoonTime = convertTo12HourFormat(afternoonTime);
      }
      if (eveningTime) {
        eveningTime = convertTo12HourFormat(eveningTime);
      }

      // Save the prescription data to 'add_prescription' Firebase
      const prescriptionRef = ref(
        databasePrescription,
        `add_prescription/${patientName}/tablets`
      );
      const newPrescriptionRef = push(prescriptionRef);

      set(newPrescriptionRef, {
        tabletName: tabletName,
        morningTime: morningTime,
        afternoonTime: afternoonTime,
        eveningTime: eveningTime,
        days: days, // Store initial total days
        dosage: dosage,
        startDate: currentDate, // Store the current date when the prescription is added
      })
        .then(() => {
          console.log("Prescription added successfully!");

          // Reset the form fields
          prescriptionForm.reset();

          // Load the patient's tablets again to display the updated list
          loadTabletsForPatient(patientName);
        })
        .catch((error) => {
          console.error("Error adding prescription:", error);
        });
    });
  }

  // Function to load the tablets for a selected patient
  function loadTabletsForPatient(patientName) {
    const tabletList = document.getElementById("tablet-list");
    tabletList.innerHTML = ""; // Clear the existing list

    if (!patientName) {
      return;
    }

    const tabletsRef = ref(
      databasePrescription,
      `add_prescription/${patientName}/tablets`
    );

    onValue(tabletsRef, (snapshot) => {
      if (snapshot.exists()) {
        const tabletsData = snapshot.val();

        Object.keys(tabletsData).forEach((tabletKey) => {
          const tablet = tabletsData[tabletKey];

          // Calculate the correct days remaining
          const remainingDays = calculateDaysRemaining(
            tablet.startDate,
            parseInt(tablet.days)
          );

          // Create a new card for each tablet
          const tabletCard = document.createElement("div");
          tabletCard.classList.add("tablet-entry");
          tabletCard.innerHTML = `
                <div class="tablet-row">
                  <span class="tablet-name">Tablet: ${tablet.tabletName}</span>
                  <span class="tablet-time">Morning: ${tablet.morningTime}</span>
                  <span class="tablet-time">Afternoon: ${tablet.afternoonTime}</span>
                  <span class="tablet-time">Evening: ${tablet.eveningTime}</span>
                  <span class="tablet-days">Days Remaining: ${remainingDays}</span>
                  <span class="tablet-dosage">Dosage: ${tablet.dosage}</span>
                </div>
              `;

          // Append the new tablet entry to the tablet list
          tabletList.appendChild(tabletCard);
        });
      } else {
        tabletList.innerHTML =
          "<p>No prescriptions found for this patient.</p>";
      }
    });
  }

  // Event listener for when a patient is selected from the dropdown
  const patientsDropdown = document.getElementById("patients");
  patientsDropdown.addEventListener("change", function () {
    const selectedPatient = patientsDropdown.value;
    loadTabletsForPatient(selectedPatient);
  });
});
