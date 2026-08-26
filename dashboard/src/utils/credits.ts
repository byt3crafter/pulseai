/**
 * Third-party credits shown on /dashboard/about.
 *
 * Some assets and libraries we use REQUIRE attribution as a licence condition —
 * pixel-art asset packs in particular usually demand a visible credit and a link
 * back. This is that visible credit, and the single place to add another.
 *
 * Keep this honest: only list what actually ships. A credit for something we
 * removed is as wrong as a missing credit for something we use.
 */

export interface Credit {
    /** What it is, in the user's words — not the package name. */
    name: string;
    /** Who made it. */
    author: string;
    /** Licence, e.g. "MIT", "CC0", "Commercial (attribution required)". */
    licence: string;
    /** Where to find it. Required when the licence demands a link back. */
    url?: string;
    /** What we actually use it for. */
    used: string;
    /** True when the licence makes this credit mandatory, not courtesy. */
    required?: boolean;
}

export const CREDITS: Credit[] = [
    {
        name: "Hermes3D",
        author: "Luke The Dev",
        licence: "MIT",
        url: "https://github.com/iamlukethedev/Hermes3D",
        used: "The 3D office on The Floor. We run our own build of it, wired to Pulse and customised from there.",
        required: true,
    },
];

/** Credits the licence obliges us to display. */
export const REQUIRED_CREDITS = CREDITS.filter((c) => c.required);
