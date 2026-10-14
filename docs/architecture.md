# QuickNotes Architecture for One Million Users

This document explains how QuickNotes grows from a simple browser app into a
reliable production system that can serve **1,000,000 registered users**.

## 1. Where we start

The first version of QuickNotes (Project 1) ran only in the browser and saved
notes in `localStorage`. That has three limits:

- Notes exist only in one browser on one device, so they cannot be shared or
  opened on a phone.
- If the user clears their browser data, the notes are gone.
- There are no accounts, so nothing can be protected.

The project front end in this repository already talks to a REST API
(JSONPlaceholder, a practice API). The design below describes the real
back end that would replace it.

## 2. Requirements

### Functional requirements (what the system must do)

- Users can register, log in and log out.
- A logged-in user can create, read, update and delete their own notes.
- Notes have a title, a body and a category, and can have tags.
- Users can search and filter their notes by text, category and tag.
- A user can only see and change their own notes.
- The system can send background emails (such as a welcome message) and
  exports without making the user wait.

### Non-functional requirements (how well it must do it)

- **Scale:** support 1,000,000 registered users and about 200,000 daily
  active users.
- **Performance:** loading the note list should take under 200 ms for 95% of
  requests, and the page should open in about 1 second.
- **Availability:** at least 99.9% uptime (about 8.8 hours of downtime per
  year at most), with no single point of failure.
- **Durability:** a saved note is never lost; the database is backed up every
  night and backups are tested.
- **Security:** HTTPS everywhere, hashed passwords, and users can only reach
  their own data.
- **Consistency:** a note list that is a few seconds out of date is
  acceptable, but a user must never see another user's notes.
- **Maintainability:** one well-organised application that a small team can
  build, test and deploy easily.
- **Cost:** use ordinary servers and a managed database before anything more
  complicated.

## 3. Assumptions

- 1,000,000 registered users.
- 20% are active on a given day, so there are **200,000 daily active users
  (DAU)**.
- Each active user creates **5 notes per day** and loads their note list
  **20 times per day**.
- An average note, with its extra fields, is about **500 bytes**.
- One day is about **100,000 seconds** (rounded to make the maths easy).
- Peak traffic is about **5 times** the average.

## 4. Load estimates

```text
Writes (new notes):   200,000 users x 5 notes   = 1,000,000 per day
                      1,000,000 / 100,000       = 10 writes per second
                      Peak (x5)                 = 50 writes per second

Reads (load notes):   200,000 users x 20 loads  = 4,000,000 per day
                      4,000,000 / 100,000       = 40 reads per second
                      Peak (x5)                 = 200 reads per second

Storage per year:     1,000,000 notes x 500 bytes = 500 MB per day
                      500 MB x 365                = about 180 GB per year
```

**What this tells us**

- QuickNotes is **read-heavy**: there are 4 reads for every write, so caching
  reads will help a lot.
- 200 requests per second at peak is manageable for a few ordinary servers.
- 180 GB per year fits comfortably in one well-configured database, so
  **sharding is not needed yet**. Over-engineering would also be a mistake.

## 5. Architecture diagram

```text
                         +---------+
          +------------> |   DNS   |  (quicknotes.com -> addresses)
          |              +---------+
 +--------+------+  static files  +----------------------+
 | Browser /     | -------------> | CDN (HTML, CSS, JS)  |
 | mobile client |                +----------------------+
 +--------+------+
          |
          | API calls (HTTPS, JSON)
          v
   +---------------+
   | Load balancer |  health checks, spreads requests
   +-------+-------+
     +-----+------+-----------+
     v            v           v
 +-------+    +-------+   +-------+        +----------------+
 | App 1 |    | App 2 |   | App 3 | -----> | Cache (Redis)  |
 +---+---+    +---+---+   +---+---+        +----------------+
     |            |           |
     | writes     | reads     | background jobs
     v            v           v
 +----------+  +----------+  +-------+    +--------+
 | Primary  |->| Read     |  | Queue | -> | Worker | (emails, exports)
 | database |  | replica  |  +-------+    +--------+
 +----------+  +----------+
```

Read the diagram the way a request travels. The browser uses DNS to find the
site and downloads the front end (`index.html`, `style.css`, `api.js`) from
the CDN. API calls go to the load balancer, which sends each one to a healthy
app server. The app servers share one cache. Writes go to the primary
database, reads go to the replica, and slow jobs go to the queue.

## 6. What each component does

- **DNS:** turns `quicknotes.com` into the address of our servers.
- **CDN:** serves the static front end from servers close to the user, so pages load faster and our servers do less work.
- **Load balancer:** spreads requests over several app servers and stops sending traffic to a server that fails its health check.
- **App servers:** run the API code (login check, notes logic); they are stateless, so we can add more when traffic grows.
- **Cache (Redis):** keeps each user's recent note list in fast memory, so most reads never reach the database.
- **Primary database:** holds the one true copy of the data and is the only place that accepts writes.
- **Read replica:** a copy of the primary that answers read queries and can take over if the primary fails.
- **Message queue:** holds slow jobs (welcome emails, exports) so the app can reply to the user straight away.
- **Worker:** takes jobs from the queue and does them in the background.

## 7. Request flows

### Loading the app

1. The browser asks DNS for `quicknotes.com` (usually cached, so 0 to 20 ms).
2. `index.html`, `style.css` and `api.js` come from a nearby CDN edge server
   (about 20 to 40 ms). The browser also caches them for next time.

### Loading notes: `GET /notes`

1. The request reaches the load balancer, which picks a healthy app server.
2. The app server checks the login token and finds the user (say, user 1).
3. It asks Redis for `notes:user:1`.
   - **Cache hit:** the notes come back in about 1 ms and are returned.
   - **Cache miss:** the app queries the read replica (about 5 to 20 ms with an
     index), saves the result in Redis with a TTL of 5 minutes, and returns it.
4. With 80 to 90% of reads served from the cache, the database sees only a
   small part of the traffic.

### Adding a note: `POST /notes`

1. The load balancer forwards the request to any healthy app server.
2. The server validates the data and writes the note to the **primary**
   database.
3. It deletes `notes:user:1` from Redis, so stale notes are never served.
4. It replies `201 Created`. Within milliseconds the primary copies the new row
   to the replica.

### Deleting a note: `DELETE /notes/{id}`

1. The server checks that the note belongs to the logged-in user.
2. It deletes the row from the primary database and clears the user's cache
   entry.
3. It replies `204 No Content`.

## 8. How the system grows

| Stage | Setup | Why we move on |
|---|---|---|
| 1 | One server runs the web files, API and database | Cheap and simple, but one failure takes everything down |
| 2 | Separate database server, CDN for static files | The app and database no longer fight for the same CPU and memory |
| 3 | Several app servers behind a load balancer | Handles more traffic and removes the single point of failure |
| 4 | Redis cache | Takes most reads away from the database |
| 5 | Read replica | Spreads read load and gives a backup copy |
| 6 | Queue and workers | Slow work happens in the background |

We scale the app servers **horizontally** (more servers) because they are
stateless. The database is first scaled **vertically** (a bigger machine) and
with replicas. Sharding is only a later option if one database ever becomes too
large or too busy.

## 9. Reliability and avoiding single points of failure

- **No single point of failure:** there are at least two app servers, a replica
  of the database, and the load balancer itself is provided in redundant form
  by the cloud provider.
- **Server crash:** the load balancer's health check stops traffic to the dead
  server within seconds. Requests in progress are retried by the client on a
  healthy server. No data is lost because the servers keep no state.
- **Primary database failure:** a replica is promoted to become the new
  primary (failover).
- **Backups:** the database is backed up every night to separate storage, and
  restoring a backup is tested regularly.
- **Timeouts and retries:** requests that wait too long are stopped, and
  retries wait longer each time (1 s, 2 s, 4 s) so a struggling server is not
  flooded. The front end already has an 8 second timeout.
- **Rate limiting:** each user or IP address is limited (for example 100
  requests per minute). Extra requests get `429 Too Many Requests`.
- **Graceful degradation:** if an optional feature such as search is down,
  users can still read and write notes.

### Single points of failure and how each is avoided

| Part that could fail | How we avoid the problem |
|---|---|
| One app server | Two or more identical, stateless app servers behind the load balancer; its health checks skip a dead server |
| The load balancer | The cloud provider runs it in a redundant way across several machines |
| The primary database | A read replica holds a copy and can be promoted to primary (failover) |
| The cache (Redis) | The app still works if the cache is empty or down; it just reads from the database more slowly (graceful degradation) |
| The queue and worker | Jobs stay in the queue until a worker finishes them, and several workers can run |
| A whole data centre | Servers and replicas are spread over more than one availability zone |
| Data loss | Nightly backups to separate storage, with restores tested regularly |

## 10. Security

- All traffic uses **HTTPS**.
- Passwords are stored only as **hashes**, never as plain text.
- Users log in and receive a **token**, and every request is checked so users
  can only see and change their own notes.
- Only the app servers can talk to the database; the browser never connects to
  it directly.
- All database queries use **placeholders**, which prevents SQL injection.
- The front end writes user text with `textContent`, never `innerHTML`, which
  prevents cross-site scripting.

## 11. Monitoring

- **Logs:** timestamped records of events and errors.
- **Metrics on a dashboard:** requests per second, error rate, latency of
  `GET /notes` for 95% of requests, CPU use and cache hit rate.
- **Alerts:** an engineer is notified if, for example, more than 1% of
  requests fail or latency goes above 1 second.

## 12. Trade-offs

1. **Speed versus freshness.** The cache makes reads very fast, but data can be
   stale. We clear a user's cached notes whenever they change a note, and use a
   5 minute TTL as a safety net. A note list that is a moment out of date is
   acceptable for a notes app.
2. **Simplicity versus scalability.** We keep one well-organised application (a
   monolith) instead of microservices. It is easier to build, test and run for
   a small team. We would only split out a part, such as search, if there were
   a clear reason.
3. **Cost versus reliability.** Extra servers and a replica cost more than one
   machine, but they keep the app online if something fails. At 1 million users
   that cost is justified.
4. **Consistency versus availability.** The replica can be a few milliseconds
   behind the primary (eventual consistency). We accept this to keep reads fast
   and available. If it ever mattered, a user's own newest notes could be read
   from the primary.
