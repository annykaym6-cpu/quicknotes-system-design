// QuickNotes System Design: talks to the JSONPlaceholder REST API.
//
// JSONPlaceholder treats each "post" as a note (a title and a body).
//   GET    /posts?_limit=10   list notes
//   POST   /posts             create a note   (answers 201 Created)
//   DELETE /posts/{id}        delete a note   (answers 200 OK)

// ===================== 1. Settings and page elements =====================
const API_URL = "https://jsonplaceholder.typicode.com/posts";
const NOTES_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 8000;

const loadBtn = document.querySelector("#load-btn");
const statusText = document.querySelector("#status");
const list = document.querySelector("#notes-list");

// The notes currently shown on the page (the page is drawn from this array).
let notes = [];

// ===================== 2. One reusable request function =====================
// Sends a request and returns { status, data }.
// It throws an Error if the network fails, the server is too slow, or the
// server answers with an error status (response.ok is false).
async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    return { status: response.status, data: data };
  } finally {
    clearTimeout(timer); // always stop the timer
  }
}

// ===================== 3. The three API calls =====================

// GET: load the first 10 notes.
function getNotes() {
  return request(`${API_URL}?_limit=${NOTES_LIMIT}`);
}

// ===================== 4. Status message and busy state =====================
// type is "", "loading", "success" or "error" (each has its own colour in CSS)
function setStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = type;
}

// Disables the buttons while a request is running, so nothing is sent twice.
function setBusy(isBusy) {
  loadBtn.disabled = isBusy;
}

// ===================== 5. Draw the notes =====================
// Only textContent is used to insert text, so anything a user types is shown
// as plain text and can never run as code.
function render() {
  list.replaceChildren(); // empty the list

  if (notes.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No notes to show.";
    list.appendChild(empty);
    return;
  }

  notes.forEach((note) => {
    const li = document.createElement("li");
    li.className = "note";

    const text = document.createElement("div");

    const title = document.createElement("strong");
    title.className = "note-title";
    title.textContent = note.title;

    const body = document.createElement("p");
    body.className = "note-body";
    body.textContent = note.body;

    text.appendChild(title);
    text.appendChild(body);
    li.appendChild(text);

    list.appendChild(li);
  });
}

// ===================== 6. Actions =====================

// Load notes (GET): loading, success, error and empty states.
async function loadNotes() {
  setStatus("Loading notes...", "loading");
  setBusy(true);

  try {
    const result = await getNotes();
    notes = result.data;
    render();

    if (notes.length === 0) {
      setStatus("The server has no notes yet.");
    } else {
      const word = notes.length === 1 ? "note" : "notes";
      setStatus(`Loaded ${notes.length} ${word} from the server.`, "success");
    }
  } catch (error) {
    notes = [];
    render();
    setStatus("Could not load notes. Please check your connection and try again.", "error");
    console.error("Load failed:", error.message);
  } finally {
    setBusy(false);
  }
}

// ===================== 7. Events =====================
loadBtn.addEventListener("click", loadNotes);

// ===================== 8. Start =====================
setStatus('Click "Load notes" to get your notes from the server.');
