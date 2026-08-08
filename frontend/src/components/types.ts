import type { Tween } from "framer-motion";

// ----------------------------------------------------------------------
// Animation variant helper options (see src/components/animate/variants)

/** Easing value(s) accepted by framer-motion transitions. */
export type Ease = NonNullable<Tween["ease"]>;

export interface VariantsOptionProps {
  distance?: number;
  durationIn?: number;
  durationOut?: number;
  easeIn?: Ease;
  easeOut?: Ease;
  duration?: number;
  ease?: Ease;
  colors?: string[];
  staggerIn?: number;
  staggerOut?: number;
}

// ----------------------------------------------------------------------
// Chat message data shape (see src/data/index.js)

export interface MessageItem {
  type?: string;
  subtype?: string;
  message?: string;
  incoming?: boolean;
  outgoing?: boolean;
  img?: string;
  preview?: string;
  reply?: string;
  text?: string;
}
