# QuickNotes Data Model

QuickNotes stores structured data (users, notes, tags) with clear
relationships and strict rules, so a **relational (SQL) database** is the right
choice. The design below works in MySQL and in SQLite.

## 1. Entities

| Table | What one row is |
|---|---|
| `users` | one person with an account |
| `notes` | one note written by one user |
| `tags` | one label, such as "exams" or "urgent" |
| `note_tags` | one link between a note and a tag (a join table) |

## 2. Relationships

```text
 users 1 ----< notes >----< note_tags >----< tags
        one-to-many         many-to-many (through the join table)
```

- **One-to-many: users to notes.** One user has many notes, but each note
  belongs to exactly one user. This is stored with a foreign key,
  `notes.user_id`, that points to `users.id`.
- **Many-to-many: notes and tags.** A note can have many tags, and a tag can be
  on many notes. A single column cannot hold this cleanly, so a **join table**
  (`note_tags`) stores one pair of ids per row.

## 3. Columns, types and keys

**users**

| Column | Type | Key and rules |
|---|---|---|
| `id` | INT | Primary key (PK), numbered automatically |
| `name` | VARCHAR(100) | NOT NULL |
| `email` | VARCHAR(100) | NOT NULL, UNIQUE |
| `password_hash` | VARCHAR(255) | NOT NULL (never the plain password) |
| `created_at` | DATETIME | Defaults to the current time |

**notes**

| Column | Type | Key and rules |
|---|---|---|
| `id` | INT | Primary key (PK) |
| `user_id` | INT | Foreign key (FK) to `users.id`, NOT NULL |
| `title` | VARCHAR(100) | NOT NULL |
| `body` | VARCHAR(500) | NOT NULL |
| `category` | VARCHAR(20) | NOT NULL, default `personal` |
| `created_at` | DATETIME | Defaults to the current time |
| `updated_at` | DATETIME | Defaults to the current time |

**tags**

| Column | Type | Key and rules |
|---|---|---|
| `id` | INT | Primary key (PK) |
| `name` | VARCHAR(30) | NOT NULL, UNIQUE |

**note_tags** (join table)

| Column | Type | Key and rules |
|---|---|---|
| `note_id` | INT | Part of the composite primary key; FK to `notes.id` |
| `tag_id` | INT | Part of the composite primary key; FK to `tags.id` |

## 4. CREATE TABLE statements

```sql
CREATE TABLE users (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,   -- no two users share an email
  password_hash VARCHAR(255) NOT NULL,          -- never the plain password
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  user_id     INT NOT NULL,
  title       VARCHAR(100) NOT NULL,
  body        VARCHAR(500) NOT NULL,
  category    VARCHAR(20) NOT NULL DEFAULT 'personal',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE tags (
  id    INT PRIMARY KEY AUTO_INCREMENT,
  name  VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE note_tags (
  note_id  INT NOT NULL,
  tag_id   INT NOT NULL,
  PRIMARY KEY (note_id, tag_id),   -- the same tag cannot be added twice to a note
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
);
```

(In SQLite, write `INTEGER PRIMARY KEY` instead of `INT PRIMARY KEY
AUTO_INCREMENT`; it numbers rows automatically.)

### Summary

**users:** `id` (primary key), `name`, `email` (unique), `password_hash`,
`created_at`.

**notes:** `id` (primary key), `user_id` (foreign key to `users.id`), `title`,
`body`, `category`, `created_at`, `updated_at`.

**tags:** `id` (primary key), `name` (unique).

**note_tags:** `note_id` and `tag_id` together form the primary key; both are
foreign keys.

## 5. Rules the database enforces

- `NOT NULL` on required columns, so a note always has a title, body and owner.
- `UNIQUE` on `users.email` and `tags.name`, so duplicates are rejected.
- Foreign keys, so a note cannot point to a user that does not exist.
- `ON DELETE CASCADE`, so deleting a user removes their notes, and deleting a
  note removes its tag links. No orphan rows are left behind.
- The composite primary key on `note_tags` stops the same tag being added to the
  same note twice.
- Rules inside the database apply to every change, whoever makes it, so the
  data stays correct even if application code has a bug.

## 6. Why this shape (normalisation)

Each fact is stored in exactly one place. A user's email lives only in `users`,
so changing it means updating one row, not every note. A tag name lives only in
`tags`, so "urgent" cannot exist twice with different spellings. There are no
comma-separated lists in a column; the join table is used instead.

## 7. Indexes

Primary keys and `UNIQUE` columns are indexed automatically. We add two more:

```sql
CREATE INDEX idx_notes_user_id ON notes(user_id, created_at);
CREATE INDEX idx_note_tags_tag_id ON note_tags(tag_id);
```

- `notes(user_id, created_at)`: almost every query is "this user's notes,
  newest first". The index lets the database jump straight to one user's notes
  already in date order instead of scanning every row.
- `note_tags(tag_id)`: makes "all notes with this tag" fast. (Lookups by
  `note_id` are already covered by the primary key.)

The trade-off: indexes make reads much faster but make writes slightly slower
and use extra space. We only index columns we search by often.

## 8. Example queries

```sql
-- A user's notes, newest first (what GET /notes runs)
SELECT id, title, body, category, created_at
FROM notes
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT 20;

-- Create a note
INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?);

-- Delete a note, only if it belongs to this user
DELETE FROM notes WHERE id = ? AND user_id = ?;

-- Notes tagged "urgent" for one user (two joins)
SELECT notes.title
FROM notes
JOIN note_tags ON note_tags.note_id = notes.id
JOIN tags      ON tags.id = note_tags.tag_id
WHERE tags.name = 'urgent' AND notes.user_id = ?;

-- Number of notes per category for one user
SELECT category, COUNT(*) AS note_count
FROM notes
WHERE user_id = ?
GROUP BY category;
```

The `?` marks are placeholders that the server fills in safely. User text is
never glued into the SQL string, which prevents SQL injection. The
`AND user_id = ?` part makes sure users can only change their own notes.

## 9. Size and growth

At about 500 bytes per note and 1,000,000 new notes per day, the `notes` table
grows by about 500 MB per day (about 180 GB per year). One well-configured
database with a read replica handles this. If the table ever became too large
or too busy, we could split it across several databases by user id (sharding),
but it is not needed at this scale.

## 10. Why SQL and not NoSQL

The data has a clear structure and real relationships (users, notes, tags), and
correctness matters. SQL gives us foreign keys, JOINs, enforced rules and
transactions. A document database such as MongoDB could store each user with
their notes in one document, but queries like "all notes tagged urgent" would
be harder, and tag data would be duplicated. If notes later became very
flexible (images, checklists, drawings), a document database for that part
could be reconsidered.

## 11. Backups and changes

- The database is backed up every night, and restores are tested.
- Changes to the structure (a new column or table) are made through versioned
  **migration** scripts, applied in order, so every copy of the database stays
  the same.
