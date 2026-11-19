// Configuración pública del proyecto Firebase (no es secreta; el acceso lo controlan las reglas de Firestore).
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAENQHAyGU6Mkb5FllnJlv8i23mqW6nAZ4",
  authDomain: "odontograma-paccha.firebaseapp.com",
  projectId: "odontograma-paccha",
  storageBucket: "odontograma-paccha.firebasestorage.app",
  messagingSenderId: "345178341467",
  appId: "1:345178341467:web:556b3dd6d7b761ba593f7e"
};
export const ALLOWED_EMAIL = "";
// Dirección del intermediario del escáner (Cloudflare Worker). Vacío = botón oculto.
export const SCAN_URL = "";
// Versión de prueba: datos y almacenamiento separados de la versión oficial.
export const ENV = { suffix: "_beta", ls: "cpodb_", appName: "beta", label: "BETA", version: "2.1" };
