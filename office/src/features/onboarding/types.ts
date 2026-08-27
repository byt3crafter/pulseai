/**
 * Onboarding wizard types.
 *
 * The wizard is step-based and extensible: new steps can be added by
 * extending `OnboardingStepId` and registering a component in the
 * step registry.
 */

export type OnboardingStepId = "welcome" | "agents" | "complete";

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
  PULSE PATCH: this is a tour, not a setup wizard.

  Upstream's wizard walks someone through standing a Hermes3D install up, and
  three of its five steps were meaningless or broken here:

  - "Connect Your Gateway" (skippable: false) asked for a gateway URL and token.
    The wizard shows on every browser missing a localStorage flag, so every
    first-time visitor — a phone above all — hit a form it could not get past.
    There is nothing to connect: the page already knows the runtime and the
    viewer is already signed in.
  - "Before You Start" told the reader to install Node.js, run
    `npm run hermes-adapter` and find ~/.hermes/hermes.json. Nobody using a
    hosted Pulse workspace has a terminal in this picture.
  - "Build Your Company" offered to write agents into the runtime, which needs
    config.patch / config.set / agents.create. Our adapter implements none of
    them, so the button could only ever throw. Pulse agents are created in the
    dashboard.

  What is left is what a tour should be: here is your office, here is your
  team, go in.
*/
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to your office",
    description: "Your AI team, in 3D",
    skippable: false,
  },
  {
    id: "agents",
    title: "Your Agents",
    description: "Meet your AI team",
    skippable: true,
  },
  {
    id: "complete",
    title: "You're all set",
    description: "Go in",
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
