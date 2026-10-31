// Authoring helper: raw template literal, with § standing in for a backtick.
export const t = (s) => s.raw[0].replaceAll('§', '`').trim();
