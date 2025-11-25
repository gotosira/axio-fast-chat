import tokens from '../../design-tokens.tokens.json';

/**
 * Resolves token references like {internal.color.grass-green.500} to actual values
 */
function resolveTokenReferences(value, tokensObj = tokens) {
  if (typeof value !== 'string') return value;

  const referenceMatch = value.match(/^\{(.+)\}$/);
  if (!referenceMatch) return value;

  const path = referenceMatch[1].split('.');
  let resolved = tokensObj;

  for (const segment of path) {
    resolved = resolved?.[segment];
    if (!resolved) return value;
  }

  return resolved?.value || resolved;
}

/**
 * Processes design tokens and converts them to Tailwind-compatible format
 */
function processTokens() {
  const processed = {
    colors: {},
    boxShadow: {},
    fontWeight: {},
    spacing: {},
    borderRadius: {}
  };

  // Process internal colors (base palette)
  if (tokens.internal?.color) {
    const internalColors = tokens.internal.color;

    Object.keys(internalColors).forEach(colorName => {
      const colorGroup = internalColors[colorName];
      processed.colors[colorName] = {};

      Object.keys(colorGroup).forEach(variant => {
        const tokenValue = colorGroup[variant];
        // Internal colors usually have direct values, but we resolve just in case
        let resolvedValue = resolveTokenReferences(tokenValue.value);
        processed.colors[colorName][variant] = resolvedValue;
      });
    });
  }

  // Process brand colors
  if (tokens['brand-colors']?.color) {
    const brandColors = tokens['brand-colors'].color;

    Object.keys(brandColors).forEach(colorName => {
      const colorGroup = brandColors[colorName];
      // If the color name already exists (e.g. from internal), we might be merging or overwriting.
      // Brand colors usually have semantic names like 'primary', 'success', etc.
      // If there's a collision, brand colors take precedence or we merge.
      // Here we initialize if not exists, but usually brand colors are distinct.
      if (!processed.colors[colorName]) {
        processed.colors[colorName] = {};
      }

      Object.keys(colorGroup).forEach(variant => {
        const tokenValue = colorGroup[variant];
        let resolvedValue = resolveTokenReferences(tokenValue.value);

        // If it's still a reference, try to resolve it recursively
        while (typeof resolvedValue === 'string' && resolvedValue.includes('{')) {
          const newResolved = resolveTokenReferences(resolvedValue);
          if (newResolved === resolvedValue) break; // Prevent infinite loops
          resolvedValue = newResolved;
        }

        processed.colors[colorName][variant] = resolvedValue;
      });
    });
  }

  // Process shadows
  if (tokens.effect?.shadow) {
    const shadows = tokens.effect.shadow;

    Object.keys(shadows).forEach(shadowName => {
      const shadow = shadows[shadowName];
      if (shadow.value) {
        const { offsetX, offsetY, radius, spread, color } = shadow.value;
        processed.boxShadow[shadowName] = `${offsetX}px ${offsetY}px ${radius}px ${spread}px ${color}`;
      }
    });
  }

  // Process font weights
  if (tokens.base?.['font-weight']) {
    const fontWeights = tokens.base['font-weight'];

    Object.keys(fontWeights).forEach(weightName => {
      const weight = fontWeights[weightName];
      processed.fontWeight[weightName] = weight.value;
    });
  }

  // Process spacing
  if (tokens.personas?.spacing) {
    const spacing = tokens.personas.spacing;

    Object.keys(spacing).forEach(spacingName => {
      const space = spacing[spacingName];
      processed.spacing[spacingName] = `${space.value}px`;
    });
  }

  // Process border radius
  if (tokens.personas?.radius) {
    const radius = tokens.personas.radius;

    Object.keys(radius).forEach(radiusName => {
      const rad = radius[radiusName];
      processed.borderRadius[radiusName] = `${rad.value}px`;
    });
  }

  return processed;
}

export const designTokens = processTokens();
export default designTokens;