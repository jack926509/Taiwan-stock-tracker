import type { Config } from "tailwindcss";
import baseConfig from "../tailwind.config";

const config: Config = {
  ...baseConfig,
  content: ["../app/**/*.{ts,tsx}", "../components/**/*.{ts,tsx}"],
};

export default config;
