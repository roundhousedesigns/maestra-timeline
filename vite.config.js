import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 3000,
	},
	// build: {
	// 	rollupOptions: {
	// 		makeAbsoluteExternalsRelative: true,
	// 		preserveEntrySignatures: "strict",
	// 		output: {
	// 			esModule: true,
	// 			generatedCode: {
	// 				reservedNamesAsProps: false,
	// 			},
	// 			interop: "compat",
	// 			systemNullSetters: false,
	// 		},
	// 	},
	// 	chunkSizeWarningLimit: 1400,
	// },
});
