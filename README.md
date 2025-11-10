# Chroma Core Arena V5.2



A fast-paced, 1v1 3D arena brawler built with Three.js and Firebase, featuring a "flawless" superhuman AI.

---

`Chroma Core Arena` is a real-time dueling game where players choose from a roster of 16 unique "Echos," each with their own set of powerful abilities. Challenge friends in local or online multiplayer, or test your skills against a custom-built, "better-than-human" AI designed to be the ultimate opponent.

---

## 🚀 Key Features

* **16 Unique Characters:** Master a diverse roster of "Echos," from the kiting master **Echo Prime** to the zoning specialist **Oracle**.
* **Deep Combat System:** Every Echo has 4 active skills, a powerful Ultimate, and a unique passive ability.
* **Full Multiplayer Suite:**
    * **Local 1v1 Duels:** Battle a friend on the same machine.
    * **Online Matchmaking:** Uses Firebase to find opponents for Classic or Rift duels.
    * **Online Leaderboards:** Compete for the top spot, powered by Firestore.
* **"Flawless" AI Opponent:** A custom-built, "Dual-Process" AI system.
    * **Human-like Tactics:** The "Tactical Brain" uses character-specific mastery for kiting, zoning, and repositioning around obstacles.
    * **Superhuman Reflexes:** The "Survival Brain" runs every frame to execute perfect, 0ms-reaction dodges, even using mobility skills (like `Phase Shift`) to escape danger.
    * **Scaling Difficulty:** From "Noob" (slow reactions) to "Devil" (flawless, 0ms reaction time).

---

## 🎮 Controls

### Player 1 (Used for all Online play)

* **Move:** `WASD`
* **Basic Attack:** `Space`
* **Skills 1-3:** `Q`, `E`, `R`
* **Ultimate (Skill 4):** `F`

### Player 2 (Local Play Only)

* **Move:** `IJKL`
* **Basic Attack:** `Enter`
* **Skills 1-3:** `U`, `O`, `P`
* **Ultimate (Skill 4):** `H`



---

## 💻 Tech Stack

* **Frontend:** HTML5, CSS3, JavaScript (ES6 Modules)
* **Graphics:** [Three.js](https://threejs.org/)
* **Audio:** [Tone.js](https://tonejs.github.io/)
* **Backend & DB:** [Firebase](https://firebase.google.com/) (Authentication, Firestore, Matchmaking)

---

## 🔧 Running the Game Locally

1.  **Firebase Setup:** This project requires a Firebase backend. You must create your own Firebase project and add your project's `firebaseConfig` object to the top of `firebase.js`.

2.  **Run a Local Server:** This project uses ES6 modules, so it **must** be run from a local server. It will **not** work by opening `index.html` directly.

    The easiest way is using the **`Live Server`** extension in VS Code.

    Alternatively, use a simple HTTP server from your terminal:
    ```bash
    # If you don't have it, install it globally
    npm install -g http-server

    # Run the server in the project's root directory
    http-server
    ```

3.  **Play:** Open your local server address (e.g., `http://127.0.0.1:8080`) in your browser.
