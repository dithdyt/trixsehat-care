import { headers } from "next/headers";

import { auth } from "@/lib/auth";

export async function getServerSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function getRequestSession(request: Request) {
  return auth.api.getSession({
    headers: request.headers,
  });
}
