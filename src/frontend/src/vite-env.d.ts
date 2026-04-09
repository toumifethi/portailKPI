/// <reference types="vite/client" />

// Allow conditional require() for @azure/msal-react in non-dev auth mode
declare function require(module: string): unknown;
