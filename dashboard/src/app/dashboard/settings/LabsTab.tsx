"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, SettingRow, Toggle } from "../../../components/dashboard/ui";
import { setFloorEnabledAction } from "./actions";

/**
 * Labs — features that work but are not finished.
 *
 * Everything here is off until someone turns it on, so a half-shaped feature is
 * something you go looking for rather than something you trip over. Turning one
 * on hides nothing else and changes no agent behaviour.
 */
export default function LabsTab({ floor }: { floor: boolean }) {
    const [floorOn, setFloorOn] = useState(floor);
    const [pending, startTransition] = useTransition();
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    function toggleFloor(next: boolean) {
        setFloorOn(next);
        setMsg(null);
        startTransition(async () => {
            const res = await setFloorEnabledAction(next);
            setMsg({ ok: res.success, text: res.message });
            if (!res.success) setFloorOn(!next); // put the switch back if it did not take
        });
    }

    return (
        <div className="space-y-5">
            <Card>
                <CardHeader
                    title="Labs"
                    description="Early features. They work, but they are still being shaped — expect rough edges."
                />
                <div className="divide-y divide-pulse-border">
                    <SettingRow
                        title="The Floor"
                        description="Your workspace as a 3D office: your agents at their desks, lighting up as they pick up work — whether the job came from here, Telegram, or a schedule."
                        control={
                            <div className="flex items-center gap-3">
                                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-500">
                                    Beta
                                </span>
                                <Toggle checked={floorOn} onChange={toggleFloor} disabled={pending} />
                            </div>
                        }
                    />
                </div>
            </Card>

            {msg && (
                <p className={`text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</p>
            )}
        </div>
    );
}
