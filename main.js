import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getDatabase, onValue, ref } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD0bcDszuRnDIhP0xKn5OJsepG_bM4w56Q",
  authDomain: "addpatients.firebaseapp.com",
  databaseURL: "https://addpatients-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "addpatients",
  storageBucket: "addpatients.appspot.com",
  messagingSenderId: "594219036450",
  appId: "1:594219036450:web:2345ca5c169602c3a5bf7b"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

function createCard(patient) {
  return `
    <div class="card">
      <div class="card-details">
        <img src="${patient.photo}" alt="Patient Photo" />
        <p class="text-title">${patient.name}</p>
        <p class="text-body">Age: ${patient.age}</p>
        <p class="text-body">Details: ${patient.details}</p>
      </div>
      <button class="card-button">More info</button>
    </div>
  `;
}

const dbRef = ref(database, 'ADDPATIENT FORM');
onValue(dbRef, (snapshot) => {
  const cardsContainer = document.querySelector('.cards');
  cardsContainer.innerHTML = '';  // Clear existing cards

  if (snapshot.exists()) {
    snapshot.forEach((childSnapshot) => {
      const patient = childSnapshot.val();
      if (patient.name && patient.age && patient.photo) {  // Ensure data integrity
        const cardHTML = createCard(patient);
        cardsContainer.innerHTML += cardHTML;
      }
    });
  } else {
    console.log("No data available");
    cardsContainer.innerHTML = '<p>No patients found.</p>';
  }
}, (error) => {
  console.error("Error fetching data: ", error);
});

