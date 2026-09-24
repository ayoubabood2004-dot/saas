/* أنواعُ `i18n-split.mjs` — حتى يفحص `tsc -b` استيرادَ `vite.config.ts` لها. */
import type { Plugin } from "vite";

export type Dict = Record<string, unknown>;
export interface Split { hot: Dict; cold: Dict }

export declare const AR_JSON: string;
export declare const HOT_PATHS_JSON: string;
export declare const STORE_AR_JSON: string;
export declare const AR_HOT_TS: string;
export declare const AR_COLD_TS: string;

export declare function readHotPaths(root?: string): string[];
export declare function readStoreKeys(root?: string): string[];
export declare function readAr(root?: string): Dict;
export declare function splitAr(ar: Dict, hotPaths: string[], storeKeys?: string[]): Split;
export declare function leafPaths(o: Dict, prefix?: string, out?: string[]): string[];
export declare function splitFromTree(root?: string): Split;
export declare function i18nSplit(): Plugin;
export declare function coldModuleSource(cold: Dict): string;
export declare function esbuildI18nSplit(opts?: { root?: string; coldExternal?: string; split?: Split }): {
  name: string;
  setup(build: unknown): void;
};
