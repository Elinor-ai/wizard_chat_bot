export async function GET() {
  return new Response(
    JSON.stringify({
      error: "Auth service not configured",
      message:
        "Stub endpoint: integrate NextAuth or another provider before shipping."
    }),
    {
      status: 501,
      headers: { "Content-Type": "application/json" }
    }
  );
}

export const POST = GET;
