/**
 * Onboarding wizard types.
 *
 * The wizard is step-based and extensible: new steps can be added by
 * extending `OnboardingStepId` and registering a component in the
 * step registry.
 */

export type OnboardingStepId =
  | "welcome"
  | "prerequisites"
  | "agents"
  | "company"
  | "complete";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  /** Whether the step can be skipped. */
  skippable: boolean;
};

export type OnboardingState = {
  currentStep: OnboardingStepId;
  completedSteps: Set<OnboardingStepId>;
  /** Whether the user has dismissed the wizard entirely. */
  dismissed: boolean;
  /** Gateway connection state passed from the parent. */
  gatewayConnected: boolean;
  /** Number of agents discovered after connection. */
  agentCount: number;
};

/*
  PULSE PATCH: the "Connect Your Gateway" step is gone.

  It was skippable: false and the wizard shows on every browser missing a
  localStorage flag — so every first-time visitor, a phone above all, was met
  with a gateway URL and token form it could not get past. Inside Pulse there is
  no gateway to link: the page already knows the runtime and the viewer is
  already signed in.
*/
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to your office",
    description: "Your AI team, in 3D",
    skippable: false,
  },
  {
    id: "prerequisites",
    title: "Before You Start",
    description: "What you'll need",
    skippable: true,
  },
  {
    id: "agents",
    title: "Your Agents",
    description: "Meet your AI team",
    skippable: true,
  },
  {
    id: "company",
    title: "Build Your Company",
    description: "Generate your org structure",
    skippable: true,
  },
  {
    id: "complete",
    title: "You're All Set",
    description: "Start exploring",
    skippable: false,
  },
];

export const getStepIndex = (stepId: OnboardingStepId): number =>
  ONBOARDING_STEPS.findIndex((s) => s.id === stepId);

export const getNextStep = (
  currentId: OnboardingStepId,
): OnboardingStepId | null => {
  const idx = getStepIndex(currentId);
  if (idx < 0 || idx >= ONBOARDING_STEPS.length - 1) return null;
  return ONBOARDING_STEPS[idx + 1].id;
};

export const getPrevStep = (
  currentId: OnboardingStepId,
): OnboardingStepId | null => {
  const idx = getStepIndex(currentId);
  if (idx <= 0) return null;
  return ONBOARDING_STEPS[idx - 1].id;
};
