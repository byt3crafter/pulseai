"use client";
import StaleAwareError from "../../components/StaleAwareError";
export default function AdminError(props: { error: Error; reset: () => void }) {
    return <StaleAwareError {...props} />;
}
