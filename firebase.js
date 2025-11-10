/*
 * firebase.js
 * Handles all Firebase initialization and backend functions.
 */

// Import SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, orderBy, limit, getDocs, serverTimestamp, onSnapshot, increment, where, deleteDoc, addDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { $$ } from './utils.js';
import { MODES } from './constants.js';

// --- Config & Init ---
const firebaseConfig = {
  apiKey: "AIzaSyCuBgpaWTxOxpFLxe7GfQY8UytWb3LkpvY",
  authDomain: "chroma-core-arena.firebaseapp.com",
  projectId: "chroma-core-arena",
  storageBucket: "chroma-core-arena.firebasestorage.app",
  messagingSenderId: "314470360799",
  appId: "1:314470360799:web:55cfee1b216fcf51072b6a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Export firebase functions for global access
export const fb = {
    serverTimestamp, doc, setDoc, getDoc, updateDoc, collection,
    query, orderBy, limit, getDocs, onSnapshot, increment,
    addDoc, deleteDoc, writeBatch, where
};

export const ROOMS = collection(db, 'rooms');
export const QUEUE = collection(db, 'matchmaking');

// --- Auth Functions ---

function sanitizeNick(n) { return (n || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30); }
function emailFromNick(n) { return `${sanitizeNick(n)}@chroma.local`; }

export async function signupNickname(nick, pass) {
  const email = emailFromNick(nick);
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  await updateProfile(cred.user, { displayName: nick });
  await setDoc(doc(db, "users", cred.user.uid), {
    nickname: nick,
    createdAt: serverTimestamp(),
    wins: { LOCAL_CLASSIC: 0, LOCAL_RIFT: 0, ONLINE_CLASSIC: 0, ONLINE_RIFT: 0 },
    isNewAccount: true // BUG-FIX: Set new account flag
  }, { merge: true });
  return cred.user;
}

export async function loginNickname(nick, pass) {
  const email = emailFromNick(nick);
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  if (!cred.user.displayName) { await updateProfile(cred.user, { displayName: nick }); }
  return cred.user;
}

export function explainAuthError(e) {
  $$('login-message').textContent = e?.message || 'Authentication failed.';
}

export async function guestLogin() {
    const userCred = await signInAnonymously(auth);
    const guestName = `Guest${Math.floor(Math.random() * 1000)}`;
    await updateProfile(userCred.user, { displayName: guestName });
    await setDoc(doc(db, "users", userCred.user.uid), {
        nickname: guestName,
        createdAt: serverTimestamp(),
        wins: { LOCAL_CLASSIC: 0, LOCAL_RIFT: 0, ONLINE_CLASSIC: 0, ONLINE_RIFT: 0 },
        isNewAccount: false // BUG-FIX: Guests are not new accounts
    }, { merge: true });
    return userCred.user;
}

// --- Leaderboard Functions ---

export async function addWin(uid, modeKey) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { [`wins.${modeKey}`]: increment(1) });
    const snap = await getDoc(userRef);
    const nickname = snap.data()?.nickname || 'Guest';
    const lbRef = doc(db, "leaderboards", modeKey, "scores", uid);
    await setDoc(lbRef, { nickname, wins: increment(1), updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.error(`Failed to add win for user ${uid} in mode ${modeKey}:`, e);
  }
}

export async function fetchLeaderboard(modeKey, topN = 50) {
  const q = query(collection(db, "leaderboards", modeKey, "scores"), orderBy("wins", "desc"), limit(topN));
  const snap = await getDocs(q);
  return snap.docs.map((d, i) => ({ rank: i + 1, name: d.data().nickname, wins: d.data().wins }));
}

// --- Online Matchmaking & Room Functions ---

export async function findMatch(modeKey, onlineState) {
  if (!auth.currentUser) {
    $$('room-status').textContent = 'Error: You must be logged in to find a match.';
    return null;
  }
  const userId = auth.currentUser.uid;
  const userNick = auth.currentUser.displayName || 'Guest';
  // UI logic is now in main.js
  
  const q = query(QUEUE, where("mode", "==", modeKey), where("hostId", "!=", userId), limit(1));
  const snap = await getDocs(q);

  let queueDocId = null;

  if (snap.empty) {
    const newQueueDoc = await addDoc(QUEUE, {
      mode: modeKey,
      hostId: userId,
      hostNick: userNick,
      createdAt: serverTimestamp()
    });
    queueDocId = newQueueDoc.id;
    onlineState.isHost = true;
    $$('room-status').textContent = 'Waiting for an opponent...';
  } else {
    const openQueueDoc = snap.docs[0];
    queueDocId = openQueueDoc.id;
    onlineState.isHost = false;

    const newRoom = await addDoc(ROOMS, {
      mode: modeKey,
      createdAt: serverTimestamp(),
      host: { id: openQueueDoc.data().hostId, nick: openQueueDoc.data().hostNick, charKey: null },
      guest: { id: userId, nick: userNick, charKey: null },
      state: { p1CharKey: null, p2CharKey: null, started: false, winner: null }
    });

    await updateDoc(doc(QUEUE, queueDocId), { roomId: newRoom.id, guestId: userId });
    onlineState.code = newRoom.id;
  }
  return queueDocId;
}

export function listenQueueDoc(id, onlineState, onMatchFound) {
  return onSnapshot(doc(QUEUE, id), async (docSnap) => {
    if (docSnap.exists() && docSnap.data().roomId) {
      onlineState.code = docSnap.data().roomId;
      if (onlineState.unsub) onlineState.unsub();
      onlineState.unsub = null;
      // No need to delete doc here, it can be deleted by the listener in main.js
      // await deleteDoc(doc(QUEUE, id)); 
      onMatchFound(); // Callback to wire the room listener
    }
  });
}

export async function cancelMatchmaking(queueDocId, onlineUnsub) {
  if (onlineUnsub) onlineUnsub();
  if (queueDocId) {
    try {
        await deleteDoc(doc(QUEUE, queueDocId));
    } catch (e) {
        console.error("Error deleting queue doc:", e);
    }
  }
  // UI logic was correctly removed from here.
  return null; // Return null to clear the queueDocId in main
}

export function listenRoom(code, cb) {
  return onSnapshot(doc(ROOMS, code), snap => cb(snap.exists() ? snap.data() : null));
}

export async function setStarted(code) {
  await updateDoc(doc(ROOMS, code), { 'state.started': true });
}

export async function pushState(code, isHost, payload) {
  if (!code) return;
  const pathPrefix = isHost ? 'state.p1' : 'state.p2';
  const updates = {};
  Object.keys(payload).forEach(key => {
    updates[`${pathPrefix}.${key}`] = payload[key];
  });
  if (Object.keys(updates).length > 0) {
    try {
      await updateDoc(doc(ROOMS, code), updates);
    } catch (e) {
      console.error("Error pushing state:", e);
    }
  }
}

export async function pushSkillEvent(roomCode, isHost, skillKey) {
  if (!roomCode) return;
  try {
    const eventCollection = collection(db, 'rooms', roomCode, 'events');
    await addDoc(eventCollection, {
      by: isHost ? 'host' : 'guest',
      key: skillKey,
      timestamp: serverTimestamp()
    });
  } catch (e) {
    console.error("Failed to push skill event:", e);
  }
}

export function wireEventsListener(roomCode, isHost, onEvent) {
    const eventCollection = collection(db, 'rooms', roomCode, 'events');
    const myIdentifier = isHost ? 'host' : 'guest';

    return onSnapshot(eventCollection, (snapshot) => {
        const batch = writeBatch(db);
        let changesProcessed = 0;
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const event = change.data();
                if (event.by && event.by !== myIdentifier && event.key) {
                    onEvent(event.key); // Pass the skill key to the callback
                }
                batch.delete(change.doc.ref);
                changesProcessed++;
            }
        });
        if (changesProcessed > 0) {
            batch.commit().catch(e => console.error("Failed to clear events:", e));
        }
    }, (error) => {
        console.error("Error in events listener:", error);
    });
}

export async function setWinner(code, winner) {
  await updateDoc(doc(ROOMS, code), { 'state.winner': winner });
}

export async function selectCharacterOnline(code, isHost, charKey) {
  const path = isHost ? 'state.p1CharKey' : 'state.p2CharKey';
  await updateDoc(doc(ROOMS, code), { [path]: charKey });
}

// --- Leaderboard Import/Export ---

export function exportLeaderboardSnapshot() {
    const modes = Object.keys(MODES);
    const allData = {};
    const promises = modes.map(async (modeKey) => {
        try {
            const q = query(collection(db, "leaderboards", modeKey, "scores"), orderBy("wins", "desc"), limit(100));
            const snap = await getDocs(q);
            const scores = snap.docs.map(d => ({
                id: d.id,
                nickname: d.data().nickname,
                wins: d.data().wins
            }));
            allData[modeKey] = scores;
        } catch (e) {
            console.error(`Failed to fetch ${modeKey} for export:`, e);
        }
    });

    Promise.all(promises).then(() => {
        const json = JSON.stringify(allData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chroma-core-leaderboard-snapshot-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        $$('leaderboard-message').textContent = 'Snapshot exported!';
    });
}

export async function importLeaderboardSnapshot(loadLeaderboardCallback) {
    const json = $$('import-data-area').value;
    if (!json) {
        $$('leaderboard-message').textContent = 'Paste snapshot data into the text area first.';
        return;
    }

    let data;
    try {
        data = JSON.parse(json);
    } catch (e) {
        $$('leaderboard-message').textContent = 'Error: Invalid JSON data.';
        return;
    }

    if (typeof data !== 'object' || data === null) {
        $$('leaderboard-message').textContent = 'Error: Invalid snapshot format.';
        return;
    }

    $$('leaderboard-message').textContent = 'Importing... This may take a moment.';
    $$('import-leaderboard-button').disabled = true;

    try {
        const batch = writeBatch(db);
        let operations = 0;

        for (const modeKey in data) {
            if (MODES[modeKey] && Array.isArray(data[modeKey])) {
                console.log(`Importing ${modeKey}...`);
                for (const entry of data[modeKey]) {
                    if (entry.id && entry.nickname && typeof entry.wins === 'number') {
                        const lbRef = doc(db, "leaderboards", modeKey, "scores", entry.id);
                        batch.set(lbRef, {
                            nickname: entry.nickname,
                            wins: entry.wins,
                            updatedAt: serverTimestamp()
                        }, { merge: true });
                        operations++;
                    }
                }
            }
        }

        if (operations > 0) {
            await batch.commit();
            $$('leaderboard-message').textContent = `Successfully imported ${operations} entries! Reloading current tab...`;
            loadLeaderboardCallback($$('#lb-tabs .tab.active').dataset.lb);
        } else {
            $$('leaderboard-message').textContent = 'No valid entries found in snapshot.';
        }

    } catch (e) {
        console.error("Import failed:", e);
        $$('leaderboard-message').textContent = 'Error during import. Check console.';
    } finally {
        $$('import-leaderboard-button').disabled = false;
    }
}