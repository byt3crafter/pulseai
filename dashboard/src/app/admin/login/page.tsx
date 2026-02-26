"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function AdminLoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        const result = await signIn("credentials", {
            email,
            password,
            redirect: false,
        });

        if (result?.error) {
            setError("Invalid credentials.");
            setLoading(false);
        } else {
            window.location.href = "/admin";
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-sm">
                <div className="flex items-center gap-2 mb-8 justify-center">
                    <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-white">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                    </div>
                    <span className="text-base font-bold text-white">Pulse</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
                    <div className="flex items-center gap-2 mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                        <h1 className="text-lg font-semibold text-white">Platform Administration</h1>
                    </div>

                    {error && (
                        <div className="bg-red-950/60 text-red-400 p-3 rounded-lg text-sm mb-5 border border-red-900/60">{error}</div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Email</label>
                            <input
                                type="email"
                                required
                                autoComplete="email"
                                placeholder="admin@runstate.com"
                                className="w-full px-3 py-2.5 border border-slate-700 rounded-lg bg-slate-800 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Password</label>
                            <input
                                type="password"
                                required
                                autoComplete="current-password"
                                placeholder="••••••••"
                                className="w-full px-3 py-2.5 border border-slate-700 rounded-lg bg-slate-800 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition-colors mt-2 disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Signing in...
                                </>
                            ) : "Sign In"}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-slate-700 mt-6">Internal access only — not for customers</p>
            </div>
        </div>
    );
}
