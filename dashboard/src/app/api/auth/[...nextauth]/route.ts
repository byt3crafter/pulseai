import { NextRequest } from "next/server";
import { handlers } from "../../../../auth";

// Expose handlers for standard GET/POST NextAuth routes
export const GET = (req: NextRequest) => handlers.GET(req);
export const POST = (req: NextRequest) => handlers.POST(req);
