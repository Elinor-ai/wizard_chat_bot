import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account.provider === "google") {
        try {
          // Send user data to our backend to create/update user
          const response = await fetch(`${API_BASE_URL}/auth/oauth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              googleId: account.providerAccountId,
            }),
          });

          if (!response.ok) {
            console.error("Failed to sync user with backend");
            return false;
          }

          const data = await response.json();
          // Store user data in the token for later use
          user.backendUser = data.user;
          user.backendToken = data.token;
          return true;
        } catch (error) {
          console.error("Error syncing user:", error);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      // Add backend user data to token on sign in
      if (user?.backendUser) {
        token.backendUser = user.backendUser;
      }
      if (user?.backendToken) {
        token.backendToken = user.backendToken;
      }
      return token;
    },
    async session({ session, token }) {
      // Add backend user data to session
      if (token.backendUser) {
        session.user = token.backendUser;
      }
      if (token.backendToken) {
        session.accessToken = token.backendToken;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});

export { handler as GET, handler as POST };
