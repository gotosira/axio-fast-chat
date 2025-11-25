import React, { useState, useEffect } from 'react'

/**
 * FadeInText
 * Shows text with a Dia-style fade effect with slight Y-axis movement.
 * Supports prefers-reduced-motion by automatically disabling animation.
 */
export const FadeInText = ({
    as: Component = 'span',
    children,
    direction = 'up',
    durationMs = 300,
    delayMs = 0,
    className = '',
    ariaLive = 'off',
    role,
    disableAnimation = false,
    ...props
}) => {
    // Respect prefers-reduced-motion from system
    const [shouldReduceMotion, setShouldReduceMotion] = useState(false)

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
        const update = () => setShouldReduceMotion(mq.matches)
        update()
        mq.addEventListener?.('change', update)
        return () => mq.removeEventListener?.('change', update)
    }, [])

    const animationClass =
        direction === 'up' ? 'animate-fade-up'
            : direction === 'down' ? 'animate-fade-down'
                : 'animate-fade'

    const styleVars = {
        // Set via CSS variables for Tailwind animation to use
        // Note: delay is used via inline style with animationDelay
        '--fade-duration': `${durationMs}ms`,
        animationDelay: `${delayMs}ms`,
    }

    const noAnim = disableAnimation || shouldReduceMotion

    return (
        <Component
            role={role}
            aria-live={ariaLive}
            // If not animating, show immediately
            className={`${noAnim ? '' : animationClass} ${className}`}
            style={styleVars}
            {...props}
        >
            {children}
        </Component>
    )
}
