import { SignInButton, SignUpButton, SignOutButton, useUser } from "@clerk/remix";
import { Link } from "@remix-run/react";
import { useState, useRef, useEffect } from "react";

export function UserMenu() {
  const { isSignedIn, user, isLoaded } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close menu on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  // Loading state
  if (!isLoaded) {
    return (
      <div className="h-8 w-20 animate-pulse rounded-md bg-gray-200" />
    );
  }

  // Not signed in - show Sign In and Sign Up buttons
  if (!isSignedIn) {
    return (
      <div className="flex items-center gap-3">
        <SignInButton mode="modal">
          <button className="text-sm font-medium text-gray-700 hover:text-gray-900">
            Sign In
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Sign Up
          </button>
        </SignUpButton>
      </div>
    );
  }

  // Signed in - show user menu dropdown
  const displayName = user?.firstName || user?.fullName || "User";
  const email = user?.primaryEmailAddress?.emailAddress;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full p-1 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {user?.imageUrl ? (
          <img
            src={user.imageUrl}
            alt={displayName}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
            {initials}
          </div>
        )}
        <span className="hidden text-sm font-medium text-gray-700 sm:inline">
          {displayName}
        </span>
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          {/* User info header */}
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-medium text-gray-900">{displayName}</p>
            {email && (
              <p className="truncate text-sm text-gray-500">{email}</p>
            )}
          </div>

          {/* Menu items */}
          <div className="py-1">
            <Link
              to="/my-rsvps"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              My RSVPs
            </Link>
          </div>

          {/* Sign out */}
          <div className="border-t border-gray-100 py-1">
            <SignOutButton>
              <button
                onClick={() => setIsOpen(false)}
                className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                Sign Out
              </button>
            </SignOutButton>
          </div>
        </div>
      )}
    </div>
  );
}
