/**
 * Clerk Backend API utilities
 * Used for admin operations like setting user metadata
 */

interface ClerkUser {
  id: string;
  publicMetadata: Record<string, unknown>;
}

/**
 * Set a user's role in their Clerk public metadata
 */
export async function setUserRole(
  clerkSecretKey: string,
  userId: string,
  role: "admin" | "super_admin" | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `https://api.clerk.com/v1/users/${userId}/metadata`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${clerkSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          public_metadata: {
            role: role,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("[clerk] Failed to update user metadata:", error);
      return { success: false, error: `Clerk API error: ${response.status}` };
    }

    return { success: true };
  } catch (err) {
    console.error("[clerk] Error updating user metadata:", err);
    return { success: false, error: "Failed to connect to Clerk API" };
  }
}

/**
 * Get a user's details from Clerk
 */
export async function getClerkUser(
  clerkSecretKey: string,
  userId: string
): Promise<ClerkUser | null> {
  try {
    const response = await fetch(
      `https://api.clerk.com/v1/users/${userId}`,
      {
        headers: {
          Authorization: `Bearer ${clerkSecretKey}`,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}
