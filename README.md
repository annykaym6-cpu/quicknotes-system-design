# QuickNotes System Design

Project 2 for the Web Foundations course. QuickNotes is moving from a
browser-only app to an online service for 1 million users. This project has
two halves:

1. **An API client** that proves the front end can talk to a REST API. It loads
   notes (`GET`), creates notes (`POST`) and deletes notes (`DELETE`) using the
   JSONPlaceholder practice API.
2. **Three design documents** that the backend team would build from: the API
   design, the data model and the architecture.

## How to run the API client

1. Download or clone this repository.
2. Open `index.html` in a browser, or open the folder in VS Code and use Live
   Server. An internet connection is needed, because the notes come from
   JSONPlaceholder.
3. Click **Load notes** to fetch 10 notes from the server.
4. Use **Add note** to create a note (a title is required, up to 100
   characters; the note text is optional).
5. Click **Delete** on a note to remove it.

| Action | Request | What the user sees |
|---|---|---|
| Click "Load notes" | `GET /posts?_limit=10` | "Loading notes..." then "Loaded 10 notes from the server." |
| Submit the form | `POST /posts` | "Saving note..." then "Note created (status 201, id 101)." |
| Click "Delete" | `DELETE /posts/{id}` | "Deleting note..." then "Note deleted." |

The page shows loading, success, error and empty states. Buttons are disabled
while a request is running, and if a request fails a red message explains what
went wrong and the user's text is kept.

JSONPlaceholder is a practice API: it answers as if a request worked, but it
does not actually save anything. The app therefore updates its own list after
each successful answer (see the comments in `api.js`).

## Design documents

- [API design](docs/api-design.md): the REST endpoints, JSON examples, status
  codes and error format.
- [Data model](docs/data-model.md): the `users`, `notes`, `tags` and
  `note_tags` tables, relationships, SQL, indexes and the SQL versus NoSQL
  choice.
- [Architecture](docs/architecture.md): requirements, load estimates for
  1 million users, the architecture diagram, request flows and trade-offs.

## Project structure

```text
quicknotes-system-design/
├── index.html            page structure (form, load button, status, list)
├── style.css             layout, colours, success and error message styles
├── api.js                request(), GET / POST / DELETE and page updates
├── README.md             this file
└── docs/
    ├── api-design.md
    ├── data-model.md
    └── architecture.md
```

## What I learned

- **How to talk to an API safely.** One reusable `request()` function calls
  `fetch`, checks `response.ok`, uses a timeout, and throws on errors, so every
  call can be wrapped in `try / catch / finally`. A request can fail in several
  ways (no network, a slow server, an error status), and the page must handle
  all of them.
- **Why loading and error states matter.** Disabling buttons while a request is
  running stops double clicks, and a clear message tells the user what is
  happening instead of leaving the page silent.
- **Practice APIs do not keep data.** JSONPlaceholder replies "created" and
  "deleted" without saving anything, so the app has to keep its own list in
  step with what the server says.
- **How to estimate before designing.** Turning 1 million users into about 10
  writes and 40 reads per second (50 and 200 at peak) and about 180 GB per year
  showed that the system is read-heavy and does not need to be huge, so
  caching and a read replica are the right tools, not sharding.
- **How data is modelled.** A one-to-many relationship uses a foreign key, and
  a many-to-many relationship (notes and tags) needs a join table. Rules such
  as `NOT NULL`, `UNIQUE` and foreign keys in the database keep data correct.
- **Every design choice is a trade-off.** A cache makes reads fast but can be
  stale, and extra servers and replicas cost money but remove single points of
  failure.
