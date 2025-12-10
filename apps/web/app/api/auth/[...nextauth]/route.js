/**
 * NextAuth Configuration
 *
 * AUTHENTICATION ARCHITECTURE:
 * - NextAuth is the SINGLE SOURCE OF TRUTH for token issuance
 * - The backend NEVER issues JWTs - it only verifies tokens from NextAuth
 * - All tokens are signed with NEXTAUTH_SECRET
 * - Backend verifies using NEXTAUTH_SECRET (AUTH_JWT_SECRET is a legacy fallback)
 *
 * Flow:
 * 1. User logs in via Google OAuth or Credentials
 * 2. signIn callback syncs user with backend (backend returns user data, NO token)
 * 3. jwt callback builds the token payload with user fields (sub, email, roles, orgId)
 * 4. session callback exposes the JWT as session.accessToken
 * 5. Frontend sends Authorization: Bearer <token> to backend
 * 6. Backend verifies the token using the same NEXTAUTH_SECRET
 */

import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import jwt from "jsonwebtoken";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;

/**
 * Sync user with backend - creates or updates user in Firestore
 * Backend returns user data only, NO token (NextAuth issues tokens)
 */
async function syncUserWithBackend(endpoint, payload) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || data.message || "Authentication failed");
  }

  return response.json();
}

const handler = NextAuth({
  // Use JWT strategy - NextAuth manages token issuance
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days (matches previous AUTH_JWT_EXPIRES_IN)
  },

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),

    // Credentials provider for email/password login
    CredentialsProvider({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        action: { label: "Action", type: "text" }, // "login" or "signup"
        name: { label: "Name", type: "text" },
        companyName: { label: "Company", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        const action = credentials.action || "login";

        try {
          if (action === "signup") {
            // Signup flow
            const data = await syncUserWithBackend("/auth/signup", {
              email: credentials.email,
              password: credentials.password,
              name: credentials.name || credentials.email.split("@")[0],
              companyName: credentials.companyName || "",
            });
            return data.user;
          } else {
            // Login flow
            const data = await syncUserWithBackend("/auth/login", {
              email: credentials.email,
              password: credentials.password,
            });
            return data.user;
          }
        } catch (error) {
          throw new Error(error.message || "Authentication failed");
        }
      },
    }),
  ],

  callbacks: {
    /**
     * signIn callback - sync user with backend for OAuth providers
     * Backend creates/updates user and returns user data (NO token)
     */
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        try {
          const data = await syncUserWithBackend("/auth/oauth/google", {
            email: user.email,
            name: user.name,
            googleId: account.providerAccountId,
          });
          // Store backend user data on the user object for jwt callback
          user.backendUser = data.user;
          return true;
        } catch (error) {
          console.error("Error syncing user with backend:", error);
          return false;
        }
      }
      // For credentials provider, user is already the backend user from authorize()
      return true;
    },

    /**
     * jwt callback - build the token payload
     * This is where NextAuth creates the JWT that will be used for API auth
     * The token payload matches what the backend expects in requireAuth middleware
     */
    async jwt({ token, user }) {
      // On sign-in, populate token with user data
      if (user) {
        // user is either backendUser (from OAuth) or direct user (from credentials)
        const backendUser = user.backendUser || user;

        // Build token payload matching backend's expected format
        // These fields are what requireAuth middleware extracts
        token.sub = backendUser.id;
        token.email = backendUser.auth?.email || backendUser.email;
        token.roles = backendUser.auth?.roles || [];
        token.orgId = backendUser.orgId || null;

        // Store full user for session
        token.user = backendUser;
      }

      return token;
    },

    /**
     * session callback - expose token and user data to the client
     * session.accessToken is the JWT that frontend sends to backend
     */
    async session({ session, token }) {
      // Expose user data
      if (token.user) {
        session.user = token.user;
      }

      // Expose key fields for backward compatibility
      session.userId = token.sub;
      session.email = token.email;
      session.roles = token.roles;
      session.orgId = token.orgId;

      // Create a signed JWT (JWS) for API calls
      // Using jsonwebtoken.sign() instead of NextAuth's encode() which creates JWE (encrypted) tokens
      // Backend verifies this with jwt.verify() using the same NEXTAUTH_SECRET
      session.accessToken = jwt.sign(
        {
          sub: token.sub,
          email: token.email,
          roles: token.roles,
          orgId: token.orgId,
        },
        NEXTAUTH_SECRET,
        {
          expiresIn: "7d",
        }
      );

      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  // Ensure NEXTAUTH_SECRET is set - this is the signing key
  // Backend must use the same secret to verify tokens
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
