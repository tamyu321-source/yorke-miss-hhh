import { createApp } from 'vue';
import App from './App.vue';
import { registerAppServiceWorker } from './pwa';
import './styles.css';

createApp(App).mount('#app');

registerAppServiceWorker();
