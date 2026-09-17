export const Motion = {
  duration: { fast: 120, base: 200, slow: 300, slower: 500 },
  easing: {
    standard: [0.4, 0, 0.2, 1],
    accelerate: [0.4, 0, 1, 1],
    decelerate: [0, 0, 0.2, 1],
  },
} as const;
