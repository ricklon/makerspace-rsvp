export interface WaiverItem {
  id: string;
  label: string;
  description: string;
  required: boolean;
  defaultChecked: boolean;
}

export interface WaiverConfig {
  title: string;
  introduction: string;
  items: WaiverItem[];
  signature: {
    required: boolean;
    label: string;
  };
}

// Default waiver items - can be overridden per event
export const DEFAULT_WAIVER_ITEMS: WaiverItem[] = [
  {
    id: "liability",
    label: "Liability Release",
    description:
      "I understand that participation in makerspace activities involves inherent risks including but not limited to: injury from tools and equipment, electrical hazards, chemical exposure, and other workshop-related dangers. I voluntarily assume all risks and release the organization, its officers, members, and volunteers from any liability for injuries or damages.",
    required: true,
    defaultChecked: false,
  },
  {
    id: "safety_rules",
    label: "Safety Rules Agreement",
    description:
      "I agree to follow all posted safety rules and guidelines. I will use appropriate personal protective equipment (PPE) when required. I will not operate equipment I am not trained or certified to use. I will report any safety concerns or incidents to staff immediately.",
    required: true,
    defaultChecked: false,
  },
  {
    id: "emergency_contact",
    label: "Emergency Contact Confirmation",
    description:
      "I confirm that my emergency contact information on file is accurate and up-to-date. I authorize the organization to contact this person and seek medical treatment on my behalf in case of emergency.",
    required: true,
    defaultChecked: false,
  },
  {
    id: "media_release",
    label: "Media Release (Optional)",
    description:
      "I grant permission for photos and videos taken during events to be used for promotional purposes, including social media, website, and marketing materials. I understand I can opt out of this without affecting my participation.",
    required: false,
    defaultChecked: true,
  },
  {
    id: "code_of_conduct",
    label: "Code of Conduct",
    description:
      "I agree to treat all members, guests, and staff with respect. I will not engage in harassment, discrimination, or behavior that creates an unsafe or unwelcoming environment. I understand that violations may result in removal from events or membership termination.",
    required: true,
    defaultChecked: false,
  },
];

export const DEFAULT_WAIVER_CONFIG: WaiverConfig = {
  title: "Participation Waiver & Release",
  introduction:
    "Please read and acknowledge each item below before participating. Required items must be accepted to attend. Optional items have sensible defaults but can be changed.",
  items: DEFAULT_WAIVER_ITEMS,
  signature: {
    required: true,
    label: "By checking this box, I confirm that I have read, understand, and agree to all required items above.",
  },
};

// Event-specific waiver additions (merged with defaults)
export const EVENT_WAIVER_ADDITIONS: Record<string, WaiverItem[]> = {
  robot_combat: [
    {
      id: "robot_combat_risk",
      label: "Robot Combat Specific Risks",
      description:
        "I understand that robot combat events involve additional risks including flying debris, projectiles, fire, and rapidly moving mechanical parts. I will remain behind safety barriers during matches and wear safety glasses at all times in the arena area.",
      required: true,
      defaultChecked: false,
    },
  ],
  woodworking: [
    {
      id: "woodworking_certification",
      label: "Equipment Certification Acknowledgment",
      description:
        "I understand that I may only operate woodworking equipment I have been certified to use. I will not attempt to use any machinery without proper training and certification.",
      required: true,
      defaultChecked: false,
    },
  ],
};

// Helper to get waiver config for an event
export function getWaiverConfigForEvent(
  eventType?: string,
  customWaiverText?: string | null
): WaiverConfig {
  const config = { ...DEFAULT_WAIVER_CONFIG };
  config.items = [...DEFAULT_WAIVER_ITEMS];

  // Add event-specific items if applicable
  if (eventType && EVENT_WAIVER_ADDITIONS[eventType]) {
    config.items = [...config.items, ...EVENT_WAIVER_ADDITIONS[eventType]];
  }

  // If event has custom waiver text, add it as a custom item
  if (customWaiverText) {
    config.items.push({
      id: "event_specific",
      label: "Event-Specific Terms",
      description: customWaiverText,
      required: true,
      defaultChecked: false,
    });
  }

  return config;
}

// Helper to validate all required items are checked
export function validateWaiverConsents(
  consents: Record<string, boolean>,
  items: WaiverItem[]
): { valid: boolean; missingItems: string[] } {
  const missingItems: string[] = [];

  for (const item of items) {
    if (item.required && !consents[item.id]) {
      missingItems.push(item.label);
    }
  }

  return {
    valid: missingItems.length === 0,
    missingItems,
  };
}
