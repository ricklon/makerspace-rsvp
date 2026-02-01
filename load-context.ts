import { type PlatformProxy } from "wrangler";

// Define the Cloudflare environment interface
interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  
  // Authentication
  SESSION_SECRET: string;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD_HASH: string;
  
  // Email Service
  RESEND_API_KEY?: string;
  SENDGRID_API_KEY?: string;
  FROM_EMAIL: string;
  
  // Makerspace Branding
  MAKERSPACE_NAME?: string;
  MAKERSPACE_URL?: string;
  MAKERSPACE_EMAIL?: string;
  
  // Optional Integrations
  DISCORD_WEBHOOK_URL?: string;

  // Clerk Authentication
  CLERK_SECRET_KEY?: string;
}

type Cloudflare = Omit<PlatformProxy<Env>, "dispose">;

declare module "@remix-run/cloudflare" {
  interface AppLoadContext {
    cloudflare: Cloudflare;
  }
}

export type { Env };
