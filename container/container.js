import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  child,
  get,
  getDatabase,
  ref,
  set,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-database.js";

// Your Firebase configuration with the updated databaseURL
const firebaseConfig = {
  apiKey: "AIzaSyCyOJmN84hcYBVcz044lza3yGHT-3WsVgU",
  authDomain: "container-ae684.firebaseapp.com",
  databaseURL:
    "https://container-ae684-default-rtdb.asia-southeast1.firebasedatabase.app", // Updated URL
  projectId: "container-ae684",
  storageBucket: "container-ae684.appspot.com",
  messagingSenderId: "57927510961",
  appId: "1:57927510961:web:530d90ca5ed9d8c8f6eb90",
  measurementId: "G-J4BQ71VP08",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Function to save container data
function saveContainerData(containerNumber, tabletName) {
  const containerRef = ref(db, "containers/" + containerNumber);

  set(containerRef, {
    tabletName: tabletName,
  })
    .then(() => {
      alert("Data saved successfully!");
    })
    .catch((error) => {
      console.error("Error saving data:", error);
    });
}

// Function to load container data and populate the input fields
function loadContainerData() {
  const dbRef = ref(db);

  for (let i = 1; i <= 8; i++) {
    const containerNumber = i;
    const inputField = document.querySelector(
      `.tablet-item:nth-child(${containerNumber}) input`
    );

    // Get data for each container
    get(child(dbRef, `containers/${containerNumber}`))
      .then((snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          inputField.value = data.tabletName || ""; // Set the tablet name to the input field
        } else {
          inputField.value = ""; // If no data, leave the field empty
        }
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
      });
  }
}

// Adding event listeners to save tablet names when the user submits them
document.addEventListener("DOMContentLoaded", () => {
  const tabletItems = document.querySelectorAll(".tablet-item");

  // Load the current tablet names from Firebase when the page loads
  loadContainerData();

  // Add event listeners for each input field
  tabletItems.forEach((item, index) => {
    const inputField = item.querySelector("input");

    inputField.addEventListener("change", () => {
      const tabletName = inputField.value;
      const containerNumber = index + 1; // Containers are numbered 1-8

      // Save data to Firebase
      saveContainerData(containerNumber, tabletName);
    });
  });
});
