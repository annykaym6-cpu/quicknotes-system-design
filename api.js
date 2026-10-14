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
const MAX_TITLE_LENGTH = 100;

const loadBtn = document.querySelector("#load-btn");
const statusText = document.querySelector("#status");
const list = document.querySelector("#notes-list");
const form = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");
const submitBtn = document.querySelector("#submit-btn");

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

// POST: create a note. The server replies with the new note and its id.
function createNote(title, body) {
  return request(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ title: title, body: body, userId: 1 }),
  });
}

// DELETE: remove a note by its id.
function deleteNoteRequest(id) {
  return request(`${API_URL}/${id}`, { method: "DELETE" });
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
  submitBtn.disabled = isBusy;
  list.querySelectorAll(".delete-btn").forEach((button) => {
    button.disabled = isBusy;
  });
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

    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete-btn";
    del.textContent = "Delete";
    del.dataset.id = note.id;
    del.setAttribute("aria-label", `Delete note: ${note.title}`);
    li.appendChild(del);

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

// Check the form. Returns an error message, or "" when the input is fine.
function validateTitle(title) {
  if (title === "") {
    return "Please enter a title.";
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return `The title must be ${MAX_TITLE_LENGTH} characters or fewer (it has ${title.length}).`;
  }
  return "";
}

// Create a note (POST).
// JSONPlaceholder does not really store what we send: it just answers with the
// new note and the id 101. So we add the returned note to our own list.
// Every new note would come back with id 101, so we make the id unique here.
async function addNote(title, body) {
  setStatus("Saving note...", "loading");
  setBusy(true);

  try {
    const result = await createNote(title, body);
    const created = result.data;

    let localId = Number(created.id);
    while (notes.some((note) => note.id === localId)) {
      localId += 1;
    }

    notes.unshift({ id: localId, title: created.title, body: created.body });
    render();
    setStatus(`Note created (status ${result.status}, id ${created.id}).`, "success");
    return true;
  } catch (error) {
    setStatus("Could not add your note. Your text is still in the form, so please try again.", "error");
    console.error("Create failed:", error.message);
    return false;
  } finally {
    setBusy(false);
  }
}

// Delete a note (DELETE).
// JSONPlaceholder does not really store notes, so a note we created earlier
// never existed on the server. Its DELETE still gets an "OK" answer, because
// the practice server accepts any id. We therefore treat any successful answer
// as "deleted" and remove the note from our own list. With a real API, this
// same code would only remove the note after the server confirmed it.
async function removeNote(id, button) {
  setStatus("Deleting note...", "loading");
  setBusy(true);
  button.textContent = "Deleting...";

  try {
    await deleteNoteRequest(id);
    notes = notes.filter((note) => note.id !== id);
    render();
    setStatus(notes.length === 0 ? "Note deleted. No notes are left." : "Note deleted.", "success");
  } catch (error) {
    button.textContent = "Delete";
    setStatus("Could not delete the note. Please try again.", "error");
    console.error("Delete failed:", error.message);
  } finally {
    setBusy(false);
  }
}

// ===================== 7. Events =====================
loadBtn.addEventListener("click", loadNotes);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  const problem = validateTitle(title);
  if (problem !== "") {
    setStatus(problem, "error");
    titleInput.focus();
    return;
  }

  const added = await addNote(title, body);
  if (added) {
    form.reset();
  }
  titleInput.focus();
});

// One listener on the list handles every Delete button (event delegation).
list.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-btn");
  if (button) {
    removeNote(Number(button.dataset.id), button);
  }
});

// ===================== 8. Start =====================
setStatus('Click "Load notes" to get your notes from the server.');
