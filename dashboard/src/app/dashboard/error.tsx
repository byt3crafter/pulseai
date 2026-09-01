"use client";
import StaleAwareError from "../../components/StaleAwareError";
export default function DashboardError(props: { error: Error; reset: () => void }) {
    return <StaleAwareError {...props} />;
}
