import NextAuth, { type DefaultSession } from "next-auth"

// Extending the built-in session types to include our custom platform roles
declare module "next-auth" {
    interface Session {
        user: {
            id: string
            role: string
            tenantId: string | null
        } & DefaultSession["user"]
    }

    interface User {
        role: string
        tenantId: string | null
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string
        role: string
        tenantId: string | null
    }
}
