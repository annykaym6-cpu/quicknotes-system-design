# QuickNotes API Design

QuickNotes uses a REST API. The resource is a plural noun (`/notes`), each
note is addressed by its id (`/notes/{id}`), and the HTTP method says what to
do. Data is sent and received as JSON over HTTPS.

The front end in this repository uses JSONPlaceholder as a stand-in. Its
`/posts` endpoints behave like the `/notes` endpoints below (a `title` and a
`body`), so the front end code only needs a different base URL to switch to the
real API.

- Base URL: `https://api.quicknotes.com/v1` (the `v1` allows future changes
  without breaking existing apps).
- Format: JSON, with `Content-Type: application/json`.

## Endpoint summary

| # | Method and path | Description | Success status |
|---|---|---|---|
| 1 | `POST /auth/register` | Create an account | `201 Created` |
| 2 | `POST /auth/login` | Log in and receive a token | `200 OK` |
| 3 | `GET /notes` | List the user's notes (paginated, filterable) | `200 OK` |
| 4 | `GET /notes/{id}` | Get one note | `200 OK` |
| 5 | `POST /notes` | Create a note | `201 Created` |
| 6 | `PUT /notes/{id}` | Replace a whole note | `200 OK` |
| 7 | `PATCH /notes/{id}` | Update part of a note | `200 OK` |
| 8 | `DELETE /notes/{id}` | Delete a note | `204 No Content` |
| 9 | `GET /tags` | List all tags | `200 OK` |
| 10 | `POST /notes/{id}/tags` | Add a tag to a note | `201 Created` |
| 11 | `DELETE /notes/{id}/tags/{tag}` | Remove a tag from a note | `204 No Content` |

## 1. The note object

```json
{
  "id": 42,
  "title": "Revise HTTP methods",
  "body": "GET, POST, PUT, PATCH, DELETE",
  "category": "study",
  "tags": ["exams", "urgent"],
  "created_at": "2026-10-12T08:15:00Z",
  "updated_at": "2026-10-12T08:15:00Z"
}
```

## 2. Authentication

Notes belong to users, so every `/notes` request needs a token:

```text
Authorization: Bearer <token>
```

| Method and path | Description | Success status |
|---|---|---|
| `POST /auth/register` | Create an account with name, email and password | `201 Created` |
| `POST /auth/login` | Check email and password, return a token | `200 OK` |

Passwords are sent only over HTTPS and stored only as hashes. A missing or
invalid token gets `401 Unauthorized`. Trying to read or change another
user's note gets `404 Not Found` (or `403 Forbidden`), so we never reveal that
another user's note exists.

## 3. Note endpoints

### List notes

- **Request:** `GET /notes?page=1&limit=20`
- **Optional filters:** `category=study`, `tag=urgent`, `search=http`
- **Request body:** none
- **Success:** `200 OK`

```json
{
  "data": [ { "id": 42, "title": "Revise HTTP methods", "body": "...", "category": "study" } ],
  "page": 1,
  "limit": 20,
  "total": 134
}
```

Results are paginated so a user with thousands of notes never gets them all in
one slow response. The default limit is 20 and the maximum is 100.

### Get one note

- **Request:** `GET /notes/{id}`
- **Success:** `200 OK` with the note object
- **Errors:** `404 Not Found` if the note does not exist or is not theirs

### Create a note

- **Request:** `POST /notes`
- **Request body:**

```json
{ "title": "Buy milk", "body": "Two litres", "category": "personal" }
```

- **Success:** `201 Created`, with the new note and its server-assigned `id`
- **Errors:** `400 Bad Request` if the title is empty or too long
- **Response body:**

```json
{
  "id": 43,
  "title": "Buy milk",
  "body": "Two litres",
  "category": "personal",
  "tags": [],
  "created_at": "2026-10-14T07:30:00Z",
  "updated_at": "2026-10-14T07:30:00Z"
}
```

### Replace a note

- **Request:** `PUT /notes/{id}`
- **Description:** replaces the whole note with the data sent; all fields are required.
- **Success:** `200 OK` with the updated note

### Update part of a note

- **Request:** `PATCH /notes/{id}`
- **Request body:** only the fields to change, for example `{ "body": "Three litres" }`
- **Success:** `200 OK` with the updated note

### Delete a note

- **Request:** `DELETE /notes/{id}`
- **Request body:** none
- **Success:** `204 No Content` (nothing is returned)
- **Errors:** `404 Not Found`

## 4. Tag endpoints

| Method and path | Description | Success status |
|---|---|---|
| `GET /tags` | List all tags | `200 OK` |
| `POST /notes/{id}/tags` | Add a tag to a note (`{ "name": "urgent" }`) | `201 Created` |
| `DELETE /notes/{id}/tags/{tag}` | Remove a tag from a note | `204 No Content` |

## 5. How each endpoint becomes a database query

The client never talks to the database. Only the server does. For a logged-in
user with id 1:

| Endpoint | Query |
|---|---|
| `GET /notes` | `SELECT ... FROM notes WHERE user_id = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?` |
| `POST /notes` | `INSERT INTO notes (user_id, title, body) VALUES (1, ?, ?)` |
| `PATCH /notes/42` | `UPDATE notes SET body = ? WHERE id = 42 AND user_id = 1` |
| `DELETE /notes/42` | `DELETE FROM notes WHERE id = 42 AND user_id = 1` |

All values use placeholders (`?`) to prevent SQL injection.

## 6. Status codes used

| Code | Meaning | When |
|---|---|---|
| `200 OK` | Success | GET, PUT, PATCH |
| `201 Created` | A new resource was made | POST |
| `204 No Content` | Success, nothing to return | DELETE |
| `400 Bad Request` | The request is invalid | Empty title, wrong data type |
| `401 Unauthorized` | Not logged in | Missing or bad token |
| `403 Forbidden` | Logged in but not allowed | Acting on someone else's data |
| `404 Not Found` | The note or URL does not exist | Unknown id |
| `409 Conflict` | The request clashes with existing data | Registering an email that is already used |
| `429 Too Many Requests` | Rate limit reached | Too many requests in a minute |
| `500 Internal Server Error` | A bug on the server | Unexpected failure |
| `503 Service Unavailable` | Temporarily overloaded or down | Maintenance, overload |

## 7. Error codes and example error bodies

Every error uses the same shape, so the front end can always show a message.
The `message` explains the problem in plain words:

```json
{
  "error": {
    "status": 400,
    "message": "Title is required and must be 100 characters or fewer."
  }
}
```

Example error bodies for the codes the API can return:

```json
// 400 Bad Request: POST /notes with an empty title
{ "error": { "status": 400, "message": "Title is required and must be 100 characters or fewer." } }

// 401 Unauthorized: no token, or an expired token
{ "error": { "status": 401, "message": "You must log in to do that." } }

// 403 Forbidden: logged in, but the action is not allowed
{ "error": { "status": 403, "message": "You do not have permission to change this note." } }

// 404 Not Found: GET /notes/9999
{ "error": { "status": 404, "message": "Note 9999 was not found." } }

// 500 Internal Server Error: a bug or failure on the server
{ "error": { "status": 500, "message": "Something went wrong on our side. Please try again." } }
```

(Real JSON has no comments; the `//` lines above only label each example.)

## 8. Caching, limits and safety

- `GET /notes` responses come from Redis when possible; any `POST`, `PUT`,
  `PATCH` or `DELETE` clears that user's cached list.
- **Rate limit:** 100 requests per minute per user. Extra requests get `429`.
- **CORS:** the API only allows requests from the QuickNotes front end's own
  address.
- **Validation:** the server checks every field (type, length, allowed values)
  and never trusts the browser.
- **Timeouts and retries:** the client stops a request after 8 seconds. Safe
  requests (GET) can be retried after a wait; to avoid creating duplicate
  notes, POST requests are only retried if the first one definitely failed.

## 9. Front end error handling

The front end (`api.js`) checks `response.ok` and shows:

- "Loading..." while a request is running (buttons are disabled so the user
  cannot click twice);
- a clear error message if the request fails, times out or the server answers
  with an error status;
- the user's text kept in the form if adding a note fails, and the note kept in
  the list if deleting it fails.
