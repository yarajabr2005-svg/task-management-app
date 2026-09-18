# Task Management App: Requirements and Decisions

This document records the product requirements and architectural decisions agreed on before API contracts and implementation begin.

It is intentionally a planning document. It does not require task models, task routes, Redis, background workers, or email infrastructure to be implemented immediately.

## 1. Product Scope

The application is a task management API built with Node.js, Express, MongoDB, and Mongoose.

The implementation will be developed in stages:

1. Authentication and account management
2. API contracts and validation
3. Task model and task operations
4. Documentation, logging, rate limiting, and testing
5. Redis, background jobs, reminders, and other refinements
6. Deployment and operational improvements

The first milestone covers users and authentication only. Task operations will be added after the user and authentication contracts are agreed upon.

## 2. User Account Requirements

A regular user must be able to:

- Register with an email address, password, and username.
- Verify their email address through a verification email.
- Log in with their email and password after verification.
- Log out.
- Update their username.
- Add or update a profile picture.
- Add or update a biography.
- Change their password while logged in by providing their current password.
- Request a password reset while logged out.
- Reset their password through a time-limited email link.
- Delete their account.

Email verification is required before login is allowed.

Email format validation and email ownership verification are separate concerns:

- Format validation checks whether the submitted value looks like an email address.
- Verification confirms that the user controls that email address.

The email address should be normalized consistently, including trimming and lowercasing. Email uniqueness must be enforced by a MongoDB unique index, and duplicate-key errors must still be handled by the API.

If usernames are publicly visible or used for lookup, usernames should also be unique and normalized according to a documented policy.

## 3. Authentication Decisions

### Password hashing

Use bcrypt for this project. Bcrypt remains an industry-standard password hashing algorithm and is appropriate for this beginner-to-intermediate training project when configured with a suitable cost factor.

Argon2id is the preferred modern choice for a new high-security system, but switching algorithms is not necessary for this project. The important requirements are:

- Never store a plaintext password.
- Store only a password hash.
- Hash passwords before saving them.
- Compare passwords using the hashing library's verification function.
- Never return the password hash in normal API responses.
- Use a field named `passwordHash` when authentication is implemented.

### Access and refresh tokens

Use JWT access tokens and refresh tokens with different responsibilities:

- Access tokens are short-lived and authorize API requests.
- Refresh tokens are longer-lived and are exchanged for new access tokens.
- Access tokens should not be used as the revocable session record.

For a browser client, store the refresh token in a secure, `HttpOnly`, `SameSite` cookie. Avoid exposing refresh tokens to browser JavaScript when possible.

### Refresh-token storage

The initial implementation should store refresh-token sessions in MongoDB. Store a hash of the refresh token rather than the raw token.

A future session record can contain:

- `userId`
- Refresh-token hash
- Expiration time
- Revocation time or revoked status
- Token-rotation or replacement reference
- Creation and update timestamps
- Optional device, IP, or user-agent metadata

Use refresh-token rotation. When a refresh token is used, invalidate it and issue a replacement. Reuse of an already-invalidated token should revoke the related session or all sessions for that user, depending on the security policy.

Redis is not required before the core authentication flow works. It can be added later for fast session lookup, TTL cleanup, distributed deployments, rate limiting, caching, and job queues. MongoDB-backed sessions are a reasonable first implementation and are easier to inspect while learning.

### Session invalidation

Refresh sessions must be invalidated when:

- The user logs out.
- The user changes their password.
- The user resets their password.
- The user deletes their account.
- A refresh-token reuse or other suspicious security event is detected.

Because access JWTs are stateless, they should be short-lived. Revoking the refresh session prevents new access tokens from being issued; an already-issued access token remains valid until it expires unless a separate denylist or token-version strategy is introduced.

## 4. Email Verification and Password Reset

### Email verification

Registration should create an unverified user and send a verification email.

Verification tokens must be:

- Cryptographically random.
- Sent to the user only through the email link.
- Stored in the database only as a hash.
- Time-limited with an expiration date.
- Single-use.

The verification flow should support requesting a new verification email while avoiding email-enumeration leaks and excessive requests.

The user cannot log in until verification succeeds.

### Forgot-password flow

A logged-out user can request a password reset email. The response should not reveal whether the email exists.

Password reset tokens must be:

- Cryptographically random.
- Stored only as hashes.
- Time-limited.
- Single-use.
- Invalidated after successful password reset.

A successful password reset must invalidate all active refresh sessions. Password-reset tokens should normally be kept in a separate collection or token model rather than embedded as plaintext fields on the user document.

## 5. Current User Model Direction

The user model currently includes the basic identity, role, profile, soft-delete, and timestamp fields. The current password field is hidden from normal Mongoose queries.

When authentication is implemented, the model should evolve toward:

- `name` or `username`, with a clear naming decision
- Normalized, unique `email`
- `passwordHash`, excluded from normal queries
- `role`, restricted to `user` and `admin`
- `isDeleted` or a documented account-status strategy
- `avatar` or profile-picture URL
- `bio`
- `emailVerified`
- `emailVerifiedAt`
- `passwordChangedAt`, if used by the token strategy
- `createdAt` and `updatedAt`

Do not add authentication fields that no implemented flow can maintain. Fields such as `lastLoginAt`, failed-login counters, account lock timestamps, and email-verification timestamps should be added when their corresponding features are implemented.

## 6. Roles and Authorization

There are two roles:

- `user`: owns and manages their own account and tasks.
- `admin`: performs controlled administrative operations.

Authentication middleware verifies the access token and attaches the authenticated user to the request. Authorization middleware checks whether the user has the required role.

Role checks alone are not sufficient. Controllers or services must also enforce resource ownership, especially for tasks. A regular user must never be able to read or modify another user's tasks by changing an ID in the request.

### Admin creation and management

Public registration must never allow a caller to choose the `admin` role.

The initial admin should be created through a controlled seed or bootstrap process. Later role changes should be performed through a protected admin-only operation and should be recorded in an audit log.

Administrators may initially be able to:

- List, search, and inspect users.
- View account verification and status information.
- Suspend, soft-delete, restore, or deactivate users according to the account policy.
- Promote or demote users.
- View or moderate tasks when support or moderation requires it.
- Review security and administrative audit logs.

Administrators must not be able to view plaintext passwords or password hashes through normal application responses. Administrative access should be limited to the capabilities the application genuinely needs.

## 7. Task Requirements

A regular user must be able to:

- Create a task.
- Update a task title, description, status, or deadline.
- Set, change, or remove an optional deadline.
- Delete a task.
- Mark a task as completed.
- View upcoming tasks.
- View completed tasks.
- View all owned tasks.
- Sort tasks by deadline.
- Search tasks by deadline date.
- Search tasks by an exact deadline date and time when supplied.

Tasks without a deadline should appear after tasks with deadlines when sorting in ascending deadline order.

Every task must belong to a user through an owner reference such as `userId`. All user task queries must be scoped to the authenticated owner unless an authorized admin operation explicitly requires broader visibility.

Dates should be stored in UTC. The API contract must define how date-only searches and user timezones are interpreted before deadline filtering is implemented.

A future task model will likely need fields similar to:

- `userId`
- `title`
- `description`
- `status`
- `deadline`
- `completedAt`
- `createdAt`
- `updatedAt`

Reminder fields should be added when the reminder feature is implemented rather than prematurely adding unused fields.

## 8. Email Reminders and Background Work

The application may later send:

- A reminder before a task deadline.
- An overdue reminder after a deadline passes while the task remains incomplete.

The user should be able to choose when a reminder is sent before the deadline.

This feature does not require WebSockets. It requires:

- An email provider.
- A background scheduler or job queue.
- A worker process that sends reminder emails.
- Retry and failure handling.
- Idempotency so the same reminder is not repeatedly sent.
- A clear policy for changed, completed, deleted, or expired tasks.
- Timezone-aware deadline calculations.

Redis and BullMQ can be introduced during the later background-jobs phase. Leave reminders out of the initial authentication and task-CRUD implementation while keeping the future design in mind.

WebSockets are optional and should only be added if the application later needs real-time task updates or notifications in an open client.

## 9. Security and Operational Requirements

Before considering the authentication system complete, add or plan for:

- Rate limiting on login, password reset, verification, and refresh-token endpoints.
- Generic responses that do not reveal whether an email is registered.
- Strong request validation and consistent error responses.
- Duplicate-email error handling at the database boundary.
- Secure cookie settings when cookies are used.
- CORS configuration for known client origins.
- Environment variables for secrets, database URLs, and email credentials.
- Secret rotation and separate secrets for different environments.
- Audit logging for role changes, account deletion, password changes, and suspicious token events.
- Pagination for administrative user lists and task lists.
- A documented soft-delete versus permanent-delete policy.
- Tests for authentication, authorization, ownership checks, token invalidation, and validation failures.

## 10. Decisions Before API Contracts

The following decisions are final for the first release.

### Identity and usernames

- The public identity field is `username`. A separate `name` field will only be added if the product later needs a person's real or display name.
- Usernames are unique, stored in lowercase, and limited to 3-30 characters.
- The allowed characters are lowercase letters, digits, underscores, and periods: `^[a-z0-9_.]{3,30}$`.
- Username uniqueness is enforced by a database unique index. Application validation should provide a friendly error, but cannot replace the database constraint.

### Account deletion

- Normal user deletion is a soft delete using `isDeleted: true`.
- Deleted users cannot log in or use normal application features.
- Soft deletion preserves task ownership and supports restoration during the retention period.
- Permanent deletion is a controlled administrative or operational process, not a public user action. It must follow a documented retention and privacy policy, and should anonymize or remove personal data when required.

### Token lifetimes and authentication transport

- Access JWT lifetime: 15 minutes.
- Refresh-token lifetime: 7 days, extendable later based on product needs.
- Access tokens are sent in the `Authorization: Bearer <access_token>` header.
- Refresh tokens are sent in a secure, `HttpOnly`, `SameSite` cookie. Production cookies must also use `Secure`.
- Because refresh cookies are automatically sent by browsers, refresh endpoints must use an appropriate CSRF defense, such as strict same-site policy plus origin checks or a CSRF token strategy.

### Session lifecycle

- Normal logout revokes only the current refresh-token session.
- A separate logout-all-sessions capability should revoke every session belonging to the user.
- Password change, password reset, and account deletion revoke all refresh-token sessions.
- Refresh tokens rotate on every successful refresh. The previous token becomes invalid immediately.
- Reuse of a revoked or already-rotated refresh token is treated as token theft: revoke all sessions for the affected user and record a security audit event.

### Verification and password reset

- Email verification tokens expire after 30 minutes.
- Password-reset tokens expire after 15 minutes.
- Both token types are cryptographically random, stored only as hashes, single-use, and invalidated after successful use.

### Time and task behavior

- All timestamps are stored in UTC.
- Each user has an IANA timezone such as `Europe/Amsterdam`; it is used to interpret date-only searches and future reminders.
- Task statuses are `pending` and `completed`.
- Overdue is computed from `deadline` and the current time; it is not stored as a status.
- Soft-deleted tasks are represented by a separate deletion flag or deletion timestamp, not by a `deleted` task status.
- Deadline sorting is ascending, with tasks without deadlines listed last.
- A deadline-date search matches tasks whose deadline falls on that calendar date in the user's timezone. Searching by task creation date is a separate filter and is not part of the deadline search unless explicitly requested.

### Admin bootstrap and first-release capabilities

- The first admin is created manually or through a controlled seed/bootstrap script.
- Public registration never accepts or assigns the `admin` role.
- Later role changes require a protected admin-only operation and an audit event.
- The minimum first-release admin capabilities are:
  - View and search users.
  - View a user's tasks when support or moderation requires it.
  - Soft-delete a user.
  - Restore a user during the retention period.
  - Delete or soft-delete a task when moderation requires it.
  - View security and administrative audit logs.
- “System logs” means filtered audit logs for security-sensitive and administrative actions; it does not mean exposing arbitrary server logs through the API.

After these decisions, define the API contracts for authentication and users first. Then create the task model and task contracts.

## 11. Recommended Implementation Order

1. Confirm the decisions listed above.
2. Define authentication and user API contracts.
3. Add request validation and consistent error handling.
4. Implement registration and bcrypt password hashing.
5. Implement email verification.
6. Implement login with access and refresh tokens.
7. Implement refresh-token storage, rotation, and revocation.
8. Implement logout, password change, password reset, and account deletion.
9. Implement authentication and role middleware.
10. Implement user profile updates.
11. Define and implement the task model and ownership rules.
12. Implement task CRUD, filtering, sorting, and pagination.
13. Add tests, rate limiting, documentation, and logging.
14. Add Redis, background jobs, email reminders, and optional WebSockets as later refinements.

## 12. Decision Maintenance

Whenever a product or architecture decision changes, update this document in the same work session before implementing the affected API or model. The decision should be recorded in the relevant section, and any outdated recommendation should be removed or clearly marked as superseded.
