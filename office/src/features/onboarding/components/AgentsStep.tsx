/**
 * AgentsStep — Shows discovered agents after gateway connection.
 */
import { Bot, Users, WifiOff } from "lucide-react";

export type AgentsStepProps = {
  agentCount: number;
  connected: boolean;
};

export const AgentsStep = ({ agentCount, connected }: AgentsStepProps) => {
  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8">
        <WifiOff className="h-8 w-8 text-white/30" />
        <p className="text-sm text-white/60">
          Can&apos;t reach your workspace right now, so your team isn&apos;t
          loaded yet.
        </p>
      </div>
    );
  }

  if (agentCount === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center gap-3 py-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
            <Bot className="h-6 w-6 text-white/40" />
          </div>
          <p className="text-sm font-medium text-white">No agents found</p>
          <p className="max-w-xs text-center text-xs text-white/55">
            Your workspace doesn&apos;t have any agents yet, so the office is
            empty.
          </p>
        </div>

        {/*
          PULSE PATCH: agents are created in the Pulse dashboard, not here.
          Upstream pointed at a fleet sidebar and a + button that create agents
          through the runtime's own config APIs — which this runtime does not
          implement, so following those steps could only fail.
        */}
        <div className="rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3">
          <p className="text-xs font-medium text-white/80">To add one:</p>
          <ol className="mt-2 space-y-1.5 text-[11px] text-white/55">
            <li>1. Open Agent Profiles in the Pulse sidebar</li>
            <li>2. Create an agent and give it a name and a model</li>
            <li>3. Turn on the tools it should be allowed to use</li>
            <li>4. Come back here and it will be at its desk</li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
        <Users className="h-5 w-5 text-amber-300" />
        <div>
          <p className="text-sm font-semibold text-white">
            {agentCount} agent{agentCount !== 1 ? "s" : ""} discovered
          </p>
          <p className="text-[11px] text-white/55">
            Your AI team is ready and waiting in the office.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-white/70">
          What you can do with agents:
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Chat", desc: "Send messages and get responses" },
            { label: "Approve", desc: "Review and approve exec commands" },
            { label: "Configure", desc: "Edit brain files and settings" },
            { label: "Monitor", desc: "Watch runtime activity in real time" },
          ].map(({ label, desc }) => (
            <div
              key={label}
              className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2"
            >
              <p className="text-[11px] font-semibold text-white">{label}</p>
              <p className="text-[10px] text-white/45">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
