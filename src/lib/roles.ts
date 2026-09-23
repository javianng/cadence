// Kept free of Firebase imports so server components can use it.
export const ROLES = ["borrower", "rm", "risk"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_META: Record<
  Role,
  { label: string; home: string; question: string }
> = {
  borrower: {
    label: "Borrower",
    home: "/borrower",
    question: "How am I doing, and what am I paying?",
  },
  rm: {
    label: "Relationship Manager",
    home: "/rm",
    question: "Which of my clients need me right now?",
  },
  risk: {
    label: "Risk",
    home: "/risk",
    question: "Is the whole book on track, and can we trust the AI?",
  },
};
