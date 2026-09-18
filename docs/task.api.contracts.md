# Task API Contracts

This document defines the versioned HTTP contract for task creation, ownership, CRUD operations, filtering, sorting, searching, pagination, completion, soft deletion, and administrative moderation.

It follows `requirements-and-decisions.md`. Authentication, user-account, session, and email contracts belong in the authentication/user contract document.

## 1. Conventions

### Base URL

```text
/api/v1
```

### Authentication

All task endpoints require a valid access token:

```http
Authorization: Bearer <access_token>
```

Refresh tokens are never accepted for task operations. Deleted, suspended, or inactive users cannot use task endpoints.

### Content type

Requests with a body use `Content-Type: application/json`. Successful responses use JSON except `204 No Content` responses.

### Identifier format

`:id` is a 24-character hexadecimal MongoDB ObjectId. A malformed identifier returns `400 INVALID_TASK_ID`. A valid but missing, deleted, or inaccessible task returns `404 TASK_NOT_FOUND`; the API must not reveal whether another user's task exists.

### Resource representation

Normal user responses contain:

```json
{
  "id": "650f1c9b8f1a2c0012345678",
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "status": "pending",
  "deadline": "2026-09-20T15:00:00.000Z",
  "completedAt": null,
  "createdAt": "2026-09-18T14:13:00.000Z",
  "updatedAt": "2026-09-18T14:13:00.000Z"
}
```

Dates are ISO 8601 UTC strings. An absent deadline is JSON `null`, not an empty string. Normal user responses omit `userId`, `isDeleted`, and internal database fields. Admin responses may include `userId` when required for administration.

### Error envelope

Every error uses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": {}
  }
}
```

`details` contains safe field-level validation information when useful. Responses must not expose stack traces, database details, token values, or private user information.

### Pagination

Collection endpoints accept:

- `page`: positive integer, default `1`.
- `limit`: integer from `1` to `100`, default `20`.

Collection responses use:

```json
{
  "tasks": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

Sorting must include a deterministic `_id` tie-breaker.

## 2. Task Rules

- Every task belongs to exactly one user through `userId`.
- Regular users can read and mutate only their own non-deleted tasks.
- Admin task access is explicit and audited.
- Normal reads, counts, searches, and lists exclude `isDeleted: true` tasks.
- A normal user deleting an already deleted task receives `404 TASK_NOT_FOUND`.
- Status values are exactly `pending` and `completed`.
- A completed task has a non-null `completedAt`.
- A pending task has `completedAt: null`.
- Overdue is computed from `status`, `deadline`, and the current time; it is not stored as a status.
- Deadlines are stored in UTC. Date-only filters use the authenticated user's IANA timezone.
- Past deadlines are allowed. A past pending deadline is presented as overdue by computed logic.
- Titles are required, trimmed, and limited to 200 characters. Descriptions are optional, trimmed, and limited to 2,000 characters.

## 3. Create Task

### Request

```http
POST /api/v1/tasks
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "deadline": "2026-09-20T15:00:00.000Z"
}
```

`description` and `deadline` are optional. `deadline` must be a valid ISO 8601 timestamp or `null`. The server sets `userId`, `status: "pending"`, `completedAt: null`, timestamps, and the deletion flag.

### Success: `201 Created`

Returns `{ "task": <task representation> }`.

### Errors

- `400 VALIDATION_ERROR`
- `401 UNAUTHENTICATED`
- `422 TASK_POLICY_VIOLATION`

## 4. List All Owned Tasks

### Request

```http
GET /api/v1/tasks?page=1&limit=20&status=pending&sort=deadline&order=asc
Authorization: Bearer <access_token>
```

Query parameters:

- `status`: `pending` or `completed`.
- `sort`: `deadline`, `createdAt`, or `updatedAt`; default `createdAt`.
- `order`: `asc` or `desc`; default `desc`.
- `page` and `limit` as defined above.

For `sort=deadline&order=asc`, dated tasks are earliest first and `deadline: null` tasks are always last.

### Success: `200 OK`

Returns the standard paginated collection envelope containing only the authenticated user's non-deleted tasks.

### Errors

- `400 VALIDATION_ERROR`
- `401 UNAUTHENTICATED`

## 5. List Upcoming Tasks

```http
GET /api/v1/tasks/upcoming?page=1&limit=20
Authorization: Bearer <access_token>
```

Returns non-deleted tasks with `status=pending` and a non-null `deadline` later than the current instant, ordered by deadline ascending and `_id` as the tie-breaker. Tasks without deadlines are excluded.

Success: `200 OK`, standard paginated collection envelope.

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`.

## 6. List Completed Tasks

```http
GET /api/v1/tasks/completed?page=1&limit=20&sort=completedAt&order=desc
Authorization: Bearer <access_token>
```

Returns non-deleted tasks with `status=completed`. The default order is most recently completed first.

Success: `200 OK`, standard paginated collection envelope.

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`.

## 7. Search Tasks by Deadline

```http
GET /api/v1/tasks/search?date=2026-09-20&time=15:00&page=1&limit=20
Authorization: Bearer <access_token>
```

Query parameters:

- `date`: required calendar date in `YYYY-MM-DD` format.
- `time`: optional local time in `HH:mm` format.
- `page` and `limit`.

The server interprets the date and optional time in the authenticated user's IANA timezone, converts the resulting half-open interval to UTC, and matches non-deleted tasks whose `deadline` falls within it. Without `time`, the interval is the entire local calendar day. Results are sorted by deadline ascending; tasks without deadlines cannot match.

Searching by `createdAt` is a separate future filter and is not part of this endpoint.

Success: `200 OK`, standard paginated collection envelope.

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`.

## 8. Get One Owned Task

```http
GET /api/v1/tasks/:id
Authorization: Bearer <access_token>
```

Success: `200 OK` with `{ "task": <task representation> }`.

Errors: `400 INVALID_TASK_ID`, `401 UNAUTHENTICATED`, `404 TASK_NOT_FOUND`.

## 9. Update Task

### Request

```http
PATCH /api/v1/tasks/:id
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "title": "Buy groceries and fruit",
  "description": "Milk, eggs, bread, apples",
  "deadline": "2026-09-21T15:00:00.000Z"
}
```

This is a partial update. At least one allowed field must be supplied. Allowed fields are `title`, `description`, and `deadline`. Send `"deadline": null` to remove a deadline.

Clients must not send `status` or `completedAt` here. State transitions use the dedicated endpoints below.

Success: `200 OK` with `{ "task": <task representation> }`.

Errors: `400 INVALID_TASK_ID` or `VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `404 TASK_NOT_FOUND`, `422 TASK_POLICY_VIOLATION`.

## 10. Complete Task

```http
POST /api/v1/tasks/:id/complete
Authorization: Bearer <access_token>
```

Sets `status=completed` and `completedAt` to the server's current UTC time. The operation is idempotent: completing an already completed task returns the current representation without changing its original completion time.

Success: `200 OK` with `{ "task": <task representation> }`.

Errors: `400 INVALID_TASK_ID`, `401 UNAUTHENTICATED`, `404 TASK_NOT_FOUND`.

## 11. Reopen Task

```http
POST /api/v1/tasks/:id/reopen
Authorization: Bearer <access_token>
```

Sets `status=pending` and clears `completedAt`.

Success: `200 OK` with `{ "task": <task representation> }`.

Errors: `400 INVALID_TASK_ID`, `401 UNAUTHENTICATED`, `404 TASK_NOT_FOUND`.

## 12. Soft Delete Task

```http
DELETE /api/v1/tasks/:id
Authorization: Bearer <access_token>
```

Sets `isDeleted=true` and records the action in the audit log. The task is not permanently removed and is excluded from ordinary queries.

Success: `204 No Content` with no response body.

Errors: `400 INVALID_TASK_ID`, `401 UNAUTHENTICATED`, `404 TASK_NOT_FOUND`.

## 13. Admin Task Operations

All admin routes require a valid access token and the `admin` role. Every moderation action is audited. Admin access does not expose password hashes or unrelated private data.

### View a user's tasks

```http
GET /api/v1/admin/users/:userId/tasks?page=1&limit=20&status=pending&sort=deadline&order=asc
Authorization: Bearer <admin_access_token>
```

Returns the standard paginated collection envelope. Admin representations may include `userId`. Deleted tasks are excluded unless a future recovery endpoint is introduced.

Errors: `400 INVALID_USER_ID`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 USER_NOT_FOUND`.

### Soft-delete a task

```http
DELETE /api/v1/admin/tasks/:id
Authorization: Bearer <admin_access_token>
```

Sets `isDeleted=true` and records the action in the audit log.

Success: `204 No Content`.

Errors: `400 INVALID_TASK_ID`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 TASK_NOT_FOUND`.

Admin user listing, user deletion/restoration, role management, and audit-log retrieval belong in the user/admin API contracts. They are not task-resource endpoints.

## 14. Error Mapping

| Condition                                       | HTTP status | Code                    |
| ----------------------------------------------- | ----------: | ----------------------- |
| Malformed JSON or request validation failure    |         400 | `VALIDATION_ERROR`      |
| Malformed task identifier                       |         400 | `INVALID_TASK_ID`       |
| Malformed user identifier                       |         400 | `INVALID_USER_ID`       |
| Missing or invalid access token                 |         401 | `UNAUTHENTICATED`       |
| Valid identity without required admin role      |         403 | `FORBIDDEN`             |
| Task missing, deleted, or not owned by caller   |         404 | `TASK_NOT_FOUND`        |
| Target user missing or deleted for admin lookup |         404 | `USER_NOT_FOUND`        |
| Valid request violates a product rule           |         422 | `TASK_POLICY_VIOLATION` |

The API should return `404 TASK_NOT_FOUND`, not `403`, when an ordinary user requests another user's task, to prevent resource enumeration.

## 15. Implementation Requirements

Before implementing these routes:

1. Validate body, query, path, and date/time input.
2. Scope ordinary queries by `userId` and `isDeleted: false`.
3. Enforce the `pending`/`completed` and `completedAt` invariant in the service layer.
4. Add compound indexes after confirming query patterns with explain plans. Initially evaluate `{ userId: 1, isDeleted: 1, status: 1, deadline: 1 }` and indexes for completed and upcoming queries.
5. Define and test the authenticated user's IANA timezone source in the user/authentication contract.
6. Test ownership isolation, pagination, null-deadline ordering, daylight-saving date boundaries, completion/reopen transitions, idempotency, soft deletion, malformed IDs, and admin authorization.
7. Document rate limits and request-correlation/audit behavior in the security and operations documentation.

This document must be updated whenever a task-resource behavior, status rule, response shape, authorization rule, or query parameter changes.
