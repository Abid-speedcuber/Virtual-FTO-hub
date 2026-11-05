import {defineConfig} from 'vite';
export default defineConfig({
 base:'./',
	server: {
		allowedHosts: [
			'vanita-coextensive-zoraida.ngrok-free.dev'
		]
	},
	build: {
		rollupOptions: {
			output: {
				manualChunks: {
					three:['three']
				}
			}
		}
	}
});
