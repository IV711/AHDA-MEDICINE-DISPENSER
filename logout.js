import {
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const loginAppConfig = {
  apiKey: "AIzaSyBnLD8SkcnEPyx9blSBeQwfH5J75hLhJ4Q",
  authDomain: "ahda-login-page.firebaseapp.com",
  projectId: "ahda-login-page",
  storageBucket: "ahda-login-page.appspot.com",
  messagingSenderId: "658853633192",
  appId: "1:658853633192:web:37195e593f0914f799769d",
};

const loginApp =
  getApps().find((app) => app.name === "loginApp") ||
  initializeApp(loginAppConfig, "loginApp");
const auth = getAuth(loginApp);

function logout() {
  signOut(auth)
    .then(() => {
      window.location.href = "../index.html";
    })
    .catch((error) => {
      console.error("Logout failed:", error);
      alert("Logout failed. Please try again.");
    });
}

document.querySelectorAll(".logout-button").forEach((button) => {
  button.addEventListener("click", logout);
});
