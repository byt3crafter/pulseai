import { ImageResponse } from "next/og";

// Favicon — the Pulse brand mark (violet gradient square + equalizer bars),
// matching the marketing-site logo. Next.js serves this at /icon.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 3,
                    background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
                    borderRadius: 8,
                }}
            >
                <div style={{ width: 4, height: 10, borderRadius: 2, background: "#fff" }} />
                <div style={{ width: 4, height: 18, borderRadius: 2, background: "#fff" }} />
                <div style={{ width: 4, height: 13, borderRadius: 2, background: "#fff" }} />
            </div>
        ),
        { ...size }
    );
}
