import { LazyMotion } from "framer-motion";
import type { ReactNode } from "react";

// ----------------------------------------------------------------------

const loadFeatures = () => import("./features").then((res) => res.default);

interface MotionLazyContainerProps {
  children?: ReactNode;
}

export default function MotionLazyContainer({
  children,
}: MotionLazyContainerProps) {
  return (
    <LazyMotion strict features={loadFeatures}>
      {children}
    </LazyMotion>
  );
}
