import type { Transition } from "framer-motion";
import type { VariantsOptionProps } from "../../types";

// ----------------------------------------------------------------------

const DEFAULT_EASE: [number, number, number, number] = [0.43, 0.13, 0.23, 0.96];

export const varTranHover = (props?: VariantsOptionProps): Transition => {
  const duration = props?.duration || 0.32;
  const ease = props?.ease || DEFAULT_EASE;

  return { duration, ease };
};

export const varTranEnter = (props?: VariantsOptionProps): Transition => {
  const duration = props?.durationIn || 0.64;
  const ease = props?.easeIn || DEFAULT_EASE;

  return { duration, ease };
};

export const varTranExit = (props?: VariantsOptionProps): Transition => {
  const duration = props?.durationOut || 0.48;
  const ease = props?.easeOut || DEFAULT_EASE;

  return { duration, ease };
};
