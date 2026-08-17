import { BUILD_MARKER } from './version'

const app = document.querySelector<HTMLDivElement>('#app')
if (app) app.textContent = BUILD_MARKER
