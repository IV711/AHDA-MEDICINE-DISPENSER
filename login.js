import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBnLD8SkcnEPyx9blSBeQwfH5J75hLhJ4Q",
    authDomain: "ahda-login-page.firebaseapp.com",
    projectId: "ahda-login-page",
    storageBucket: "ahda-login-page.appspot.com",
    messagingSenderId: "658853633192",
    appId: "1:658853633192:web:37195e593f0914f799769d",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const submit = document.getElementById("submit");
submit.addEventListener("click", function (event) {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            // Successfully logged in
            alert("LOGIN SUCCESSFUL....");
            window.location.href = "main.html"; // Navigate to main page
        })
        .catch((error) => {
            const errorCode = error.code;
            const errorMessage = error.message;

            if (errorCode === 'auth/invalid-credential') {
                alert("No account found, sign up first");
            } else {
                alert(errorMessage);
            }
        });
});
