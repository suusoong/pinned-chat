import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyC2B-ObPFtM5Pa4uuqSdDYTCuOnPWd3Nfo",
  authDomain: "pinned-chat.firebaseapp.com",
  projectId: "pinned-chat",
  storageBucket: "pinned-chat.firebasestorage.app",
  messagingSenderId: "684403382903",
  appId: "1:684403382903:web:fe24e7447dc4104d2c0472"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)