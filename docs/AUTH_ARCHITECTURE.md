# Authentication Architecture

This document describes the authentication flow between the frontend (Next.js) and the backend (API Gateway).

## Overview

The system uses a hybrid authentication approach:
- **Frontend**: NextAuth.js for session management and OAuth (Google)
- **Backend**: Custom JWT tokens for API authentication
- **Token Flow**: Backend issues JWTs that are stored in NextAuth session and passed to all API calls

## Authentication Flow

### 1. Password Login/Signup

```
┌─────────────┐     POST /auth/login      ┌─────────────────┐
│   Frontend  │ ──────────────────────────▶│   API Gateway   │
│  (Next.js)  │                            │    (Express)    │
│             │◀────────────────────────── │                 │
└─────────────┘   { user, token }          └─────────────────┘
       │                                           │
       │  Store token in local state               │  Verify password
       │  or NextAuth session                      │  Issue JWT
       ▼                                           ▼
```

**Frontend** (`apps/web/lib/api-client.js`):
```javascript
// AuthApi.login() → POST /auth/login
const { user, token } = await AuthApi.login({ email, password });
// token is stored and used for subsequent API calls
```

**Backend** (`services/api-gateway/src/routes/auth.js`):
- Validates email/password with bcrypt
- Issues JWT via `issueAuthToken(user)`
- Returns `{ user, token, isNew: false }`

### 2. Google OAuth (NextAuth)

```
┌─────────────┐   OAuth Redirect    ┌──────────┐
│   Frontend  │ ──────────────────▶ │  Google  │
│  (Next.js)  │                     │   OAuth  │
│             │◀────────────────────│          │
└─────────────┘   OAuth callback    └──────────┘
       │
       │  NextAuth signIn callback
       ▼
┌─────────────────────────────────────────────────────┐
│  POST /auth/oauth/google                            │
│  { email, name, googleId }                          │
│                                                     │
│  Backend: Creates/updates user, issues JWT          │
│  Returns: { user, token }                           │
│                                                     │
│  NextAuth: Stores token in session                  │
│  session.accessToken = token                        │
└─────────────────────────────────────────────────────┘
```

**NextAuth Configuration** (`apps/web/app/api/auth/[...nextauth]/route.js`):
```javascript
callbacks: {
  async signIn({ user, account }) {
    // On Google OAuth, sync with backend
    const data = await AuthApi.oauthGoogle({
      email: user.email,
      name: user.name,
      googleId: account.providerAccountId,
    });
    user.backendToken = data.token;  // Store for session
  },
  async session({ session, token }) {
    session.accessToken = token.backendToken;  // Expose to frontend
  }
}
```

## Token Structure

### JWT Payload

Tokens are issued by `services/api-gateway/src/utils/auth-tokens.js`:

```javascript
{
  sub: "user-uuid",           // User ID (required)
  email: "user@example.com",  // User email
  roles: ["owner"],           // User roles array
  orgId: null,                // Organization ID (if any)
  exp: 1234567890,            // Expiration timestamp
  iat: 1234567890             // Issued at timestamp
}
```

**Configuration**:
- Secret: `AUTH_JWT_SECRET` environment variable (required)
- Expiry: `AUTH_JWT_EXPIRES_IN` environment variable (default: "7d")

## Backend Auth Middleware

### `requireAuth` Middleware

Location: `services/api-gateway/src/middleware/require-auth.js`

**Token Sources** (in order of precedence):
1. `Authorization: Bearer <token>` header
2. `?token=<token>` query parameter (for EventSource/SSE endpoints)

**On Success** - Populates `req.user`:
```javascript
req.user = {
  id: payload.sub,      // User ID from JWT
  email: payload.email, // User email
  roles: payload.roles, // User roles
  orgId: payload.orgId, // Organization ID
  token: token          // Original token (for internal HTTP calls)
};
```

**On Failure** - Returns 401:
- Missing token: `"Missing Authorization header or token parameter"`
- Invalid/expired token: `"Invalid or expired auth token"`

## Route Protection

### Protected Routes

All routes under these paths require authentication:
- `/api/llm/*` - All LLM operations
- `/wizard/*` - Job wizard operations
- `/wizard/copilot/*` - Copilot chat
- `/assets/*` - Asset management
- `/videos/*` - Video library
- `/dashboard/*` - Dashboard data
- `/users/*` - User profile
- `/companies/*` - Company management
- `/golden-interview/*` - Golden interview sessions
- `/subscriptions/purchase` - Credit purchases

### Public Routes

These routes do NOT require authentication:
- `/auth/login` - Login
- `/auth/signup` - Signup
- `/auth/oauth/google` - OAuth callback
- `/contact/*` - Contact form
- `/subscriptions/plans` - List subscription plans (GET only)

## Frontend API Client Pattern

All API calls pass the auth token via the `authToken` option:

```javascript
// apps/web/lib/api-client.js
function authHeaders(authToken) {
  if (!authToken) return {};
  return { Authorization: `Bearer ${authToken}` };
}

// Usage in API methods
async fetchJob(jobId, options = {}) {
  const response = await fetch(`${API_BASE_URL}/wizard/${jobId}`, {
    headers: {
      ...authHeaders(options.authToken),
    },
  });
  // ...
}
```

## Internal HTTP Calls

For internal service-to-service calls (e.g., Golden Interviewer calling `/api/llm`), the original user's token is forwarded:

```javascript
// req.user.token contains the original JWT
const response = await fetch(`http://127.0.0.1:${port}/api/llm`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${req.user.token}`,
  },
  body: JSON.stringify({ taskType: "...", context: {...} }),
});
```

This ensures:
1. The internal call is authenticated
2. Usage tracking attributes to the correct user
3. Rate limits apply per-user

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_JWT_SECRET` | Yes | - | Secret key for signing JWTs |
| `AUTH_JWT_EXPIRES_IN` | No | `"7d"` | Token expiration (e.g., "1h", "7d") |
| `GOOGLE_CLIENT_ID` | For OAuth | - | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For OAuth | - | Google OAuth client secret |
| `NEXTAUTH_SECRET` | For NextAuth | - | NextAuth session encryption key |
| `NEXTAUTH_URL` | For NextAuth | - | Base URL for NextAuth callbacks |

## Security Considerations

1. **JWT Secret**: Must be a strong, random string. Never commit to git.
2. **Token Storage**: Frontend stores in NextAuth session (encrypted cookie).
3. **HTTPS**: Always use HTTPS in production to protect tokens in transit.
4. **Token in Query**: Only used for SSE/EventSource (browsers don't support auth headers).
5. **No Refresh Tokens**: Tokens are long-lived (7d default). User re-authenticates on expiry.

## Debugging Auth Issues

### Backend Logs

Auth failures are logged with context:
```javascript
logger.warn({
  err: error?.message,
  path: req.path
}, "Auth token verification failed");
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| 401 "Missing Authorization header" | Token not passed | Check `authHeaders()` is called |
| 401 "Invalid or expired auth token" | Token expired or malformed | Re-authenticate user |
| Token missing in session | NextAuth callback not storing token | Check signIn/session callbacks |
| "AUTH_JWT_SECRET is not configured" | Missing env var | Set `AUTH_JWT_SECRET` in `.env` |

---

**Last updated**: December 2024
