/**
 * Clerk Backend API utilities
 * Used for admin operations like setting user metadata
 */

interface ClerkEmailAddress {
  email_address: string;
  id: string;
}

interface ClerkUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email_addresses: ClerkEmailAddress[];
  primary_email_address_id: string | null;
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

/**
 * Get a user's primary email address from their Clerk user object
 */
export function getClerkUserPrimaryEmail(user: ClerkUser): string | null {
  if (!user.email_addresses || user.email_addresses.length === 0) {
    return null;
  }

  // Find primary email address if set
  if (user.primary_email_address_id) {
    const primaryEmail = user.email_addresses.find(
      (e) => e.id === user.primary_email_address_id
    );
    if (primaryEmail) {
      return primaryEmail.email_address;
    }
  }

  // Fall back to first email address
  return user.email_addresses[0].email_address;
}
