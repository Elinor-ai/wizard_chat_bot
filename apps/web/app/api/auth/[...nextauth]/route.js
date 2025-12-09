import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { AuthApi } from "../../../../lib/api-client";

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
          const data = await AuthApi.oauthGoogle({
            email: user.email,
            name: user.name,
            googleId: account.providerAccountId,
          });
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
