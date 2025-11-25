/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Variable-backed colors
                app: "var(--bg-app)",
                panel: "var(--bg-panel)",
                card: "var(--bg-card)",
                brand: "var(--color-brand)",
                text: {
                    strong: "var(--fg-strong)",
                    primary: "var(--fg-primary)",
                    secondary: "var(--fg-secondary)",
                    muted: "var(--fg-muted)",
                },
                border: {
                    weak: "var(--border-weak)",
                    strong: "var(--border-strong)",
                },
                chat: {
                    user: "var(--chat-user-bubble)",
                    "user-fg": "var(--chat-user-fg)",
                    ai: "var(--chat-ai-bubble)",
                    "ai-fg": "var(--chat-ai-fg)",
                }
            },
            boxShadow: {
                ringFocus: "var(--ring-focus)",
                elevation1: "var(--shadow-1)",
                elevation2: "var(--shadow-2)",
            },
            fontFamily: {
                sans: ['"IBM Plex Sans Thai"', "ui-sans-serif", "system-ui", "-apple-system"],
                looped: ['"IBM Plex Sans Thai Looped"', 'sans-serif'],
            },
            keyframes: {
                'fade-up': {
                    '0%': { opacity: '0', transform: 'translateY(8px)' },
                    '100%': { opacity: '1', transform: 'translateY(0px)' },
                },
                'fade-down': {
                    '0%': { opacity: '0', transform: 'translateY(-8px)' },
                    '100%': { opacity: '1', transform: 'translateY(0px)' },
                },
                'fade': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
            },
            animation: {
                'fade-up': 'fade-up var(--fade-duration, 300ms) cubic-bezier(0.22, 1, 0.36, 1) forwards',
                'fade-down': 'fade-down var(--fade-duration, 300ms) cubic-bezier(0.22, 1, 0.36, 1) forwards',
                'fade': 'fade var(--fade-duration, 300ms) cubic-bezier(0.22, 1, 0.36, 1) forwards',
            },
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}
