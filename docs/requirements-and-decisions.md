# Task Management App: Requirements and Decisions

This document records the product requirements and architectural decisions agreed on before API contracts and implementation begin.

It is intentionally a planning document. It does not require task models, task routes, Redis, background workers, or email infrastructure to be implemented immediately.

**Implementation status (2026-09-25):** Foundational authentication services, token/session models, validation utilities, middleware, and the baseline task model have been implemented. Authentication and user HTTP controllers/routes, task operations, audit logging, rate limiting, and deployment infrastructure remain incomplete.

## 1. Product Scope

The application is a task management API built with Node.js, Express, MongoDB, and Mongoose.

The implementation will be developed in stages:

1. Authentication and account management [PARTIAL: core services/utilities exist; HTTP controllers/routes are pending.]
2. API contracts and validation [PARTIAL: contracts and shared validation exist; route-specific validation is pending.]
3. Task model and task operations [PARTIAL: baseline task model exists; task operations are pending.]
4. Documentation, logging, rate limiting, and testing [PARTIAL: planning/contracts and unit tests exist; audit logging and rate limiting are pending.]
5. Redis, background jobs, reminders, and other refinements [NOT IMPLEMENTED; intentionally deferred.]
6. Deployment and operational improvements [NOT IMPLEMENTED; intentionally deferred.]

The first milestone covers users and authentication only. Task operations will be added after the user and authentication contracts are agreed upon. [CHANGED: authentication service work is underway, but its HTTP layer and the user profile/admin layer are not yet implemented.]

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

**User-account implementation status:** Registration, login, email verification, logout/session revocation, password change, password-reset request, and password reset exist as service-layer functions in `src/services/auth.service.js`; their controllers/routes are not implemented. Profile updates and account deletion are not implemented. The email provider is only an injectable adapter, not a production delivery integration.

Email verification is required before login is allowed. [DONE in the auth service; the HTTP route is pending.]

Email format validation and email ownership verification are separate concerns:

- Format validation checks whether the submitted value looks like an email address.
- Verification confirms that the user controls that email address.

The email address should be normalized consistently, including trimming and lowercasing. Email uniqueness must be enforced by a MongoDB unique index, and duplicate-key errors must still be handled by the API.

If usernames are publicly visible or used for lookup, usernames should also be unique and normalized according to a documented policy. [PARTIAL/DONE: the model has a unique index and registration lowercases usernames; route-level policy validation is pending.]

**Identity implementation status:** Email and username fields are trimmed/lowercased by the model and auth service, unique indexes exist, and duplicate email/username errors are translated in registration. Email-format, username-pattern, and other request validation schemas are not yet attached to auth routes because those routes do not exist.

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

**Implementation status:** JWT access/refresh creation and verification are implemented in `src/utils/jwt.js`, including separate secrets, issuer/audience checks, lifetimes from environment variables, and restricted claims. Auth routes/controllers that use these utilities are still pending.

Use JWT access tokens and refresh tokens with different responsibilities:

- Access tokens are short-lived and authorize API requests.
- Refresh tokens are longer-lived and are exchanged for new access tokens.
- Access tokens should not be used as the revocable session record.

For a browser client, store the refresh token in a secure, `HttpOnly`, `SameSite` cookie. Avoid exposing refresh tokens to browser JavaScript when possible.

[PARTIAL: `src/utils/refresh-cookie.js` defines the HttpOnly/SameSite/production-Secure cookie behavior, but login/refresh/logout route integration and CSRF/origin protection are not implemented.]

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

[DONE at the service layer: `src/models/refresh-session.model.js` stores only the token hash and `src/services/refresh-session.service.js` performs rotation, replacement linking, expiry checks, and reuse detection. Audit persistence and HTTP routes remain pending.]

Redis is not required before the core authentication flow works. It can be added later for fast session lookup, TTL cleanup, distributed deployments, rate limiting, caching, and job queues. MongoDB-backed sessions are a reasonable first implementation and are easier to inspect while learning.

### Session invalidation

Refresh sessions must be invalidated when:

- The user logs out.
- The user changes their password.
- The user resets their password.
- The user deletes their account.
- A refresh-token reuse or other suspicious security event is detected.

Because access JWTs are stateless, they should be short-lived. Revoking the refresh session prevents new access tokens from being issued; an already-issued access token remains valid until it expires unless a separate denylist or token-version strategy is introduced.

**Session invalidation status:** Logout, logout-all, password change, and password reset service functions revoke refresh sessions. Account-deletion invalidation is not implemented. Reuse detection revokes sessions, but no audit-log persistence exists yet.

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

**Implementation status:** Password reset requests, hashed single-use tokens, reset consumption, password hashing, and refresh-session invalidation are implemented in the auth/email-token services. HTTP routes/controllers, rate limiting, and production email delivery are pending.

A logged-out user can request a password reset email. The response should not reveal whether the email exists.

Password reset tokens must be:

- Cryptographically random.
- Stored only as hashes.
- Time-limited.
- Single-use.
- Invalidated after successful password reset.

A successful password reset must invalidate all active refresh sessions. Password-reset tokens should normally be kept in a separate collection or token model rather than embedded as plaintext fields on the user document.

[DONE: reset tokens use the separate `EmailToken` model and successful resets call refresh-session revocation.]

## 5. Current User Model Direction

The user model currently includes the basic identity, role, profile, soft-delete, and timestamp fields. The current password field is hidden from normal Mongoose queries. [CHANGED: the implemented field is `passwordHash`, not `password`, and it is excluded with `select: false`.]

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

Do not add authentication fields that no implemented flow can maintain. Fields such as `lastLoginAt`, failed-login counters, account lock timestamps, and email-verification timestamps should be added when their corresponding features are implemented. [CHANGED: `emailVerifiedAt` and `passwordChangedAt` are implemented and maintained; `lastLoginAt`, failed-login counters, and account-lock fields remain absent.]

**User-model status:** `username`, normalized unique `email`, `passwordHash`, restricted `role`, `isDeleted`, `isDisabled`, `avatar`, `bio`, `timezone`, email-verification fields, password-change timestamp, and Mongoose timestamps are implemented in `src/models/user.model.js`. Profile/account-lifecycle services and routes are still pending.

## 6. Roles and Authorization

There are two roles:

- `user`: owns and manages their own account and tasks.
- `admin`: performs controlled administrative operations.

Authentication middleware verifies the access token and attaches the authenticated user to the request. Authorization middleware checks whether the user has the required role. [PARTIAL: both middleware implementations and unit tests exist, but `requireAuth` currently does not call Express `next()`, so route integration is not complete.]

Role checks alone are not sufficient. Controllers or services must also enforce resource ownership, especially for tasks. A regular user must never be able to read or modify another user's tasks by changing an ID in the request.

### Admin creation and management

Public registration must never allow a caller to choose the `admin` role.

The initial admin should be created through a controlled seed or bootstrap process. Later role changes should be performed through a protected admin-only operation and should be recorded in an audit log. [NOT IMPLEMENTED: no seed/bootstrap, admin operation layer, or audit-log model exists.]

Administrators may initially be able to:

- List, search, and inspect users.
- View account verification and status information.
- Suspend, soft-delete, restore, or deactivate users according to the account policy.
- Promote or demote users.
- View or moderate tasks when support or moderation requires it.
- Review security and administrative audit logs.

Administrators must not be able to view plaintext passwords or password hashes through normal application responses. Administrative access should be limited to the capabilities the application genuinely needs. [DONE for the current model serialization and auth public-user mapping; the admin HTTP layer is pending.]

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

### Current task model baseline

The current task model implements the baseline fields above and uses `isDeleted: false` for soft deletion. This is appropriate for the first task-CRUD milestone. [DONE at the model baseline; task services/controllers/routes are not implemented.] The implementation must also enforce these application invariants:

- Every task query is scoped by the authenticated `userId`, except explicitly authorized admin operations.
- A completed task has `status: "completed"` and a `completedAt` timestamp.
- A pending task has `status: "pending"` and `completedAt: null`.
- Marking a task complete sets `completedAt`; restoring a task to pending clears it.
- Soft-deleted tasks are excluded from normal reads and are not returned in counts or search results.
- Updating or deleting a task must verify ownership before changing it.

The current single-field `userId` index supports basic ownership lookups. [DONE: the current model defines this index.] Before task filtering and sorting are implemented, add and verify compound indexes based on measured query patterns, initially considering `{ userId: 1, status: 1, deadline: 1 }` and an index that supports upcoming-task queries. Indexes should be confirmed with query explain plans rather than added indiscriminately. [PENDING: compound indexes and explain-plan verification.]

The task model should not silently decide API behavior. The task API contract must define title and description limits, whether past deadlines are allowed, how `null` deadlines are represented, allowed status transitions, pagination, and the exact date/timezone semantics for deadline searches.

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

**Security/operations status:** Generic enumeration-resistant responses exist in the verification/reset services; bcrypt, JWT configuration, duplicate-key translation, cookie helpers, CORS middleware, environment-driven secrets, shared Zod validation, error envelopes, and unit tests are implemented. Rate limiting, CSRF/origin protection, production CORS allowlisting, audit logging, request correlation, auth HTTP tests, ownership tests, and full integration tests are still pending. Administrative pagination is specified in the contract but not implemented because admin routes/services do not exist.

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

**Implementation status:** These decisions remain valid, but none of the admin bootstrap, admin user operations, task moderation, or audit-log capabilities are implemented yet.

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

After these decisions, define the API contracts for authentication and users first. Then create the task model and task contracts. [DONE: `user.api.contracts.md` and `task.api.contracts.md` exist; implementation is still behind the contracts.]

## 11. Recommended Implementation Order

1. Confirm the decisions listed above. [DONE: decisions are recorded here.]
2. Define authentication and user API contracts. [DONE: `user.api.contracts.md` exists.]
3. Add request validation and consistent error handling. [PARTIAL: shared Zod adapter, validation middleware, malformed-JSON handling, and error envelope exist; route-specific schemas are pending.]
4. Implement registration and bcrypt password hashing. [PARTIAL: auth service, bcrypt utility, model field, and tests exist; route/controller and database integration tests are pending.]
5. Implement email verification. [PARTIAL: token model/utilities/service and auth service flow exist; route/controller, production email delivery, and rate limiting are pending.]
6. Implement login with access and refresh tokens. [PARTIAL: auth service and JWT utilities exist; route/controller, cookie integration, and end-to-end tests are pending.]
7. Implement refresh-token storage, rotation, and revocation. [DONE at the model/service level; HTTP routes, CSRF/origin checks, audit events, and integration tests are pending.]
8. Implement logout, password change, password reset, and account deletion. [PARTIAL: logout/password-change/password-reset services exist; account deletion and all HTTP layers are pending.]
9. Implement authentication and role middleware. [PARTIAL: middleware and unit tests exist; `requireAuth` must be wired to Express with `next()` before routes can use it.]
10. Implement user profile updates. [NOT IMPLEMENTED.]
11. Define and implement the task model and ownership rules. [PARTIAL: task model and task contract exist; ownership/service enforcement is pending.]
12. Implement task CRUD, filtering, sorting, and pagination. [NOT IMPLEMENTED.]
13. Add tests, rate limiting, documentation, and logging. [PARTIAL: unit tests and API/planning documentation exist; route/integration tests, rate limiting, audit logging, and request logging policy are pending.]
14. Add Redis, background jobs, email reminders, and optional WebSockets as later refinements. [NOT IMPLEMENTED; intentionally deferred.]

## 12. Decision Maintenance

Whenever a product or architecture decision changes, update this document in the same work session before implementing the affected API or model. The decision should be recorded in the relevant section, and any outdated recommendation should be removed or clearly marked as superseded.

**Status update:** This document was audited against the current repository on 2026-09-25. The next implementation boundary is the authentication HTTP layer: auth controllers, route-specific Zod schemas, refresh-cookie/CSRF handling, route mounting, and end-to-end auth tests. User profile/admin operations should follow that layer.
