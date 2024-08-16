import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";
import { addDoc, collection, getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

// Initialize Firebase
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
const storage = getStorage(app);
const firestore = getFirestore(app);

document.getElementById('addpat').addEventListener('submit', submitForm);

async function submitForm(e) {
  e.preventDefault();

  var name = getElementVal('name');
  var age = getElementVal('age');
  var photoFile = document.getElementById('photo').files[0];
  var details = getElementVal('details');

  let photoURL = '';

  if (photoFile) {
    try {
      // Upload photo to Firebase Storage
      const photoRef = storageRef(storage, 'photos/' + photoFile.name);
      await uploadBytes(photoRef, photoFile);
      photoURL = await getDownloadURL(photoRef);
    } catch (error) {
      console.error("Error uploading photo: ", error);
    }
  }

  console.log(name, age, photoURL, details);

  // Save patient data to Firebase Realtime Database
  try {
    await set(ref(database, 'ADDPATIENT FORM/' + name), {
      name: name,
      age: age,
      photo: photoURL,
      details: details
    });
    console.log("Patient added successfully to Realtime Database!");
  } catch (error) {
    console.error("Error adding patient to Realtime Database: ", error);
  }

  // Save patient data to Firestore
  try {
    await addDoc(collection(firestore, 'patients'), {
      name: name,
      age: age,
      photo: photoURL,
      details: details
    });
    console.log("Patient added successfully to Firestore!");
  } catch (error) {
    console.error("Error adding patient to Firestore: ", error);
  }

  // Clear the form fields
  document.getElementById('name').value = '';
  document.getElementById('age').value = '';
  document.getElementById('photo').value = '';
  document.getElementById('details').value = '';

  // Display a success message
  alert("Patient added successfully!");
}

const getElementVal = (id) => {
  return document.getElementById(id).value;
}

