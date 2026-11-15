import type { Api } from "@shared/types";

declare global {
  interface Window {
    simpleton: Api;
  }
}
