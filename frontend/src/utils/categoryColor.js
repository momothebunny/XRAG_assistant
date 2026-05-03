// Deterministic color generation for knowledge base categories.
// Same category name -> same color across renders, components, and sessions.

const hashString = (input) => {
  const str = String(input || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const hueFor = (category) => {
  if (!category) return null;
  // Golden-angle conjugate spread → visually distinct hues for any inputs.
  return (hashString(category.toLowerCase()) * 137.508) % 360;
};

const hslToRgb = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
};

/**
 * Color palette for a category. Includes Tailwind-style inline colors
 * (CSS strings) plus an RGB triple useful for canvas rendering.
 *
 * Pass `null` / empty for "uncategorized" → returns a neutral amber palette.
 */
export const getCategoryColor = (category) => {
  const hue = hueFor(category);
  if (hue === null) {
    return {
      hue: 35,
      isUncategorized: true,
      text: 'rgb(146 64 14)',
      textStrong: 'rgb(120 53 15)',
      bgSoft: 'rgb(255 251 235)',
      bgStrong: 'rgb(254 243 199)',
      border: 'rgb(252 211 77)',
      ring: 'rgb(253 230 138)',
      iconBg: 'rgb(254 243 199)',
      iconText: 'rgb(180 83 9)',
      gradient:
        'linear-gradient(to right, rgb(255 251 235 / 0.8), rgb(254 243 199 / 0.6), transparent)',
      rgb: { r: 245, g: 158, b: 11 },
    };
  }
  const rgb = hslToRgb(hue, 0.72, 0.55);
  return {
    hue,
    isUncategorized: false,
    text: `hsl(${hue} 60% 28%)`,
    textStrong: `hsl(${hue} 65% 22%)`,
    bgSoft: `hsl(${hue} 90% 97%)`,
    bgStrong: `hsl(${hue} 80% 92%)`,
    border: `hsl(${hue} 65% 80%)`,
    ring: `hsl(${hue} 70% 75%)`,
    iconBg: `hsl(${hue} 80% 92%)`,
    iconText: `hsl(${hue} 60% 35%)`,
    gradient: `linear-gradient(to right, hsl(${hue} 90% 97% / 0.85), hsl(${hue} 85% 94% / 0.6), transparent)`,
    rgb,
  };
};

/** Stable list of unique top-level categories sorted alphabetically. */
export const collectCategories = (documents) => {
  const set = new Set();
  documents.forEach((doc) => {
    if (doc.category) set.add(doc.category);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'hu'));
};
